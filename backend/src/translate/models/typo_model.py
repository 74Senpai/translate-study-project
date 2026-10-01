from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel
from src.translate.models.analysis_model import AnalysisResponse
from src.translate.models.translate_model import TranslateResponse


class Word(BaseModel):
    index: int
    sentence_i: Optional[int] = None
    origin_text: str
    correction: str
    candidates: Optional[list[str]] = None


class TypoSentence(BaseModel):
    origin_text: str
    correction: str
    words: Optional[list[Word]] = None
    metadata: Optional[dict] = None


class SpellCheckResult(BaseModel):
    sentences: Optional[TypoSentence] = None
