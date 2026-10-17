import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from loguru import logger

from src.core.database import get_database
from src.core.supabase import get_system_client, get_supabase
from src.flashcard.engines.scoring_engine import ScoringEngine


class FlashcardRepository:
    """
    Quản lý lưu trữ Flashcard Sets, Sessions, Daily Usage và đồng bộ từ vựng với Supabase PostgreSQL.
    """

    def __init__(self):
        self._supabase = None

    @property
    def db(self):
        return get_database()

    @property
    def supabase(self):
        if self._supabase is None:
            try:
                self._supabase = get_system_client()
            except Exception:
                self._supabase = get_supabase()
        return self._supabase

    # ── FLASHCARD SETS ───────────────────────────────────────────────────────

    async def get_all_sets(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lấy tất cả các bộ flashcard công khai hoặc bộ private mà user có quyền truy cập."""
        if self.db is None:
            return []

        query: Dict[str, Any] = {"$or": [{"is_public": True}]}
        if user_id:
            query["$or"].extend([
                {"creator_id": user_id},
                {"allowed_user_ids": user_id}
            ])

        cursor = self.db["flashcard_sets"].find(query).sort("created_at", -1)
        results = await cursor.to_list(length=200)
        for r in results:
            if "_id" in r:
                r["id"] = str(r["_id"])
                del r["_id"]
        return results

    async def get_set_by_id(self, set_id: str) -> Optional[Dict[str, Any]]:
        """Tìm bộ flashcard theo ID."""
        if self.db is None:
            return None

        # Check by id field or _id string
        doc = await self.db["flashcard_sets"].find_one({"$or": [{"id": set_id}, {"_id": set_id}]})
        if doc:
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
                del doc["_id"]
            return doc
        return None

    async def create_set(self, data: Dict[str, Any], creator_id: Optional[str] = None) -> Dict[str, Any]:
        """Tạo mới một bộ flashcard."""
        set_id = data.get("id") or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "id": set_id,
            "title": data.get("title", "Untitled Flashcard Set"),
            "description": data.get("description", ""),
            "is_public": data.get("is_public", False),
            "set_type": data.get("set_type", "manual"),
            "creator_id": creator_id,
            "invite_code": data.get("invite_code") or uuid.uuid4().hex[:6].upper(),
            "allowed_user_ids": data.get("allowed_user_ids", []),
            "settings": data.get("settings") or {},
            "cards": data.get("cards") or [],
            "created_at": now,
            "updated_at": now,
        }

        if self.db is not None:
            await self.db["flashcard_sets"].insert_one(doc.copy())

        return doc

    async def update_set(self, set_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Cập nhật thông tin bộ flashcard."""
        if self.db is None:
            return None

        updates = {k: v for k, v in data.items() if v is not None and k not in ("id", "_id")}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        await self.db["flashcard_sets"].update_one(
            {"$or": [{"id": set_id}, {"_id": set_id}]},
            {"$set": updates}
        )
        return await self.get_set_by_id(set_id)

    async def delete_set(self, set_id: str) -> bool:
        """Xóa bộ flashcard."""
        if self.db is None:
            return False
        res = await self.db["flashcard_sets"].delete_one({"$or": [{"id": set_id}, {"_id": set_id}]})
        return res.deleted_count > 0

    async def find_by_invite_code(self, code: str) -> Optional[Dict[str, Any]]:
        """Tìm bộ flashcard private theo mã mời."""
        if self.db is None or not code:
            return None
        doc = await self.db["flashcard_sets"].find_one({"invite_code": code.strip().upper()})
        if doc:
            if "_id" in doc:
                doc["id"] = str(doc["_id"])
                del doc["_id"]
            return doc
        return None

    async def add_allowed_user(self, set_id: str, user_id: str) -> bool:
        """Thêm user vào danh sách được phép tham gia bộ private."""
        if self.db is None:
            return False
        await self.db["flashcard_sets"].update_one(
            {"$or": [{"id": set_id}, {"_id": set_id}]},
            {"$addToSet": {"allowed_user_ids": user_id}}
        )
        return True

    # ── DAILY USAGE & LIMITS ────────────────────────────────────────────────

    def _get_current_day_window(self, reset_time_str: str = "07:00") -> str:
        """
        Tính toán chu kỳ ngày học dựa trên reset_time (mặc định 07:00 sáng).
        Nếu hiện tại < 07:00 sáng thì tính thuộc về ngày hôm trước.
        """
        now = datetime.now(timezone.utc)
        try:
            hour, minute = map(int, reset_time_str.split(":"))
        except Exception:
            hour, minute = 7, 0

        reset_today = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if now < reset_today:
            active_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        else:
            active_date = now.strftime("%Y-%m-%d")
        return active_date

    async def get_user_usage(
        self,
        user_id: str,
        set_id: str,
        daily_limit: int,
        reset_time_str: str = "07:00",
        event_start_at: Optional[str] = None,
        event_end_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Kiểm tra số lượt đã chơi trong ngày và tính toán xem user có được phép chơi tiếp không.
        Kiểm tra thời gian mở/đóng bộ thẻ (event_start_at, event_end_at).
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        event_status = "active"

        if event_start_at and now_iso < event_start_at:
            event_status = "not_started"
        elif event_end_at and now_iso > event_end_at:
            event_status = "ended"

        active_day = self._get_current_day_window(reset_time_str)
        used_today = 0

        if self.db is not None:
            record = await self.db["flashcard_daily_usage"].find_one({
                "user_id": user_id,
                "set_id": set_id,
                "date_key": active_day
            })
            if record:
                used_today = record.get("count", 0)

        is_unlimited = (daily_limit <= 0)
        remaining = 9999 if is_unlimited else max(0, daily_limit - used_today)
        can_play = (event_status == "active") and (is_unlimited or remaining > 0)

        return {
            "can_play": can_play,
            "daily_limit": daily_limit,
            "used_today": used_today,
            "remaining": remaining,
            "event_status": event_status,
            "active_day": active_day,
            "reset_time": reset_time_str,
        }

    async def increment_usage(self, user_id: str, set_id: str, reset_time_str: str = "07:00") -> None:
        """Tăng số lượt chơi trong ngày của user lên 1."""
        if self.db is None:
            return
        active_day = self._get_current_day_window(reset_time_str)
        await self.db["flashcard_daily_usage"].update_one(
            {"user_id": user_id, "set_id": set_id, "date_key": active_day},
            {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True
        )

    # ── SESSIONS ─────────────────────────────────────────────────────────────

    async def create_session(self, session_data: Dict[str, Any]) -> None:
        """Lưu phiên học vào MongoDB."""
        if self.db is not None:
            await self.db["flashcard_sessions"].insert_one(session_data.copy())

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Lấy thông tin phiên học."""
        if self.db is None:
            return None
        return await self.db["flashcard_sessions"].find_one({"session_id": session_id})

    async def update_session(self, session_id: str, updates: Dict[str, Any]) -> None:
        """Cập nhật tiến độ của phiên học."""
        if self.db is not None:
            await self.db["flashcard_sessions"].update_one(
                {"session_id": session_id},
                {"$set": updates}
            )

    async def delete_session(self, session_id: str) -> None:
        """Xóa phiên học sau khi hoàn thành."""
        if self.db is not None:
            await self.db["flashcard_sessions"].delete_one({"session_id": session_id})

    # ── PROFICIENCY & LEITNER SRS ────────────────────────────────────────────

    async def get_user_word_proficiency(self, user_id: str, word: str) -> Dict[str, Any]:
        """Lấy điểm thông thạo và tiến trình Leitner của từ đối với user."""
        clean_word = word.strip().lower()
        if self.db is not None:
            doc = await self.db["user_word_proficiency"].find_one({
                "user_id": user_id,
                "word": clean_word
            })
            if doc:
                return {
                    "proficiency": doc.get("proficiency", 0.0),
                    "leitner_box": doc.get("leitner_box", 1),
                    "attempts": doc.get("attempts", 0),
                    "correct_count": doc.get("correct_count", 0),
                }
        return {"proficiency": 0.0, "leitner_box": 1, "attempts": 0, "correct_count": 0}

    async def update_user_word_proficiency(
        self,
        user_id: str,
        word: str,
        delta: float,
        is_correct: bool,
        max_boxes: int = 5
    ) -> Dict[str, Any]:
        """
        Cập nhật độ thông thạo của từ và chuyển đổi Leitner box:
        - Nếu đúng: tăng box (tối đa max_boxes)
        - Nếu sai: rơi về box 1
        """
        clean_word = word.strip().lower()
        now = datetime.now(timezone.utc).isoformat()
        current = await self.get_user_word_proficiency(user_id, clean_word)

        new_proficiency = round(current["proficiency"] + delta, 1)
        new_attempts = current["attempts"] + 1
        new_correct = current["correct_count"] + (1 if is_correct else 0)

        current_box = current.get("leitner_box", 1)
        if is_correct:
            new_box = min(max_boxes, current_box + 1)
        else:
            new_box = 1  # Reset về box 1 theo nguyên lý Leitner khi trả lời sai

        if self.db is not None:
            await self.db["user_word_proficiency"].update_one(
                {"user_id": user_id, "word": clean_word},
                {"$set": {
                    "proficiency": new_proficiency,
                    "leitner_box": new_box,
                    "attempts": new_attempts,
                    "correct_count": new_correct,
                    "last_reviewed": now,
                    "updated_at": now
                }},
                upsert=True
            )

        return {
            "proficiency": new_proficiency,
            "leitner_box": new_box,
            "attempts": new_attempts,
            "correct_count": new_correct
        }

    # ── ENGLISH WORDS REGISTRATION & MATCH COUNT (MỤC 4 SPECIFICATION) ─────────

    async def record_english_words_exposure(
        self,
        user_id: Optional[str],
        text: str,
        is_answer: bool = False
    ) -> List[str]:
        """
        Hiện thực nguyên tắc cốt lõi từ mục 4 specification:
        'Mỗi từ xuất hiện trong flashcard (Câu trả lời, câu hỏi) nếu là tiếng Anh,
        nó sẽ được ghi nhận và lưu như 1 từ tiếng Anh,
        nếu là từ đã có trong kho của user tăng match_count lên 1.'
        """
        words = ScoringEngine.extract_english_words(text)
        if not words or self.supabase is None:
            return words

        now_iso = datetime.now(timezone.utc).isoformat()

        for w in words:
            clean_w = w.lower()
            try:
                # 1. Đảm bảo từ đã tồn tại trong bảng words toàn hệ thống
                word_rec = self.supabase.table("words").select("id").eq("word_text", clean_w).maybe_single().execute()
                word_id = None
                if word_rec and word_rec.data:
                    word_id = word_rec.data.get("id")
                else:
                    new_w = self.supabase.table("words").insert({
                        "word_text": clean_w,
                        "created_at": now_iso,
                        "updated_at": now_iso
                    }).execute()
                    if new_w.data:
                        word_id = new_w.data[0].get("id")

                # 2. Nếu có user_id: Kiểm tra kho từ của user (user_words & user_word_statistics)
                if user_id and word_id:
                    # Kiểm tra user_words
                    uw_rec = self.supabase.table("user_words").select(
                        "id, translated_count"
                    ).eq("user_id", user_id).eq("word_id", word_id).maybe_single().execute()

                    if uw_rec and uw_rec.data:
                        # Đã có trong kho user -> tăng translated_count / review_count
                        uw_id = uw_rec.data["id"]
                        self.supabase.table("user_words").update({
                            "updated_at": now_iso
                        }).eq("id", uw_id).execute()
                    else:
                        # Chưa có -> ghi nhận mới
                        self.supabase.table("user_words").insert({
                            "user_id": user_id,
                            "word_id": word_id,
                            "translated_count": 0,
                            "created_at": now_iso,
                            "updated_at": now_iso
                        }).execute()

                    # Cập nhật user_word_statistics: Tăng encountered_count & match_count
                    stat_rec = self.supabase.table("user_word_statistics").select(
                        "id, encountered_count, total_count"
                    ).eq("user_id", user_id).eq("word", clean_w).maybe_single().execute()

                    if stat_rec and stat_rec.data:
                        s_id = stat_rec.data["id"]
                        enc = stat_rec.data.get("encountered_count", 0) + 1
                        tot = stat_rec.data.get("total_count", 0) + 1
                        self.supabase.table("user_word_statistics").update({
                            "encountered_count": enc,
                            "total_count": tot,
                            "last_seen": now_iso,
                            "updated_at": now_iso
                        }).eq("id", s_id).execute()
                    else:
                        self.supabase.table("user_word_statistics").insert({
                            "user_id": user_id,
                            "word": clean_w,
                            "encountered_count": 1,
                            "translated_count": 0,
                            "total_count": 1,
                            "last_seen": now_iso,
                            "created_at": now_iso,
                            "updated_at": now_iso
                        }).execute()

                # 3. Tăng match_count trên bảng senses nếu khớp từ vựng
                self.supabase.rpc("increment_sense_match", {"p_word": clean_w}).execute()
            except Exception as e:
                # Log graceful degradation không ngắt flow học của user
                logger.debug(f"record_english_words_exposure notice for '{clean_w}': {e}")

        return words
