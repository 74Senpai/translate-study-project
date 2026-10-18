from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from loguru import logger

from src.core.supabase import get_system_client
from src.middleware.auth import require_admin, ensure_role_in_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UpdateRoleRequest(BaseModel):
    new_role: str


@router.get("/users/roles", response_model=List[str])
async def get_roles(admin=Depends(require_admin)):
    """Trả về danh sách tất cả các role khả dụng trong hệ thống."""
    return ["ADMIN", "MANAGER", "CREATOR", "USER"]


@router.get("/users", response_model=List[Dict[str, Any]])
async def get_all_users(admin=Depends(require_admin)):
    """Lấy danh sách tất cả người dùng từ profiles kèm role."""
    client = get_system_client()
    try:
        # Lấy profiles kèm user_roles
        res = client.table("profiles").select(
            "id, user_name, email, display_name, avatar_url, role_id, created_at, updated_at, user_roles(id, role_name)"
        ).order("created_at", desc=True).execute()

        users = []
        for p in res.data or []:
            roles = []
            ur = p.get("user_roles")
            if isinstance(ur, dict) and ur.get("role_name"):
                roles.append(ur["role_name"].upper())
            elif p.get("role_id"):
                r_res = client.table("user_roles").select("role_name").eq("id", p["role_id"]).maybe_single().execute()
                if r_res and r_res.data and r_res.data.get("role_name"):
                    roles.append(r_res.data["role_name"].upper())

            if not roles:
                roles = ["USER"]

            users.append({
                "id": p["id"],
                "username": p.get("user_name"),
                "email": p.get("email"),
                "display_name": p.get("display_name"),
                "avatar_url": p.get("avatar_url"),
                "roles": roles,
                "is_admin": "ADMIN" in roles,
                "created_at": p.get("created_at"),
                "updated_at": p.get("updated_at"),
            })
        return users
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    req: UpdateRoleRequest,
    admin=Depends(require_admin),
):
    """Cập nhật role của người dùng."""
    client = get_system_client()
    new_role = req.new_role.upper()
    try:
        role_id = ensure_role_in_db(new_role, client)
        if not role_id:
            raise HTTPException(status_code=400, detail=f"Invalid role: {new_role}")

        # Update profiles table
        client.table("profiles").update({"role_id": role_id}).eq("id", user_id).execute()

        # Đồng bộ vào auth.users app_metadata
        try:
            client.auth.admin.update_user_by_id(user_id, {
                "app_metadata": {"roles": [new_role], "role": new_role}
            })
        except Exception as e:
            logger.debug(f"Could not sync role to auth.users app_metadata: {e}")

        return {"message": "Role updated successfully", "user_id": user_id, "role": new_role}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user role: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dictionary/cleanup")
async def cleanup_dictionary(admin=Depends(require_admin)):
    """Dọn dẹp các từ hoặc senses không hợp lệ."""
    return {"checked": 0, "deleted": 0}


@router.post("/flashcards/sessions/cleanup")
async def admin_cleanup_sessions(admin=Depends(require_admin)):
    """Dọn dẹp sessions flashcard cũ hoặc đã hết hạn."""
    from src.flashcard.services.flashcard_service import FlashcardService
    service = FlashcardService()
    return await service.cleanup_old_sessions()

