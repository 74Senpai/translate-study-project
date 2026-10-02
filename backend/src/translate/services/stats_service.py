from typing import List, Optional
import spacy
from loguru import logger
from src.translate.models.stats_model import WordStatsResponse, WordStatItem
from src.translate.repositories.stats_repository import StatsRepository


class StatsService:
    """Service to process text, count word frequencies, and update daily/weekly/monthly stats."""

    def __init__(self, repo: Optional[StatsRepository] = None, spacy_model: str = "en_core_web_sm"):
        self.repo = repo or StatsRepository()
        self.nlp = None
        try:
            self.nlp = spacy.load(spacy_model)
        except Exception as e:
            logger.warning(f"Could not load SpaCy model in StatsService: {e}")

    async def update_statistics(
        self,
        text: str,
        source_engine: str = "default",
        is_translated: bool = False
    ) -> WordStatsResponse:
        """Extract words from text, update word count & frequency statistics across time periods."""
        words_to_count: List[str] = []

        if self.nlp is not None:
            doc = self.nlp(text)
            i = 0
            n = len(doc)
            while i < n:
                token = doc[i]
                # Check for hyphenated compound (e.g., push-ups, high-tech, state-of-the-art)
                if i + 2 < n and doc[i+1].text == "-" and doc[i].is_alpha and doc[i+2].is_alpha:
                    parts_lemmas = [doc[i].lemma_.lower()]
                    j = i
                    while j + 2 < n and doc[j+1].text == "-" and doc[j+2].is_alpha:
                        parts_lemmas.append(doc[j+2].lemma_.lower())
                        j += 2
                    compound_lemma = "-".join(parts_lemmas)
                    words_to_count.append(compound_lemma)
                    i = j + 1
                    continue

                if token.is_alpha and not token.is_stop:
                    words_to_count.append(token.lemma_.lower())
                i += 1
        else:
            # Fallback simple split
            raw_words = text.split()
            for w in raw_words:
                clean = "".join(c for c in w if c.isalnum()).lower()
                if clean and len(clean) > 1:
                    words_to_count.append(clean)

        updated_items: List[WordStatItem] = []
        for word in words_to_count:
            stat_item = self.repo.update_word_occurrence(
                word=word,
                source_engine=source_engine,
                is_translated=is_translated
            )
            updated_items.append(stat_item)

        return WordStatsResponse(
            processed_words_count=len(words_to_count),
            word_stats=updated_items,
            metadata={
                "source_engine": source_engine,
                "is_translated": is_translated
            }
        )
