import asyncio
import os
import sys
import re

# Add the project root to sys.path so we can import src
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger
from src.core.database import connect_db, close_db, get_database
from src.modules.translate.manager import TranslationManager

STOP_WORDS = {"cái", "con", "ngôi", "sự", "những", "các", "một", "a", "an", "the", "to", "of", "in"}

async def check_literal_phrase(original: str, src: str, dest: str, manager: TranslationManager) -> bool:
    """
    Káº¿t quÃ£ tráº£ vá» True: ÄÃ¢y LÃ€ tæ° ghép (Phrase há»£p lá»‡), nÃªn Giá»® láº¡i.
    Káº¿t quÃ£ tráº£ vá» False: ÄÃ¢y LÃ€ tá»• há»£p tæ° vÃ´ nghÄ©a (Literal translation), nÃªn XÃ“A.
    """
    words = original.split()
    if len(words) == 1:
        return True # Dá»… dÃ ng pass náº¿u chá»‰ cÃ³ 1 tæ°
    if len(words) > 3:
        return False # QuÃ¡ dÃ i
        
    # Translate tá»«ng tá»« Ä‘Æ¡n láº» vÃ  cáº£ cá»¥m tá»« cÃ¹ng luÃºc!
    to_translate = words + [original]
    try:
        translations = await manager.translate_batch(to_translate, src=src, dest=dest)
    except Exception as e:
        logger.warning(f"Batch translation failed for {original}: {e}")
        return True # Fallback if API fails
        
    if not translations or len(translations) != len(to_translate):
        return True
        
    m_parts = translations[:-1]
    m_phrase = translations[-1]
    
    def get_word_set(text: str):
        text = re.sub(r'[^\w\s]', '', text.lower())
        return set(w for w in text.split() if w not in STOP_WORDS)
        
    phrase_set = get_word_set(m_phrase)
    
    parts_set = set()
    for m in m_parts:
        parts_set.update(get_word_set(m))
        
    if not phrase_set:
        return False # HoÃ n toÃ n lÃ  stop words? KhÃ´ng há»£p lá»‡
        
    # Náº¿u nghÄ©a cá»§a cá»¥m tá»« CHá»ˆ Ä‘Æ°á»£c cÃ¡u thÃ nh tá»« cÃ¡c tá»« Ä‘Æ¡n (Subset) -> Literal!
    if phrase_set.issubset(parts_set):
        logger.debug(f"Phrase rejected as Literal: '{original}' -> {m_phrase}. (Parts: {m_parts})")
        return False
        
    return True

