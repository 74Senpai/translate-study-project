from typing import Optional, List, Dict, Any
from loguru import logger
from supabase import Client
from src.core.supabase import get_supabase, get_system_client
from src.translate.models.vocab_db_models import (
    UserWordModel,
    WordMeaningModel,
    FlashcardStatisticsModel,
    SenseModel,
    UserWordStatsModel,
)


class SupabaseVocabRepository:
    """
    Repository tương tác với Supabase PostgreSQL:
    - users, senses, user_words, word_meanings, flashcard_statistics, user_word_statistics
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

    # ── SENSES (Kho tri thức WSD & Cache chung) ──────────────────────────────

    def get_sense(self, sense_id: str) -> Optional[Dict[str, Any]]:
        """Lấy thông tin sense từ cache theo id."""
        try:
            res = self.client.table("senses").select("*").eq("id", sense_id).maybe_single().execute()
            return res.data
        except Exception as e:
            logger.error(f"Error fetching sense {sense_id}: {e}")
            return None

    def upsert_sense(self, sense: SenseModel) -> Optional[Dict[str, Any]]:
        """Lưu hoặc cập nhật sense vào bảng senses thông qua RPC hoặc table upsert."""
        try:
            res = self.client.rpc(
                "upsert_sense_cache",
                {
                    "p_id": sense.id,
                    "p_meaning": sense.meaning,
                    "p_define": sense.define,
                    "p_example": sense.example,
                    "p_pos": sense.pos,
                    "p_ipa": sense.ipa,
                    "p_synonyms": sense.synonyms,
                    "p_antonyms": sense.antonyms,
                    "p_confidence": sense.confidence,
                    "p_trusted": sense.trusted,
                    "p_rate": sense.rate,
                },
            ).execute()
            return res.data
        except Exception as e:
            logger.warning(f"RPC upsert_sense_cache failed ({e}), falling back to direct table upsert.")
            try:
                payload = sense.model_dump(exclude_none=True)
                res = self.client.table("senses").upsert(payload, on_conflict="id").execute()
                return res.data[0] if res.data else None
            except Exception as e2:
                logger.error(f"Failed to upsert sense {sense.id}: {e2}")
                return None

    # ── USER_WORDS & WORD_MEANINGS ──────────────────────────────────────────

    def get_or_create_user_word(self, user_id: str, text: str) -> Optional[Dict[str, Any]]:
        """Lấy hoặc tạo mới bản ghi user_words cho user và từ vựng tương ứng."""
        clean_text = text.strip().lower()
        try:
            # Tìm kiếm xem từ đã tồn tại chưa
            existing = (
                self.client.table("user_words")
                .select("*")
                .eq("user_id", user_id)
                .eq("text", clean_text)
                .maybe_single()
                .execute()
            )
            if existing.data:
                # Tăng translate_count
                updated = (
                    self.client.table("user_words")
                    .update({
                        "translate_count": existing.data["translate_count"] + 1,
                        "last_translate": "now()",
                    })
                    .eq("id", existing.data["id"])
                    .execute()
                )
                return updated.data[0] if updated.data else existing.data

            # Tạo mới nếu chưa có
            new_word = {
                "user_id": user_id,
                "text": clean_text,
                "translate_count": 1,
                "review_count": 0,
                "status": "learning",
            }
            res = self.client.table("user_words").insert(new_word).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error get_or_create_user_word: {e}")
            return None

    def add_word_meaning(self, meaning: WordMeaningModel) -> Optional[Dict[str, Any]]:
        """
        Thêm một nghĩa mới cho user_word.
        Trigger trg_auto_create_flashcard_stat trên Supabase sẽ tự động tạo flashcard_statistics!
        """
        try:
            payload = meaning.model_dump(exclude={"id", "created_at", "updated_at"}, exclude_none=True)
            res = self.client.table("word_meanings").insert(payload).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error add_word_meaning: {e}")
            return None

    def get_user_word_with_meanings(self, user_id: str, word: str) -> Optional[Dict[str, Any]]:
        """Lấy thông tin từ vựng cùng tất cả các nghĩa theo ngữ cảnh và flashcard stats."""
        try:
            res = (
                self.client.table("user_words")
                .select("*, word_meanings(*, flashcard_statistics(*), senses(*))")
                .eq("user_id", user_id)
                .eq("text", word.strip().lower())
                .maybe_single()
                .execute()
            )
            return res.data
        except Exception as e:
            logger.error(f"Error fetching word with meanings: {e}")
            return None

    # ── FLASHCARD STATISTICS & SRS ──────────────────────────────────────────

    def update_flashcard_review(
        self,
        flashcard_id: str,
        is_success: bool,
        exercise_type: str,  # 'chose', 'fill', 'write'
        new_hard_score: Optional[float] = None,
        next_review_iso: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Cập nhật kết quả làm bài ôn tập flashcard."""
        try:
            current = (
                self.client.table("flashcard_statistics")
                .select("*")
                .eq("id", flashcard_id)
                .single()
                .execute()
            )
            data = current.data
            updates: Dict[str, Any] = {
                "review_count": data["review_count"] + 1,
                "last_review": "now()",
            }
            if is_success:
                updates["success_count"] = data["success_count"] + 1
            if new_hard_score is not None:
                updates["hard_score"] = new_hard_score
            if next_review_iso:
                updates["next_review"] = next_review_iso
                updates["repe_loop"] = data["repe_loop"] + 1

            if exercise_type == "chose":
                key = "chose_true_count" if is_success else "chose_fail_count"
                updates[key] = data[key] + 1
            elif exercise_type == "fill":
                key = "fill_true_count" if is_success else "fill_fail_count"
                updates[key] = data[key] + 1
            elif exercise_type == "write":
                key = "write_true_count" if is_success else "write_fail_count"
                updates[key] = data[key] + 1

            res = self.client.table("flashcard_statistics").update(updates).eq("id", flashcard_id).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.error(f"Error updating flashcard review: {e}")
            return None

    # ── USER WORD STATS (Số lần gặp, số lần dịch) ────────────────────────────

    def record_interaction(
        self,
        user_id: str,
        word: str,
        is_translate: bool = False,
        source: str = "web",
    ) -> None:
        """Ghi nhận số lần gặp và số lần dịch một từ."""
        try:
            self.client.rpc(
                "record_word_interaction",
                {
                    "p_user_id": user_id,
                    "p_word": word,
                    "p_is_translate": is_translate,
                    "p_source": source,
                },
            ).execute()
        except Exception as e:
            logger.error(f"Error recording word interaction: {e}")
