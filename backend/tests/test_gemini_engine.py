import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from src.translate.engines.gemini_translate import (
    GeminiEngine,
    BatchTranslationResponse,
    BatchTranslationItem,
)


@pytest.fixture
def gemini_engine():
    engine = GeminiEngine()
    engine.api_key = "dummy_api_key"
    engine.available = True
    engine.engine = MagicMock()
    return engine


def test_should_translate_rules(gemini_engine):
    # Empty or whitespace
    assert not gemini_engine._should_translate("", "en", "vi")
    assert not gemini_engine._should_translate("   ", "en", "vi")

    # Same source and target language
    assert not gemini_engine._should_translate("Hello world", "en", "en")
    assert not gemini_engine._should_translate("Hello world", "vi", "VI")

    # Non-alphabetic text (numbers, punctuation, symbols)
    assert not gemini_engine._should_translate("123456 !!! ???", "en", "vi")
    assert not gemini_engine._should_translate("--- /// ***", "en", "vi")

    # Valid text
    assert gemini_engine._should_translate("Hello world", "en", "vi")
    assert gemini_engine._should_translate("Xin chào thế giới", "vi", "en")


@pytest.mark.asyncio
async def test_gemini_single_translation_api_call(gemini_engine):
    mock_response = MagicMock()
    mock_response.text = "Xin chào thế giới"

    gemini_engine.engine.aio.models.generate_content = AsyncMock(return_value=mock_response)

    res = await gemini_engine.translate(source_lang="en", target_lang="vi", text="Hello world")
    assert res == "Xin chào thế giới"

    # Verify generate_content was called on client.aio.models
    gemini_engine.engine.aio.models.generate_content.assert_called_once()


@pytest.mark.asyncio
async def test_gemini_batch_translation(gemini_engine):
    batch_res = BatchTranslationResponse(
        translations=[
            BatchTranslationItem(id=0, original="Hello", translated="Xin chào"),
            BatchTranslationItem(id=1, original="Good morning", translated="Chào buổi sáng"),
        ]
    )

    mock_response = MagicMock()
    mock_response.text = batch_res.model_dump_json()

    gemini_engine.engine.aio.models.generate_content = AsyncMock(return_value=mock_response)

    inputs = ["Hello", "Good morning", "12345"]  # Note: "12345" will be filtered out by _should_translate
    results = await gemini_engine.translate_batch(source_lang="en", target_lang="vi", texts=inputs)

    assert len(results) == 3
    assert results[0] == "Xin chào"
    assert results[1] == "Chào buổi sáng"
    assert results[2] == "12345"  # Kept original without calling API
