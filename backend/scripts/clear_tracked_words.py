import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Load settings to get MongoDB URI
# Assuming we are running from the backend directory
load_dotenv()

async def clear_encountered_words():
    # Use standard env var names or defaults
    mongodb_uri = os.getenv("MONGODB_URI")
    db_name = os.getenv("MONGODB_DB_NAME", "translate_db")
    
    if not mongodb_uri:
        print("MONGODB_URI not found in environment. Please check your .env file.")
        return

    print(f"Connecting to MongoDB: {mongodb_uri}")
    client = AsyncIOMotorClient(mongodb_uri)
    db = client[db_name]
    
    collection_name = "user_encountered_words"
    
    # Get count before deletion
    count = await db[collection_name].count_documents({})
    print(f"Found {count} documents in '{collection_name}' collection.")
    
    if count > 0:
        result = await db[collection_name].delete_many({})
        print(f"Successfully deleted {result.deleted_count} documents.")
    else:
        print("Nothing to delete.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(clear_encountered_words())
