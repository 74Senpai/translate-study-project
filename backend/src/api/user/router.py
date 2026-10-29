import os
import time
import uuid
import math
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from pydantic import BaseModel, Field
from supabase import Client
from loguru import logger

from src.core.supabase import get_system_client, get_supabase
from src.middleware.auth import get_current_user
from src.translate.services.ipa_service import get_ipa_service


router = APIRouter(prefix="/user", tags=["user"])


# ── SCHEMAS ─────────────────────────────────────────────────────────────────

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    user_name: Optional[str] = None
    avatar_url: Optional[str] = None


class PersonalWordCreateRequest(BaseModel):
    word: str = Field(..., min_length=1, description="Từ tiếng Anh")
    personal_translation: Optional[str] = Field(None, description="Bản dịch / ghi chú cá nhân")
    personal_context: Optional[str] = Field(None, description="Câu ngữ cảnh ví dụ")
    ipa: Optional[str] = Field(None, description="Phiên âm IPA")
    encountered_count: Optional[int] = Field(1, ge=0)
    translated_count: Optional[int] = Field(1, ge=0)


class PersonalWordUpdateRequest(BaseModel):
    personal_translation: Optional[str] = None
    personal_context: Optional[str] = None
    encountered_count: Optional[int] = None
    translated_count: Optional[int] = None


# ── PROFILE ENDPOINTS ────────────────────────────────────────────────────────

