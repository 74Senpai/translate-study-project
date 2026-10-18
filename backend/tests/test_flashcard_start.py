import asyncio
from types import SimpleNamespace
from unittest.mock import patch

from src.config import Settings
from src.flashcard.models.flashcard_models import FlashcardSettings, SubmitAnswerRequest
from src.flashcard.engines.dynamic_generator import DynamicGenerator
from src.flashcard.services.flashcard_service import FlashcardService


class FakeFlashcardRepository:
    def __init__(self):
        self.recorded_words = []

    async def get_set_by_id(self, set_id):
        return {
            "title": "Starter set",
            "description": "",
            "is_public": True,
            "set_type": "manual",
            "settings": {"daily_limit": 0},
            "cards": [
                {
                    "id": "card-1",
                    "word": "hello",
                    "meaning": "xin chào",
                    "tasks": {
                        "choice": {
                            "enabled": True,
                            "options": [
                                {"text": "", "is_correct": True},
                                {"text": "tổ chức", "is_correct": False},
                                {"text": " TỔ CHỨC ", "is_correct": False},
                            ],
                        },
                        "fill": {"enabled": True, "answers": [""]},
                        "complete": {
                            "enabled": True,
                            "patterns": [{"display_text": "", "blanks": [""]}],
                        },
                    },
                },
                {
                    "id": "card-2",
                    "word": "goodbye",
                    "meaning": "tạm biệt",
                    "tasks": {
                        "choice": {
                            "enabled": True,
                            "options": [{"text": "", "is_correct": True}],
                        }
                    },
                },
            ],
        }

    async def get_user_usage(self, **kwargs):
        return {"can_play": True}

    async def increment_usage(self, **kwargs):
        return None

    async def get_user_word_proficiency(self, user_id, word):
        return {"proficiency": 0, "attempts": 0, "leitner_box": 1}

    async def create_session(self, session_data):
        return None

    async def record_english_words_exposure(self, user_id, text):
        self.recorded_words.append(text)


class FakeSupabaseQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.single = False

    def select(self, *args, **kwargs):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, *args, **kwargs):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        rows = [
            row for row in self.rows
            if all(row.get(field) == value for field, value in self.filters)
        ]
        data = rows[0] if self.single and rows else None if self.single else rows
        return SimpleNamespace(data=data)


class FakeSupabase:
    def table(self, name):
        rows_by_table = {
            "user_words": [
                {
                    "word_id": "word-1",
                    "translated_count": 0,
                    "words": {"id": "word-1", "word_text": "orphan"},
                }
            ],
            "user_word_statistics": [],
            "senses": [
                {
                    "id": "sense-without-meaning",
                    "meaning_vi": None,
                    "words": {"word_text": "orphan"},
                }
            ],
        }
        return FakeSupabaseQuery(rows_by_table.get(name, []))


class FakeSystemSenseSupabase:
    def __init__(self):
        self.senses = [
            {
                "id": "sense-member",
                "meaning_vi": "thành viên",
                "example_en": "She is a member of the club.",
                "words": {"word_text": "member"},
            },
            {
                "id": "sense-organization",
                "meaning_vi": "tổ chức",
                "example_en": "The organization helps local families.",
                "words": {"word_text": "organization"},
            },
            {
                "id": "sense-participant",
                "meaning_vi": "người tham gia",
                "example_en": "Each participant received a certificate.",
                "words": {"word_text": "participant"},
            },
            {
                "id": "sense-duplicate-meaning",
                "meaning_vi": "tổ chức",
                "example_en": "The group is a local organization.",
                "words": {"word_text": "group"},
            },
        ]

    def table(self, name):
        return FakeSupabaseQuery(self.senses if name == "senses" else [])


class FakeUserDynamicSupabase:
    def __init__(self):
        self.words = [
            {
                "user_id": "user-1",
                "word_id": "word-1",
                "translated_count": 0,
                "words": {"word_text": "member"},
            },
            {
                "user_id": "user-1",
                "word_id": "word-2",
                "translated_count": 0,
                "words": {"word_text": "organization"},
            },
            {
                "user_id": "user-1",
                "word_id": "word-3",
                "translated_count": 0,
                "words": {"word_text": "participant"},
            },
            {
                "user_id": "user-1",
                "word_id": "word-4",
                "translated_count": 0,
                "words": {"word_text": "group"},
            },
        ]
        self.senses = [
            {
                "id": "sense-member",
                "word_id": "word-1",
                "meaning_vi": "thành viên",
                "example_en": "She is a member of the club.",
            },
            {
                "id": "sense-organization",
                "word_id": "word-2",
                "meaning_vi": "tổ chức",
                "example_en": "The organization helps local families.",
            },
            {
                "id": "sense-participant",
                "word_id": "word-3",
                "meaning_vi": "người tham gia",
                "example_en": "Each participant received a certificate.",
            },
            {
                "id": "sense-group",
                "word_id": "word-4",
                "meaning_vi": "tổ chức",
                "example_en": "The group is a local organization.",
            },
        ]

    def table(self, name):
        rows_by_table = {
            "user_words": self.words,
            "user_word_statistics": [],
            "senses": self.senses,
            "user_sense_progress": [],
        }
        return FakeSupabaseQuery(rows_by_table.get(name, []))


