from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class LeitnerConfig(BaseModel):
    boxes: List[int] = Field(default=[1, 2, 5, 8, 14], description="Khoảng cách ngày ôn tập giữa các box")
    priority: str = Field(
        default="total_desc",
        description="Ưu tiên ôn tập: translate_desc, translate_asc, encounter_desc, encounter_asc, total_desc, total_asc"
    )
    min_threshold: float = Field(default=-100.0, description="Ngưỡng thông thạo tối thiểu")
    max_threshold: float = Field(default=100.0, description="Ngưỡng thông thạo tối đa")


class FlashcardSettings(BaseModel):
    model_config = {"extra": "ignore"}

    total_cards: int = 20
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
    leitner_config: Optional[LeitnerConfig] = None

    @field_validator("daily_limit", mode="before")
    @classmethod
    def parse_daily_limit(cls, v):
        if v is None or v == "":
            return 0
        try:
            return int(v)
        except (ValueError, TypeError):
            return 0

    @field_validator("total_cards", mode="before")
    @classmethod
    def parse_total_cards(cls, v):
        if v is None or v == "":
            return 20
        try:
            return max(1, int(v))
        except (ValueError, TypeError):
            return 20

    @field_validator("per_card_timer", mode="before")
    @classmethod
    def parse_per_card_timer(cls, v):
        if v is None or v == "":
            return 15
        try:
            return max(1, int(v))
        except (ValueError, TypeError):
            return 15

    @field_validator("total_time_limit", mode="before")
    @classmethod
    def parse_total_time_limit(cls, v):
        if v is None or v == "":
            return None
        try:
            val = int(v)
            return val if val > 0 else None
        except (ValueError, TypeError):
            return None

    @field_validator("event_start_at", "event_end_at", mode="before")
    @classmethod
    def parse_event_dates(cls, v):
        if not v or str(v).strip() == "":
            return None
        return str(v).strip()



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
    model_config = {"extra": "ignore"}

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
    # Backend-selected task type và câu hỏi — frontend chỉ hiển thị theo đây
    selected_task_type: Optional[str] = None  # "choice", "fill", "complete", "listen_choice", "listen_write", "def_choice", ...
    question_text: Optional[str] = None       # Câu hỏi đã build sẵn, phù hợp với selected_task_type

    @field_validator("difficulty", mode="before")
    @classmethod
    def parse_difficulty(cls, v):
        if not v:
            return "medium"
        d = str(v).strip().lower()
        return d if d in ("easy", "medium", "hard") else "medium"

    @field_validator("timer", mode="before")
    @classmethod
    def parse_timer(cls, v):
        if v is None or v == "":
            return 15
        try:
            val = int(v)
            return max(1, val)
        except (ValueError, TypeError):
            return 15

    @field_validator("points", mode="before")
    @classmethod
    def parse_points(cls, v):
        if v is None or v == "":
            return 10
        try:
            val = int(v)
            return max(0, val)
        except (ValueError, TypeError):
            return 10

    @field_validator("sense_id", mode="before")
    @classmethod
    def parse_sense_id(cls, v):
        if not v or str(v).strip() == "":
            return None
        return str(v).strip()


class FlashcardSetCreate(BaseModel):
    model_config = {"extra": "ignore"}

    id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    is_public: bool = False
    is_dynamic: Optional[bool] = None
    set_type: str = Field(default="manual", description="manual, ai_gen, user_dynamic, system_dynamic")
    creator_id: Optional[str] = None
    invite_code: Optional[str] = None
    allowed_user_ids: List[str] = []
    settings: Optional[FlashcardSettings] = None
    cards: List[FlashcardCard] = []


