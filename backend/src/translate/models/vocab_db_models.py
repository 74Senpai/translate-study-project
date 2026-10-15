from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class WordModel(BaseModel):
    id: Optional[str] = None
    word_text: str
    is_validated: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    validated_at: Optional[datetime] = None


class SenseModel(BaseModel):
    id: Optional[str] = None
    word_id: Optional[str] = None
    meaning_vi: str
    definition_en: Optional[str] = None
    definition_vi: Optional[str] = None
    example_en: Optional[str] = None
    example_vi: Optional[str] = None
    synonyms: List[str] = []
    antonyms: List[str] = []
    match_count: int = 0
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    is_trusted: bool = False
    rating_count: int = 0
    rating_score: float = Field(default=0.0, ge=0.0)
    part_of_speech: Optional[str] = None
    ipa: Optional[str] = None
    audio_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class WordFormModel(BaseModel):
    id: Optional[str] = None
    word_id: str
    form_text: str
    form_type: Optional[str] = None
    created_at: Optional[datetime] = None


class RepetitionLoopModel(BaseModel):
    id: Optional[int] = None
    loop_order: int
    day_repetition: int
    pre_loop_id: Optional[int] = None
    next_loop_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSenseProgressModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    sense_id: str
    mastery_score: float = 0.0
    translated_count: int = 0
    last_translated: Optional[datetime] = None
    last_review: Optional[datetime] = None
    current_repetition_id: Optional[int] = None
    next_review: Optional[datetime] = None
    wrong_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserWordModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    word_id: str
    translated_count: int = 0
    last_translated: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSenseNoteModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    sense_id: str
    meaning_note: Optional[str] = None
    context: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSenseStatsModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    sense_id: str
    hard_score: float = 0.0
    choose_fail_count: int = 0
    choose_true_count: int = 0
    fill_fail_count: int = 0
    fill_true_count: int = 0
    write_fail_count: int = 0
    write_true_count: int = 0
    listen_fail_count: int = 0
    listen_true_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserStatsModel(BaseModel):
    user_id: str
    total_word_match: int = 0
    total_sense_match: int = 0
    last_translated: Optional[datetime] = None
    last_review: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSenseAttemptModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    sense_id: str
    activity_type: str = "translate"  # 'choose', 'fill', 'write', 'listen', 'translate'
    is_correct: bool = True
    user_answer: Optional[str] = None
    context: Optional[str] = None
    created_at: Optional[datetime] = None


# Backward compatibility aliases
WordMeaningModel = UserSenseNoteModel
FlashcardStatisticsModel = UserSenseStatsModel
UserWordStatsModel = UserWordModel
UserOverallStatsModel = UserStatsModel