def test_settings_has_empty_admin_email_list_by_default():
    assert Settings(_env_file=None).admin_emails == []


def test_settings_loads_admin_emails_from_environment():
    with patch.dict("os.environ", {"ADMIN_EMAILS": '["admin@example.com"]'}):
        assert Settings(_env_file=None).admin_emails == ["admin@example.com"]


def test_submit_answer_request_accepts_required_answer_fields():
    request = SubmitAnswerRequest(
        card_id="card-1",
        word="hello",
        user_answer="xin chào",
        is_correct=True,
        task_type="choice",
    )

    assert request.card_id == "card-1"
    assert request.user_answer == "xin chào"


def test_dynamic_generators_skip_senses_without_meanings():
    async def run_generation():
        user_cards = await DynamicGenerator.generate_user_dynamic_cards(
            user_id="user-1",
            settings=FlashcardSettings(),
            supabase_client=FakeSupabase(),
        )
        system_cards = await DynamicGenerator.generate_system_dynamic_cards(
            settings=FlashcardSettings(),
            supabase_client=FakeSupabase(),
        )

        assert user_cards == []
        assert system_cards == []

    asyncio.run(run_generation())


def test_dynamic_choice_options_are_unique_and_use_real_distractors():
    tasks = DynamicGenerator._build_card_tasks(
        word="member",
        meaning="thành viên",
        distractors=[
            "thành viên",
            " Thành viên ",
            "tổ chức",
            "người tham gia",
            "một lựa chọn sai",
        ],
        allowed_task_types=["choice"],
    )

    options = tasks["choice"]["options"]
    option_texts = [option["text"].strip().casefold() for option in options]

    assert len(option_texts) == len(set(option_texts))
    assert sum(option["is_correct"] for option in options) == 1
    assert "thành viên (ngữ cảnh khác)" not in option_texts
    assert {option["text"] for option in options} == {
        "thành viên",
        "tổ chức",
        "người tham gia",
        "một lựa chọn sai",
    }


def test_system_dynamic_cards_keep_context_and_deduplicate_meaning_options():
    async def run_generation():
        cards = await DynamicGenerator.generate_system_dynamic_cards(
            settings=FlashcardSettings(total_cards=4),
            supabase_client=FakeSystemSenseSupabase(),
        )

        assert len(cards) == 4
        assert all(card.context for card in cards)
        for card in cards:
            options = card.tasks["choice"]["options"]
            normalized_options = [option["text"].strip().casefold() for option in options]
            assert len(normalized_options) == len(set(normalized_options))
            assert sum(option["is_correct"] for option in options) == 1

    asyncio.run(run_generation())


def test_user_dynamic_cards_keep_context_and_deduplicate_meaning_options():
    async def run_generation():
        cards = await DynamicGenerator.generate_user_dynamic_cards(
            user_id="user-1",
            settings=FlashcardSettings(
                total_cards=4,
                allowed_task_types=["choice"],
            ),
            supabase_client=FakeUserDynamicSupabase(),
        )

        assert len(cards) == 4
        assert all(card.context for card in cards)
        assert {card.word: card.context for card in cards}["member"] == (
            "She is a member of the club."
        )
        for card in cards:
            options = card.tasks["choice"]["options"]
            normalized_options = [option["text"].strip().casefold() for option in options]
            assert len(normalized_options) == len(set(normalized_options))
            assert sum(option["is_correct"] for option in options) == 1

    asyncio.run(run_generation())


def test_start_session_records_words_without_raising_name_error():
    async def run_start_session():
        repository = FakeFlashcardRepository()
        service = FlashcardService(repo=repository)

        response = await service.start_session("set-1", user_id="user-1")

        assert response.id == "set-1"
        assert response.cards[0].word == "hello"
        assert response.cards[0].tasks["choice"]["options"] == [
            {"text": "xin chào", "is_correct": True},
            {"text": "tổ chức", "is_correct": False},
            {"text": "tạm biệt", "is_correct": False},
        ]
        assert response.cards[0].tasks["fill"]["answers"] == ["hello"]
        assert response.cards[0].tasks["complete"]["patterns"][0]["blanks"]
        await asyncio.sleep(0)
        assert repository.recorded_words == ["hello", "goodbye"]

    asyncio.run(run_start_session())
