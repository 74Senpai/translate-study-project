from enum import Enum
from typing import Optional, List, Dict
from pydantic import BaseModel


class SentenceFormType(str, Enum):
    DECLARATIVE = "Declarative"         # Câu trần thuật
    INTERROGATIVE = "Interrogative"     # Câu hỏi
    IMPERATIVE = "Imperative"           # Câu mệnh lệnh
    EXCLAMATORY = "Exclamatory"         # Câu cảm thán


class SentenceComplexity(str, Enum):
    SIMPLE = "Simple"                   # Câu đơn
    COMPOUND = "Compound"               # Câu ghép
    COMPLEX = "Complex"                 # Câu phức
    COMPOUND_COMPLEX = "Compound-Complex"


class SentenceVoice(str, Enum):
    ACTIVE = "Active"                   # Câu chủ động
    PASSIVE = "Passive"                 # Câu bị động


class SentenceTense(str, Enum):
    PRESENT_SIMPLE = "Present Simple"
    PRESENT_CONTINUOUS = "Present Continuous"
    PRESENT_PERFECT = "Present Perfect"
    PRESENT_PERFECT_CONTINUOUS = "Present Perfect Continuous"
    PAST_SIMPLE = "Past Simple"
    PAST_CONTINUOUS = "Past Continuous"
    PAST_PERFECT = "Past Perfect"
    PAST_PERFECT_CONTINUOUS = "Past Perfect Continuous"
    FUTURE_SIMPLE = "Future Simple"
    FUTURE_CONTINUOUS = "Future Continuous"
    FUTURE_PERFECT = "Future Perfect"
    FUTURE_PERFECT_CONTINUOUS = "Future Perfect Continuous"
    MODAL_CONDITIONAL = "Modal/Conditional"
    UNKNOWN = "Unknown"


class SentenceStructure(BaseModel):
    subject: Optional[str] = None
    verb: Optional[str] = None
    object: Optional[str] = None
    clauses: List[str] = []


class AnalysisToken(BaseModel):
    index: int
    text: str
    lemma: Optional[str] = None
    dictionary_form: Optional[str] = None
    pos: Optional[str] = None
    tag: Optional[str] = None
    morph: Dict[str, str] = {}
    dependency: Optional[str] = None
    head: Optional[str] = None
    entity: Optional[str] = None
    is_stop: bool = False
    is_alpha: bool = False
    is_punct: bool = False
    like_num: bool = False
    example: Optional[str] = None


class SentenceAnalysisInfo(BaseModel):
    form_type: SentenceFormType = SentenceFormType.DECLARATIVE
    complexity: SentenceComplexity = SentenceComplexity.SIMPLE
    voice: SentenceVoice = SentenceVoice.ACTIVE
    tense: SentenceTense = SentenceTense.PRESENT_SIMPLE
    rule_explanation: Optional[str] = None


class AnalysisResponse(BaseModel):
    original_text: str
    tokens: Optional[List[AnalysisToken]] = None
    structure: Optional[SentenceStructure] = None
    sentence_info: Optional[SentenceAnalysisInfo] = None
    metadata: Optional[dict] = None
