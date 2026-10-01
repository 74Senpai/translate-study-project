import asyncio
import re
import os
import sys

# Add the project root to sys.path so we can import src
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger
from src.core.database import connect_db, close_db, get_database

async def clean_dictionary(db=None):
    should_close_db = False
    if db is None:
        await connect_db()
        db = get_database()
        should_close_db = True

    if db is None:
        logger.error("Could not connect to database")
        return {"status": "error", "message": "Could not connect to database"}
        
    collection = db["dictionary_cache"]
    
    # Cursor to iterate over all documents
    cursor = collection.find({})
    
    deleted_count = 0
    checked_count = 0
    
    logger.info("Starting dictionary cleanup...")
    
    VALID_1_CHAR = {"a", "i", "à", "á", "ả", "ã", "ạ", "ô", "ố", "ồ", "ổ", "ỗ", "ộ", "ơ", "ớ", "ờ", "ở", "ỡ", "ợ", "ý", "ỷ", "ỹ", "ỳ", "ỵ", "ê", "ế", "ề", "ể", "ễ", "ệ", "u", "ú", "ù", "ủ", "ũ", "ụ", "ư", "ứ", "ừ", "ử", "ữ", "ự", "y", "o", "ó", "ò", "ỏ", "õ", "ọ", "e", "é", "è", "ẻ", "ẽ", "ẹ"}
    def is_invalid(text):
        text = text.strip()
        if not text:
            return True
        if "http://" in text or "https://" in text or "www." in text:
            return True
        if re.search(r'[_,\.":;/?!@#$%^&*()+={<>}\[\]|\\~`0-9]', text):
            return True
        if len(text) == 1 and text.lower() not in VALID_1_CHAR:
            return True
        # Also reject if parts are not alphabetical (allowing apostrophes)
        parts = re.split(r'[\s\-]+', text)
        for p in parts:
            if not p: continue
            if not p.replace("'", "").isalpha():
                return True
            if len(p) == 1 and p.lower() not in VALID_1_CHAR:
                return True
        return False

    async for doc in cursor:
        checked_count += 1
        original = doc.get("original", "")
        translations = doc.get("translations", [])
        
        should_delete = False
        
        # Check original
        if is_invalid(original):
            should_delete = True
            
        # Check all translations
        for t in translations:
            if is_invalid(t):
                should_delete = True
                break
                
        if should_delete:
            await collection.delete_one({"_id": doc["_id"]})
            deleted_count += 1
            if deleted_count % 100 == 0:
                logger.info(f"Deleted {deleted_count} invalid entries so far...")
                
    logger.info(f"Cleanup finished! Checked {checked_count} entries. Deleted {deleted_count} invalid entries.")
    
    if should_close_db:
        await close_db()

    return {
        "status": "success",
        "checked": checked_count,
        "deleted": deleted_count
    }

if __name__ == "__main__":
    asyncio.run(clean_dictionary())
