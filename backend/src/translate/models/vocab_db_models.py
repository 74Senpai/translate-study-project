from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class SenseModel(BaseModel):
    id: str
    meaning: str
    match_count: int = 1
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    trusted: bool = False
    rate: float = Field(default=0.0, ge=0.0, le=5.0)
    define: Optional[str] = None
    example: Optional[str] = None
    pos: Optional[str] = None
    ipa: Optional[str] = None
    synonyms: List[str] = []
    antonyms: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserWordModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    text: str
    translate_count: int = 1
    review_count: int = 0
    last_translate: Optional[datetime] = None
    last_review: Optional[datetime] = None
    repetition_loop: int = 0
    next_repetition: Optional[datetime] = None
    status: str = "learning"
    wrong_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WordMeaningModel(BaseModel):
    id: Optional[str] = None
    user_word_id: str
    sense_id: Optional[str] = None
    meaning: str
    context: Optional[str] = None
    define: Optional[str] = None
    example: Optional[str] = None
    pos: Optional[str] = None
    ipa: Optional[str] = None
    synonyms: List[str] = []
    antonyms: List[str] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FlashcardStatisticsModel(BaseModel):
    id: Optional[str] = None
    word_meaning_id: str
    user_id: str
    hard_score: float = 2.50
    repe_loop: int = 0
    next_review: Optional[datetime] = None
    last_review: Optional[datetime] = None
    success_count: int = 0
    review_count: int = 0
    chose_fail_count: int = 0
    chose_true_count: int = 0
    fill_fail_count: int = 0
    fill_true_count: int = 0
    write_fail_count: int = 0
    write_true_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserWordStatsModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    word: str
    encountered_count: int = 1
    translated_count: int = 1
    total_count: int = 2
    last_seen: Optional[datetime] = None
    source_counts: Dict[str, int] = Field(default_factory=lambda: {"web": 1})
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserOverallStatsModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    total_words_saved: int = 0
    total_translations: int = 0
    total_words_encountered: int = 0
    total_reviews: int = 0
    total_mastered_words: int = 0
    streak_days: int = 0
    last_active_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
