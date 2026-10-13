from typing import Optional
from fastapi import Request, HTTPException
from loguru import logger


def get_user_roles(user_id: str) -> list[str]:
    """
    Trả về danh sách roles của user.
    Hiện tại trả về mảng rỗng (sẽ mở rộng sau với Supabase roles/RBAC).
    """
    # TODO: Truy vấn Supabase để lấy roles thực của user theo user_id
    return []


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency — Lấy thông tin user hiện tại từ JWT trong Authorization header.
    Trả về dict chứa user payload nếu hợp lệ, raise 401 nếu không.
    """
    from src.core.supabase import get_supabase
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ", 1)[1]
    try:
        client = get_supabase()
        user_resp = client.auth.get_user(token)
        if not user_resp or not user_resp.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        user = user_resp.user
        return {
            "sub": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"get_current_user error: {e}")
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_optional_current_user(request: Request) -> Optional[dict]:
    """
    Phiên bản tuỳ chọn (không bắt buộc auth) — trả về None nếu không có token.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