async def verify_dictionary(db=None, reverify_all: bool = False):
    should_close_db = False
    if db is None:
        await connect_db()
        db = get_database()
        should_close_db = True

    if db is None:
        logger.error("Could not connect to database")
        return {"status": "error", "message": "Could not connect to database"}
        
    manager = TranslationManager()
    collection = db["dictionary_cache"]
    
    # Cho phÃ©p verify láº¡i cáº£ cÃ¡c tá»« Ä‘Ã£ confirm náº¿u user yÃªu cáº§u
    query = {} if reverify_all else {"confirm": {"$ne": True}}
    cursor = collection.find(query)
    
    checked_count = 0
    passed_count = 0
    deleted_count = 0
    replaced_count = 0
    
    logger.info(f"Starting verification... (reverify_all={reverify_all})")
    
    async for doc in cursor:
        checked_count += 1
        original = doc.get("original", "")
        translations = doc.get("translations", [])
        src = doc.get("src")
        dest = doc.get("dest")
        
        if not original or not translations or not src or not dest:
            await collection.delete_one({"_id": doc["_id"]})
            deleted_count += 1
            continue
            
        # 1. Semantic Multi-Word Validation
        is_valid_phrase = await check_literal_phrase(original, src, dest, manager)
        if not is_valid_phrase:
            await collection.delete_one({"_id": doc["_id"]})
            deleted_count += 1
            continue
            
        # 2. Back-translation Validation
        first_translation = translations[0]
        try:
            back_translation = await manager.translate(first_translation, src=dest, dest=src)
            
            back_clean_str = re.sub(r'\(.*?\)', '', back_translation)
            back_parts = [p.strip().lower() for p in re.split(r'[,/;\n|]', back_clean_str) if p.strip()]
            original_clean = original.strip().lower()
            
            match_found = False
            for back_clean in back_parts:
                if back_clean == original_clean or back_clean in original_clean or original_clean in back_clean:
                    await collection.update_one(
                        {"_id": doc["_id"]},
                        {"$set": {"confirm": True}}
                    )
                    passed_count += 1
                    match_found = True
                    logger.debug(f"Passed: {original} <-> {first_translation}")
                    break
                    
            if not match_found:
                await collection.delete_one({"_id": doc["_id"]})
                deleted_count += 1
                logger.debug(f"Failed (back={back_clean_str}): {original} <-> {first_translation}. Deleted.")
                
                # Check fallback
                VALID_1_CHAR = {"a", "i", "à", "á", "ả", "ã", "ạ", "ô", "ố", "ồ", "ổ", "ỗ", "ộ", "ơ", "ớ", "ờ", "ở", "ỡ", "ợ", "ý", "ỷ", "ỹ", "ỳ", "ỵ", "ê", "ế", "ề", "ể", "ễ", "ệ", "u", "ú", "ù", "ủ", "ũ", "ụ", "ư", "ứ", "ừ", "ử", "ữ", "ự", "y", "o", "ó", "ò", "ỏ", "õ", "ọ", "e", "é", "è", "ẻ", "ẽ", "ẹ"}
                def is_valid_token(text):
                    text = text.strip()
                    if not text: return False
                    if "http://" in text or "https://" in text or "www." in text: return False
                    if re.search(r'[_,\.":;/?!@#$%^&*()+={<>}\[\]|\\~`0-9]', text): return False
                    if len(text) == 1 and text.lower() not in VALID_1_CHAR: return False
                    parts = re.split(r'[\s\-]+', text)
                    for p in parts:
                        if not p: continue
                        if not p.replace("'", "").isalpha(): return False
                        if len(p) == 1 and p.lower() not in VALID_1_CHAR: return False
                    return True
                
                for back_clean in back_parts:
                    if is_valid_token(back_clean):
                        # Ensure fallback also passes semantic check if multi-word!
                        is_valid_fallback = await check_literal_phrase(back_clean, src, dest, manager)
                        if is_valid_fallback:
                            import hashlib
                            from datetime import datetime, timezone
                            payload = f"{src}:{dest}:{back_clean}"
                            new_key = hashlib.sha256(payload.encode("utf-8")).hexdigest()
                            now = datetime.now(timezone.utc)
                            await collection.update_one(
                                {"_id": new_key},
                                {
                                    "$set": {
                                        "original": back_clean,
                                        "src": src,
                                        "dest": dest,
                                        "accessed_at": now,
                                        "confirm": False,
                                    },
                                    "$addToSet": {"translations": first_translation},
                                    "$setOnInsert": {"hit_count": 0, "created_at": now},
                                },
                                upsert=True
                            )
                            replaced_count += 1
                            logger.debug(f"Replaced {original} with {back_clean}")
                            break
                
        except Exception as e:
            logger.warning(f"Translation API failed for {first_translation}: {e}")
            
        if checked_count % 50 == 0:
            logger.info(f"Checked {checked_count} entries. Passed: {passed_count}, Deleted: {deleted_count}")
            
    logger.info(f"Verification finished! Checked: {checked_count}, Passed: {passed_count}, Deleted: {deleted_count}")
    
    if should_close_db:
        await close_db()

    return {
        "status": "success",
        "scanned": checked_count,
        "passed": passed_count,
        "deleted": deleted_count,
        "replaced": replaced_count
    }

if __name__ == "__main__":
    asyncio.run(verify_dictionary())
