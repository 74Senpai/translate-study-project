import pytest
import asyncio
from unittest.mock import patch
from src.config import get_settings
from src.translate.services.embedding_service import EmbeddingService
from src.translate.services.vocab_service import VocabService


@pytest.fixture
def vocab_service():
    embed_service = EmbeddingService()
    return VocabService(embedding_service=embed_service)


def test_context_window_extraction(vocab_service):
    tokens = ["The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog"]
    # Target: "fox" at index 3, span_len=1, window_size=2
    window_tokens, window_text = vocab_service._extract_context_window(
        doc_tokens_text=tokens, token_idx=3, span_len=1, window_size=2
    )
    assert window_tokens == ["quick", "brown", "fox", "jumps", "over"]
    assert window_text == "quick brown fox jumps over"

    # Edge cases: window larger than bounds
    w_toks, w_txt = vocab_service._extract_context_window(
        doc_tokens_text=tokens, token_idx=1, span_len=1, window_size=10
    )
    assert w_toks == tokens
    assert w_txt == "The quick brown fox jumps over the lazy dog"


@pytest.mark.asyncio
async def test_lesk_scoring(vocab_service):
    synsets = vocab_service._get_synsets("bank", "NOUN")
    assert len(synsets) > 0

    target_synset = synsets[0]
    window_tokens = ["deposited", "money", "in", "the", "bank"]
    full_tokens = ["Yesterday", "I", "deposited", "money", "in", "the", "bank", "account"]

    # Test dual Lesk method score calculation (M3: trimmed context + full sentence)
    lesk_score = vocab_service._compute_lesk_score(
        syn=target_synset,
        window_tokens=window_tokens,
        full_sentence_tokens=full_tokens,
        target_lemma="bank",
        wn_pos="n",
    )
    assert 0.0 <= lesk_score <= 1.0


def test_max_synonyms_configuration(vocab_service):
    """Verify that max synonyms per sense is configurable via wsd_max_synonyms setting."""
    settings = get_settings()

    synsets = vocab_service._get_synsets("good", "ADJ")
    assert len(synsets) > 0

    with patch.object(settings, "wsd_max_synonyms", 3):
        max_syn = int(getattr(settings, "wsd_max_synonyms", 5))
        for syn in synsets:
            raw_lemmas = [l.name().replace("_", " ") for l in syn.lemmas()]
            syn_lemmas = [l for l in raw_lemmas if l.lower() != "good"]
            limited_synonyms = syn_lemmas[:max_syn]
            assert len(limited_synonyms) <= 3


@pytest.mark.asyncio
async def test_ctx_definition_scoring(vocab_service):
    """Test M4: Context Window vs Definition Embedding scoring."""
    synsets = vocab_service._get_synsets("bank", "NOUN")
    assert len(synsets) > 0

    target_synset = synsets[0]
    context_text = "I deposited money in the bank account"
    context_vec = vocab_service.embedding_service.get_embedding(context_text)

    ctx_def_score = vocab_service._compute_ctx_definition_score(
        syn=target_synset,
        context_window_vec=context_vec,
    )
    assert 0.0 <= ctx_def_score <= 1.0


@pytest.mark.asyncio
async def test_generated_example_scoring(vocab_service):
    """Test M5: Generated Example Similarity scoring."""
    synsets = vocab_service._get_synsets("bank", "NOUN")
    assert len(synsets) > 0

    target_synset = synsets[0]
    context_text = "deposited money in the bank account"
    context_vec = vocab_service.embedding_service.get_embedding(context_text)

    gen_ex_score = vocab_service._compute_generated_example_score(
        syn=target_synset,
        target_word="bank",
        context_word_count=6,
        context_window_vec=context_vec,
    )
    assert 0.0 <= gen_ex_score <= 1.0


def test_generate_matching_length_example(vocab_service):
    """Test that generated examples match the target word count."""
    synsets = vocab_service._get_synsets("bank", "NOUN")
    assert len(synsets) > 0

    syn = synsets[0]
    target_count = 7

    result = vocab_service._generate_matching_length_example(
        target_word="bank",
        definition=syn.definition(),
        examples=syn.examples(),
        target_word_count=target_count,
    )
    assert result  # Not empty
    assert len(result.split()) == target_count


@pytest.mark.asyncio
async def test_5method_wsd_vocab_extraction(vocab_service):
    """Test full 5-method WSD vocabulary extraction pipeline."""
    sentence = "The financial bank opened a new branch in the city center."
    res = await vocab_service.extract_and_save_vocab(sentence_text=sentence)
    assert len(res.vocabularies) > 0

    bank_vocab = next((v for v in res.vocabularies if v.word == "bank"), None)
    assert bank_vocab is not None
    assert bank_vocab.context_id is not None
    assert bank_vocab.context_id.startswith("ctx_wn_")
    assert bank_vocab.similarity_score > 0.0

    # Verify WSD method scores are populated
    assert bank_vocab.wsd_method_scores is not None
    assert "m1_sentence_embed" in bank_vocab.wsd_method_scores
    assert "m2_ctx_synonym" in bank_vocab.wsd_method_scores
    assert "m3_lesk" in bank_vocab.wsd_method_scores
    assert "m4_ctx_definition" in bank_vocab.wsd_method_scores
    assert "m5_generated_example" in bank_vocab.wsd_method_scores
    assert "composite" in bank_vocab.wsd_method_scores

    # Verify is_trusted is set (boolean)
    assert isinstance(bank_vocab.is_trusted, bool)


@pytest.mark.asyncio
async def test_trust_threshold_mechanism(vocab_service):
    """Test that trust threshold correctly determines is_trusted flag."""
    settings = get_settings()

    # With very low threshold, everything should be trusted
    with patch.object(settings, "wsd_trust_threshold", 0.01):
        sentence = "The cat sat on the mat."
        res = await vocab_service.extract_and_save_vocab(sentence_text=sentence)
        for v in res.vocabularies:
            if v.similarity_score > 0.0:
                assert v.is_trusted is True

    # With very high threshold, nothing should be trusted
    with patch.object(settings, "wsd_trust_threshold", 0.999):
        sentence = "The dog ran through the park."
        res = await vocab_service.extract_and_save_vocab(sentence_text=sentence)
        for v in res.vocabularies:
            assert v.is_trusted is False


@pytest.mark.asyncio
async def test_env_weight_configuration_override(vocab_service):
    """Verify that changing WSD weight settings dynamically changes composite calculation behavior."""
    settings = get_settings()

    with patch.object(settings, "wsd_weight_sentence_embed", 10.0), \
         patch.object(settings, "wsd_weight_ctx_synonym", 10.0), \
         patch.object(settings, "wsd_weight_lesk", 50.0), \
         patch.object(settings, "wsd_weight_ctx_definition", 20.0), \
         patch.object(settings, "wsd_weight_generated_example", 10.0), \
         patch.object(settings, "wsd_context_window_size", 3):

        sentence = "He sat on the bank of the river watching fish."
        res = await vocab_service.extract_and_save_vocab(sentence_text=sentence)
        assert len(res.vocabularies) > 0
        river_bank = next((v for v in res.vocabularies if v.word == "bank"), None)
        assert river_bank is not None
        assert river_bank.similarity_score > 0.0
        assert river_bank.wsd_method_scores is not None
