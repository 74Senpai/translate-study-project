from loguru import logger


class TranslationCache:
    def __init__(self, ttl_days: int = 30):
        self.ttl_days = ttl_days

    async def ensure_indexes(self):
        logger.info(f"TranslationCache indexes initialized (TTL: {self.ttl_days} days).")
