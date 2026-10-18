import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import HTTPException
from loguru import logger

from src.flashcard.models.flashcard_models import (
    FlashcardSetCreate,
    FlashcardSetUpdate,
    FlashcardSetResponse,
    FlashcardSessionStartResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    SessionCompletedRequest,
    SessionCompletedResponse,
    AIGenerateRequest,
    FlashcardCard,
    FlashcardSettings,
    FlashcardInitRequest,
    RepetitionScheduleResponse,
    UpdateRepetitionScheduleRequest,
    RepetitionLoopItem,
    LeitnerConfig,
)
from src.flashcard.repositories.flashcard_repository import FlashcardRepository
from src.flashcard.engines.scoring_engine import ScoringEngine
from src.flashcard.engines.dynamic_generator import DynamicGenerator
from src.flashcard.engines.ai_generator import AIFlashcardGenerator


class FlashcardService:
    """
    Nghiệp vụ cốt lõi của module Flashcard:
    - Quản lý bộ thẻ (Public, Private với mã mời / invite list)
    - Tạo nội dung (Manual, AI-gen, User dynamic Leitner, System dynamic)
    - Quản lý phiên học, lượt chơi mỗi ngày (reset 07:00), khung giờ mở/đóng
    - Chấm điểm & phân cấp bài tập theo ngưỡng thông thạo & ghi nhận từ vựng
    """

    def __init__(self, repo: Optional[FlashcardRepository] = None):
        self.repo = repo or FlashcardRepository()
        self.ai_generator = AIFlashcardGenerator()

    # ── FLASHCARD SET CRUD ───────────────────────────────────────────────────

    async def list_sets(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lấy danh sách các bộ flashcard công khai hoặc bộ private được quyền truy cập."""
        sets = await self.repo.get_all_sets(user_id=user_id)
        if not sets:
            # Seed bộ thẻ mặc định ban đầu nếu hệ thống chưa có
            default_set = await self._seed_default_set()
            sets = [default_set]
        return sets

    async def get_set_by_id(self, set_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Lấy chi tiết một bộ flashcard, kiểm tra quyền riêng tư (Private)."""
        card_set = await self.repo.get_set_by_id(set_id)
        if not card_set:
            raise HTTPException(status_code=404, detail="Không tìm thấy bộ flashcard này.")

        # Kiểm tra tính riêng tư
        is_public = card_set.get("is_public", True)
        creator_id = card_set.get("creator_id")
        allowed_users = card_set.get("allowed_user_ids") or []

        if not is_public:
            if not user_id or (user_id != creator_id and user_id not in allowed_users):
                raise HTTPException(
                    status_code=403,
                    detail="Bộ thẻ này là riêng tư (Private). Bạn cần có mã mời hoặc được người tạo cấp quyền."
                )

        return card_set

    async def initialize_flashcard(
        self,
        req: FlashcardInitRequest,
        creator_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Khởi tạo bộ flashcard theo các chế độ (system_dynamic, user_dynamic, default_seed, manual):
        - Tự động lấy cấu hình khoảng cách box ôn tập từ repetition_loops trong database
        - Thiết lập cài đặt thời gian, số lượng câu, dạng câu hỏi phù hợp
        - Lưu trữ đồng bộ vào database
        """
        # 1. Lấy cấu hình space repetition từ bảng repetition_loops trong database
        loops = await self.repo.get_repetition_loops()
        db_boxes = [l["day_repetition"] for l in loops]

        leitner_cfg = req.leitner_config or LeitnerConfig()
        if req.use_db_spaced_repetition or not leitner_cfg.boxes:
            leitner_cfg.boxes = db_boxes

        mode = req.mode.lower()
        title = req.title
        description = req.description or ""
        set_type = "manual"
        is_dynamic = False
        cards: List[FlashcardCard] = []

        if mode == "system_dynamic":
            set_type = "system_dynamic"
            is_dynamic = True
            title = title or "Bộ Thẻ Ôn Tập Hệ Thống (System Dynamic Leitner)"
            description = description or "Bộ thẻ tạo câu hỏi động từ kho từ vựng toàn hệ thống, tự động điều chỉnh theo thuật toán Leitner Space Repetition."
        elif mode == "user_dynamic":
            set_type = "user_dynamic"
            is_dynamic = True
            title = title or "Bộ Thẻ Cá Nhân Hóa (User Data Leitner SRS)"
            description = description or "Bộ thẻ tạo câu hỏi động từ kho từ vựng và lịch sử dịch của bạn, tự động ưu tiên ôn tập theo Leitner Box."
        elif mode == "default_seed":
            # Khởi tạo bộ thẻ mẫu cơ bản
            return await self._seed_default_set()
        else:
            set_type = "manual"
            is_dynamic = False
            title = title or "Bộ Flashcard Tự Chọn"
            description = description or "Bộ thẻ flashcard tự nhập liệu nội dung từ vựng."

        settings = FlashcardSettings(
            total_cards=req.total_cards,
            allowed_task_types=req.allowed_task_types or ["choice", "fill", "complete"],
            time_limit_mode=req.time_limit_mode,
            per_card_timer=req.per_card_timer,
            daily_limit=req.daily_limit,
            reset_time=req.reset_time,
            event_start_at=req.event_start_at,
            event_end_at=req.event_end_at,
            leitner_config=leitner_cfg
        )

        create_data = FlashcardSetCreate(
            title=title,
            description=description,
            is_public=req.is_public,
            set_type=set_type,
            settings=settings,
            cards=cards
        )
        return await self.create_set(create_data, creator_id=creator_id)

    async def create_set(self, data: FlashcardSetCreate, creator_id: Optional[str] = None) -> Dict[str, Any]:
        """Tạo mới một bộ flashcard (tích hợp cấu hình Space Repetition từ database)."""
        payload = data.model_dump()
        
        # Nếu là bộ dynamic, đánh dấu cờ phù hợp
        if data.set_type in ("user_dynamic", "system_dynamic"):
            payload["is_dynamic"] = True

        # Tự động đồng bộ cấu hình spaced repetition từ database nếu chưa có hoặc dùng mặc định
        loops = await self.repo.get_repetition_loops()
        db_boxes = [l["day_repetition"] for l in loops]

        if not payload.get("settings"):
            payload["settings"] = FlashcardSettings(
                leitner_config=LeitnerConfig(boxes=db_boxes)
            ).model_dump()
        else:
            st = payload["settings"]
            l_cfg = st.get("leitner_config")
            if not l_cfg:
                st["leitner_config"] = LeitnerConfig(boxes=db_boxes).model_dump()
            elif not l_cfg.get("boxes"):
                l_cfg["boxes"] = db_boxes

        created = await self.repo.create_set(payload, creator_id=creator_id)
        return created

    async def update_set(
        self,
        set_id: str,
        data: FlashcardSetUpdate,
        user_id: Optional[str] = None,
        is_admin: bool = False
    ) -> Dict[str, Any]:
        """Cập nhật bộ flashcard."""
        existing = await self.get_set_by_id(set_id, user_id=user_id)
        creator = existing.get("creator_id")
        if not is_admin and creator and user_id and creator != user_id:
            raise HTTPException(status_code=403, detail="Chỉ người tạo hoặc quản trị viên mới có quyền chỉnh sửa bộ thẻ này.")

        updated = await self.repo.update_set(set_id, data.model_dump(exclude_unset=True))
        if not updated:
            updated = await self.get_set_by_id(set_id)
        return updated

    async def delete_set(
        self,
        set_id: str,
        user_id: Optional[str] = None,
        is_admin: bool = False
    ) -> Dict[str, Any]:
        """Xóa bộ flashcard."""
        existing = await self.get_set_by_id(set_id, user_id=user_id)
        creator = existing.get("creator_id")
        if not is_admin and creator and user_id and creator != user_id:
            raise HTTPException(status_code=403, detail="Chỉ người tạo hoặc quản trị viên mới có quyền xóa bộ thẻ này.")

        await self.repo.delete_set(set_id)
        return {"status": "success", "message": "Đã xóa bộ flashcard thành công."}

    async def join_private_set(self, invite_code: str, user_id: str) -> Dict[str, Any]:
        """Tham gia bộ flashcard không công khai (Private) bằng mã mời."""
        if not invite_code:
            raise HTTPException(status_code=400, detail="Vui lòng cung cấp mã mời.")

        card_set = await self.repo.find_by_invite_code(invite_code)
        if not card_set:
            raise HTTPException(status_code=404, detail="Mã mời không hợp lệ hoặc bộ thẻ không tồn tại.")

        await self.repo.add_allowed_user(card_set["id"], user_id)
        return {
            "status": "success",
            "message": f"Bạn đã tham gia thành công bộ flashcard '{card_set.get('title')}'.",
            "set_id": card_set["id"]
        }

    # ── USAGE & EVENT SCHEDULE ──────────────────────────────────────────────

    async def get_usage(self, set_id: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Kiểm tra lượt chơi trong ngày và lịch sự kiện."""
        card_set = await self.repo.get_set_by_id(set_id)
        if not card_set:
            raise HTTPException(status_code=404, detail="Không tìm thấy bộ thẻ.")

        settings = card_set.get("settings") or {}
        daily_limit = settings.get("daily_limit", 5)
        reset_time = settings.get("reset_time", "07:00")
        event_start_at = settings.get("event_start_at")
        event_end_at = settings.get("event_end_at")

        if not user_id:
            return {
                "can_play": daily_limit == 0,
                "daily_limit": daily_limit,
                "used_today": 0,
                "remaining": 9999 if daily_limit == 0 else daily_limit,
                "event_status": "active",
                "reset_time": reset_time
            }

        usage = await self.repo.get_user_usage(
            user_id=user_id,
            set_id=set_id,
            daily_limit=daily_limit,
            reset_time_str=reset_time,
            event_start_at=event_start_at,
            event_end_at=event_end_at
        )
        return usage

    # ── START SESSION ────────────────────────────────────────────────────────

    async def start_session(
        self,
        set_id: str,
        user_id: Optional[str] = None,
        is_guest: bool = False
    ) -> FlashcardSessionStartResponse:
        """
        Bắt đầu một phiên luyện tập flashcard:
        - Kiểm tra quyền truy cập (nếu private)
        - Kiểm tra giới hạn số lần làm mỗi ngày / người (daily_limit)
        - Kiểm tra thời gian mở / đóng của bộ thẻ (event_start_at / event_end_at)
        - Xử lý các loại nguồn dữ liệu:
            + User data dynamic gen (tạo thẻ động từ kho từ user theo Leitner SRS)
            + System data dynamic gen (tạo thẻ động từ kho từ hệ thống)
            + Manual / AI gen (tải các thẻ đã tạo sẵn)
        - Ghi nhận từ vựng tiếng Anh xuất hiện trong flashcard và tăng match_count
        """
        card_set = await self.get_set_by_id(set_id, user_id=user_id)
        settings_dict = card_set.get("settings") or {}
        settings = FlashcardSettings(**settings_dict)

        # 1. Kiểm tra giới hạn chơi trong ngày và khung giờ
        if not is_guest and user_id:
            usage = await self.repo.get_user_usage(
                user_id=user_id,
                set_id=set_id,
                daily_limit=settings.daily_limit,
                reset_time_str=settings.reset_time,
                event_start_at=settings.event_start_at,
                event_end_at=settings.event_end_at
            )
            if not usage["can_play"]:
                if usage["event_status"] == "not_started":
                    raise HTTPException(status_code=400, detail="Bộ thẻ này chưa tới thời gian mở.")
                elif usage["event_status"] == "ended":
                    raise HTTPException(status_code=400, detail="Bộ thẻ này đã kết thúc thời gian mở.")
                else:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Bạn đã đạt giới hạn {settings.daily_limit} lượt làm hôm nay. Lượt chơi sẽ làm mới lúc {settings.reset_time}."
                    )
            # Tăng số lượt chơi
            await self.repo.increment_usage(user_id=user_id, set_id=set_id, reset_time_str=settings.reset_time)
        elif is_guest and settings.daily_limit > 0:
            raise HTTPException(status_code=401, detail="Bộ thẻ này yêu cầu đăng nhập để ghi nhận tiến độ học tập.")

        # 2. Xử lý cards theo nguồn dữ liệu
        set_type = card_set.get("set_type", "manual")
        is_dynamic = set_type in ("user_dynamic", "system_dynamic") or card_set.get("is_dynamic", False)
        cards: List[FlashcardCard] = []

        if set_type == "user_dynamic" and user_id:
            cards = await DynamicGenerator.generate_user_dynamic_cards(
                user_id=user_id,
                settings=settings,
                supabase_client=self.repo.supabase
            )
        elif set_type == "system_dynamic":
            cards = await DynamicGenerator.generate_system_dynamic_cards(
                settings=settings,
                supabase_client=self.repo.supabase
            )
        else:
            # Manual hoặc AI-gen: lấy thẻ có sẵn trong bộ
            raw_cards = card_set.get("cards") or []
            for c in raw_cards:
                cards.append(FlashcardCard(**c))

        if not cards:
            raise HTTPException(status_code=400, detail="Bộ thẻ hiện chưa có từ vựng nào để luyện tập.")

        # 3. Đồng bộ điểm thông thạo & ghi nhận từ tiếng Anh theo Spec Mục 4
        if user_id:
            # Ghi nhận từ vựng trong background để không làm chậm khởi động bài học
            target_words = [c.word for c in cards if c.word]
            asyncio.create_task(self._record_words_background(user_id, target_words))

            for card in cards:
                try:
                    prof_data = await self.repo.get_user_word_proficiency(user_id, card.word)
                    card.user_proficiency = prof_data["proficiency"]
                    card.user_attempts = prof_data["attempts"]
                    card.leitner_box = prof_data["leitner_box"]
                except Exception:
                    pass

        # 4. Khởi tạo session trong Supabase
        session_id = f"sess_{uuid.uuid4().hex}"
        session_data = {
            "session_id": session_id,
            "set_id": set_id,
            "user_id": user_id,
            "is_guest": is_guest,
            "score": 0,
            "streak": 0,
            "cards_count": len(cards),
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.repo.create_session(session_data)

        return FlashcardSessionStartResponse(
            session_id=session_id,
            id=set_id,
            title=card_set.get("title", ""),
            description=card_set.get("description", ""),
            is_public=card_set.get("is_public", True),
            is_dynamic=is_dynamic,
            all_mastered=False,
            settings=settings,
            cards=cards,
            usage=None
        )

    async def _record_words_background(self, user_id: Optional[str], words: List[str]):
        """Ghi nhận từ vựng tiếng Anh trong background."""
        if not user_id or not words:
            return
        try:
            for w in words[:20]:
                await self.repo.record_english_words_exposure(user_id=user_id, text=w)
        except Exception as e:
            logger.debug(f"_record_words_background notice: {e}")

    # ── SUBMIT ANSWER & SRS UPDATE ───────────────────────────────────────────

    async def submit_answer(
        self,
        req: SubmitAnswerRequest,
        user_id: Optional[str] = None
    ) -> SubmitAnswerResponse:
        """
        Chấm điểm câu trả lời và cập nhật theo Mục 4 Specification:
        - Đúng: +1..+10 điểm thông thạo (giảm dần theo thời gian trả lời).
        - Sai: -1..-10 điểm thông thạo (tính theo số lần gặp, dịch và độ dài chữ tiếng Anh).
        - Ghi nhận từ tiếng Anh xuất hiện trong câu trả lời vào kho từ user.
        - Tăng / reset Leitner Box.
        - Cập nhật Supabase user_sense_stats & user_sense_progress.
        """
        # 1. Ghi nhận từ tiếng Anh xuất hiện trong câu trả lời
        user_answer_str = str(req.user_answer)
        await self.repo.record_english_words_exposure(
            user_id=user_id,
            text=f"{req.word} {user_answer_str}",
            is_answer=True
        )

        # 2. Tính điểm cộng hoặc điểm trừ
        points_earned = 0
        new_prof = 0.0
        leitner_box = 1
        bonus_toast = None

        if req.is_correct:
            points_earned = ScoringEngine.calculate_correct_score(
                time_spent=req.time_spent,
                time_limit=req.time_limit
            )
            feedback = "Chính xác! Làm rất tốt."
            if points_earned >= 9:
                bonus_toast = {
                    "type": "bonus",
                    "title": "Tốc độ thần tốc!",
                    "message": f"+{points_earned} điểm kinh nghiệm vì trả lời rất nhanh.",
                    "bonusType": "speed"
                }
        else:
            # Lấy thông tin gặp/dịch của từ
            encountered_count = 0
            translated_count = 0
            if user_id:
                prof_data = await self.repo.get_user_word_proficiency(user_id, req.word)
                encountered_count = prof_data.get("attempts", 0)

            penalty = ScoringEngine.calculate_incorrect_penalty(
                encountered_count=encountered_count,
                translated_count=translated_count,
                word=req.word
            )
            points_earned = -int(round(penalty))
            feedback = f"Chưa chính xác. Đáp án đúng là '{req.word}'."

        # 3. Cập nhật tiến trình Leitner & điểm thông thạo của từ
        if user_id:
            res = await self.repo.update_user_word_proficiency(
                user_id=user_id,
                word=req.word,
                delta=points_earned,
                is_correct=req.is_correct
            )
            new_prof = res["proficiency"]
            leitner_box = res["leitner_box"]

            if new_prof >= 100:
                bonus_toast = {
                    "type": "mastered",
                    "title": "Thành thạo từ vựng!",
                    "message": f"Bạn đã hoàn toàn làm chủ từ '{req.word}'!",
                }

        # 4. Cập nhật phiên học trong Supabase
        current_streak = 0
        if req.session_id:
            sess = await self.repo.get_session(req.session_id)
            if sess:
                current_streak = (sess.get("streak", 0) + 1) if req.is_correct else 0
                await self.repo.update_session(req.session_id, {
                    "score": sess.get("score", 0) + max(0, points_earned),
                    "streak": current_streak
                })

        return SubmitAnswerResponse(
            is_correct=req.is_correct,
            points_earned=points_earned,
            streak=current_streak,
            new_proficiency=new_prof,
            feedback=feedback,
            leitner_box=leitner_box,
            bonus_toast=bonus_toast
        )

    # ── COMPLETE SESSION ─────────────────────────────────────────────────────

    async def complete_session(
        self,
        req: SessionCompletedRequest,
        user_id: Optional[str] = None
    ) -> SessionCompletedResponse:
        """Kết thúc phiên học flashcard, tính toán tổng kết và dọn dẹp session."""
        results = req.results or []
        total_cards = len(results)
        correct_count = sum(1 for r in results if r.get("is_correct") is True)
        accuracy = round((correct_count / max(1, total_cards)) * 100, 1)

        # Xóa phiên học active
        await self.repo.delete_session(req.session_id)

        # Cập nhật chuỗi ngày học streak trong user_stats
        if user_id and self.repo.supabase:
            try:
                self.repo.supabase.table("user_stats").upsert({
                    "user_id": user_id,
                    "last_review": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }, on_conflict="user_id").execute()
            except Exception as e:
                logger.debug(f"Update user_stats streak error: {e}")

        return SessionCompletedResponse(
            status="success",
            message="Chúc mừng bạn đã hoàn thành phiên luyện tập flashcard!",
            final_score=req.total_score,
            max_streak=req.streak,
            cards_reviewed=total_cards,
            correct_count=correct_count,
            accuracy_rate=accuracy,
            streak_days=1
        )

    async def sync_offline_progress(
        self,
        items: List[Dict[str, Any]],
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Đồng bộ hàng đợi kết quả ngoại tuyến (offline sync queue)."""
        synced_count = 0
        for item in items:
            try:
                req = SubmitAnswerRequest(
                    card_id=item.get("card_id", ""),
                    word=item.get("word", ""),
                    sense_id=item.get("sense_id"),
                    user_answer=item.get("user_answer", ""),
                    is_correct=item.get("is_correct", False),
                    task_type=item.get("task_type", "choice"),
                    time_spent=item.get("time_spent", 0.0),
                    time_limit=item.get("time_limit", 15.0),
                )
                await self.submit_answer(req, user_id=user_id)
                synced_count += 1
            except Exception as e:
                logger.warning(f"Error syncing progress item: {e}")

        return {"status": "success", "synced_count": synced_count}

    # ── AI GENERATION ────────────────────────────────────────────────────────

    async def generate_ai_cards(self, req: AIGenerateRequest) -> List[FlashcardCard]:
        """Sinh bộ câu hỏi flashcard thông qua Generative AI."""
        return await self.ai_generator.generate_cards(req)

    # ── SEED DATA HELPER ─────────────────────────────────────────────────────

    async def _seed_default_set(self) -> Dict[str, Any]:
        """Tạo bộ flashcard mẫu cốt lõi hỗ trợ các dạng bài tập theo spec."""
        default_payload = {
            "title": "Từ Vựng Tiếng Anh Giao Tiếp Cốt Lõi",
            "description": "Bộ thẻ flashcard tương tác đa dạng câu hỏi trắc nghiệm, điền từ, hoàn thành từ và nghe.",
            "is_public": True,
            "set_type": "manual",
            "settings": {
                "total_cards": 5,
                "difficulty_distribution": {"easy": 2, "medium": 2, "hard": 1},
                "allowed_task_types": ["choice", "fill", "complete"],
                "daily_limit": 10,
                "reset_time": "07:00",
                "per_card_timer": 15,
            },
            "cards": [
                {
                    "id": "card_seed_1",
                    "word": "adapt",
                    "meaning": "thích nghi",
                    "ipa": "/əˈdæpt/",
                    "question": "Chọn nghĩa phù hợp của 'adapt'",
                    "hint": "Bắt đầu bằng chữ 'a'",
                    "context": "Animals must adapt to their environment to survive.",
                    "difficulty": "medium",
                    "timer": 15,
                    "points": 10,
                    "tasks": {
                        "choice": {
                            "enabled": True,
                            "options": [
                                {"text": "thích nghi", "is_correct": True},
                                {"text": "từ chối", "is_correct": False},
                                {"text": "mở rộng", "is_correct": False},
                                {"text": "phát triển", "is_correct": False},
                            ]
                        },
                        "fill": {"enabled": True, "answers": ["adapt"]},
                        "complete": {
                            "enabled": True,
                            "patterns": [{"display_text": "ad_pt", "blanks": ["a"]}]
                        }
                    }
                },
                {
                    "id": "card_seed_2",
                    "word": "brilliant",
                    "meaning": "xuất sắc, tài giỏi",
                    "ipa": "/ˈbrɪliənt/",
                    "question": "Điền hoặc chọn nghĩa đúng của 'brilliant'",
                    "hint": "Đồng nghĩa với talented / smart",
                    "context": "She is a brilliant student with a bright future.",
                    "difficulty": "medium",
                    "timer": 15,
                    "points": 10,
                    "tasks": {
                        "choice": {
                            "enabled": True,
                            "options": [
                                {"text": "xuất sắc, tài giỏi", "is_correct": True},
                                {"text": "chậm chạp", "is_correct": False},
                                {"text": "nhạt nhẽo", "is_correct": False},
                                {"text": "bình thường", "is_correct": False},
                            ]
                        },
                        "fill": {"enabled": True, "answers": ["brilliant"]},
                        "complete": {
                            "enabled": True,
                            "patterns": [{"display_text": "br_ll_ant", "blanks": ["i", "i"]}]
                        }
                    }
                }
            ]
        }
        return await self.repo.create_set(default_payload)

    # ── SPACE REPETITION SCHEDULE & DICTIONARY CACHE ─────────────────────────

    async def get_repetition_config(self) -> RepetitionScheduleResponse:
        """Lấy danh sách cấu hình các box và khoảng cách ngày ôn tập từ database."""
        loops = await self.repo.get_repetition_loops()
        boxes = [int(l["day_repetition"]) for l in loops]
        loop_items = [
            RepetitionLoopItem(
                id=l.get("id"),
                loop_order=l["loop_order"],
                day_repetition=l["day_repetition"],
                pre_loop_id=l.get("pre_loop_id"),
                next_loop_id=l.get("next_loop_id"),
            )
            for l in loops
        ]
        return RepetitionScheduleResponse(
            total_boxes=len(boxes),
            boxes=boxes,
            loops=loop_items
        )

    async def update_repetition_config(self, req: UpdateRepetitionScheduleRequest) -> RepetitionScheduleResponse:
        """Cập nhật các khoảng cách ngày ôn tập tương ứng với các box trong database."""
        loops = await self.repo.update_repetition_loops(req.boxes)
        boxes = [int(l["day_repetition"]) for l in loops]
        loop_items = [
            RepetitionLoopItem(
                id=l.get("id"),
                loop_order=l["loop_order"],
                day_repetition=l["day_repetition"],
                pre_loop_id=l.get("pre_loop_id"),
                next_loop_id=l.get("next_loop_id"),
            )
            for l in loops
        ]
        return RepetitionScheduleResponse(
            total_boxes=len(boxes),
            boxes=boxes,
            loops=loop_items
        )

    async def get_dictionary_cache(
        self,
        limit: int = 200,
        src: Optional[str] = None,
        dest: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Lấy dữ liệu từ điển và các senses từ database để phục vụ import tạo thẻ flashcard."""
        return await self.repo.get_dictionary_cache(limit=limit, src=src, dest=dest)

    async def cleanup_old_sessions(self) -> Dict[str, Any]:
        """Dọn dẹp các session flashcard cũ quá 7 ngày."""
        return await self.repo.cleanup_old_sessions()

