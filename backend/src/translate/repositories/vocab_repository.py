from typing import Dict, List, Optional
from src.translate.models.vocab_model import VocabItem


class VocabRepository:
    """Repository for storing extracted vocabulary items and context entries."""

    def __init__(self, db=None):
        self.db = db
        # Fallback in-memory store keyed by word and context_id
        self._store: Dict[str, VocabItem] = {}

    def save_vocab_item(self, item: VocabItem) -> VocabItem:
        key = f"{item.word.lower().strip()}_{item.context_id}"
        self._store[key] = item
        return item

    def get_vocab_item(self, word: str, context_id: str) -> Optional[VocabItem]:
        key = f"{word.lower().strip()}_{context_id}"
        return self._store.get(key)

    def list_all_vocab(self) -> List[VocabItem]:
        return list(self._store.values())
