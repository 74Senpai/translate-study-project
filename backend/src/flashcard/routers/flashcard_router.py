from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
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
    JoinPrivateSetRequest,
    FlashcardCard,
    FlashcardInitRequest,
    RepetitionScheduleResponse,
    UpdateRepetitionScheduleRequest,
)
from src.flashcard.services.flashcard_service import FlashcardService
from src.middleware.auth import get_current_user, get_optional_current_user

router = APIRouter(prefix="/flashcards", tags=["flashcards"])
service = FlashcardService()


# ── FLASHCARD INITIALIZATION & CONFIGURATION ────────────────────────────────

@router.post("/initialize", response_model=Dict[str, Any])
@router.post("/init", response_model=Dict[str, Any])
async def initialize_flashcard(
    data: FlashcardInitRequest,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """
    Khởi tạo bộ flashcard (hỗ trợ system_dynamic, user_dynamic, default_seed, manual):
    - Tự động tích hợp cấu hình Space Repetition từ database (bảng repetition_loops).
    - Cấu hình số lượng card, thời gian làm bài, phân cấp dạng câu hỏi theo ngưỡng thông thạo.
    """
    user_id = user.get("sub") if user else None
    return await service.initialize_flashcard(data, creator_id=user_id)


@router.get("/repetition-config", response_model=RepetitionScheduleResponse)
async def get_repetition_config():
    """Lấy danh sách các box và khoảng cách ngày ôn tập theo thuật toán Leitner Space Repetition trong database."""
    return await service.get_repetition_config()


@router.put("/repetition-config", response_model=RepetitionScheduleResponse)
async def update_repetition_config(
    data: UpdateRepetitionScheduleRequest,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Điều chỉnh lại cấu hình khoảng cách ngày ôn tập (day_repetition) của các box trong database."""
    return await service.update_repetition_config(data)


@router.get("/dictionary-cache", response_model=List[Dict[str, Any]])
async def get_dictionary_cache(
    limit: int = 200,
    src: Optional[str] = None,
    dest: Optional[str] = None,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Lấy danh sách từ vựng & senses từ database để phục vụ khởi tạo / import thẻ flashcard."""
    return await service.get_dictionary_cache(limit=limit, src=src, dest=dest)


# ── FLASHCARD SET MANAGEMENT ─────────────────────────────────────────────────

@router.get("", response_model=List[Dict[str, Any]])
async def list_flashcard_sets(user: Optional[dict] = Depends(get_optional_current_user)):
    """Lấy danh sách các bộ flashcard công khai hoặc bộ private mà user có quyền xem."""
    user_id = user.get("sub") if user else None
    return await service.list_sets(user_id=user_id)


@router.post("", response_model=Dict[str, Any])
async def create_flashcard_set(
    data: FlashcardSetCreate,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Tạo mới một bộ flashcard (hỗ trợ manual, ai_gen, user_dynamic, system_dynamic)."""
    user_id = user.get("sub") if user else None
    return await service.create_set(data, creator_id=user_id)


@router.get("/{set_id}", response_model=Dict[str, Any])
async def get_flashcard_set(
    set_id: str,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Lấy thông tin chi tiết một bộ flashcard."""
    user_id = user.get("sub") if user else None
    return await service.get_set_by_id(set_id, user_id=user_id)


@router.put("/{set_id}", response_model=Dict[str, Any])
async def update_flashcard_set(
    set_id: str,
    data: FlashcardSetUpdate,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Cập nhật bộ flashcard."""
    user_id = user.get("sub") if user else None
    role = (user.get("role") or user.get("user_metadata", {}).get("role") or "") if user else ""
    is_admin = role.upper() == "ADMIN"
    return await service.update_set(set_id, data, user_id=user_id, is_admin=is_admin)


@router.delete("/{set_id}")
async def delete_flashcard_set(
    set_id: str,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Xóa bộ flashcard."""
    user_id = user.get("sub") if user else None
    role = (user.get("role") or user.get("user_metadata", {}).get("role") or "") if user else ""
    is_admin = role.upper() == "ADMIN"
    return await service.delete_set(set_id, user_id=user_id, is_admin=is_admin)


@router.post("/join-private")
async def join_private_set(
    req: JoinPrivateSetRequest,
    user: dict = Depends(get_current_user)
):
    """Tham gia bộ flashcard private bằng mã mời."""
    user_id = user.get("sub")
    return await service.join_private_set(req.invite_code, user_id=user_id)


# ── SESSION & USAGE ──────────────────────────────────────────────────────────

@router.get("/{set_id}/usage")
async def get_flashcard_usage(
    set_id: str,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Kiểm tra lượt chơi trong ngày và khung giờ mở/đóng sự kiện của bộ thẻ."""
    user_id = user.get("sub") if user else None
    return await service.get_usage(set_id, user_id=user_id)


@router.post("/{set_id}/start", response_model=FlashcardSessionStartResponse)
async def start_authenticated_session(
    set_id: str,
    user: dict = Depends(get_current_user)
):
    """Bắt đầu phiên học dành cho người dùng đã đăng nhập (kiểm tra daily limit và lưu tiến độ)."""
    user_id = user.get("sub")
    return await service.start_session(set_id, user_id=user_id, is_guest=False)


@router.post("/{set_id}/start-guest", response_model=FlashcardSessionStartResponse)
async def start_guest_session(
    set_id: str,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Bắt đầu phiên học cho khách (chỉ khả dụng với các bộ thẻ không giới hạn lượt làm)."""
    user_id = user.get("sub") if user else None
    return await service.start_session(set_id, user_id=user_id, is_guest=True)


@router.post("/submit-answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    req: SubmitAnswerRequest,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """
    Nộp câu trả lời cho một thẻ:
    - Tính điểm đúng/sai theo tốc độ & độ thông thạo
    - Tăng match_count cho từ vựng tiếng Anh xuất hiện
    - Cập nhật Leitner Box & điểm thông thạo
    """
    user_id = user.get("sub") if user else None
    return await service.submit_answer(req, user_id=user_id)


@router.post("/session-completed", response_model=SessionCompletedResponse)
async def session_completed(
    req: SessionCompletedRequest,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Hoàn thành phiên học và ghi nhận kết quả tổng thể."""
    user_id = user.get("sub") if user else None
    return await service.complete_session(req, user_id=user_id)


@router.post("/sync-progress")
async def sync_progress(
    payload: Dict[str, Any],
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Đồng bộ hàng đợi kết quả ngoại tuyến (offline sync queue)."""
    user_id = user.get("sub") if user else None
    items = payload.get("items") or []
    return await service.sync_offline_progress(items, user_id=user_id)


@router.get("/extension-session/{session_id}")
async def get_extension_session(
    session_id: str,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Tải phiên học được kích hoạt từ Browser Extension."""
    sess = await service.repo.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên học từ extension.")
    return sess


# ── AI FLASHCARD GENERATION ──────────────────────────────────────────────────

@router.post("/generate-ai", response_model=List[FlashcardCard])
async def generate_ai_cards(
    req: AIGenerateRequest,
    user: Optional[dict] = Depends(get_optional_current_user)
):
    """Sinh bộ thẻ flashcard bằng AI theo chủ đề, độ khó và dạng bài."""
    return await service.generate_ai_cards(req)


@router.post("/sessions/cleanup")
async def cleanup_sessions(user: Optional[dict] = Depends(get_optional_current_user)):
    """Dọn dẹp các phiên học flashcard cũ."""
    return await service.cleanup_old_sessions()