class FlashcardSetUpdate(BaseModel):
    model_config = {"extra": "ignore"}

    title: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    is_dynamic: Optional[bool] = None
    set_type: Optional[str] = None
    creator_id: Optional[str] = None
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
    model_config = {"extra": "ignore"}

    session_id: Optional[str] = None
    set_id: Optional[str] = None
    card_id: Optional[str] = ""
    word: str = ""
    sense_id: Optional[str] = None
    user_answer: Any = None
    is_correct: bool = False
    task_type: str = "choice"
    time_spent: float = 0.0  # giây đã dùng trả lời
    time_limit: float = 15.0  # giới hạn thời gian mỗi câu
    # Thông tin gặp / dịch từ được truyền từ frontend để cập nhật match_count đúng theo spec
    encounter_count: Optional[int] = None  # số lần gặp (match_count) hiện tại của từ
    translate_count: Optional[int] = None  # số lần dịch của từ (translated_count)

    @field_validator("card_id", mode="before")
    @classmethod
    def parse_card_id(cls, v):
        if v is None:
            return ""
        return str(v)

    @field_validator("word", mode="before")
    @classmethod
    def parse_word(cls, v):
        if not v:
            return ""
        return str(v).strip()

    @field_validator("is_correct", mode="before")
    @classmethod
    def parse_is_correct(cls, v):
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return bool(v)
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes")
        return False

    @field_validator("task_type", mode="before")
    @classmethod
    def parse_task_type(cls, v):
        if not v:
            return "choice"
        valid_types = {
            "choice", "fill", "complete", "listen_choice", "listen_write",
            "def_choice", "def_write", "context_def_vi", "context_def_en",
            "listen_choice_vi", "listen_write_vi", "context_def_en_write", "multiple_choice"
        }
        t = str(v).strip().lower()
        return t if t in valid_types else "choice"

    @field_validator("time_spent", "time_limit", mode="before")
    @classmethod
    def parse_float_safe(cls, v):
        if v is None or v == "":
            return 0.0
        try:
            return max(0.0, float(v))
        except (ValueError, TypeError):
            return 0.0

    @field_validator("sense_id", mode="before")
    @classmethod
    def parse_sense_id(cls, v):
        if not v or str(v).strip() == "":
            return None
        return str(v).strip()

    @field_validator("session_id", "set_id", mode="before")
    @classmethod
    def parse_optional_str(cls, v):
        if not v or str(v).strip() == "":
            return None
        return str(v).strip()


class SubmitAnswerResponse(BaseModel):
    is_correct: bool
    points_earned: int
    streak: int
    new_proficiency: float
    feedback: str
    leitner_box: int
    bonus_toast: Optional[Dict[str, Any]] = None
    # Thông tin cập nhật từ để hiển thị trên UI (theo spec mục 4)
    word_stats: Optional[Dict[str, Any]] = None


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


class RepetitionLoopItem(BaseModel):
    id: Optional[int] = None
    loop_order: int = Field(description="Thứ tự box trong hệ thống Leitner")
    day_repetition: int = Field(description="Khoảng cách ngày ôn tập")
    pre_loop_id: Optional[int] = None
    next_loop_id: Optional[int] = None


class RepetitionScheduleResponse(BaseModel):
    total_boxes: int
    boxes: List[int]
    loops: List[RepetitionLoopItem]


class UpdateRepetitionScheduleRequest(BaseModel):
    boxes: List[int] = Field(
        min_length=1,
        description="Danh sách khoảng cách ngày ôn tập giữa các box, ví dụ: [1, 2, 5, 8, 14]"
    )


class FlashcardInitRequest(BaseModel):
    mode: str = Field(
        default="system_dynamic",
        description="Chế độ khởi tạo: 'system_dynamic', 'user_dynamic', 'default_seed', 'manual'"
    )
    title: Optional[str] = None
    description: Optional[str] = None
    is_public: bool = True
    total_cards: int = 20
    difficulty: str = "medium"
    allowed_task_types: Optional[List[str]] = Field(
        default=None,
        description="Các dạng bài tập cho phép: choice, fill, complete, listen_choice, listen_write, def_choice, def_write, context_def_vi, context_def_en"
    )
    time_limit_mode: str = "per_card"
    per_card_timer: int = 15
    daily_limit: int = 5
    reset_time: str = "07:00"
    event_start_at: Optional[str] = None
    event_end_at: Optional[str] = None
    leitner_config: Optional[LeitnerConfig] = None
    use_db_spaced_repetition: bool = Field(
        default=True,
        description="Sử dụng cấu hình space repetition từ database (repetition_loops)"
    )


class DictionaryCacheItem(BaseModel):
    id: str
    word: str
    meaning_vi: str
    ipa: Optional[str] = None
    part_of_speech: Optional[str] = None
    definition_en: Optional[str] = None
    definition_vi: Optional[str] = None
    example_en: Optional[str] = None
    audio_url: Optional[str] = None