@router.get("/profile")
async def get_user_profile(
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Lấy toàn bộ thông tin profile của người dùng hiện tại:
    - Thông tin cá nhân (email, display_name, avatar, username)
    - Chỉ số Gamification: XP, level, chuỗi học tập (streak_days)
    - Tổng quan kho từ vựng đã gặp & đã dịch
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    # 1. Truy vấn thông tin profile
    prof_res = client.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    prof_data = prof_res.data if prof_res else {}

    # 2. Đếm số từ đã gặp và đã dịch
    total_words_encountered = 0
    total_words_translated = 0
    unique_words_count = 0
    try:
        count_res = client.table("user_word_statistics").select("encountered_count, translated_count").eq("user_id", user_id).execute()
        if count_res and count_res.data:
            total_words_encountered = sum(r.get("encountered_count", 0) for r in count_res.data)
            total_words_translated = sum(r.get("translated_count", 0) for r in count_res.data)
            unique_words_count = len(count_res.data)
    except Exception as e:
        logger.debug(f"Count words notice: {e}")

    return {
        "id": user_id,
        "username": prof_data.get("user_name") or user.get("email", "").split("@")[0],
        "full_name": prof_data.get("display_name") or user.get("email", "").split("@")[0],
        "email": prof_data.get("email") or user.get("email"),
        "avatar_url": prof_data.get("avatar_url"),
        "created_at": prof_data.get("created_at"),
        "total_words_encountered": total_words_encountered,
        "total_words_translated": total_words_translated,
        "unique_words_count": unique_words_count
    }


@router.put("/profile")
async def update_user_profile(
    payload: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Cập nhật thông tin profile người dùng (tên hiển thị, username, avatar_url).
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    updates: Dict[str, Any] = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if payload.display_name is not None and payload.display_name.strip():
        updates["display_name"] = payload.display_name.strip()
    if payload.user_name is not None and payload.user_name.strip():
        updates["user_name"] = payload.user_name.strip().lower()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url.strip()

    try:
        res = client.table("profiles").update(updates).eq("id", user_id).execute()
        return {
            "success": True,
            "message": "Cập nhật thông tin trang cá nhân thành công.",
            "data": res.data[0] if (res and res.data) else updates
        }
    except Exception as e:
        logger.error(f"Error updating user profile: {e}")
        raise HTTPException(status_code=400, detail=f"Không thể cập nhật profile: {str(e)}")


@router.post("/avatar")
async def upload_user_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Tải lên ảnh đại diện cá nhân, lưu vào static/avatars và cập nhật profiles.avatar_url.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    filename = file.filename or "avatar.png"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ file ảnh định dạng JPG, PNG, WEBP, GIF.")

    # Static folder path
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    avatar_dir = os.path.join(base_dir, "static", "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    saved_filename = f"{user_id}_{int(time.time())}{ext}"
    saved_path = os.path.join(avatar_dir, saved_filename)

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dung lượng ảnh tối đa là 5MB.")

    with open(saved_path, "wb") as f:
        f.write(contents)

    avatar_url = f"/static/avatars/{saved_filename}"

    # Cập nhật DB
    try:
        client.table("profiles").update({
            "avatar_url": avatar_url,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()
    except Exception as e:
        logger.warning(f"Failed to update avatar in DB: {e}")

    return {
        "success": True,
        "avatar_url": avatar_url,
        "message": "Tải lên ảnh đại diện thành công."
    }


# ── PERSONAL VOCABULARY & TRANSLATIONS CRUD ─────────────────────────────────

@router.get("/words")
async def get_user_words(
    search: Optional[str] = Query(None, description="Tìm kiếm từ vựng"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("last_seen", description="Sắp xếp theo: last_seen, encountered, translated, word"),
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Lấy danh sách các từ đã gặp, số lần dịch và bản dịch cá nhân của người dùng.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    # 1. Truy vấn từ bảng user_word_statistics
    query = client.table("user_word_statistics").select("*").eq("user_id", user_id)

    if search and search.strip():
        clean_s = search.strip().lower()
        query = query.ilike("word", f"%{clean_s}%")

    if sort_by == "encountered":
        query = query.order("encountered_count", desc=True)
    elif sort_by == "translated":
        query = query.order("translated_count", desc=True)
    elif sort_by == "word":
        query = query.order("word", desc=False)
    else:
        query = query.order("last_seen", desc=True)

    res = query.range(offset, offset + limit - 1).execute()
    items = res.data or []

    # 2. Lấy thông tin bản dịch cá nhân từ user_sense_notes & senses
    words_list = [item["word"] for item in items if item.get("word")]
    notes_map = {}
    senses_map = {}

    if words_list:
        try:
            # Lấy senses để có nghĩa tiếng Việt mặc định
            s_res = client.table("senses").select(
                "id, meaning_vi, definition_en, ipa, words!inner(word_text)"
            ).in_("words.word_text", words_list).execute()
            if s_res and s_res.data:
                for s in s_res.data:
                    w_obj = s.get("words") or {}
                    w_text = w_obj.get("word_text", "").lower()
                    if w_text and w_text not in senses_map:
                        senses_map[w_text] = s

            # Lấy user_sense_notes của user này
            sense_ids = [s["id"] for s in senses_map.values() if s.get("id")]
            if sense_ids:
                n_res = client.table("user_sense_notes").select(
                    "id, sense_id, meaning_note, context"
                ).eq("user_id", user_id).in_("sense_id", sense_ids).execute()
                if n_res and n_res.data:
                    for n in n_res.data:
                        notes_map[n["sense_id"]] = n
        except Exception as e:
            logger.debug(f"Fetch notes notice: {e}")

    # Ghép dữ liệu trả về cho frontend
    enriched_items = []
    for item in items:
        w_text = (item.get("word") or "").lower()
        sense = senses_map.get(w_text, {})
        sense_id = sense.get("id")
        note = notes_map.get(sense_id, {}) if sense_id else {}

        enriched_items.append({
            "id": item.get("id"),
            "word": item.get("word"),
            "encountered_count": item.get("encountered_count", 0),
            "translated_count": item.get("translated_count", 0),
            "total_count": item.get("total_count", 0),
            "last_seen": item.get("last_seen"),
            "created_at": item.get("created_at"),
            "default_meaning": sense.get("meaning_vi") or "",
            "ipa": sense.get("ipa") or "",
            "personal_translation": note.get("meaning_note") or "",
            "personal_context": note.get("context") or "",
            "sense_id": sense_id,
            "note_id": note.get("id")
        })

    return {
        "items": enriched_items,
        "total": len(enriched_items),
        "limit": limit,
        "offset": offset
    }


@router.post("/words", status_code=status.HTTP_201_CREATED)
async def add_personal_word(
    payload: PersonalWordCreateRequest,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Thêm từ mới và/hoặc bản dịch cá nhân vào kho từ của người dùng.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    clean_w = payload.word.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Đảm bảo từ tồn tại trong bảng words
    word_rec = client.table("words").select("id").eq("word_text", clean_w).maybe_single().execute()
    word_id = None
    if word_rec and word_rec.data:
        word_id = word_rec.data["id"]
    else:
        new_w = client.table("words").insert({
            "word_text": clean_w,
            "is_validated": False,
            "created_at": now_iso,
            "updated_at": now_iso
        }).execute()
        if new_w and new_w.data:
            word_id = new_w.data[0]["id"]

    if not word_id:
        raise HTTPException(status_code=500, detail="Không thể tạo bản ghi từ vựng.")

    # 2. Upsert user_words
    uw_rec = client.table("user_words").select("id, translated_count").eq("user_id", user_id).eq("word_id", word_id).maybe_single().execute()
    if uw_rec and uw_rec.data:
        uw_id = uw_rec.data["id"]
        client.table("user_words").update({
            "translated_count": uw_rec.data.get("translated_count", 0) + (payload.translated_count or 1),
            "updated_at": now_iso
        }).eq("id", uw_id).execute()
    else:
        client.table("user_words").insert({
            "user_id": user_id,
            "word_id": word_id,
            "translated_count": payload.translated_count or 1,
            "created_at": now_iso,
            "updated_at": now_iso
        }).execute()

    # 3. Upsert user_word_statistics
    enc = payload.encountered_count or 1
    trans = payload.translated_count or 1
    stat_rec = client.table("user_word_statistics").select("id, encountered_count, translated_count").eq("user_id", user_id).eq("word", clean_w).maybe_single().execute()

    if stat_rec and stat_rec.data:
        s_id = stat_rec.data["id"]
        new_enc = stat_rec.data.get("encountered_count", 0) + enc
        new_trans = stat_rec.data.get("translated_count", 0) + trans
        client.table("user_word_statistics").update({
            "encountered_count": new_enc,
            "translated_count": new_trans,
            "total_count": new_enc + new_trans,
            "last_seen": now_iso,
            "updated_at": now_iso
        }).eq("id", s_id).execute()
    else:
        client.table("user_word_statistics").insert({
            "user_id": user_id,
            "word": clean_w,
            "encountered_count": enc,
            "translated_count": trans,
            "total_count": enc + trans,
            "last_seen": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso
        }).execute()

    # 4. Lưu bản dịch cá nhân (user_sense_notes) nếu có
    sense_id = None
    ipa_val = payload.ipa or get_ipa_service().get_ipa(clean_w)
    if payload.personal_translation or payload.personal_context:
        # Tìm sense hoặc tạo sense mẫu cho từ này
        sense_rec = client.table("senses").select("id, ipa").eq("word_id", word_id).maybe_single().execute()
        if sense_rec and sense_rec.data:
            sense_id = sense_rec.data["id"]
            if ipa_val and (not sense_rec.data.get("ipa") or not str(sense_rec.data.get("ipa")).strip()):
                client.table("senses").update({"ipa": ipa_val, "updated_at": now_iso}).eq("id", sense_id).execute()
        else:
            sense_id = f"custom_{word_id[:8]}"
            client.table("senses").insert({
                "id": sense_id,
                "word_id": word_id,
                "meaning_vi": payload.personal_translation or "",
                "ipa": ipa_val,
                "created_at": now_iso,
                "updated_at": now_iso
            }).execute()

        # Upsert user_sense_notes
        note_rec = client.table("user_sense_notes").select("id").eq("user_id", user_id).eq("sense_id", sense_id).maybe_single().execute()
        if note_rec and note_rec.data:
            client.table("user_sense_notes").update({
                "meaning_note": payload.personal_translation,
                "context": payload.personal_context,
                "updated_at": now_iso
            }).eq("id", note_rec.data["id"]).execute()
        else:
            client.table("user_sense_notes").insert({
                "user_id": user_id,
                "sense_id": sense_id,
                "meaning_note": payload.personal_translation,
                "context": payload.personal_context,
                "created_at": now_iso,
                "updated_at": now_iso
            }).execute()

    return {
        "success": True,
        "message": f"Đã thêm từ '{clean_w}' vào kho từ cá nhân thành công.",
        "word": clean_w,
        "personal_translation": payload.personal_translation,
        "personal_context": payload.personal_context
    }


@router.put("/words/{word_text}")
async def update_personal_word(
    word_text: str,
    payload: PersonalWordUpdateRequest,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Sửa bản dịch cá nhân, ngữ cảnh hoặc số lần gặp/dịch của một từ.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    clean_w = word_text.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Cập nhật user_word_statistics nếu có thay đổi chỉ số
    if payload.encountered_count is not None or payload.translated_count is not None:
        stat_rec = client.table("user_word_statistics").select("id, encountered_count, translated_count").eq("user_id", user_id).eq("word", clean_w).maybe_single().execute()
        if stat_rec and stat_rec.data:
            enc = payload.encountered_count if payload.encountered_count is not None else stat_rec.data.get("encountered_count", 0)
            trans = payload.translated_count if payload.translated_count is not None else stat_rec.data.get("translated_count", 0)
            client.table("user_word_statistics").update({
                "encountered_count": enc,
                "translated_count": trans,
                "total_count": enc + trans,
                "updated_at": now_iso
            }).eq("id", stat_rec.data["id"]).execute()

    # 2. Cập nhật bản dịch cá nhân trong user_sense_notes
    if payload.personal_translation is not None or payload.personal_context is not None:
        # Tìm sense_id của từ
        w_rec = client.table("words").select("id").eq("word_text", clean_w).maybe_single().execute()
        if w_rec and w_rec.data:
            w_id = w_rec.data["id"]
            sense_rec = client.table("senses").select("id").eq("word_id", w_id).maybe_single().execute()
            sense_id = None
            if sense_rec and sense_rec.data:
                sense_id = sense_rec.data["id"]
            else:
                sense_id = f"custom_{w_id[:8]}"
                client.table("senses").insert({
                    "id": sense_id,
                    "word_id": w_id,
                    "meaning_vi": payload.personal_translation or "",
                    "created_at": now_iso,
                    "updated_at": now_iso
                }).execute()

            note_rec = client.table("user_sense_notes").select("id").eq("user_id", user_id).eq("sense_id", sense_id).maybe_single().execute()
            if note_rec and note_rec.data:
                updates = {"updated_at": now_iso}
                if payload.personal_translation is not None:
                    updates["meaning_note"] = payload.personal_translation
                if payload.personal_context is not None:
                    updates["context"] = payload.personal_context
                client.table("user_sense_notes").update(updates).eq("id", note_rec.data["id"]).execute()
            else:
                client.table("user_sense_notes").insert({
                    "user_id": user_id,
                    "sense_id": sense_id,
                    "meaning_note": payload.personal_translation or "",
                    "context": payload.personal_context or "",
                    "created_at": now_iso,
                    "updated_at": now_iso
                }).execute()

    return {
        "success": True,
        "message": f"Cập nhật bản dịch cá nhân cho '{clean_w}' thành công."
    }


@router.delete("/words/{word_text}")
async def delete_personal_word(
    word_text: str,
    user: dict = Depends(get_current_user),
    client: Client = Depends(get_system_client)
):
    """
    Xóa từ khỏi kho từ và ghi chú cá nhân của người dùng.
    """
    user_id = user.get("sub") or user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Xác thực người dùng không hợp lệ.")

    clean_w = word_text.strip().lower()

    # 1. Xóa khỏi user_word_statistics
    client.table("user_word_statistics").delete().eq("user_id", user_id).eq("word", clean_w).execute()

    # 2. Xóa khỏi user_words
    w_rec = client.table("words").select("id").eq("word_text", clean_w).maybe_single().execute()
    if w_rec and w_rec.data:
        w_id = w_rec.data["id"]
        client.table("user_words").delete().eq("user_id", user_id).eq("word_id", w_id).execute()

        # Xóa khỏi user_sense_notes nếu có
        s_res = client.table("senses").select("id").eq("word_id", w_id).execute()
        if s_res and s_res.data:
            s_ids = [s["id"] for s in s_res.data]
            client.table("user_sense_notes").delete().eq("user_id", user_id).in_("sense_id", s_ids).execute()

    return {
        "success": True,
        "message": f"Đã xóa từ '{clean_w}' khỏi kho từ cá nhân."
    }




