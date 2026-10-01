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
