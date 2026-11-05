import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from loguru import logger

from src.core.supabase import get_system_client, get_supabase
from src.flashcard.engines.scoring_engine import ScoringEngine


class FlashcardRepository:
    """
    Quản lý lưu trữ Flashcard Sets, Cards, Sessions, Daily Usage và Space Repetition (Leitner SRS).
    Hoạt động 100% trên cơ sở dữ liệu Supabase PostgreSQL (schema.sql).
    """

    def __init__(self):
        self._supabase = None

    @property
    def supabase(self):
        if self._supabase is None:
            try:
                self._supabase = get_system_client()
            except Exception:
                self._supabase = get_supabase()
        return self._supabase

    # ── SPACE REPETITION CONFIG (REPETITION LOOPS) ───────────────────────────

    async def get_repetition_loops(self) -> List[Dict[str, Any]]:
        """
        Lấy cấu hình các loop / box của thuật toán Space Repetition từ bảng repetition_loops trong Supabase.
        Mỗi row tương ứng 1 Leitner box với khoảng cách ngày ôn tập (day_repetition).
        """
        default_loops = [
            {"id": 1, "loop_order": 1, "day_repetition": 1, "pre_loop_id": None, "next_loop_id": 2},
            {"id": 2, "loop_order": 2, "day_repetition": 2, "pre_loop_id": 1, "next_loop_id": 3},
            {"id": 3, "loop_order": 3, "day_repetition": 5, "pre_loop_id": 1, "next_loop_id": 4},
            {"id": 4, "loop_order": 4, "day_repetition": 8, "pre_loop_id": 1, "next_loop_id": 5},
            {"id": 5, "loop_order": 5, "day_repetition": 14, "pre_loop_id": 1, "next_loop_id": None},
        ]

        if not self.supabase:
            return default_loops

        try:
            res = self.supabase.table("repetition_loops").select("*").order("loop_order").execute()
            if res and res.data and len(res.data) > 0:
                return res.data
        except Exception as e:
            logger.warning(f"Could not load repetition_loops from Supabase ({e}). Using default Leitner intervals.")

        return default_loops

    async def update_repetition_loops(self, boxes: List[int]) -> List[Dict[str, Any]]:
        """
        Cập nhật cấu hình khoảng cách ngày ôn tập (day_repetition) của các box trong Supabase.
        Chỉ Admin mới có quyền gọi cập nhật này. Áp dụng cho toàn bộ hệ thống.
        """
        if not boxes:
            return await self.get_repetition_loops()

        if self.supabase:
            try:
                # 1. Xóa các loop có loop_order > len(boxes) nếu Admin giảm bớt số lượng box
                existing = await self.get_repetition_loops()
                for old_loop in existing:
                    old_order = old_loop.get("loop_order", 0)
                    if old_order > len(boxes):
                        try:
                            self.supabase.table("repetition_loops").delete().eq("id", old_loop.get("id")).execute()
                        except Exception as del_err:
                            logger.warning(f"Error removing excess loop {old_order}: {del_err}")

                # 2. Upsert từng box theo thứ tự
                for idx, days in enumerate(boxes):
                    loop_order = idx + 1
                    self.supabase.table("repetition_loops").upsert({
                        "loop_order": loop_order,
                        "day_repetition": max(1, int(days)),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }, on_conflict="loop_order").execute()

                # 3. Làm mới các con trỏ pre_loop_id và next_loop_id
                all_loops = await self.get_repetition_loops()
                for i, loop in enumerate(all_loops):
                    pre_id = all_loops[i - 1]["id"] if i > 0 else None
                    next_id = all_loops[i + 1]["id"] if i < len(all_loops) - 1 else None
                    self.supabase.table("repetition_loops").update({
                        "pre_loop_id": pre_id,
                        "next_loop_id": next_id
                    }).eq("id", loop["id"]).execute()

                return await self.get_repetition_loops()
            except Exception as e:
                logger.error(f"Error updating repetition_loops in Supabase: {e}")

        return await self.get_repetition_loops()

    # ── FLASHCARD SETS ───────────────────────────────────────────────────────

    async def get_all_sets(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lấy tất cả các bộ flashcard công khai hoặc bộ private mà user có quyền truy cập từ Supabase."""
        sets_map: Dict[str, Dict[str, Any]] = {}

        if not self.supabase:
            return []

        try:
            # Query sets
            query = self.supabase.table("flashcard_sets").select(
                "id, title, description, is_public, set_type, creator_id, invite_code, settings, created_at, updated_at"
            )
            if user_id:
                query = query.or_(f"is_public.eq.true,creator_id.eq.{user_id}")
            else:
                query = query.eq("is_public", True)

            res = query.order("created_at", desc=True).limit(100).execute()
            if res and res.data:
                set_ids = []
                for s in res.data:
                    s_id = str(s["id"])
                    s["id"] = s_id
                    s["allowed_user_ids"] = []
                    try:
                        cnt = self.supabase.table("flashcard_cards").select("id", count="exact", head=True).eq("set_id", s_id).execute()
                        card_count = cnt.count or 0
                    except Exception:
                        card_count = 0
                    s["cards"] = [{"id": f"{s_id}_{i}"} for i in range(card_count)]
                    sets_map[s_id] = s

            # Nếu là user đã đăng nhập, lấy thêm các bộ private được mời tham gia từ flashcard_set_members
            if user_id:
                mem_res = self.supabase.table("flashcard_set_members").select(
                    "set_id, flashcard_sets(*)"
                ).eq("user_id", user_id).execute()
                if mem_res and mem_res.data:
                    for row in mem_res.data:
                        set_obj = row.get("flashcard_sets")
                        if set_obj:
                            sid = str(set_obj["id"])
                            if sid not in sets_map:
                                set_obj["id"] = sid
                                set_obj["allowed_user_ids"] = []
                                try:
                                    cnt = self.supabase.table("flashcard_cards").select("id", count="exact", head=True).eq("set_id", sid).execute()
                                    card_count = cnt.count or 0
                                except Exception:
                                    card_count = 0
                                set_obj["cards"] = [{"id": f"{sid}_{i}"} for i in range(card_count)]
                                sets_map[sid] = set_obj

        except Exception as e:
            logger.warning(f"Supabase get_all_sets notice: {e}")

        return list(sets_map.values())

    async def get_set_by_id(self, set_id: str) -> Optional[Dict[str, Any]]:
        """Tìm bộ flashcard theo ID từ Supabase."""
        if not self.supabase:
            return None

        try:
            res = self.supabase.table("flashcard_sets").select("*").eq("id", set_id).maybe_single().execute()
            if res and res.data:
                doc = dict(res.data)
                doc["id"] = str(doc["id"])
                # Lấy danh sách thẻ từ flashcard_cards
                cards_res = self.supabase.table("flashcard_cards").select("*").eq("set_id", set_id).order("card_order").limit(5000).execute()
                cards = []
                if cards_res and cards_res.data:
                    for c in cards_res.data:
                        c["id"] = str(c["id"])
                        cards.append(c)
                doc["cards"] = cards

                # Lấy danh sách allowed_user_ids từ flashcard_set_members
                m_res = self.supabase.table("flashcard_set_members").select("user_id").eq("set_id", set_id).execute()
                doc["allowed_user_ids"] = [str(m["user_id"]) for m in (m_res.data or [])]
                return doc
        except Exception as e:
            logger.debug(f"Supabase get_set_by_id notice for {set_id}: {e}")

        return None

    async def create_set(self, data: Dict[str, Any], creator_id: Optional[str] = None) -> Dict[str, Any]:
        """Tạo mới một bộ flashcard và lưu trữ vào Supabase PostgreSQL."""
        raw_id = data.get("id")
        try:
            if raw_id and str(raw_id).lower() != "new":
                uuid.UUID(str(raw_id))
                set_id = str(raw_id)
            else:
                set_id = str(uuid.uuid4())
        except Exception:
            set_id = str(uuid.uuid4())

        now = datetime.now(timezone.utc).isoformat()

        # Validate creator_id
        raw_creator = creator_id or data.get("creator_id")
        valid_creator_id = None
        if raw_creator:
            try:
                uuid.UUID(str(raw_creator))
                valid_creator_id = str(raw_creator)
            except Exception:
                valid_creator_id = None

        if valid_creator_id and self.supabase:
            try:
                chk = self.supabase.table("profiles").select("id").eq("id", valid_creator_id).maybe_single().execute()
                if not chk or not chk.data:
                    valid_creator_id = None
            except Exception:
                valid_creator_id = None

        doc = {
            "id": set_id,
            "title": data.get("title", "Untitled Flashcard Set"),
            "description": data.get("description", ""),
            "is_public": data.get("is_public", False),
            "set_type": data.get("set_type", "manual"),
            "creator_id": valid_creator_id,
            "invite_code": data.get("invite_code") or uuid.uuid4().hex[:6].upper(),
            "allowed_user_ids": data.get("allowed_user_ids", []),
            "settings": data.get("settings") or {},
            "cards": data.get("cards") or [],
            "created_at": now,
            "updated_at": now,
        }

        # Lưu vào Supabase PostgreSQL
        if self.supabase:
            try:
                set_payload = {
                    "id": set_id,
                    "title": doc["title"],
                    "description": doc["description"],
                    "is_public": doc["is_public"],
                    "set_type": doc["set_type"],
                    "creator_id": doc["creator_id"],
                    "invite_code": doc["invite_code"],
                    "settings": doc["settings"],
                    "created_at": now,
                    "updated_at": now,
                }
                self.supabase.table("flashcard_sets").upsert(set_payload).execute()

                # Lưu cards nếu có
                raw_cards = doc.get("cards") or []
                if raw_cards:
                    card_rows = []
                    for idx, c in enumerate(raw_cards):
                        card_dict = c if isinstance(c, dict) else c.model_dump()
                        raw_c_id = card_dict.get("id")
                        try:
                            uuid.UUID(str(raw_c_id))
                            c_id = str(raw_c_id)
                        except Exception:
                            c_id = str(uuid.uuid4())

                        raw_sense = card_dict.get("sense_id")
                        valid_sense_id = None
                        if raw_sense:
                            try:
                                s_chk = self.supabase.table("senses").select("id").eq("id", str(raw_sense)).maybe_single().execute()
                                if s_chk and s_chk.data:
                                    valid_sense_id = str(raw_sense)
                            except Exception:
                                valid_sense_id = None

                        diff = (card_dict.get("difficulty") or "medium").lower()
                        if diff not in ("easy", "medium", "hard"):
                            diff = "medium"

                        card_rows.append({
                            "id": c_id,
                            "set_id": set_id,
                            "word": str(card_dict.get("word") or ""),
                            "meaning": str(card_dict.get("meaning") or ""),
                            "ipa": card_dict.get("ipa"),
                            "audio_url": card_dict.get("audio_url"),
                            "question": card_dict.get("question") or "",
                            "hint": card_dict.get("hint") or "",
                            "context": card_dict.get("context"),
                            "definition_en": card_dict.get("definition_en"),
                            "definition_vi": card_dict.get("definition_vi"),
                            "difficulty": diff,
                            "timer": max(1, int(card_dict.get("timer") or 15)),
                            "points": max(0, int(card_dict.get("points") or 10)),
                            "card_order": idx,
                            "tasks": card_dict.get("tasks") or {},
                            "sense_id": valid_sense_id,
                            "created_at": now,
                            "updated_at": now,
                        })
                    self.supabase.table("flashcard_cards").upsert(card_rows).execute()

                # Lưu creator vào flashcard_set_members
                if valid_creator_id:
                    self.supabase.table("flashcard_set_members").upsert({
                        "set_id": set_id,
                        "user_id": valid_creator_id,
                        "role": "owner",
                        "joined_at": now,
                    }, on_conflict="set_id,user_id").execute()
            except Exception as e:
                logger.warning(f"Error persisting flashcard set to Supabase: {e}")

        return doc

    async def update_set(self, set_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Cập nhật thông tin bộ flashcard trong Supabase."""
        now = datetime.now(timezone.utc).isoformat()
        updates = {k: v for k, v in data.items() if v is not None and k not in ("id", "_id")}
        updates["updated_at"] = now

        if self.supabase:
            try:
                base_updates = {k: v for k, v in updates.items() if k in (
                    "title", "description", "is_public", "set_type", "invite_code", "settings", "updated_at"
                )}
                if base_updates:
                    self.supabase.table("flashcard_sets").update(base_updates).eq("id", set_id).execute()

                # Cập nhật cards nếu có
                if "cards" in updates:
                    raw_cards = updates["cards"]
                    # Xóa cards cũ của set này và chèn lại danh sách mới
                    self.supabase.table("flashcard_cards").delete().eq("set_id", set_id).execute()
                    if raw_cards:
                        card_rows = []
                        for idx, c in enumerate(raw_cards):
                            card_dict = c if isinstance(c, dict) else c.model_dump()
                            raw_c_id = card_dict.get("id")
                            try:
                                uuid.UUID(str(raw_c_id))
                                c_id = str(raw_c_id)
                            except Exception:
                                c_id = str(uuid.uuid4())

                            raw_sense = card_dict.get("sense_id")
                            valid_sense_id = None
                            if raw_sense:
                                try:
                                    s_chk = self.supabase.table("senses").select("id").eq("id", str(raw_sense)).maybe_single().execute()
                                    if s_chk and s_chk.data:
                                        valid_sense_id = str(raw_sense)
                                except Exception:
                                    valid_sense_id = None

                            diff = (card_dict.get("difficulty") or "medium").lower()
                            if diff not in ("easy", "medium", "hard"):
                                diff = "medium"

                            card_rows.append({
                                "id": c_id,
                                "set_id": set_id,
                                "word": str(card_dict.get("word") or ""),
                                "meaning": str(card_dict.get("meaning") or ""),
                                "ipa": card_dict.get("ipa"),
                                "audio_url": card_dict.get("audio_url"),
                                "question": card_dict.get("question") or "",
                                "hint": card_dict.get("hint") or "",
                                "context": card_dict.get("context"),
                                "definition_en": card_dict.get("definition_en"),
                                "definition_vi": card_dict.get("definition_vi"),
                                "difficulty": diff,
                                "timer": max(1, int(card_dict.get("timer") or 15)),
                                "points": max(0, int(card_dict.get("points") or 10)),
                                "card_order": idx,
                                "tasks": card_dict.get("tasks") or {},
                                "sense_id": valid_sense_id,
                                "created_at": now,
                                "updated_at": now,
                            })
                        if card_rows:
                            # Batch insert chunks of 100
                            for b_start in range(0, len(card_rows), 100):
                                self.supabase.table("flashcard_cards").insert(card_rows[b_start:b_start + 100]).execute()

                # Cập nhật allowed_user_ids nếu có
                if "allowed_user_ids" in updates and isinstance(updates["allowed_user_ids"], list):
                    for u_id in updates["allowed_user_ids"]:
                        try:
                            uuid.UUID(str(u_id))
                            self.supabase.table("flashcard_set_members").upsert({
                                "set_id": set_id,
                                "user_id": str(u_id),
                                "role": "member",
                                "joined_at": now,
                            }, on_conflict="set_id,user_id").execute()
                        except Exception:
                            pass
            except Exception as e:
                logger.warning(f"Error updating flashcard set in Supabase: {e}")

        return await self.get_set_by_id(set_id)

    async def delete_set(self, set_id: str) -> bool:
        """Xóa bộ flashcard khỏi Supabase."""
        deleted = False
        if self.supabase:
            try:
                self.supabase.table("flashcard_sets").delete().eq("id", set_id).execute()
                deleted = True
            except Exception as e:
                logger.warning(f"Error deleting flashcard set in Supabase: {e}")

        return deleted

    async def find_by_invite_code(self, code: str) -> Optional[Dict[str, Any]]:
        """Tìm bộ flashcard private theo mã mời từ Supabase."""
        clean_code = (code or "").strip().upper()
        if not clean_code or not self.supabase:
            return None

        try:
            res = self.supabase.table("flashcard_sets").select("*").eq("invite_code", clean_code).maybe_single().execute()
            if res and res.data:
                return await self.get_set_by_id(str(res.data["id"]))
        except Exception as e:
            logger.debug(f"Supabase find_by_invite_code notice: {e}")

        return None

    async def add_allowed_user(self, set_id: str, user_id: str) -> bool:
        """Thêm user vào danh sách được phép tham gia bộ private trong Supabase."""
        now = datetime.now(timezone.utc).isoformat()
        if self.supabase:
            try:
                self.supabase.table("flashcard_set_members").upsert({
                    "set_id": set_id,
                    "user_id": user_id,
                    "role": "member",
                    "joined_at": now,
                }, on_conflict="set_id,user_id").execute()
                return True
            except Exception as e:
                logger.warning(f"Error adding allowed user to Supabase: {e}")

        return False

    # ── DAILY USAGE & LIMITS ────────────────────────────────────────────────

    def _get_current_day_window(self, reset_time_str: str = "07:00") -> str:
        """
        Xác định khung ngày làm việc dựa trên mốc reset_time (mặc định 07:00).
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
        Kiểm tra số lượt đã chơi trong ngày từ Supabase và tính toán xem user có được phép chơi tiếp không.
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

        if self.supabase:
            try:
                u_res = self.supabase.table("flashcard_daily_usage").select(
                    "play_count"
                ).eq("user_id", user_id).eq("set_id", set_id).eq("date_key", active_day).maybe_single().execute()
                if u_res and u_res.data:
                    used_today = u_res.data.get("play_count", 0)
            except Exception as e:
                logger.debug(f"Supabase get_user_usage notice: {e}")

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
        """Tăng số lượt chơi trong ngày của user lên 1 trong Supabase."""
        active_day = self._get_current_day_window(reset_time_str)
        now_iso = datetime.now(timezone.utc).isoformat()

        if self.supabase:
            try:
                cur = self.supabase.table("flashcard_daily_usage").select(
                    "id, play_count"
                ).eq("user_id", user_id).eq("set_id", set_id).eq("date_key", active_day).maybe_single().execute()
                if cur and cur.data:
                    self.supabase.table("flashcard_daily_usage").update({
                        "play_count": cur.data["play_count"] + 1,
                        "last_played_at": now_iso,
                        "updated_at": now_iso,
                    }).eq("id", cur.data["id"]).execute()
                else:
                    self.supabase.table("flashcard_daily_usage").insert({
                        "user_id": user_id,
                        "set_id": set_id,
                        "date_key": active_day,
                        "play_count": 1,
                        "last_played_at": now_iso,
                        "created_at": now_iso,
                        "updated_at": now_iso,
                    }).execute()
            except Exception as e:
                logger.debug(f"Supabase increment_usage notice: {e}")

    # ── SESSIONS ─────────────────────────────────────────────────────────────

    async def create_session(self, session_data: Dict[str, Any]) -> None:
        """Lưu phiên học vào bảng flashcard_sessions trong Supabase."""
        now_iso = datetime.now(timezone.utc).isoformat()
        if self.supabase:
            try:
                set_id = session_data.get("set_id")
                try:
                    uuid.UUID(str(set_id))
                except Exception:
                    set_id = None

                if set_id:
                    self.supabase.table("flashcard_sessions").insert({
                        "session_id": session_data.get("session_id"),
                        "set_id": set_id,
                        "user_id": session_data.get("user_id"),
                        "is_guest": session_data.get("is_guest", False),
                        "score": session_data.get("score", 0),
                        "streak": session_data.get("streak", 0),
                        "total_cards": session_data.get("cards_count", 0),
                        "started_at": session_data.get("started_at") or now_iso,
                    }).execute()
            except Exception as e:
                logger.debug(f"Supabase create_session notice: {e}")

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Lấy thông tin phiên học từ Supabase."""
        if self.supabase:
            try:
                res = self.supabase.table("flashcard_sessions").select("*").eq("session_id", session_id).maybe_single().execute()
                if res and res.data:
                    return dict(res.data)
            except Exception as e:
                logger.debug(f"Supabase get_session notice: {e}")

        return None

    async def update_session(self, session_id: str, updates: Dict[str, Any]) -> None:
        """Cập nhật tiến độ của phiên học vào Supabase."""
        if self.supabase:
            try:
                allowed_cols = {
                    k: v for k, v in updates.items()
                    if k in ("score", "streak", "cards_reviewed", "correct_count", "accuracy_rate", "is_completed", "completed_at", "results")
                }
                if allowed_cols:
                    self.supabase.table("flashcard_sessions").update(allowed_cols).eq("session_id", session_id).execute()
            except Exception as e:
                logger.debug(f"Supabase update_session notice: {e}")

    async def delete_session(self, session_id: str) -> None:
        """Đánh dấu hoàn thành phiên học trong Supabase."""
        if self.supabase:
            try:
                self.supabase.table("flashcard_sessions").update({
                    "is_completed": True,
                    "completed_at": datetime.now(timezone.utc).isoformat()
                }).eq("session_id", session_id).execute()
            except Exception as e:
                logger.debug(f"Supabase delete_session notice: {e}")

    async def cleanup_old_sessions(self) -> Dict[str, Any]:
        """Dọn dẹp các session flashcard cũ (hơn 7 ngày) trong Supabase."""
        deleted_count = 0
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        if self.supabase:
            try:
                res = self.supabase.table("flashcard_sessions").delete().lt("started_at", cutoff).execute()
                if res and res.data:
                    deleted_count += len(res.data)
            except Exception as e:
                logger.debug(f"Supabase cleanup_old_sessions error: {e}")

        return {"checked": True, "deleted": deleted_count}

    # ── PROFICIENCY & LEITNER SRS ────────────────────────────────────────────

    async def get_user_word_proficiency(self, user_id: str, word: str) -> Dict[str, Any]:
        """Lấy điểm thông thạo và tiến trình Leitner của từ đối với user từ Supabase."""
        clean_word = word.strip().lower()

        if self.supabase:
            try:
                w_rec = self.supabase.table("words").select("id").eq("word_text", clean_word).maybe_single().execute()
                if w_rec and w_rec.data:
                    w_id = w_rec.data["id"]
                    s_rec = self.supabase.table("senses").select("id").eq("word_id", w_id).limit(1).execute()
                    if s_rec and s_rec.data:
                        sense_id = s_rec.data[0]["id"]
                        p_rec = self.supabase.table("user_sense_progress").select(
                            "mastery_score, current_repetition_id, wrong_count, translated_count"
                        ).eq("user_id", user_id).eq("sense_id", sense_id).maybe_single().execute()
                        if p_rec and p_rec.data:
                            return {
                                "proficiency": p_rec.data.get("mastery_score", 0.0),
                                "leitner_box": p_rec.data.get("current_repetition_id") or 1,
                                "attempts": p_rec.data.get("translated_count", 0) + p_rec.data.get("wrong_count", 0),
                                "correct_count": p_rec.data.get("translated_count", 0),
                            }
            except Exception as e:
                logger.debug(f"Supabase get_user_word_proficiency notice: {e}")

        return {"proficiency": 0.0, "leitner_box": 1, "attempts": 0, "correct_count": 0}

    async def get_batch_user_word_proficiency(self, user_id: str, words: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Truy vấn hàng loạt điểm thông thạo và Leitner box của danh sách từ để tối ưu tốc độ tải.
        Giảm từ N*3 request xuống còn tối đa 3 batch query.
        """
        result: Dict[str, Dict[str, Any]] = {}
        if not words or not self.supabase or not user_id:
            return result

        clean_words = list(dict.fromkeys(w.strip().lower() for w in words if w and w.strip()))
        if not clean_words:
            return result

        try:
            # 1. Batch fetch word IDs
            w_res = self.supabase.table("words").select("id, word_text").in_("word_text", clean_words).execute()
            word_id_to_text: Dict[str, str] = {}
            word_text_to_id: Dict[str, str] = {}
            if w_res and w_res.data:
                for row in w_res.data:
                    wid = str(row["id"])
                    wtxt = str(row["word_text"]).strip().lower()
                    word_id_to_text[wid] = wtxt
                    word_text_to_id[wtxt] = wid

            word_ids = list(word_id_to_text.keys())
            if not word_ids:
                return {w: {"proficiency": 0.0, "leitner_box": 1, "attempts": 0, "correct_count": 0} for w in clean_words}

            # 2. Batch fetch senses
            s_res = self.supabase.table("senses").select("id, word_id").in_("word_id", word_ids).execute()
            sense_id_to_word: Dict[str, str] = {}
            sense_ids: List[str] = []
            if s_res and s_res.data:
                for row in s_res.data:
                    sid = str(row["id"])
                    wid = str(row.get("word_id"))
                    wtxt = word_id_to_text.get(wid)
                    if wtxt and wtxt not in [sense_id_to_word[s] for s in sense_id_to_word]:
                        sense_id_to_word[sid] = wtxt
                        sense_ids.append(sid)

            # 3. Batch fetch progress
            if sense_ids:
                p_res = self.supabase.table("user_sense_progress").select(
                    "sense_id, mastery_score, current_repetition_id, wrong_count, translated_count"
                ).eq("user_id", user_id).in_("sense_id", sense_ids).execute()

                if p_res and p_res.data:
                    for p in p_res.data:
                        sid = str(p.get("sense_id"))
                        wtxt = sense_id_to_word.get(sid)
                        if wtxt:
                            result[wtxt] = {
                                "proficiency": p.get("mastery_score", 0.0),
                                "leitner_box": p.get("current_repetition_id") or 1,
                                "attempts": p.get("translated_count", 0) + p.get("wrong_count", 0),
                                "correct_count": p.get("translated_count", 0),
                            }
        except Exception as e:
            logger.debug(f"get_batch_user_word_proficiency notice: {e}")

        # Điền giá trị mặc định cho các từ chưa có tiến trình
        for w in clean_words:
            if w not in result:
                result[w] = {"proficiency": 0.0, "leitner_box": 1, "attempts": 0, "correct_count": 0}

        return result

    async def get_user_leitner_box_stats(self, user_id: str) -> Dict[str, Any]:
        """
        Thống kê các Leitner box, số lượng từ trong mỗi box, và các hàng đợi chuyển giao giữa các box.
        - Box K: Số từ đã đến hạn ôn tập trong Box K (sẵn sàng ôn tập).
        - Hàng đợi (Queue) giữa Box K và Box K+1: Số từ đã vượt qua Box K, đang trong quá trình chuyển giao
          chờ đến hạn ôn tập (next_review) để bước vào Box K+1.
        - Bảo mật quy trình học: KHÔNG trả về danh sách chi tiết từ trong hàng đợi để tránh học trước khi làm.
        """
        loops = await self.get_repetition_loops()
        configured_boxes = {l.get("loop_order", idx + 1): l.get("day_repetition", 1) for idx, l in enumerate(loops)}
        loop_id_to_order = {l.get("id"): l.get("loop_order", idx + 1) for idx, l in enumerate(loops) if l.get("id")}
        if not configured_boxes:
            configured_boxes = {1: 1, 2: 2, 3: 5, 4: 8, 5: 14}

        sorted_box_nums = sorted(configured_boxes.keys())
        now = datetime.now(timezone.utc)

        # Cấu trúc thống kê theo Box
        box_stats: Dict[int, Dict[str, Any]] = {
            b: {
                "box": b,
                "day_repetition": configured_boxes[b],
                "total_count": 0,
                "ready_count": 0,
                "in_queue_count": 0,
            }
            for b in sorted_box_nums
        }

        # Cấu trúc các hàng đợi chuyển giao giữa các Box liên tiếp
        queues = []
        queue_map = {}
        for i in range(len(sorted_box_nums) - 1):
            from_b = sorted_box_nums[i]
            to_b = sorted_box_nums[i + 1]
            q_id = f"q_{from_b}_{to_b}"
            q_obj = {
                "id": q_id,
                "from_box": from_b,
                "to_box": to_b,
                "interval_days": configured_boxes.get(to_b, 1),
                "count": 0,
            }
            queues.append(q_obj)
            queue_map[to_b] = q_obj

        # Hàng đợi làm mới / cooldown cho Box 1
        box1_cooldown_queue = {
            "id": "q_cooldown_1",
            "from_box": 0,
            "to_box": 1,
            "interval_days": configured_boxes.get(1, 1),
            "count": 0,
        }

        total_words = 0

        if self.supabase and user_id:
            try:
                res = self.supabase.table("user_sense_progress").select(
                    "id, sense_id, current_repetition_id, last_review, next_review"
                ).eq("user_id", user_id).execute()

                if res and res.data:
                    progress_items = res.data

                    for row in progress_items:
                        raw_rep_id = row.get("current_repetition_id") or 1
                        box_num = loop_id_to_order.get(raw_rep_id, raw_rep_id)
                        if box_num not in box_stats:
                            box_num = sorted_box_nums[-1] if sorted_box_nums else 1

                        total_words += 1
                        box_stats[box_num]["total_count"] += 1

                        next_review_str = row.get("next_review")
                        is_due = True

                        if next_review_str:
                            try:
                                clean_dt_str = str(next_review_str).replace("Z", "+00:00")
                                nr_dt = datetime.fromisoformat(clean_dt_str)
                                if nr_dt.tzinfo is None:
                                    nr_dt = nr_dt.replace(tzinfo=timezone.utc)
                                if (nr_dt - now).total_seconds() > 0:
                                    is_due = False
                            except Exception:
                                is_due = True

                        if is_due:
                            box_stats[box_num]["ready_count"] += 1
                        else:
                            box_stats[box_num]["in_queue_count"] += 1
                            if box_num in queue_map:
                                queue_map[box_num]["count"] += 1
                            elif box_num == 1:
                                box1_cooldown_queue["count"] += 1

            except Exception as e:
                logger.debug(f"get_user_leitner_box_stats notice: {e}")

        # Thêm cooldown queue nếu có từ
        final_queues = []
        if box1_cooldown_queue["count"] > 0:
            final_queues.append(box1_cooldown_queue)
        final_queues.extend(queues)

        box_counts = {str(b): box_stats[b]["total_count"] for b in sorted_box_nums}
        box_ready_counts = {str(b): box_stats[b]["ready_count"] for b in sorted_box_nums}

        box_details = []
        for b in sorted_box_nums:
            bs = box_stats[b]
            box_details.append({
                "box": b,
                "day_repetition": bs["day_repetition"],
                "count": bs["total_count"],
                "ready_count": bs["ready_count"],
                "in_queue_count": bs["in_queue_count"],
            })

        return {
            "total_words": total_words,
            "boxes": box_counts,
            "ready_boxes": box_ready_counts,
            "box_details": box_details,
            "queues": final_queues
        }

    async def get_system_leitner_stats(self) -> Dict[str, Any]:
        """
        Thống kê Spaced Repetition toàn hệ thống dành cho Admin:
        - Số lượng từ và trạng thái trong từng Box
        - Các hàng đợi chuyển giao giữa các Box trên toàn hệ thống
        - Danh sách các từ đang chuyển giao gần nhất
        """
        loops = await self.get_repetition_loops()
        configured_boxes = {l.get("loop_order", idx + 1): l.get("day_repetition", 1) for idx, l in enumerate(loops)}
        loop_id_to_order = {l.get("id"): l.get("loop_order", idx + 1) for idx, l in enumerate(loops) if l.get("id")}
        if not configured_boxes:
            configured_boxes = {1: 1, 2: 2, 3: 5, 4: 8, 5: 14}

        sorted_box_nums = sorted(configured_boxes.keys())
        now = datetime.now(timezone.utc)

        box_stats = {
            b: {
                "box": b,
                "day_repetition": configured_boxes[b],
                "total_count": 0,
                "ready_count": 0,
                "in_queue_count": 0
            }
            for b in sorted_box_nums
        }

        queues = []
        queue_map = {}
        for i in range(len(sorted_box_nums) - 1):
            from_b = sorted_box_nums[i]
            to_b = sorted_box_nums[i + 1]
            q_id = f"q_{from_b}_{to_b}"
            q_obj = {
                "id": q_id,
                "from_box": from_b,
                "to_box": to_b,
                "interval_days": configured_boxes.get(to_b, 1),
                "count": 0,
                "words": []
            }
            queues.append(q_obj)
            queue_map[to_b] = q_obj

        total_system_words = 0
        recent_transitions = []

        if self.supabase:
            try:
                res = self.supabase.table("user_sense_progress").select(
                    "id, sense_id, mastery_score, current_repetition_id, last_review, next_review"
                ).limit(500).execute()

                if res and res.data:
                    progress_items = res.data
                    sense_ids = [p["sense_id"] for p in progress_items if p.get("sense_id")]

                    senses_map = {}
                    word_ids = []
                    if sense_ids:
                        for chunk in [sense_ids[i:i + 100] for i in range(0, min(len(sense_ids), 300), 100)]:
                            try:
                                s_res = self.supabase.table("senses").select("id, word_id, meaning_vi").in_("id", chunk).execute()
                                if s_res and s_res.data:
                                    for s in s_res.data:
                                        senses_map[s["id"]] = s
                                        if s.get("word_id"):
                                            word_ids.append(s["word_id"])
                            except Exception:
                                pass

                    words_map = {}
                    if word_ids:
                        unique_wids = list(set(word_ids))
                        for chunk in [unique_wids[i:i + 100] for i in range(0, min(len(unique_wids), 300), 100)]:
                            try:
                                w_res = self.supabase.table("words").select("id, word_text").in_("id", chunk).execute()
                                if w_res and w_res.data:
                                    for w in w_res.data:
                                        words_map[w["id"]] = w.get("word_text")
                            except Exception:
                                pass

                    for row in progress_items:
                        raw_rep_id = row.get("current_repetition_id") or 1
                        box_num = loop_id_to_order.get(raw_rep_id, raw_rep_id)
                        if box_num not in box_stats:
                            box_num = sorted_box_nums[-1] if sorted_box_nums else 1

                        total_system_words += 1
                        box_stats[box_num]["total_count"] += 1

                        next_review_str = row.get("next_review")
                        is_due = True
                        seconds_left = 0.0

                        if next_review_str:
                            try:
                                clean_dt_str = str(next_review_str).replace("Z", "+00:00")
                                nr_dt = datetime.fromisoformat(clean_dt_str)
                                if nr_dt.tzinfo is None:
                                    nr_dt = nr_dt.replace(tzinfo=timezone.utc)
                                seconds_left = (nr_dt - now).total_seconds()
                                if seconds_left > 0:
                                    is_due = False
                            except Exception:
                                is_due = True

                        sense_id = row.get("sense_id")
                        sense_info = senses_map.get(sense_id, {})
                        word_text = words_map.get(sense_info.get("word_id"), "") or "Vocabulary"
                        meaning_vi = sense_info.get("meaning_vi") or ""

                        if is_due:
                            box_stats[box_num]["ready_count"] += 1
                        else:
                            box_stats[box_num]["in_queue_count"] += 1
                            item_data = {
                                "word": word_text,
                                "meaning": meaning_vi,
                                "from_box": box_num - 1 if box_num > 1 else 1,
                                "to_box": box_num,
                                "next_review": next_review_str,
                                "seconds_left": max(0, int(seconds_left)),
                            }
                            if box_num in queue_map:
                                queue_map[box_num]["count"] += 1
                                if len(queue_map[box_num]["words"]) < 20:
                                    queue_map[box_num]["words"].append(item_data)
                            if len(recent_transitions) < 25:
                                recent_transitions.append(item_data)

            except Exception as e:
                logger.debug(f"get_system_leitner_stats notice: {e}")

        return {
            "total_system_words": total_system_words,
            "boxes": box_stats,
            "queues": queues,
            "recent_transitions": recent_transitions
        }

    async def update_user_word_proficiency(
        self,
        user_id: str,
        word: str,
        delta: float,
        is_correct: bool,
        max_boxes: int = 5
    ) -> Dict[str, Any]:
        """
        Cập nhật độ thông thạo của từ và chuyển đổi Leitner box vào Supabase:
        - Nếu đúng: tăng box (tối đa max_boxes)
        - Nếu sai: rơi về box 1
        - Đồng bộ tính toán ngày ôn tập tiếp theo (next_review) dựa trên bảng repetition_loops trong database!
        """
        clean_word = word.strip().lower()
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        current = await self.get_user_word_proficiency(user_id, clean_word)

        new_proficiency = round(current["proficiency"] + delta, 1)
        new_attempts = current["attempts"] + 1
        new_correct = current["correct_count"] + (1 if is_correct else 0)

        # Lấy cấu hình các loop từ database
        loops = await self.get_repetition_loops()
        max_boxes = max(len(loops), max_boxes)

        current_box = current.get("leitner_box", 1)
        if is_correct:
            new_box = min(max_boxes, current_box + 1)
        else:
            new_box = 1  # Reset về box 1 theo nguyên lý Leitner khi trả lời sai

        # Xác định khoảng cách ngày ôn tập từ loop tương ứng
        target_loop = next((l for l in loops if l.get("loop_order") == new_box), None)
        day_interval = target_loop.get("day_repetition", 1) if target_loop else 1
        target_loop_id = target_loop.get("id") if target_loop else new_box
        next_review_time = (now + timedelta(days=day_interval)).isoformat()

        # Cập nhật Supabase user_sense_progress (SRS chính)
        if self.supabase:
            try:
                w_rec = self.supabase.table("words").select("id").eq("word_text", clean_word).maybe_single().execute()
                if w_rec and w_rec.data:
                    w_id = w_rec.data["id"]
                    s_rec = self.supabase.table("senses").select("id").eq("word_id", w_id).limit(1).execute()
                    if s_rec and s_rec.data:
                        sense_id = s_rec.data[0]["id"]
                        prog_rec = self.supabase.table("user_sense_progress").select(
                            "id, wrong_count"
                        ).eq("user_id", user_id).eq("sense_id", sense_id).maybe_single().execute()

                        prog_payload = {
                            "user_id": user_id,
                            "sense_id": sense_id,
                            "mastery_score": max(0.0, new_proficiency),
                            "current_repetition_id": target_loop_id,
                            "last_review": now_iso,
                            "next_review": next_review_time,
                            "updated_at": now_iso,
                        }
                        if not is_correct:
                            w_count = (prog_rec.data.get("wrong_count", 0) + 1) if (prog_rec and prog_rec.data) else 1
                            prog_payload["wrong_count"] = w_count

                        self.supabase.table("user_sense_progress").upsert(
                            prog_payload, on_conflict="user_id,sense_id"
                        ).execute()
            except Exception as e:
                logger.debug(f"Supabase update_user_sense_progress notice: {e}")

        return {
            "proficiency": new_proficiency,
            "leitner_box": new_box,
            "repetition_loop_id": target_loop_id,
            "next_review": next_review_time,
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
                        # Đã có trong kho user -> tăng translated_count nếu là câu trả lời
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
                        "id, encountered_count, translated_count, total_count"
                    ).eq("user_id", user_id).eq("word", clean_w).maybe_single().execute()

                    if stat_rec and stat_rec.data:
                        s_id = stat_rec.data["id"]
                        enc = stat_rec.data.get("encountered_count", 0) + 1
                        trans = stat_rec.data.get("translated_count", 0) + (1 if is_answer else 0)
                        tot = enc + trans
                        self.supabase.table("user_word_statistics").update({
                            "encountered_count": enc,
                            "translated_count": trans,
                            "total_count": tot,
                            "last_seen": now_iso,
                            "updated_at": now_iso
                        }).eq("id", s_id).execute()
                    else:
                        self.supabase.table("user_word_statistics").insert({
                            "user_id": user_id,
                            "word": clean_w,
                            "encountered_count": 1,
                            "translated_count": 1 if is_answer else 0,
                            "total_count": 1,
                            "last_seen": now_iso,
                            "created_at": now_iso,
                            "updated_at": now_iso
                        }).execute()

                # 3. Tăng match_count trên bảng senses nếu khớp từ vựng
                self.supabase.rpc("increment_sense_match", {"p_word": clean_w}).execute()
            except Exception as e:
                logger.debug(f"record_english_words_exposure notice for '{clean_w}': {e}")

        return words

    async def increment_word_translate_count(self, user_id: str, word: str) -> None:
        """
        Tăng số lần dịch (translated_count) của từ trong kho của user khi trả lời đúng (theo spec mục 4).
        """
        if not user_id or not word or self.supabase is None:
            return
        clean_w = word.strip().lower()
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            # 1. Update user_word_statistics
            stat_rec = self.supabase.table("user_word_statistics").select(
                "id, translated_count, total_count"
            ).eq("user_id", user_id).eq("word", clean_w).maybe_single().execute()
            if stat_rec and stat_rec.data:
                s_id = stat_rec.data["id"]
                trans = stat_rec.data.get("translated_count", 0) + 1
                tot = stat_rec.data.get("total_count", 0) + 1
                self.supabase.table("user_word_statistics").update({
                    "translated_count": trans,
                    "total_count": tot,
                    "last_seen": now_iso,
                    "updated_at": now_iso
                }).eq("id", s_id).execute()

            # 2. Update user_words nếu từ đã tồn tại
            word_rec = self.supabase.table("words").select("id").eq("word_text", clean_w).maybe_single().execute()
            if word_rec and word_rec.data:
                w_id = word_rec.data.get("id")
                uw_rec = self.supabase.table("user_words").select("id, translated_count").eq("user_id", user_id).eq("word_id", w_id).maybe_single().execute()
                if uw_rec and uw_rec.data:
                    uw_id = uw_rec.data["id"]
                    curr_trans = uw_rec.data.get("translated_count", 0) + 1
                    self.supabase.table("user_words").update({
                        "translated_count": curr_trans,
                        "updated_at": now_iso
                    }).eq("id", uw_id).execute()
        except Exception as e:
            logger.debug(f"increment_word_translate_count notice for '{clean_w}': {e}")

    # ── DICTIONARY CACHE FOR FLASHCARD IMPORT ─────────────────────────────────

    async def get_dictionary_cache(
        self,
        limit: int = 200,
        src: Optional[str] = None,
        dest: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Truy vấn kho senses & words từ database để làm từ điển tham khảo khởi tạo thẻ flashcard.
        """
        items: List[Dict[str, Any]] = []
        if self.supabase:
            try:
                res = self.supabase.table("senses").select(
                    "id, meaning_vi, ipa, part_of_speech, definition_en, definition_vi, example_en, audio_url, words(word_text)"
                ).limit(limit).execute()
                if res and res.data:
                    for row in res.data:
                        word_obj = row.get("words") or {}
                        word_text = word_obj.get("word_text") or ""
                        if word_text:
                            items.append({
                                "id": row.get("id"),
                                "word": word_text,
                                "meaning_vi": row.get("meaning_vi") or "",
                                "ipa": row.get("ipa"),
                                "part_of_speech": row.get("part_of_speech"),
                                "definition_en": row.get("definition_en"),
                                "definition_vi": row.get("definition_vi"),
                                "example_en": row.get("example_en"),
                                "audio_url": row.get("audio_url"),
                            })
            except Exception as e:
                logger.warning(f"Error fetching dictionary cache from Supabase: {e}")

        # Fallback mẫu nếu DB chưa có từ
        if not items:
            sample_words = [
                ("abandon", "từ bỏ", "/əˈbændən/", "to leave a place, thing, or person forever"),
                ("capable", "có khả năng", "/ˈkeɪpəbl/", "having the ability, power, or qualities to do something"),
                ("diversity", "sự đa dạng", "/daɪˈvɜːrsəti/", "a range of different things or people"),
                ("efficient", "hiệu quả", "/ɪˈfɪʃnt/", "working well and not wasting time or energy"),
                ("flexible", "linh hoạt", "/ˈfleksəbl/", "able to change or be changed easily"),
                ("generate", "tạo ra, sinh ra", "/ˈdʒenəreɪt/", "to produce or cause something to exist"),
                ("highlight", "làm nổi bật", "/ˈhaɪlaɪt/", "to attract attention to or emphasize something"),
                ("implement", "thực thi, áp dụng", "/ˈɪmplɪment/", "to start using a plan or system"),
                ("justify", "biện minh, chứng minh", "/ˈdʒʌstɪfaɪ/", "to give or to be a good reason for"),
                ("knowledge", "kiến thức", "/ˈnɒlɪdʒ/", "understanding of or information about a subject"),
            ]
            for w, m, ipa, def_en in sample_words[:limit]:
                items.append({
                    "id": f"sample_{w}",
                    "word": w,
                    "meaning_vi": m,
                    "ipa": ipa,
                    "definition_en": def_en,
                    "definition_vi": m,
                    "example_en": f"Example sentence with {w}.",
                    "audio_url": None,
                })

        return items
