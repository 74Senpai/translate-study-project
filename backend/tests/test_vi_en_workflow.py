import pytest
import asyncio
from src.translate.manager.input_manager import InputManager
from src.translate.services.typo_service import TypoService
from src.translate.services.stats_service import StatsService
from src.translate.services.analys_service import AnalysService
from src.translate.services.vocab_service import VocabService
from src.translate.services.translate_service import TranslateService
from src.translate.workflows.translate_wokrflow import TranslateWorkflow
from src.translate.models.translate_model import TranslateRequest, TranslateMode
from src.translate.models.translate_workflow_model import TypeResponse


@pytest.mark.asyncio
async def test_vi_input_validation():
    input_mgr = InputManager()
    raw_vi_text = "\u200bXin chào\u200d thế giới! \ufeffĐây là bài kiểm tra.\x07"
    normalized = input_mgr.validate_and_normalize(raw_vi_text)
    assert normalized == "Xin chào thế giới! Đây là bài kiểm tra."


@pytest.mark.asyncio
async def test_full_vi_en_workflow():
    translator = TranslateService()
    analysis = AnalysService()
    typo = TypoService()
    stats = StatsService()
    vocab = VocabService()

    workflow = TranslateWorkflow(
        translator=translator,
        analysis=analysis,
        typo=typo,
        stats=stats,
        vocab=vocab,
    )

    req = TranslateRequest(
        source=TranslateMode(source_lang="vi", target_lang="en"),
        text="Tôi đang xây dựng một ứng dụng trí tuệ nhân tạo để phát triển ngôn ngữ."
    )

    responses = []
    async for item in workflow.translate(req):
        responses.append(item)

    types_received = {r.type_response for r in responses}
    assert TypeResponse.TRANSLATE in types_received
    assert TypeResponse.ANALYSIS in types_received
    assert TypeResponse.STATS in types_received
    assert TypeResponse.VOCAB in types_received

    # Verify STATS payload has translated_count and is_translated metadata flag
    stats_resps = [r.data for r in responses if r.type_response == TypeResponse.STATS]
    assert len(stats_resps) > 0
    stats_data = stats_resps[0]
    assert stats_data.metadata.get("is_translated") is True
    assert any(w.translated_count >= 1 for w in stats_data.word_stats)

    # Verify VOCAB items extracted from translated English are saved and marked as translated
    vocab_resps = [r.data for r in responses if r.type_response == TypeResponse.VOCAB]
    assert len(vocab_resps) > 0
    all_vocab_items = [item for v in vocab_resps for item in v.vocabularies]
    assert len(all_vocab_items) > 0
    assert all_vocab_items[0].is_translated is True
    assert all_vocab_items[0].source_lang == "vi"


@pytest.mark.asyncio
async def test_stats_encountered_vs_translated_distinction():
    stats_service = StatsService()

    # Direct English encounter (đã gặp trực tiếp)
    res_direct = await stats_service.update_statistics("Artificial intelligence", source_engine="google", is_translated=False)
    stat_item_direct = next(w for w in res_direct.word_stats if w.word == "intelligence")
    assert stat_item_direct.encountered_count == 1
    assert stat_item_direct.translated_count == 0
    assert stat_item_direct.total_count == 1

    # Translated English from VI -> EN (đã dịch)
    res_trans = await stats_service.update_statistics("Artificial intelligence", source_engine="google", is_translated=True)
    stat_item_trans = next(w for w in res_trans.word_stats if w.word == "intelligence")
    assert stat_item_trans.encountered_count == 1
    assert stat_item_trans.translated_count == 1
    assert stat_item_trans.total_count == 2
    assert "google_translated" in stat_item_trans.source_counts


@pytest.mark.asyncio
async def test_wordnet_phrase_extraction():
    vocab_service = VocabService()
    # Test sentence containing multi-word compounds: "artificial intelligence" and "machine learning"
    sentence = "We are developing an artificial intelligence model using machine learning."
    res = await vocab_service.extract_and_save_vocab(sentence)

    extracted_words = [item.word for item in res.vocabularies]
    phrase_items = [item for item in res.vocabularies if item.is_phrase]

    # Verify phrases were detected as single compounds rather than isolated tokens
    assert "artificial intelligence" in extracted_words or "artificial_intelligence" in extracted_words
    assert len(phrase_items) >= 1
    
    ai_item = next(item for item in res.vocabularies if "artificial" in item.word)
    assert ai_item.is_phrase is True
    assert ai_item.concept_definition is not None
    assert len(ai_item.contextual_meaning) > 0

