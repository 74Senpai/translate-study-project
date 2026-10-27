from datetime import datetime, timezone
from typing import Dict, Optional, List
from loguru import logger
from src.translate.models.stats_model import WordStatItem
from src.translate.repositories.supabase_vocab_repository import SupabaseVocabRepository


class StatsRepository:
    """
    Repository for word translation & encounter statistics.
    Maintains fast in-memory aggregate statistics, and when user_id is provided,
    persists user encounters and translation counts to Supabase (user_words & user_stats).
    When user_id is None (guest user), no user-bound records are created.
    """

    def __init__(self, db=None, supabase_repo: Optional[SupabaseVocabRepository] = None):
        self.db = db
        self.supabase_repo = supabase_repo
        # Fallback in-memory store
        self._memory_store: Dict[str, dict] = {}

    def update_word_occurrence(
        self,
        word: str,
        source_engine: str = "default",
        is_translated: bool = False,
        user_id: Optional[str] = None,
    ) -> WordStatItem:
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
                "encountered_count": 0,
                "translated_count": 0,
                "daily_counts": {},
                "weekly_counts": {},
                "monthly_counts": {},
                "source_counts": {},
                "last_seen": last_seen,
            }

        entry = self._memory_store[word_key]
        entry["total_count"] += 1
        if is_translated:
            entry["translated_count"] = entry.get("translated_count", 0) + 1
            src_key = f"{source_engine}_translated"
        else:
            entry["encountered_count"] = entry.get("encountered_count", 0) + 1
            src_key = source_engine

        entry["daily_counts"][day_key] = entry["daily_counts"].get(day_key, 0) + 1
        entry["weekly_counts"][week_key] = entry["weekly_counts"].get(week_key, 0) + 1
        entry["monthly_counts"][month_key] = entry["monthly_counts"].get(month_key, 0) + 1
        entry["source_counts"][src_key] = entry["source_counts"].get(src_key, 0) + 1
        entry["last_seen"] = last_seen

        # Persist to Supabase only if user is authenticated
        if user_id:
            try:
                repo = self.supabase_repo or SupabaseVocabRepository()
                word_rec = repo.get_or_create_word(word_key)
                if word_rec and word_rec.get("id"):
                    repo.record_user_word(user_id=user_id, word_id=word_rec["id"])
                    repo.record_user_word_statistic(user_id=user_id, word=word_key, is_translated=is_translated)
            except Exception as e:
                logger.warning(f"Could not persist user word stat for user {user_id}: {e}")

        return WordStatItem(
            word=word_key,
            total_count=entry["total_count"],
            daily_count=entry["daily_counts"][day_key],
            weekly_count=entry["weekly_counts"][week_key],
            monthly_count=entry["monthly_counts"][month_key],
            encountered_count=entry.get("encountered_count", 0),
            translated_count=entry.get("translated_count", 0),
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
            encountered_count=entry.get("encountered_count", 0),
            translated_count=entry.get("translated_count", 0),
            source_counts=entry["source_counts"],
            last_seen=entry["last_seen"],
        )
