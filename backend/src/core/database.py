from typing import Optional
from loguru import logger
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from src.config import get_settings

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect_db():
    global _client, _db
    settings = get_settings()
    try:
        _client = AsyncIOMotorClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
        _db = _client[settings.mongodb_db_name]
        logger.info(f"Connected to MongoDB database: {settings.mongodb_db_name}")

        # Tạo indexes cho module Flashcard
        try:
            await _db["user_word_proficiency"].create_index(
                [("user_id", 1), ("word", 1)], unique=True, background=True
            )
            await _db["flashcard_sessions"].create_index(
                [("started_at", 1)], expireAfterSeconds=7200, name="ttl_flashcard_sessions_2h", background=True
            )
            await _db["flashcard_daily_usage"].create_index(
                [("user_id", 1), ("set_id", 1), ("date_key", 1)], unique=True, background=True
            )
            logger.info("Flashcard MongoDB indexes initialized.")
        except Exception as idx_err:
            logger.debug(f"Flashcard index creation notice: {idx_err}")
    except Exception as e:
        logger.warning(f"Failed to connect to MongoDB ({e}). Running in degraded/offline DB mode.")
        _client = None
        _db = None


async def close_db():
    global _client, _db
    if _client:
        _client.close()
        logger.info("Closed MongoDB database connection.")
        _client = None
        _db = None


def get_database() -> Optional[AsyncIOMotorDatabase]:
    return _db

# from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
# from loguru import logger
# from fastapi import Depends, HTTPException

# from src.config import get_settings

# _client: AsyncIOMotorClient | None = None


# async def connect_db() -> None:
#     """Khởi tạo kết nối MongoDB khi server start."""
#     global _client
#     settings = get_settings()

#     if not settings.mongodb_uri:
#         logger.warning("MONGODB_URI chưa được cấu hình. Tính năng database sẽ không hoạt động.")
#         return

#     try:
#         _client = AsyncIOMotorClient(settings.mongodb_uri)
#         # Ping để xác nhận kết nối thành công
#         await _client.admin.command("ping")
#         logger.info(f"Kết nối MongoDB thành công — DB: '{settings.mongodb_db_name}'")

#         # Tạo index cho user_word_proficiency (nếu chưa có)
#         db = _client[settings.mongodb_db_name]
#         await db["user_word_proficiency"].create_index(
#             [("user_id", 1), ("word", 1)], unique=True, background=True
#         )
#         logger.info("Index user_word_proficiency(user_id, word) đã sẵn sàng.")

#         # TTL index: tự xóa flashcard_sessions sau 2 giờ (7200 giây)
#         # Đảm bảo orphan sessions bị dọn sạch khi browser crash hoặc user không thoát đúng cách
#         await db["flashcard_sessions"].create_index(
#             [("started_at", 1)],
#             expireAfterSeconds=7200,
#             name="ttl_flashcard_sessions_2h",
#             background=True,
#         )
#         logger.info("TTL index flashcard_sessions (2h) đã sẵn sàng.")
#     except Exception as e:
#         logger.error(f"Không thể kết nối MongoDB: {e}")
#         _client = None



# async def close_db() -> None:
#     """Đóng kết nối MongoDB khi server shutdown."""
#     global _client
#     if _client:
#         _client.close()
#         logger.info("Đóng kết nối MongoDB.")
#         _client = None


# def get_database() -> AsyncIOMotorDatabase | None:
#     """
#     FastAPI dependency — trả về database instance.
#     Trả về None nếu chưa kết nối (graceful degrade).
#     """
#     if _client is None:
#         return None
#     settings = get_settings()
#     return _client[settings.mongodb_db_name]


# def require_database(db: AsyncIOMotorDatabase | None = Depends(get_database)) -> AsyncIOMotorDatabase:
#     """
#     FastAPI dependency — Đảm bảo DB đang kết nối trước khi xử lý request.
#     Nếu chưa kết nối, trả về 503 Service Unavailable.
#     """
#     if db is None:
#         raise HTTPException(
#             status_code=503,
#             detail="Dịch vụ cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau hoặc kiểm tra cấu hình hệ thống.",
#         )
#     return db
