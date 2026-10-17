from typing import Optional, List
from fastapi import Request, HTTPException, Depends
from loguru import logger
from src.core.supabase import get_system_client, get_supabase
from src.config import get_settings


def ensure_role_in_db(role_name: str, client) -> Optional[int]:
    """Lấy hoặc tạo role trong bảng user_roles nếu chưa có."""
    try:
        r = client.table("user_roles").select("id").eq("role_name", role_name.upper()).maybe_single().execute()
        if r and r.data:
            return r.data["id"]
        new_r = client.table("user_roles").insert({
            "role_name": role_name.upper(),
            "details": f"Role {role_name.upper()}"
        }).execute()
        if new_r and new_r.data:
            return new_r.data[0]["id"]
    except Exception as e:
        logger.warning(f"ensure_role_in_db error for {role_name}: {e}")
    return None


def get_user_roles(
    user_id: str,
    email: Optional[str] = None,
    user_metadata: Optional[dict] = None,
    app_metadata: Optional[dict] = None,
) -> list[str]:
    """
    Truy vấn roles của user từ Supabase PostgreSQL qua service key (bypass RLS).
    1. Kiểm tra profiles -> user_roles
    2. Kiểm tra app_metadata / user_metadata của Supabase Auth
    3. Kiểm tra admin_emails (tự động gán ADMIN nếu là email admin)
    4. Mặc định trả về USER nếu chưa có role nào.
    """
    settings = get_settings()
    roles: List[str] = []
    norm_email = email.strip().lower() if email else ""

    try:
        client = get_system_client()
        # 1. Truy vấn bảng profiles
        prof_res = client.table("profiles").select("id, role_id, email, user_roles(id, role_name)").eq("id", user_id).maybe_single().execute()
        if prof_res and prof_res.data:
            p_data = prof_res.data
            if not norm_email and p_data.get("email"):
                norm_email = p_data["email"].strip().lower()

            # Join user_roles
            ur = p_data.get("user_roles")
            if isinstance(ur, dict) and ur.get("role_name"):
                roles.append(ur["role_name"].upper())
            elif p_data.get("role_id"):
                r_res = client.table("user_roles").select("role_name").eq("id", p_data["role_id"]).maybe_single().execute()
                if r_res and r_res.data and r_res.data.get("role_name"):
                    roles.append(r_res.data["role_name"].upper())

        # 2. Kiểm tra Supabase Auth metadata nếu roles còn trống
        if not roles:
            try:
                auth_user = client.auth.admin.get_user_by_id(user_id)
                if auth_user and auth_user.user:
                    u = auth_user.user
                    if not norm_email and u.email:
                        norm_email = u.email.strip().lower()
                    app_m = u.app_metadata or {}
                    usr_m = u.user_metadata or {}
                    for m in [app_m, usr_m]:
                        val = m.get("roles") or m.get("role")
                        if isinstance(val, list):
                            roles.extend([str(x).upper() for x in val if x])
                        elif isinstance(val, str) and val.strip():
                            roles.append(val.strip().upper())
            except Exception as e:
                logger.debug(f"Could not fetch auth user by id: {e}")

        # 3. Kiểm tra email admin
        admin_emails = [e.lower() for e in settings.admin_emails]
        if norm_email and norm_email in admin_emails:
            if "ADMIN" not in roles:
                roles.insert(0, "ADMIN")
            # Tự động đồng bộ role_id trong bảng profiles nếu chưa trỏ tới ADMIN
            try:
                admin_role_id = ensure_role_in_db("ADMIN", client)
                if admin_role_id:
                    client.table("profiles").update({"role_id": admin_role_id}).eq("id", user_id).execute()
            except Exception as e:
                logger.debug(f"Could not link admin role_id for {norm_email}: {e}")

    except Exception as e:
        logger.error(f"Error querying user roles for user_id={user_id}: {e}")

    # Fallback từ tham số metadata nếu có
    if not roles:
        for m in [app_metadata, user_metadata]:
            if not m:
                continue
            val = m.get("roles") or m.get("role")
            if isinstance(val, list):
                roles.extend([str(x).upper() for x in val if x])
            elif isinstance(val, str) and val.strip():
                roles.append(val.strip().upper())

    # 4. Mặc định role USER nếu không có role nào
    if not roles:
        roles.append("USER")

    # Loại bỏ duplicate giữ nguyên thứ tự
    seen = set()
    unique_roles = []
    for r in roles:
        if r not in seen:
            seen.add(r)
            unique_roles.append(r)

    return unique_roles


async def get_current_user(request: Request) -> dict:
    """
    FastAPI dependency — Lấy thông tin user hiện tại từ JWT trong Authorization header.
    Trả về dict chứa user payload + roles nếu hợp lệ, raise 401 nếu không.
    """
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
        roles = get_user_roles(
            user.id,
            email=user.email,
            user_metadata=user.user_metadata or {},
            app_metadata=user.app_metadata or {},
        )
        user_dict = {
            "sub": user.id,
            "id": user.id,
            "email": user.email,
            "user_metadata": user.user_metadata or {},
            "app_metadata": user.app_metadata or {},
            "roles": roles,
            "is_admin": "ADMIN" in roles,
        }
        request.state.user = user_dict
        return user_dict
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


def require_roles(allowed_roles: list[str]):
    """FastAPI dependency factory kiểm tra role của user."""
    async def role_checker(user: dict = Depends(get_current_user)):
        user_roles = user.get("roles", [])
        if user.get("is_admin") or any(r in user_roles for r in allowed_roles):
            return user
        raise HTTPException(status_code=403, detail="Forbidden: insufficient permissions")
    return role_checker


require_admin = require_roles(["ADMIN"])
require_staff = require_roles(["ADMIN", "MANAGER", "CREATOR"])
