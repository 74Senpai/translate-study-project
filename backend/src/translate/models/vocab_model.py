from typing import Optional, List
from pydantic import BaseModel


class VocabItem(BaseModel):
    word: str
    contextual_meaning: Optional[str] = None
    context_sentence: str
    simple_example: Optional[str] = None
    concept_definition: Optional[str] = None
    synonyms: List[str] = []
    antonyms: List[str] = []
    context_id: Optional[str] = None
    similarity_score: float = 0.0
    is_translated: bool = False
    source_lang: Optional[str] = None
    is_phrase: bool = False
    is_trusted: bool = False
    wsd_method_scores: Optional[dict] = None


class VocabAnalysisResponse(BaseModel):
    sentence: str
    vocabularies: List[VocabItem] = []
    metadata: Optional[dict] = None
