import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from loguru import logger
from supabase import Client
from src.core.supabase import get_supabase, get_system_client
from src.translate.models.vocab_db_models import (
    WordModel,
    SenseModel,
    WordFormModel,
    UserSenseProgressModel,
    UserWordModel,
    UserSenseNoteModel,
    UserSenseStatsModel,
    UserStatsModel,
    UserSenseAttemptModel,
)
from src.translate.models.vocab_model import VocabItem


def _to_uuid_str(val: Optional[str], fallback_seed: str = "") -> str:
    """Ensure a string is a valid UUID, otherwise generate a deterministic UUID5."""
    if val:
        try:
            return str(uuid.UUID(val))
        except (ValueError, TypeError, AttributeError):
            pass
    seed = val or fallback_seed or str(uuid.uuid4())
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, seed))


def _clean_sense_id(val: Optional[str], fallback_seed: str = "") -> str:
    """Return clean sense ID string (preserving WordNet sense ID like 'bank.n.01')."""
    if val and str(val).strip():
        return str(val).strip()
    return fallback_seed or str(uuid.uuid4())


class SupabaseVocabRepository:
    """
    Repository tương tác với Supabase PostgreSQL theo đúng chuẩn backend/database/schema.sql:
    - Bảng dùng chung (không ràng buộc user): words, senses, word_forms
    - Bảng dành riêng cho user (ràng buộc profiles.id):
        user_words, user_sense_progress, user_sense_notes,
        user_sense_stats, user_stats, user_sense_attempts
    """

    def __init__(self, client: Optional[Client] = None):
        self._client = client

    @property
    def client(self) -> Client:
        if self._client is None:
            try:
                self._client = get_system_client()
            except Exception:
                self._client = get_supabase()
        return self._client

    # ── WORDS (Kho từ vựng toàn hệ thống) ────────────────────────────────────

    def get_word_by_text(self, word_text: str) -> Optional[Dict[str, Any]]:
        """Lấy bản ghi từ bảng words theo word_text (LOWER)."""
        clean_word = word_text.strip().lower()
        if not clean_word:
            return None
        try:
            res = (
                self.client.table("words")
                .select("*")
                .eq("word_text", clean_word)
                .maybe_single()
                .execute()
            )
            return res.data if res else None
        except Exception as e:
            logger.warning(f"Word not found or error fetching '{clean_word}': {e}")
            return None

    def get_or_create_word(self, word_text: str) -> Optional[Dict[str, Any]]:
        """Lấy hoặc tạo mới bản ghi trong bảng words theo word_text."""
        clean_word = word_text.strip().lower()
        if not clean_word:
            return None
        try:
            existing = self.get_word_by_text(clean_word)
            if existing:
                return existing

            payload = {
                "word_text": clean_word,
                "is_validated": False,
            }
            res = self.client.table("words").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Error in get_or_create_word '{clean_word}': {e}")
            return self.get_word_by_text(clean_word)

    # ── WORD FORMS (Biến thể từ vựng: runs/running -> run) ───────────────────

    def add_word_form(
        self,
        word_id: str,
        form_text: str,
        form_type: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Lưu biến thể từ vựng vào bảng word_forms."""
        clean_form = form_text.strip().lower()
        if not clean_form:
            return None
        try:
            payload = {
                "word_id": word_id,
                "form_text": clean_form,
                "form_type": form_type or "inflection",
            }
            res = self.client.table("word_forms").upsert(
                payload,
                on_conflict="word_id,form_text"
            ).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Error saving word_form '{clean_form}': {e}")
            return None

    # ── SENSES (Kho tri thức nghĩa & cache WSD) ──────────────────────────────

    def get_sense(self, sense_id: str) -> Optional[Dict[str, Any]]:
        """Lấy thông tin sense theo id."""
        clean_id = _clean_sense_id(sense_id)
        try:
            res = self.client.table("senses").select("*").eq("id", clean_id).maybe_single().execute()
            return res.data
        except Exception as e:
            logger.error(f"Error fetching sense {sense_id}: {e}")
            return None

    def get_word_senses(self, word_id: str) -> List[Dict[str, Any]]:
        """Lấy tất cả senses của một từ theo word_id."""
        try:
            res = self.client.table("senses").select("*").eq("word_id", word_id).execute()
            return res.data or []
        except Exception as e:
            logger.error(f"Error fetching senses for word_id '{word_id}': {e}")
            return []

    def upsert_sense(self, sense: SenseModel) -> Optional[Dict[str, Any]]:
        """
        Lưu hoặc cập nhật sense vào bảng senses:
        - Tăng match_count khi gặp lại nghĩa này
        - Cập nhật confidence_score và is_trusted nếu cao hơn
        """
        try:
            sense_id = _clean_sense_id(sense.id, f"{sense.word_id}_{sense.meaning_vi}")
            
            # 1. Kiểm tra sense đã tồn tại theo id (WordNet sense ID) hoặc (word_id, meaning_vi)
            existing = None
            if sense_id:
                try:
                    res_id = self.client.table("senses").select("*").eq("id", sense_id).maybe_single().execute()
                    existing = res_id.data if res_id else None
                except Exception:
                    pass

            if not existing and sense.word_id:
                try:
                    res_m = (
                        self.client.table("senses")
                        .select("*")
                        .eq("word_id", sense.word_id)
                        .eq("meaning_vi", sense.meaning_vi.strip())
                        .maybe_single()
                        .execute()
                    )
                    existing = res_m.data if res_m else None
                except Exception:
                    pass

            if existing:
                actual_id = existing["id"]
                new_match = int(existing.get("match_count", 0)) + 1
                new_conf = max(float(existing.get("confidence_score", 0.0)), float(sense.confidence_score))
                new_trusted = existing.get("is_trusted", False) or sense.is_trusted

                updates: Dict[str, Any] = {
                    "match_count": new_match,
                    "confidence_score": new_conf,
                    "is_trusted": new_trusted,
                    "updated_at": "now()",
                }
                if sense.definition_en and not existing.get("definition_en"):
                    updates["definition_en"] = sense.definition_en
                if sense.example_en and not existing.get("example_en"):
                    updates["example_en"] = sense.example_en
                if sense.part_of_speech and not existing.get("part_of_speech"):
                    updates["part_of_speech"] = sense.part_of_speech
                if sense.ipa and not existing.get("ipa"):
                    updates["ipa"] = sense.ipa
                if sense.synonyms and not existing.get("synonyms"):
                    updates["synonyms"] = sense.synonyms

                res_up = self.client.table("senses").update(updates).eq("id", actual_id).execute()
                return res_up.data[0] if res_up.data else existing

            # Tạo mới sense
            payload = {
                "id": sense_id,
                "word_id": sense.word_id,
                "meaning_vi": sense.meaning_vi.strip(),
                "definition_en": sense.definition_en,
                "definition_vi": sense.definition_vi,
                "example_en": sense.example_en,
                "example_vi": sense.example_vi,
                "synonyms": sense.synonyms or [],
                "antonyms": sense.antonyms or [],
                "match_count": max(1, sense.match_count),
                "confidence_score": float(sense.confidence_score),
                "is_trusted": bool(sense.is_trusted),
                "rating_count": sense.rating_count,
                "rating_score": sense.rating_score,
                "part_of_speech": sense.part_of_speech,
                "ipa": sense.ipa,
                "audio_url": sense.audio_url,
            }
            res_ins = self.client.table("senses").insert(payload).execute()
            return res_ins.data[0] if res_ins.data else None
        except Exception as e:
            logger.error(f"Error in upsert_sense: {e}")
            return None

    # ── USER WORDS (Lịch sử tiếp xúc từ vựng của user) ───────────────────────

    def record_user_word(self, user_id: str, word_id: str) -> Optional[Dict[str, Any]]:
        """Ghi nhận số lần dịch/tiếp xúc từ vựng của user trong bảng user_words."""
        try:
            existing = (
                self.client.table("user_words")
                .select("*")
                .eq("user_id", user_id)
                .eq("word_id", word_id)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                curr_count = existing.data.get("translated_count", 0)
                res_up = (
                    self.client.table("user_words")
                    .update({
                        "translated_count": curr_count + 1,
                        "last_translated": "now()",
                        "updated_at": "now()",
                    })
                    .eq("id", existing.data["id"])
                    .execute()
                )
                return res_up.data[0] if res_up.data else existing.data

            payload = {
                "user_id": user_id,
                "word_id": word_id,
                "translated_count": 1,
                "last_translated": "now()",
            }
            res = self.client.table("user_words").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error record_user_word for user {user_id}, word {word_id}: {e}")
            return None

    # ── USER SENSE PROGRESS (Tiến độ học SRS theo từng nghĩa của từ) ─────────

    def record_user_sense_progress(self, user_id: str, sense_id: str) -> Optional[Dict[str, Any]]:
        """Ghi nhận số lần dịch / cập nhật tiến độ học sense của user."""
        clean_sense_id = _clean_sense_id(sense_id)
        try:
            existing = (
                self.client.table("user_sense_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("sense_id", clean_sense_id)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                curr_count = existing.data.get("translated_count", 0)
                res_up = (
                    self.client.table("user_sense_progress")
                    .update({
                        "translated_count": curr_count + 1,
                        "last_translated": "now()",
                        "updated_at": "now()",
                    })
                    .eq("id", existing.data["id"])
                    .execute()
                )
                return res_up.data[0] if res_up.data else existing.data

            payload = {
                "user_id": user_id,
                "sense_id": clean_sense_id,
                "mastery_score": 0.0,
                "translated_count": 1,
                "last_translated": "now()",
                "wrong_count": 0,
            }
            res = self.client.table("user_sense_progress").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error record_user_sense_progress: {e}")
            return None

    # ── USER SENSE NOTES (Ghi chú & Ngữ cảnh riêng của user) ─────────────────

    def save_user_sense_note(
        self,
        user_id: str,
        sense_id: str,
        context: Optional[str] = None,
        meaning_note: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Lưu câu ngữ cảnh hoặc ghi chú riêng của user cho một sense."""
        if not context and not meaning_note:
            return None
        clean_sense_id = _clean_sense_id(sense_id)
        try:
            existing = (
                self.client.table("user_sense_notes")
                .select("*")
                .eq("user_id", user_id)
                .eq("sense_id", clean_sense_id)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                updates = {"updated_at": "now()"}
                if context:
                    updates["context"] = context
                if meaning_note:
                    updates["meaning_note"] = meaning_note
                res_up = (
                    self.client.table("user_sense_notes")
                    .update(updates)
                    .eq("id", existing.data["id"])
                    .execute()
                )
                return res_up.data[0] if res_up.data else existing.data

            payload = {
                "user_id": user_id,
                "sense_id": clean_sense_id,
                "context": context,
                "meaning_note": meaning_note,
            }
            res = self.client.table("user_sense_notes").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error save_user_sense_note: {e}")
            return None

    # ── USER SENSE STATS (Thống kê theo từng dạng bài tập) ───────────────────

    def ensure_user_sense_stats(self, user_id: str, sense_id: str) -> Optional[Dict[str, Any]]:
        """Đảm bảo tồn tại bản ghi user_sense_stats cho cặp (user_id, sense_id)."""
        clean_sense_id = _clean_sense_id(sense_id)
        try:
            existing = (
                self.client.table("user_sense_stats")
                .select("*")
                .eq("user_id", user_id)
                .eq("sense_id", clean_sense_id)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                return existing.data

            payload = {
                "user_id": user_id,
                "sense_id": clean_sense_id,
                "hard_score": 0.0,
            }
            res = self.client.table("user_sense_stats").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error ensure_user_sense_stats: {e}")
            return None

    def update_flashcard_review(
        self,
        user_id: str,
        sense_id: str,
        is_success: bool,
        exercise_type: str,  # 'choose', 'fill', 'write', 'listen'
        new_hard_score: Optional[float] = None,
        next_review_iso: Optional[str] = None,
        repetition_loop_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Cập nhật kết quả làm bài ôn tập flashcard cho user."""
        clean_sense_id = _clean_sense_id(sense_id)
        norm_type = "choose" if exercise_type in ("chose", "choose") else exercise_type
        try:
            # 1. Cập nhật thống kê chi tiết theo loại bài tập (user_sense_stats)
            stats_rec = self.ensure_user_sense_stats(user_id, clean_sense_id)
            if stats_rec:
                col = f"{norm_type}_true_count" if is_success else f"{norm_type}_fail_count"
                updates = {
                    col: stats_rec.get(col, 0) + 1,
                    "updated_at": "now()",
                }
                if new_hard_score is not None:
                    updates["hard_score"] = new_hard_score
                self.client.table("user_sense_stats").update(updates).eq("id", stats_rec["id"]).execute()

            # 2. Cập nhật tiến độ lặp lại ngắt quãng (user_sense_progress)
            prog = (
                self.client.table("user_sense_progress")
                .select("*")
                .eq("user_id", user_id)
                .eq("sense_id", clean_sense_id)
                .maybe_single()
                .execute()
            )
            if prog and prog.data:
                prog_updates: Dict[str, Any] = {
                    "last_review": "now()",
                    "updated_at": "now()",
                }
                if not is_success:
                    prog_updates["wrong_count"] = prog.data.get("wrong_count", 0) + 1
                if next_review_iso:
                    prog_updates["next_review"] = next_review_iso
                if repetition_loop_id is not None:
                    prog_updates["current_repetition_id"] = repetition_loop_id
                self.client.table("user_sense_progress").update(prog_updates).eq("id", prog.data["id"]).execute()

            # 3. Ghi log lịch sử làm bài vào user_sense_attempts
            self.record_sense_attempt(
                user_id=user_id,
                sense_id=clean_sense_id,
                activity_type=norm_type,
                is_correct=is_success,
            )

            # 4. Cập nhật last_review trên user_stats
            self.client.table("user_stats").upsert({
                "user_id": user_id,
                "last_review": "now()",
                "updated_at": "now()",
            }, on_conflict="user_id").execute()

            return stats_rec
        except Exception as e:
            logger.error(f"Error in update_flashcard_review: {e}")
            return None

    # ── USER STATS (Thống kê tổng hợp của user) ─────────────────────────────

    def record_user_translation_stats(
        self,
        user_id: str,
        word_count_inc: int = 1,
        sense_count_inc: int = 1
    ) -> Optional[Dict[str, Any]]:
        """Cập nhật tổng số từ/nghĩa đã gặp và thời gian dịch gần nhất vào user_stats."""
        try:
            existing = (
                self.client.table("user_stats")
                .select("*")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            if existing and existing.data:
                res_up = (
                    self.client.table("user_stats")
                    .update({
                        "total_word_match": existing.data.get("total_word_match", 0) + word_count_inc,
                        "total_sense_match": existing.data.get("total_sense_match", 0) + sense_count_inc,
                        "last_translated": "now()",
                        "updated_at": "now()",
                    })
                    .eq("user_id", user_id)
                    .execute()
                )
                return res_up.data[0] if res_up.data else existing.data

            payload = {
                "user_id": user_id,
                "total_word_match": word_count_inc,
                "total_sense_match": sense_count_inc,
                "last_translated": "now()",
                "updated_at": "now()",
            }
            res = self.client.table("user_stats").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error record_user_translation_stats for user {user_id}: {e}")
            return None

    # ── USER SENSE ATTEMPTS (Lịch sử tương tác / bài tập / dịch) ─────────────

    def record_sense_attempt(
        self,
        user_id: str,
        sense_id: str,
        activity_type: str,
        is_correct: bool,
        user_answer: Optional[str] = None,
        context: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Lưu lại một lượt tương tác (choose, fill, write, listen, translate) vào user_sense_attempts."""
        valid_activities = {'choose', 'fill', 'write', 'listen', 'translate'}
        norm_type = "choose" if activity_type in ("chose", "choose") else activity_type
        if norm_type not in valid_activities:
            norm_type = "translate"

        clean_sense_id = _clean_sense_id(sense_id)
        try:
            payload = {
                "user_id": user_id,
                "sense_id": clean_sense_id,
                "activity_type": norm_type,
                "is_correct": is_correct,
                "user_answer": user_answer,
                "context": context,
            }
            res = self.client.table("user_sense_attempts").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error record_sense_attempt: {e}")
            return None

    # ── WORKFLOW SAVE (Lưu dữ liệu khi người dùng thực hiện dịch thuật) ───────

    def save_translation_vocab_item(
        self,
        item: VocabItem,
        user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Lưu toàn bộ thông tin từ vựng và nghĩa trích xuất khi dịch:
        1. Bảng dùng chung (words, senses, word_forms): LUÔN ĐƯỢC LƯU DÙ USER ĐÃ ĐĂNG NHẬP HAY CHƯA.
        2. Bảng ràng buộc người dùng (user_words, user_sense_progress, user_sense_notes,
           user_sense_stats, user_stats, user_sense_attempts): CHỈ ĐƯỢC LƯU KHI user_id TỒN TẠI.
        """
        clean_word = item.word.strip().lower()
        if not clean_word:
            return None

        try:
            # 1. Lưu hoặc lấy word từ bảng words (không ràng buộc user)
            word_rec = self.get_or_create_word(clean_word)
            word_id = word_rec["id"] if word_rec else None

            # Lưu biến thể (form_text) vào word_forms nếu khác với clean_word
            raw_surface = item.word.strip()
            if word_id and raw_surface.lower() != raw_surface:
                self.add_word_form(word_id=word_id, form_text=raw_surface, form_type="surface")

            # 2. Xác định ID cho sense: sử dụng id của sense từ wordnet ra để tránh trùng lặp
            meaning_text = (item.contextual_meaning or item.concept_definition or clean_word).strip()

            wordnet_sense_id = item.sense_id
            if not wordnet_sense_id and item.context_id:
                if item.context_id.startswith("ctx_wn_"):
                    wordnet_sense_id = item.context_id.removeprefix("ctx_wn_")
                else:
                    wordnet_sense_id = item.context_id

            sense_id = _clean_sense_id(wordnet_sense_id, f"{word_id}_{clean_word}")
            item.sense_id = sense_id

            # 3. Lưu hoặc cập nhật sense vào bảng senses (không ràng buộc user)
            sense_model = SenseModel(
                id=sense_id,
                word_id=word_id,
                meaning_vi=meaning_text[:255],
                definition_en=item.concept_definition,
                example_en=item.simple_example,
                synonyms=item.synonyms or [],
                antonyms=item.antonyms or [],
                confidence_score=min(1.0, max(0.0, float(item.similarity_score or 0.0))),
                is_trusted=bool(item.is_trusted),
                part_of_speech=item.pos,
                ipa=item.ipa,
                rating_score=4.5 if item.is_trusted else 0.0,
            )
            saved_sense = self.upsert_sense(sense_model)
            actual_sense_id = (saved_sense["id"] if saved_sense else None) or sense_id

            # ─────────────────────────────────────────────────────────────────
            # NẾU USER CHƯA ĐĂNG NHẬP (user_id is None): DỪNG LẠI TẠI ĐÂY!
            # Không lưu vào các bảng có ràng buộc user_id (user_words, user_sense_progress, ...)
            # ─────────────────────────────────────────────────────────────────
            if not user_id:
                return {
                    "word": word_rec,
                    "sense": saved_sense or sense_model.model_dump(),
                }

            # 4. Khi User ĐÃ đăng nhập: Lưu vào các bảng ràng buộc user
            if word_id:
                self.record_user_word(user_id=user_id, word_id=word_id)

            if actual_sense_id:
                # Cập nhật tiến độ học sense
                self.record_user_sense_progress(user_id=user_id, sense_id=actual_sense_id)

                # Lưu ngữ cảnh dịch câu của user
                if item.context_sentence or item.contextual_meaning:
                    self.save_user_sense_note(
                        user_id=user_id,
                        sense_id=actual_sense_id,
                        context=item.context_sentence,
                        meaning_note=item.contextual_meaning,
                    )

                # Đảm bảo bảng thống kê bài tập được khởi tạo
                self.ensure_user_sense_stats(user_id=user_id, sense_id=actual_sense_id)

                # Ghi nhận lượt tương tác dịch thuật vào lịch sử attempts
                self.record_sense_attempt(
                    user_id=user_id,
                    sense_id=actual_sense_id,
                    activity_type="translate",
                    is_correct=True,
                    user_answer=item.contextual_meaning,
                    context=item.context_sentence,
                )

            # Cập nhật tổng số từ/nghĩa đã match trong user_stats
            self.record_user_translation_stats(
                user_id=user_id,
                word_count_inc=1,
                sense_count_inc=1,
            )

            return {
                "word": word_rec,
                "sense": saved_sense or sense_model.model_dump(),
                "user_id": user_id,
            }
        except Exception as e:
            logger.error(f"Error in save_translation_vocab_item for '{clean_word}': {e}")
            return None

    # ── TRÍCH XUẤT VÀ THỐNG KÊ (Extraction & Analytics queries) ─────────────

    def get_user_word_with_meanings(self, user_id: str, word_text: str) -> Optional[Dict[str, Any]]:
        """
        Trích xuất thông tin một từ vựng cùng tất cả senses và tiến độ cá nhân của user:
        - Thông tin word từ bảng words
        - Thống kê dịch từ bảng user_words
        - Danh sách senses từ bảng senses
        - Với mỗi sense: user_sense_progress, user_sense_notes, user_sense_stats
        """
        clean_word = word_text.strip().lower()
        try:
            word_rec = self.get_word_by_text(clean_word)
            if not word_rec:
                return None

            word_id = word_rec["id"]

            # Lấy thống kê user_words
            user_word_res = (
                self.client.table("user_words")
                .select("*")
                .eq("user_id", user_id)
                .eq("word_id", word_id)
                .maybe_single()
                .execute()
            )
            user_word_data = user_word_res.data if user_word_res else None

            # Lấy các senses
            senses = self.get_word_senses(word_id)
            enriched_senses = []
            for s in senses:
                s_id = s["id"]
                # Lấy tiến độ SRS
                prog_res = (
                    self.client.table("user_sense_progress")
                    .select("*")
                    .eq("user_id", user_id)
                    .eq("sense_id", s_id)
                    .maybe_single()
                    .execute()
                )
                # Lấy ghi chú & ngữ cảnh
                note_res = (
                    self.client.table("user_sense_notes")
                    .select("*")
                    .eq("user_id", user_id)
                    .eq("sense_id", s_id)
                    .maybe_single()
                    .execute()
                )
                # Lấy thống kê bài tập
                stats_res = (
                    self.client.table("user_sense_stats")
                    .select("*")
                    .eq("user_id", user_id)
                    .eq("sense_id", s_id)
                    .maybe_single()
                    .execute()
                )

                enriched_senses.append({
                    **s,
                    "progress": prog_res.data if prog_res else None,
                    "notes": note_res.data if note_res else None,
                    "stats": stats_res.data if stats_res else None,
                })

            return {
                "word": word_rec,
                "user_word": user_word_data,
                "senses": enriched_senses,
            }
        except Exception as e:
            logger.error(f"Error fetching word with meanings for user {user_id}: {e}")
            return None

    def get_user_overall_stats(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Trích xuất bảng thống kê tổng thể user_stats cùng các chỉ số phái sinh."""
        try:
            res = (
                self.client.table("user_stats")
                .select("*")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            data = res.data if res else None
            if not data:
                return {
                    "user_id": user_id,
                    "total_word_match": 0,
                    "total_sense_match": 0,
                    "last_translated": None,
                    "last_review": None,
                }
            return data
        except Exception as e:
            logger.error(f"Error get_user_overall_stats: {e}")
            return None

    def get_due_reviews(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Trích xuất danh sách senses đến hạn ôn tập SRS (next_review <= now())."""
        try:
            res = (
                self.client.table("user_sense_progress")
                .select("*, senses(*, words(*))")
                .eq("user_id", user_id)
                .lte("next_review", "now()")
                .order("next_review", desc=False)
                .limit(limit)
                .execute()
            )
            return res.data or []
        except Exception as e:
            logger.error(f"Error get_due_reviews: {e}")
            return []
