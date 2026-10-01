from datetime import datetime, timezone
from typing import Dict, Optional, List
from src.translate.models.stats_model import WordStatItem


class StatsRepository:
    """In-memory + MongoDB/DB repository for storing word translation statistics."""

    def __init__(self, db=None):
        self.db = db
        # Fallback in-memory store
        self._memory_store: Dict[str, dict] = {}

    def update_word_occurrence(self, word: str, source_engine: str = "default") -> WordStatItem:
        word_key = word.lower().strip()
        now = datetime.now(timezone.utc)
        day_key = now.strftime("%Y-%m-%d")
        week_key = now.strftime("%Y-W%U")
        month_key = now.strftime("%Y-%m")
        last_seen = now.isoformat()

        if word_key not in self._memory_store:
            self._memory_store[word_key] = {
                "word": word_key,
                "total_count": 0,
                "daily_counts": {},
                "weekly_counts": {},
                "monthly_counts": {},
                "source_counts": {},
                "last_seen": last_seen,
            }

        entry = self._memory_store[word_key]
        entry["total_count"] += 1
        entry["daily_counts"][day_key] = entry["daily_counts"].get(day_key, 0) + 1
        entry["weekly_counts"][week_key] = entry["weekly_counts"].get(week_key, 0) + 1
        entry["monthly_counts"][month_key] = entry["monthly_counts"].get(month_key, 0) + 1
        entry["source_counts"][source_engine] = entry["source_counts"].get(source_engine, 0) + 1
        entry["last_seen"] = last_seen

        return WordStatItem(
            word=word_key,
            total_count=entry["total_count"],
            daily_count=entry["daily_counts"][day_key],
            weekly_count=entry["weekly_counts"][week_key],
            monthly_count=entry["monthly_counts"][month_key],
            source_counts=entry["source_counts"],
            last_seen=last_seen,
        )

    def get_word_stat(self, word: str) -> Optional[WordStatItem]:
        word_key = word.lower().strip()
        if word_key not in self._memory_store:
            return None
        entry = self._memory_store[word_key]
        now = datetime.now(timezone.utc)
        day_key = now.strftime("%Y-%m-%d")
        week_key = now.strftime("%Y-W%U")
        month_key = now.strftime("%Y-%m")

        return WordStatItem(
            word=word_key,
            total_count=entry["total_count"],
            daily_count=entry["daily_counts"].get(day_key, 0),
            weekly_count=entry["weekly_counts"].get(week_key, 0),
            monthly_count=entry["monthly_counts"].get(month_key, 0),
            source_counts=entry["source_counts"],
            last_seen=entry["last_seen"],
        )
