import pytest
import asyncio
import json
from src.translate.manager.input_manager import InputManager
from src.translate.services.typo_service import TypoService
from src.translate.services.stats_service import StatsService
from src.translate.services.analys_service import AnalysService
from src.translate.services.embedding_service import EmbeddingService
from src.translate.services.vocab_service import VocabService
from src.translate.services.translate_service import TranslateService
from src.translate.workflows.translate_wokrflow import TranslateWorkflow
from src.translate.models.translate_model import TranslateRequest, TranslateMode
from src.translate.models.translate_workflow_model import TypeResponse
from src.translate.models.analysis_model import SentenceFormType, SentenceTense, SentenceVoice


@pytest.mark.asyncio
async def test_input_manager_validation():
    input_mgr = InputManager()
    # Hidden zero-width spaces and control chars
    raw_text = "\u200bHello\u200d world! \ufeffThis is a test.\x07"
    normalized = input_mgr.validate_and_normalize(raw_text)
    assert normalized == "Hello world! This is a test."

    with pytest.raises(ValueError):
        input_mgr.validate_and_normalize("   \u200b   ")


@pytest.mark.asyncio
async def test_typo_service():
    typo_service = TypoService()
    sentences = InputManager().split_text_to_sentences("He is a wonderfull teacher.")
    results = []
    async for typo in typo_service.sentence_spell_check(sentences, lang="en"):
        results.append(typo)

    assert len(results) > 0
    assert any(w.origin_text == "wonderfull" for w in results[0].words)
    assert "wonderful" in results[0].correction


@pytest.mark.asyncio
async def test_stats_service():
    stats_service = StatsService()
    res = await stats_service.update_statistics("The quick brown fox jumps over the lazy dog.", source_engine="googletrans")
    assert res.processed_words_count > 0
    fox_stat = next((w for w in res.word_stats if w.word == "fox"), None)
    assert fox_stat is not None
    assert fox_stat.total_count >= 1
    assert fox_stat.source_counts.get("googletrans") >= 1


@pytest.mark.asyncio
async def test_analys_service_rulebase():
    analys_service = AnalysService()

    # Test Question (Interrogative)
    sentences_q = InputManager().split_text_to_sentences("Are you going to the store?")
    results_q = []
    async for res in analys_service.analysis(lang="en", sentences=sentences_q):
        results_q.append(res)
    assert results_q[0].sentence_info.form_type == SentenceFormType.INTERROGATIVE

    # Test Passive Voice & Past Tense
    sentences_p = InputManager().split_text_to_sentences("The letter was written by the manager.")
    results_p = []
    async for res in analys_service.analysis(lang="en", sentences=sentences_p):
        results_p.append(res)
    assert results_p[0].sentence_info.voice == SentenceVoice.PASSIVE
    assert results_p[0].sentence_info.tense == SentenceTense.PAST_SIMPLE


@pytest.mark.asyncio
async def test_embedding_and_vocab_service():
    embed_service = EmbeddingService()
    sim = embed_service.compute_cosine_similarity("She loves reading books.", "He enjoys reading novels.")
    assert 0.0 <= sim <= 1.0

    vocab_service = VocabService(embedding_service=embed_service)
    res = await vocab_service.extract_and_save_vocab("She loves reading books.")
    assert len(res.vocabularies) > 0
    assert any(v.word == "book" or v.word == "love" or v.word == "read" for v in res.vocabularies)
    # context_id is set for WordNet-resolved items, None for unresolved tokens
    wn_items = [v for v in res.vocabularies if v.context_id is not None]
    assert all(v.context_id.startswith("ctx_wn_") for v in wn_items)


@pytest.mark.asyncio
async def test_full_en_vi_workflow():
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
        source=TranslateMode(source_lang="en", target_lang="vi"),
        text="The team is developing an advance algorithm to process language."
    )

    responses = []
    async for item in workflow.translate(req):
        responses.append(item)

    types_received = {r.type_response for r in responses}
    assert TypeResponse.TRANSLATE in types_received
    assert TypeResponse.ANALYSIS in types_received
    assert TypeResponse.STATS in types_received
    assert TypeResponse.VOCAB in types_received
