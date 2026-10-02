from typing import Optional, Dict
from pydantic import BaseModel


class WordStatItem(BaseModel):
    word: str
    total_count: int
    daily_count: int
    weekly_count: int
    monthly_count: int
    encountered_count: int = 0
    translated_count: int = 0
    source_counts: Dict[str, int] = {}
    last_seen: str


class WordStatsResponse(BaseModel):
    processed_words_count: int
    word_stats: list[WordStatItem]
    metadata: Optional[dict] = None
