from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field


class SoundConfig(BaseModel):
    preset: Optional[str] = "gaming"
    correct: Optional[Dict[str, Any]] = None
    wrong: Optional[Dict[str, Any]] = None
    finisher: Optional[Dict[str, Any]] = None


class LeitnerConfig(BaseModel):
    boxes: List[int] = Field(default=[1, 2, 5, 8, 14], description="Khoảng cách ngày ôn tập giữa các box")
    priority: str = Field(
        default="total_desc",
        description="Ưu tiên ôn tập: translate_desc, translate_asc, encounter_desc, encounter_asc, total_desc, total_asc"
    )
    min_threshold: float = Field(default=-100.0, description="Ngưỡng thông thạo tối thiểu")
    max_threshold: float = Field(default=100.0, description="Ngưỡng thông thạo tối đa")


class FlashcardSettings(BaseModel):
    total_cards: int = 20
    difficulty_distribution: Dict[str, int] = Field(default={"easy": 5, "medium": 10, "hard": 5})
    allowed_task_types: List[str] = Field(
        default=["choice", "fill", "complete"],
        description="choice, fill, complete, listen_choice, listen_write, multiple_choice, def_choice, def_write, context_def_vi, context_def_en"
    )
    time_limit_mode: str = Field(default="per_card", description="per_card hoặc total")
    total_time_limit: Optional[int] = Field(default=None, description="Tổng thời gian (giây) hoàn thành cả bộ")
    per_card_timer: int = Field(default=15, description="Thời gian (giây) mỗi câu hỏi")
    daily_limit: int = Field(default=5, description="Số lần làm tối đa mỗi ngày/người (0: không giới hạn)")
    reset_time: str = Field(default="07:00", description="Thời điểm reset lượt làm trong ngày (HH:MM)")
    event_start_at: Optional[str] = Field(default=None, description="Thời gian mở bộ thẻ (ISO format)")
    event_end_at: Optional[str] = Field(default=None, description="Thời gian đóng bộ thẻ (ISO format)")
    sound_config: Optional[Dict[str, Any]] = None
    leitner_config: Optional[LeitnerConfig] = None


class ChoiceOption(BaseModel):
    text: str
    is_correct: bool = False
    explanation: Optional[str] = None


class ChoiceTask(BaseModel):
    enabled: bool = True
    multiple: bool = False
    options: List[ChoiceOption] = []


class FillTask(BaseModel):
    enabled: bool = False
    answers: List[str] = []


class CompletePattern(BaseModel):
    display_text: str
    blanks: List[str] = []


class CompleteTask(BaseModel):
    enabled: bool = False
    patterns: List[CompletePattern] = []


class FlashcardTasks(BaseModel):
    choice: Optional[ChoiceTask] = None
    fill: Optional[FillTask] = None
    complete: Optional[CompleteTask] = None
    listen_choice: Optional[ChoiceTask] = None
    listen_write: Optional[FillTask] = None
    def_choice: Optional[ChoiceTask] = None
    def_write: Optional[FillTask] = None
    context_def_vi: Optional[FillTask] = None
    context_def_en: Optional[FillTask] = None


class FlashcardCard(BaseModel):
    id: str
    word: str
    meaning: str
    ipa: Optional[str] = None
    audio_url: Optional[str] = None
    question: Optional[str] = ""
    hint: Optional[str] = ""
    context: Optional[str] = None
    definition_en: Optional[str] = None
    definition_vi: Optional[str] = None
    feedback_correct: Optional[str] = "Great job!"
    feedback_incorrect: Optional[str] = "Try again!"
    difficulty: str = "medium"
    timer: int = 15
    points: int = 10
    tasks: Optional[Dict[str, Any]] = None
    sense_id: Optional[str] = None
    user_proficiency: Optional[float] = None
    user_attempts: Optional[int] = None
    leitner_box: Optional[int] = 1


class FlashcardSetCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    is_public: bool = False
    set_type: str = Field(default="manual", description="manual, ai_gen, user_dynamic, system_dynamic")
    invite_code: Optional[str] = None
    allowed_user_ids: List[str] = []
    settings: Optional[FlashcardSettings] = None
    cards: List[FlashcardCard] = []


class FlashcardSetUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    set_type: Optional[str] = None
    invite_code: Optional[str] = None
    allowed_user_ids: Optional[List[str]] = None
    settings: Optional[FlashcardSettings] = None
    cards: Optional[List[FlashcardCard]] = None


class FlashcardSetResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    is_public: bool = False
    set_type: str = "manual"
    creator_id: Optional[str] = None
    invite_code: Optional[str] = None
    allowed_user_ids: List[str] = []
    settings: FlashcardSettings
    cards: List[FlashcardCard] = []
    created_at: str
    updated_at: str


class FlashcardSessionStartResponse(BaseModel):
    session_id: str
    id: str
    title: str
    description: Optional[str] = ""
    is_public: bool = False
    is_dynamic: bool = False
    all_mastered: bool = False
    settings: FlashcardSettings
    cards: List[FlashcardCard]
    usage: Optional[Dict[str, Any]] = None


class SubmitAnswerRequest(BaseModel):
    session_id: Optional[str] = None
    set_id: Optional[str] = None
    card_id: str
    word: str
    sense_id: Optional[str] = None
    user_answer: Any
    is_correct: bool
    task_type: str
    time_spent: float = 0.0  # seconds
    time_limit: float = 15.0  # seconds


class SubmitAnswerResponse(BaseModel):
    is_correct: bool
    points_earned: int
    streak: int
    new_proficiency: float
    feedback: str
    leitner_box: int
    bonus_toast: Optional[Dict[str, Any]] = None


class SessionCompletedRequest(BaseModel):
    session_id: str
    set_id: Optional[str] = None
    total_score: int
    streak: int
    results: List[Dict[str, Any]] = []


class SessionCompletedResponse(BaseModel):
    status: str = "success"
    message: str = "Session completed successfully"
    final_score: int
    max_streak: int
    cards_reviewed: int
    correct_count: int
    accuracy_rate: float
    streak_days: int = 1


class AIGenerateRequest(BaseModel):
    prompt: str
    count: int = 10
    difficulty: List[str] = ["medium"]
    task_types: List[str] = ["choice", "fill", "complete"]
    include_hint: bool = True


class JoinPrivateSetRequest(BaseModel):
    invite_code: str
