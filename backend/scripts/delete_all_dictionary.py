import asyncio
import os
import sys

# Add the project root to sys.path so we can import src
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger
from src.core.database import connect_db, close_db, get_database

async def delete_all_dictionary():
    await connect_db()
    db = get_database()
    if db is None:
        logger.error("Could not connect to database")
        return
        
    collection = db["dictionary_cache"]
    
    logger.warning("BẠN ĐANG CHUẨN BỊ XOÁ TOÀN BỘ DỮ LIỆU TỪ ĐIỂN. HÀNH ĐỘNG NÀY KHÔNG THỂ PHỤC HỒI!")
    confirm = input("Bạn có chắc chắn muốn xoá toàn bộ dữ liệu từ điển không? Nhập 'YES' để xác nhận: ")
    
    if confirm == 'YES':
        result = await collection.delete_many({})
        logger.success(f"Đã xoá thành công toàn bộ {result.deleted_count} từ vựng khỏi CSDL!")
    else:
        logger.info("Đã huỷ thao tác xoá.")
    
    await close_db()

if __name__ == "__main__":
    asyncio.run(delete_all_dictionary())
