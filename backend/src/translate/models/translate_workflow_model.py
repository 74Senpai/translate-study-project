from enum import Enum
from typing import Optional, Union, Any
from pydantic import BaseModel
from src.translate.models.analysis_model import AnalysisResponse
from src.translate.models.translate_model import TranslateResponse
from src.translate.models.typo_model import TypoSentence
from src.translate.models.stats_model import WordStatsResponse
from src.translate.models.vocab_model import VocabAnalysisResponse


class TypeResponse(str, Enum):
    VALIDATION = "VALIDATION"
    TYPO = "TYPO"
    TRANSLATE = "TRANSLATE"
    ANALYSIS = "ANALYSIS"
    STATS = "STATS"
    VOCAB = "VOCAB"


class TranslateWorkflowResponse(BaseModel):
    type_response: TypeResponse
    data: Union[AnalysisResponse, TranslateResponse, TypoSentence, WordStatsResponse, VocabAnalysisResponse, dict]
