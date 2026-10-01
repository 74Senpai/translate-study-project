from typing import Optional, List
from pydantic import BaseModel


class VocabItem(BaseModel):
    word: str
    contextual_meaning: str
    context_sentence: str
    simple_example: str
    concept_definition: Optional[str] = None
    synonyms: List[str] = []
    antonyms: List[str] = []
    context_id: str
    similarity_score: float = 0.0


class VocabAnalysisResponse(BaseModel):
    sentence: str
    vocabularies: List[VocabItem] = []
    metadata: Optional[dict] = None
