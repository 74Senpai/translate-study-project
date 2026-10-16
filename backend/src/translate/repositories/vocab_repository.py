from typing import Dict, List, Optional, Any
from loguru import logger
from src.translate.models.vocab_model import VocabItem
from src.translate.repositories.supabase_vocab_repository import SupabaseVocabRepository


class VocabRepository:
    """
    Repository for storing and extracting vocabulary items and context entries.
    Persists words, senses, and user vocabularies to Supabase PostgreSQL,
    with an in-memory cache as fallback.
    """

    def __init__(self, db=None, supabase_repo: Optional[SupabaseVocabRepository] = None):
        self.db = db
        self.supabase_repo = supabase_repo or SupabaseVocabRepository()
        # Fallback in-memory store keyed by word and context_id
        self._store: Dict[str, VocabItem] = {}

    def save_vocab_item(self, item: VocabItem, user_id: Optional[str] = None) -> VocabItem:
        # Capture stable WordNet sense_id BEFORE it can be overwritten by DB UUID after save
        stable_sense_id = item.sense_id or item.context_id
        key = f"{item.word.lower().strip()}_{stable_sense_id}"
        self._store[key] = item

        try:
            res = self.supabase_repo.save_translation_vocab_item(item, user_id=user_id)
            if res and isinstance(res, dict):
                saved_sense = res.get("sense")
                if saved_sense and isinstance(saved_sense, dict) and saved_sense.get("id"):
                    # Update item.sense_id to reflect the persisted DB ID,
                    # but the in-memory cache key stays stable (WordNet ID)
                    item.sense_id = str(saved_sense["id"])
        except Exception as e:
            logger.error(f"Failed to persist vocab item '{item.word}' to Supabase: {e}")

        return item

    def get_vocab_item(self, word: str, context_id: str) -> Optional[VocabItem]:
        key = f"{word.lower().strip()}_{context_id}"
        return self._store.get(key)

    def list_all_vocab(self) -> List[VocabItem]:
        return list(self._store.values())

    # ── Extraction & SRS Queries ─────────────────────────────────────────────

    def get_user_word_with_meanings(self, user_id: str, word: str) -> Optional[Dict[str, Any]]:
        """Trích xuất từ vựng cùng các senses, ghi chú và tiến độ của user."""
        try:
            return self.supabase_repo.get_user_word_with_meanings(user_id=user_id, word_text=word)
        except Exception as e:
            logger.error(f"Error in get_user_word_with_meanings: {e}")
            return None

    def get_user_overall_stats(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Trích xuất thống kê tổng thể user_stats."""
        try:
            return self.supabase_repo.get_user_overall_stats(user_id=user_id)
        except Exception as e:
            logger.error(f"Error in get_user_overall_stats: {e}")
            return None

    def get_due_reviews(self, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Trích xuất danh sách senses đến hạn ôn tập SRS."""
        try:
            return self.supabase_repo.get_due_reviews(user_id=user_id, limit=limit)
        except Exception as e:
            logger.error(f"Error in get_due_reviews: {e}")
            return []
