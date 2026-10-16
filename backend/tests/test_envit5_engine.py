import pytest
from unittest.mock import MagicMock
from src.translate.engines.envit5_translate import EnViT5Engine


@pytest.fixture
def envit5_engine():
    engine = EnViT5Engine()
    engine.available = True
    return engine


def test_language_normalization(envit5_engine):
    assert envit5_engine._normalize_lang("vi") == "vi"
    assert envit5_engine._normalize_lang("vi-VN") == "vi"
    assert envit5_engine._normalize_lang("en") == "en"
    assert envit5_engine._normalize_lang("en-US") == "en"
    assert envit5_engine._normalize_lang("fr") == "fr"


def test_format_input(envit5_engine):
    # Without prefix
    assert envit5_engine._format_input("Vietnam", "en") == "en: Vietnam"
    assert envit5_engine._format_input("Việt Nam", "vi") == "vi: Việt Nam"

    # Already has prefix
    assert envit5_engine._format_input("en: Vietnam", "en") == "en: Vietnam"
    assert envit5_engine._format_input("vi: Việt Nam", "vi") == "vi: Việt Nam"
    assert envit5_engine._format_input("EN: Vietnam", "en") == "en: Vietnam"
    assert envit5_engine._format_input("vi:Việt Nam", "vi") == "vi: Việt Nam"


def test_clean_translated_text(envit5_engine):
    assert envit5_engine._clean_translated_text("en: Hello world", "en") == "Hello world"
    assert envit5_engine._clean_translated_text("vi: Xin chào", "vi") == "Xin chào"
    assert envit5_engine._clean_translated_text("Hello world", "en") == "Hello world"


@pytest.mark.asyncio
async def test_empty_and_same_lang(envit5_engine):
    assert await envit5_engine.translate("vi", "en", "") == ""
    assert await envit5_engine.translate("vi", "en", "   ") == ""
    assert await envit5_engine.translate("en", "en", "hello") == "hello"
    assert await envit5_engine.translate("en", "en", ["hello", "world"]) == ["hello", "world"]


@pytest.mark.asyncio
async def test_unsupported_language_raises(envit5_engine):
    with pytest.raises(ValueError, match="only supports English and Vietnamese"):
        await envit5_engine.translate("fr", "en", "bonjour")


@pytest.mark.asyncio
async def test_mocked_inference_single_text(envit5_engine):
    envit5_engine._infer_sync = MagicMock(return_value=["Hello world"])
    envit5_engine.model = MagicMock()
    envit5_engine.tokenizer = MagicMock()

    res = await envit5_engine.translate("vi", "en", "Xin chào thế giới")
    assert res == "Hello world"
    assert envit5_engine.current_session_rate_count == 1
    assert envit5_engine.current_session_token_use_count == len("Xin chào thế giới")


@pytest.mark.asyncio
async def test_mocked_inference_array_input(envit5_engine):
    envit5_engine._infer_sync = MagicMock(return_value=["Việt Nam", "Trung Quốc"])
    envit5_engine.model = MagicMock()
    envit5_engine.tokenizer = MagicMock()

    # Passing array directly to translate()
    res = await envit5_engine.translate("en", "vi", ["Vietnam", "China"])
    assert res == ["Việt Nam", "Trung Quốc"]
    assert envit5_engine.current_session_rate_count == 2


@pytest.mark.asyncio
async def test_mocked_batch_inference(envit5_engine):
    envit5_engine._infer_sync = MagicMock(return_value=["Hello", "World"])
    envit5_engine.model = MagicMock()
    envit5_engine.tokenizer = MagicMock()

    res = await envit5_engine.translate_batch("vi", "en", ["Xin chào", "Thế giới"])
    assert res == ["Hello", "World"]
    assert envit5_engine.current_session_rate_count == 2


@pytest.mark.asyncio
async def test_real_envit5_translation():
    engine = EnViT5Engine()
    engine.start_engine()
    assert engine.available is True

    # Test vi -> en single text
    vi_text = "Xin chào thế giới"
    en_res = await engine.translate("vi", "en", vi_text)
    assert len(en_res) > 0
    assert "hello" in en_res.lower()

    # Test en -> vi array of countries
    countries = ["en: Vietnam", "en: Japan"]
    vi_batch = await engine.translate("en", "vi", countries)
    assert len(vi_batch) == 2
    assert "việt nam" in vi_batch[0].lower()
