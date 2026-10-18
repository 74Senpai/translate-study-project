import asyncio
from unittest.mock import patch

from src.config import Settings
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
            "cards": [{"id": "card-1", "word": "hello", "meaning": "xin chào"}],
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


def test_settings_has_empty_admin_email_list_by_default():
    assert Settings(_env_file=None).admin_emails == []


def test_settings_loads_admin_emails_from_environment():
    with patch.dict("os.environ", {"ADMIN_EMAILS": '["admin@example.com"]'}):
        assert Settings(_env_file=None).admin_emails == ["admin@example.com"]


def test_start_session_records_words_without_raising_name_error():
    async def run_start_session():
        repository = FakeFlashcardRepository()
        service = FlashcardService(repo=repository)

        response = await service.start_session("set-1", user_id="user-1")

        assert response.id == "set-1"
        assert response.cards[0].word == "hello"
        await asyncio.sleep(0)
        assert repository.recorded_words == ["hello"]

    asyncio.run(run_start_session())
