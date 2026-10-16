"""
Contextual Word Sense Disambiguation (WSD) & Meaning Extraction Pipeline

Pipeline Architecture (5-Method Weighted WSD):
  1. Context Window & SpaCy Token/POS Extraction:
     - Parse sentence into tokens with surface form, lemma, POS, POS tag, and index.
     - Extract surrounding context window of configurable size (`wsd_context_window_size`).
  2. Five-Method Sense Scoring:
     - Method 1 (Sentence Embedding, 40%): Embedding câu gốc vs embedding câu thay thế từ đồng nghĩa.
     - Method 2 (Context Synonym, 30%): Embedding context window vs embedding context window thay thế từ đồng nghĩa.
     - Method 3 (WordNet Lesk, 10%): Thuật toán Lesk overlap gloss/examples với context window.
     - Method 4 (Context Definition, 10%): Embedding context window vs embedding definition của sense.
     - Method 5 (Generated Example, 10%): Tạo example cùng số từ với context, so sánh embedding.
  3. Percentage Weighted Combination:
     - Combine 5 method scores using weights from `.env` config.
  4. Trust Mechanism:
     - Composite score >= `wsd_trust_threshold` → is_trusted = True.
  5. Composite Reranking & Sense Selection:
     - Rank senses by composite score with POS match bonus.
  6. Vietnamese Meaning Assignment & Translation:
     - Batch-translate or individually translate word meanings via translation engine manager, then verify with the translated sentence.
"""

from typing import List, Optional, Dict, Tuple
import re
import spacy
import lemminflect
from loguru import logger
import nltk
from nltk.corpus import wordnet as wn
from nltk.wsd import lesk
import asyncio

from src.config import get_settings
from src.translate.manager.translate_engine_manager import TranslateEngineManager
from src.translate.models.translate_model import TranslateMode
from src.translate.models.vocab_model import VocabItem, VocabAnalysisResponse
from src.translate.repositories.vocab_repository import VocabRepository
from src.translate.services.embedding_service import EmbeddingService

LOCATION_NER_LABELS = {"GPE", "LOC", "FAC"}
KEEP_ORIGINAL_NER_LABELS = {
    "PERSON", "ORG", "PRODUCT", "EVENT", "WORK_OF_ART", "LAW", "LANGUAGE", "NORP"
}
SKIP_NER_LABELS = {
    "DATE", "TIME", "PERCENT", "MONEY", "QUANTITY", "ORDINAL", "CARDINAL"
}


class VocabService:
    """
    5-Method Contextual Word Sense Disambiguation (WSD) Service.
    Combines:
      - M1: Sentence Embedding Similarity (sentence vs synonym-substituted sentence)
      - M2: Context Window Synonym Substitution Embedding Similarity
      - M3: WordNet Lesk algorithm with Context Window
      - M4: Context Window vs Sense Definition Embedding Similarity
      - M5: Generated Example (same word count as context) Embedding Similarity
    Configurable via .env weights & trust threshold.
    """

    def __init__(
        self,
        repo: Optional[VocabRepository] = None,
        embedding_service: Optional[EmbeddingService] = None,
        spacy_model: str = "en_core_web_sm",
        engine_manager: Optional[TranslateEngineManager] = None,
    ):
        self.repo = repo or VocabRepository()
        self.embedding_service = embedding_service or EmbeddingService(spacy_model=spacy_model)
        self.engine_manager = engine_manager or TranslateEngineManager()
        self.nlp = None
        try:
            self.nlp = spacy.load(spacy_model)
        except Exception as e:
            logger.warning(f"Could not load SpaCy model in VocabService: {e}")

        for pkg in ("wordnet", "omw-1.4", "punkt", "stopwords"):
            try:
                nltk.download(pkg, quiet=True)
            except Exception as e:
                logger.warning(f"NLTK download {pkg}: {e}")

    @staticmethod
    def _extract_synonyms_from_synset(
        synset,
        excluded_words: List[str],
        max_synonyms: int = 5,
    ) -> List[str]:
        """
        Extract synonyms strictly from WordNet synset lemmas / lemma_names().
        Excludes lemmas matching any word in excluded_words (case-insensitive, normalized).
        """
        excluded_normalized = {
            w.lower().replace("_", " ") for w in excluded_words if w
        }
        synonyms: List[str] = []
        seen = set()
        for lemma in synset.lemmas():
            name_clean = lemma.name().replace("_", " ")
            name_lower = name_clean.lower()
            if name_lower not in excluded_normalized and name_lower not in seen:
                seen.add(name_lower)
                synonyms.append(name_clean)
                if len(synonyms) >= max_synonyms:
                    break
        return synonyms

    @staticmethod
    def _extract_antonyms_from_synset(
        synset,
        max_antonyms: int = 5,
    ) -> List[str]:
        """
        Extract antonyms strictly from WordNet synset lemmas' antonyms.
        """
        antonyms: List[str] = []
        seen = set()
        for lemma in synset.lemmas():
            for ant in lemma.antonyms():
                ant_clean = ant.name().replace("_", " ")
                ant_lower = ant_clean.lower()
                if ant_lower not in seen:
                    seen.add(ant_lower)
                    antonyms.append(ant_clean)
                    if len(antonyms) >= max_antonyms:
                        break
            if len(antonyms) >= max_antonyms:
                break
        return antonyms

    # ── Public API ─────────────────────────────────────────────────────────────

    async def extract_and_save_vocab(
        self,
        sentence_text: str,
        top_k: int = 5,
        translated_sentence: Optional[str] = None,
        is_translated: bool = False,
        source_lang: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> VocabAnalysisResponse:
        """
        Analyse content target words using 5-Method Weighted WSD with trust mechanism.
        """
        if not sentence_text or not sentence_text.strip():
            return VocabAnalysisResponse(sentence=sentence_text, vocabularies=[])

        target_tokens = self._extract_target_tokens(sentence_text)

        # Pre-embed original sentence
        original_vec = self.embedding_service.get_embedding(sentence_text)

        # Load configurable weights & context window from .env settings
        settings = get_settings()
        w_sentence_embed = float(getattr(settings, "wsd_weight_sentence_embed", 40.0))
        w_ctx_synonym = float(getattr(settings, "wsd_weight_ctx_synonym", 30.0))
        w_lesk = float(getattr(settings, "wsd_weight_lesk", 10.0))
        w_ctx_def = float(getattr(settings, "wsd_weight_ctx_definition", 10.0))
        w_gen_ex = float(getattr(settings, "wsd_weight_generated_example", 10.0))
        window_size = int(getattr(settings, "wsd_context_window_size", 5))
        wsd_top_k = int(getattr(settings, "wsd_top_k", 6))
        max_synonyms = int(getattr(settings, "wsd_max_synonyms", 5))
        trust_threshold = float(getattr(settings, "wsd_trust_threshold", 0.65))

        total_weight = w_sentence_embed + w_ctx_synonym + w_lesk + w_ctx_def + w_gen_ex
        if total_weight <= 0:
            w1, w2, w3, w4, w5 = 0.4, 0.3, 0.1, 0.1, 0.1
        else:
            w1 = w_sentence_embed / total_weight
            w2 = w_ctx_synonym / total_weight
            w3 = w_lesk / total_weight
            w4 = w_ctx_def / total_weight
            w5 = w_gen_ex / total_weight

        vocab_items: List[VocabItem] = []
        meaning_requests: List[Tuple[VocabItem, str, str, str]] = []
        pos_map = {"NOUN": "n", "VERB": "v", "ADJ": "a", "ADV": "r"}
        stopwords = {"a", "an", "the", "of", "or", "and", "in", "on", "at", "by", "for",
                     "with", "to", "from", "as", "used", "is", "are", "be", "form", "combining"}

        for t_info in target_tokens:
            token_idx = t_info["idx"]
            span_len  = t_info.get("span_len", 1)
            surface   = t_info["surface"]
            lemma     = t_info["lemma"]
            display_word = t_info.get("display_word", surface)
            pos_tag   = t_info["pos"]
            tag       = t_info["tag"]
            morph     = t_info.get("morph", "")   # SpaCy morphology string e.g. "VerbForm=Part|Tense=Pres"
            is_phrase = t_info.get("is_phrase", False)
            wn_pos    = pos_map.get(pos_tag, None)

            is_proper_noun = t_info.get("is_proper_noun", False) or pos_tag == "PROPN"
            is_location = t_info.get("is_location", False)
            is_keep_original = t_info.get("is_keep_original", False)

            # ── Case: Tên riêng giữ nguyên (PERSON, ORG, PROPN, ...) ────────
            if is_proper_noun and is_keep_original:
                ner_type = t_info.get("ner_label") or "PROPN"
                item = VocabItem(
                    word=display_word,
                    contextual_meaning=display_word,  # Tên riêng giữ nguyên
                    context_sentence=sentence_text,
                    simple_example=None,
                    concept_definition=f"Tên riêng ({ner_type})",
                    synonyms=[],
                    antonyms=[],
                    context_id=None,
                    sense_id=None,
                    similarity_score=1.0,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                    is_trusted=True,
                    wsd_method_scores=None,
                    pos="PROPN",
                )
                vocab_items.append(item)
                continue

            # ── Case: Địa danh (GPE, LOC, FAC) → Dịch trực tiếp ──────────────
            if is_proper_noun and is_location:
                ner_type = t_info.get("ner_label") or "LOC"
                item = VocabItem(
                    word=display_word,
                    contextual_meaning=None,
                    context_sentence=sentence_text,
                    simple_example=None,
                    concept_definition=f"Địa danh ({ner_type})",
                    synonyms=[],
                    antonyms=[],
                    context_id=None,
                    sense_id=None,
                    similarity_score=1.0,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                    is_trusted=True,
                    wsd_method_scores=None,
                    pos="PROPN",
                )
                vocab_items.append(item)
                meaning_requests.append((item, display_word, "", display_word))
                continue

            synsets = t_info.get("synsets") or self._get_synsets(lemma, pos_tag)

            # ── Case: no synsets at all → translate directly ───────────────────
            if not synsets:
                item = self._build_direct_item(
                    word=display_word,
                    sentence_text=sentence_text,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                    pos=pos_tag,
                )
                vocab_items.append(item)
                # For translation: use SpaCy lemma (base form) for single words, display_word for phrases
                translate_form_direct = lemma if not is_phrase else display_word
                meaning_requests.append((item, display_word, "", translate_form_direct))
                continue

            # ── Case: only 1 sense OR 1 sense with no synonyms → translate directly ──
            single_sense_no_wsd = False
            if len(synsets) == 1:
                single_sense_no_wsd = True
            elif len(synsets) > 1:
                # Check if all senses combined have no usable synonyms
                all_synonyms = []
                for syn in synsets:
                    syn_lemmas = self._extract_synonyms_from_synset(
                        syn, [lemma, display_word, surface], max_synonyms
                    )
                    all_synonyms.extend(syn_lemmas)
                # Only treat as "no synonyms" when exactly 1 synset has no external synonyms
                if len(synsets) == 1 and not all_synonyms:
                    single_sense_no_wsd = True

            if single_sense_no_wsd:
                only_syn = synsets[0]
                definition = only_syn.definition() or ""
                examples = only_syn.examples()
                synonyms = self._extract_synonyms_from_synset(
                    only_syn, [lemma, display_word, surface], max_synonyms
                )
                antonyms = self._extract_antonyms_from_synset(
                    only_syn, max_synonyms
                )

                item = VocabItem(
                    word=display_word,
                    contextual_meaning=None,
                    context_sentence=sentence_text,
                    simple_example=examples[0] if examples else None,
                    concept_definition=definition or None,
                    synonyms=synonyms,
                    antonyms=antonyms,
                    context_id=f"ctx_wn_{only_syn.name()}",
                    sense_id=only_syn.name(),
                    similarity_score=1.0,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                    is_trusted=True,
                    wsd_method_scores=None,
                    pos=pos_tag,
                )
                vocab_items.append(item)
                # For translation: use SpaCy lemma (base form) for single words, display_word for phrases
                translate_form_single = lemma if not is_phrase else display_word
                meaning_requests.append((item, display_word, definition, translate_form_single))
                continue

            all_tokens_text = t_info["doc_tokens_text"]
            window_tokens, window_text = self._extract_context_window(
                all_tokens_text, token_idx, span_len, window_size
            )

            # Pre-embed context window for M2, M4, M5
            context_window_vec = self.embedding_service.get_embedding(window_text)

            # ── Candidate Preparation & 5-Method Feature Calculation ─────
            synset_info: Dict[str, dict] = {}
            # M1: sentence-level synonym variants
            sentence_variants: List[Tuple[str, str, str, str]] = []
            # M2: context-window-level synonym variants
            context_variants: List[Tuple[str, str, str, str]] = []
            m3_lesk_scores: Dict[str, float] = {}
            m4_ctx_def_scores: Dict[str, float] = {}
            m5_gen_ex_scores: Dict[str, float] = {}

            for syn in synsets:
                syn_name = syn.name()
                syn_lemmas = self._extract_synonyms_from_synset(
                    syn, [lemma, display_word, surface], max_synonyms
                )
                antonyms = self._extract_antonyms_from_synset(
                    syn, max_synonyms
                )

                synset_info[syn_name] = {
                    "synset": syn,
                    "pos": syn.pos(),
                    "definition": syn.definition(),
                    "examples": syn.examples(),
                    "synonyms": syn_lemmas,
                    "antonyms": antonyms,
                    "context_id": f"ctx_wn_{syn_name}",
                    "sense_id": syn_name,
                }

                # ── M3: WordNet Lesk score (dual: trimmed context + full sentence) ──
                m3_lesk_scores[syn_name] = self._compute_lesk_score(
                    syn=syn,
                    window_tokens=window_tokens,
                    full_sentence_tokens=all_tokens_text,
                    target_lemma=lemma,
                    wn_pos=wn_pos,
                    stopwords=stopwords,
                )

                # ── M4: Context Window vs Definition Embedding ─────────────
                m4_ctx_def_scores[syn_name] = self._compute_ctx_definition_score(
                    syn=syn,
                    context_window_vec=context_window_vec,
                )

                # ── M5: Generated Example Similarity ──────────────────────
                m5_gen_ex_scores[syn_name] = self._compute_generated_example_score(
                    syn=syn,
                    target_word=display_word,
                    context_word_count=len(window_tokens),
                    context_window_vec=context_window_vec,
                )

                # Collect variants for M1 (sentence) and M2 (context window)
                for s_lemma in syn_lemmas:
                    # Inflect synonym to match the grammatical form of the original word.
                    # Uses the full morphology chain: Penn tag → morph features → SpaCy inflect → fallback.
                    inflected = self._inflect_synonym_to_match(
                        syn_lemma=s_lemma,
                        surface=surface,
                        tag=tag,
                        morph=morph,
                        pos_tag=pos_tag,
                    )

                    # M1 variant: full sentence with synonym substitution
                    var_sent_words = (
                        all_tokens_text[:token_idx]
                        + [inflected]
                        + all_tokens_text[token_idx + span_len:]
                    )
                    var_sent = " ".join(var_sent_words)
                    sentence_variants.append((var_sent, s_lemma, inflected, syn_name))

                    # M2 variant: context window with synonym substitution
                    window_start = max(0, token_idx - window_size)
                    relative_idx = token_idx - window_start
                    var_ctx_tokens = list(window_tokens)
                    if 0 <= relative_idx < len(var_ctx_tokens):
                        var_ctx_tokens[relative_idx] = inflected
                    var_ctx_text = " ".join(var_ctx_tokens)
                    context_variants.append((var_ctx_text, s_lemma, inflected, syn_name))

            # ── M1: Sentence Embedding Similarity Scoring ──────────────────
            m1_synonym_scores: List[Tuple[str, str, float]] = []
            for var_sent, s_lemma, inflected, syn_name in sentence_variants:
                var_vec = self.embedding_service.get_embedding(var_sent)
                score = self.embedding_service.compute_vector_similarity(original_vec, var_vec)
                m1_synonym_scores.append((s_lemma, syn_name, float(score)))

            # TopK formula for M1: sum of scores of sense in top K divided by K (default 6)
            sorted_m1 = sorted(m1_synonym_scores, key=lambda x: x[2], reverse=True)
            top_k_m1 = sorted_m1[:wsd_top_k]

            m1_scores: Dict[str, float] = {}
            for syn in synsets:
                syn_name = syn.name()
                synset_top_scores = [score for s_lemma, s_name, score in top_k_m1 if s_name == syn_name]
                m1_scores[syn_name] = (sum(synset_top_scores) / float(wsd_top_k)) if wsd_top_k > 0 else 0.0

            # ── M2: Context Window Synonym Substitution Similarity ─────────
            m2_synonym_scores: List[Tuple[str, str, float]] = []
            for var_ctx, s_lemma, inflected, syn_name in context_variants:
                var_vec = self.embedding_service.get_embedding(var_ctx)
                score = self.embedding_service.compute_vector_similarity(context_window_vec, var_vec)
                m2_synonym_scores.append((s_lemma, syn_name, float(score)))

            # TopK formula for M2: sum of scores of sense in top K divided by K (default 6)
            sorted_m2 = sorted(m2_synonym_scores, key=lambda x: x[2], reverse=True)
            top_k_m2 = sorted_m2[:wsd_top_k]

            m2_scores: Dict[str, float] = {}
            for syn in synsets:
                syn_name = syn.name()
                synset_top_scores = [score for s_lemma, s_name, score in top_k_m2 if s_name == syn_name]
                m2_scores[syn_name] = (sum(synset_top_scores) / float(wsd_top_k)) if wsd_top_k > 0 else 0.0

            # ── 5-Method Weighted Score Fusion ────────────────────────────
            synset_votes: Dict[str, float] = {}
            synset_method_details: Dict[str, dict] = {}
            for syn in synsets:
                syn_name = syn.name()
                s1 = m1_scores.get(syn_name, 0.0)
                s2 = m2_scores.get(syn_name, 0.0)
                s3 = m3_lesk_scores.get(syn_name, 0.0)
                s4 = m4_ctx_def_scores.get(syn_name, 0.0)
                s5 = m5_gen_ex_scores.get(syn_name, 0.0)

                composite = (w1 * s1) + (w2 * s2) + (w3 * s3) + (w4 * s4) + (w5 * s5)
                synset_votes[syn_name] = composite
                synset_method_details[syn_name] = {
                    "m1_sentence_embed": round(s1, 4),
                    "m2_ctx_synonym": round(s2, 4),
                    "m3_lesk": round(s3, 4),
                    "m4_ctx_definition": round(s4, 4),
                    "m5_generated_example": round(s5, 4),
                    "composite": round(composite, 4),
                }

            top_k_senses = sorted(synset_votes.items(), key=lambda x: x[1], reverse=True)[:wsd_top_k]

            # ── Composite Reranking with POS match bonus ──────────────────
            if not top_k_senses:
                best_synset_name = synsets[0].name()
                best_score = 1.0
            else:
                best_synset_name, best_score = self._rerank_senses(
                    target_pos=wn_pos,
                    top_k_senses=top_k_senses,
                )

            best_info = synset_info[best_synset_name]

            # ── Trust Mechanism ───────────────────────────────────────────
            is_trusted = best_score >= trust_threshold

            # ── Meaning Assignment & Translation ─────────────────────────
            winning_synonyms = sorted(
                [(sl, score) for sl, sn, score in m1_synonym_scores if sn == best_synset_name],
                key=lambda x: x[1], reverse=True
            )
            best_subs = [s for s, _ in winning_synonyms[:3]]

            synonyms = best_info["synonyms"][:max_synonyms]
            antonyms = best_info["antonyms"][:max_synonyms]
            simple_ex = (best_info["examples"][0]
                         if best_info.get("examples") else None)

            item = VocabItem(
                word=display_word,
                contextual_meaning=None,
                context_sentence=sentence_text,
                simple_example=simple_ex,
                concept_definition=best_info.get("definition") or None,
                synonyms=synonyms,
                antonyms=antonyms,
                context_id=best_info["context_id"],
                sense_id=best_synset_name,
                similarity_score=round(best_score, 4),
                is_translated=is_translated,
                source_lang=source_lang,
                is_phrase=is_phrase,
                is_trusted=is_trusted,
                wsd_method_scores=synset_method_details.get(best_synset_name),
                pos=pos_tag,
            )
            vocab_items.append(item)
            # For translation: use SpaCy lemma (base form) for single words, display_word for phrases
            translate_form_wsd = lemma if not is_phrase else display_word
            meaning_requests.append((item, display_word, best_info["definition"], translate_form_wsd))

        await self._populate_contextual_meanings(
            meaning_requests=meaning_requests,
            sentence_text=sentence_text,
            translated_sentence=translated_sentence,
        )
        for item in vocab_items:
            self.repo.save_vocab_item(item, user_id=user_id)
        return VocabAnalysisResponse(sentence=sentence_text, vocabularies=vocab_items)

    # ── Context Window & 5-Method Helpers ─────────────────────────────────────

    def _extract_context_window(
        self,
        doc_tokens_text: List[str],
        token_idx: int,
        span_len: int = 1,
        window_size: int = 5,
    ) -> Tuple[List[str], str]:
        """
        Extract a window of `window_size` tokens around the target token/phrase.
        Returns (window_tokens, window_text).
        """
        if window_size <= 0 or window_size >= len(doc_tokens_text):
            return doc_tokens_text, " ".join(doc_tokens_text)

        start_idx = max(0, token_idx - window_size)
        end_idx = min(len(doc_tokens_text), token_idx + span_len + window_size)
        window_tokens = doc_tokens_text[start_idx:end_idx]
        window_text = " ".join(window_tokens)
        return window_tokens, window_text

    def _compute_single_lesk_score(
        self,
        syn: wn.synset,
        context_tokens: List[str],
        target_lemma: str,
        wn_pos: Optional[str] = None,
        stopwords: Optional[set] = None,
    ) -> float:
        """
        WordNet Lesk overlap & NLTK lesk match score for a given token sequence.
        """
        if stopwords is None:
            stopwords = {"a", "an", "the", "of", "or", "and", "in", "on", "at", "by", "for",
                         "with", "to", "from", "as", "used", "is", "are", "be", "form", "combining"}

        ctx_words = set(
            w.lower() for w in context_tokens
            if w.isalpha() and w.lower() not in stopwords and w.lower() != target_lemma.lower()
        )

        def_ex_text = (syn.definition() or "") + " " + " ".join(syn.examples() or [])
        sig_words = set(
            w.lower() for w in re.findall(r'\b[a-zA-Z]{2,}\b', def_ex_text)
            if w.lower() not in stopwords
        )

        if not sig_words or not ctx_words:
            overlap_score = 0.0
        else:
            intersection = ctx_words.intersection(sig_words)
            union = ctx_words.union(sig_words)
            jaccard = len(intersection) / len(union) if union else 0.0
            ratio = len(intersection) / max(1, len(sig_words))
            overlap_score = max(jaccard, ratio)

        # NLTK WSD Lesk best match check
        lesk_bonus = 0.0
        try:
            best_lesk = lesk(context_tokens, target_lemma, pos=wn_pos)
            if best_lesk and best_lesk.name() == syn.name():
                lesk_bonus = 1.0
        except Exception as e:
            logger.debug(f"NLTK Lesk error for '{target_lemma}': {e}")

        return min(1.0, 0.60 * overlap_score + 0.40 * lesk_bonus)

    def _compute_lesk_score(
        self,
        syn: wn.synset,
        window_tokens: List[str],
        full_sentence_tokens: List[str],
        target_lemma: str,
        wn_pos: Optional[str] = None,
        stopwords: Optional[set] = None,
    ) -> float:
        """
        Method 3: Dual WordNet Lesk score (trimmed context window + full sentence).
        Calculates Lesk score for trimmed context window and full intact sentence,
        then returns their average score.
        """
        score_trimmed = self._compute_single_lesk_score(
            syn=syn,
            context_tokens=window_tokens,
            target_lemma=target_lemma,
            wn_pos=wn_pos,
            stopwords=stopwords,
        )
        score_full = self._compute_single_lesk_score(
            syn=syn,
            context_tokens=full_sentence_tokens,
            target_lemma=target_lemma,
            wn_pos=wn_pos,
            stopwords=stopwords,
        )
        avg_score = (score_trimmed + score_full) / 2.0
        return round(avg_score, 4)

    def _compute_ctx_definition_score(
        self,
        syn: wn.synset,
        context_window_vec,
    ) -> float:
        """
        Method 4: Vector similarity between context window and synset definition.
        Differs from old Method 3 by comparing context window embedding
        against the sense definition embedding only (without examples mixed in).
        """
        def_text = syn.definition() or ""
        if not def_text:
            return 0.0

        def_vec = self.embedding_service.get_embedding(def_text)
        sim = self.embedding_service.compute_vector_similarity(context_window_vec, def_vec)
        return round(max(0.0, float(sim)), 4)

    def _compute_generated_example_score(
        self,
        syn: wn.synset,
        target_word: str,
        context_word_count: int,
        context_window_vec,
    ) -> float:
        """
        Method 5: Generate an example sentence for this sense that has the same
        word count as the context window, then compare embeddings.
        Uses synset examples + definition to build a synthetic example of matching length.
        """
        examples = syn.examples() or []
        definition = syn.definition() or ""

        # Build a candidate example from WordNet data
        generated = self._generate_matching_length_example(
            target_word=target_word,
            definition=definition,
            examples=examples,
            target_word_count=context_word_count,
        )

        if not generated:
            return 0.0

        gen_vec = self.embedding_service.get_embedding(generated)
        sim = self.embedding_service.compute_vector_similarity(context_window_vec, gen_vec)
        return round(max(0.0, float(sim)), 4)

    def _generate_matching_length_example(
        self,
        target_word: str,
        definition: str,
        examples: List[str],
        target_word_count: int,
    ) -> str:
        """
        Generate an example sentence with approximately `target_word_count` words
        using wordnet examples and definition as source material.
        """
        if target_word_count <= 0:
            target_word_count = 5

        # Try to find/adapt the closest existing example
        best_example = ""
        best_diff = float("inf")
        for ex in examples:
            ex_words = ex.split()
            diff = abs(len(ex_words) - target_word_count)
            if diff < best_diff:
                best_diff = diff
                best_example = ex

        # If we have a good example, adapt its length
        if best_example:
            words = best_example.split()
            if len(words) == target_word_count:
                return best_example
            elif len(words) > target_word_count:
                # Truncate keeping target word if present
                return " ".join(words[:target_word_count])
            else:
                # Pad with definition words
                def_words = definition.split()
                while len(words) < target_word_count and def_words:
                    words.append(def_words.pop(0))
                return " ".join(words[:target_word_count])

        # No example available — build from definition
        if definition:
            def_words = definition.split()
            # Ensure target word is included
            if target_word.lower() not in [w.lower() for w in def_words]:
                def_words = [target_word] + def_words

            if len(def_words) >= target_word_count:
                return " ".join(def_words[:target_word_count])
            else:
                # Pad by repeating definition context
                while len(def_words) < target_word_count:
                    def_words.append(def_words[len(def_words) % max(1, len(definition.split()))])
                return " ".join(def_words[:target_word_count])

        return target_word

    # ── Private Helpers ────────────────────────────────────────────────────────

    def _extract_target_tokens(self, sentence_text: str) -> List[dict]:
        """
        Extract content target tokens and multi-word phrases using SpaCy POS tags and WordNet synset lookup.
        Scans for 4-gram, 3-gram, 2-gram compounds/phrases in WordNet before falling back to unigrams.
        """
        targets = []
        if self.nlp is not None:
            doc = self.nlp(sentence_text)
            doc_tokens_text = [t.text for t in doc]
            n_tokens = len(doc)
            used_indices = set()

            # 1. Named Entity Recognition (NER) handling
            for ent in doc.ents:
                if not ent.text.strip():
                    continue

                # Skip temporal/numerical entities from vocab analysis
                if ent.label_ in SKIP_NER_LABELS:
                    for idx in range(ent.start, ent.end):
                        used_indices.add(idx)
                    continue

                if ent.label_ in LOCATION_NER_LABELS:
                    # Địa danh -> Dịch trực tiếp
                    targets.append({
                        "idx": ent.start,
                        "span_len": len(ent),
                        "surface": ent.text,
                        "lemma": ent.text,
                        "display_word": ent.text,
                        "pos": "PROPN",
                        "tag": "NNP",
                        "doc_tokens_text": doc_tokens_text,
                        "is_phrase": len(ent) > 1,
                        "is_proper_noun": True,
                        "is_location": True,
                        "is_keep_original": False,
                        "ner_label": ent.label_,
                        "synsets": [],
                    })
                    for idx in range(ent.start, ent.end):
                        used_indices.add(idx)
                else:
                    # Tên riêng (PERSON, ORG, PRODUCT, ...) -> Giữ nguyên
                    targets.append({
                        "idx": ent.start,
                        "span_len": len(ent),
                        "surface": ent.text,
                        "lemma": ent.text,
                        "display_word": ent.text,
                        "pos": "PROPN",
                        "tag": "NNP",
                        "doc_tokens_text": doc_tokens_text,
                        "is_phrase": len(ent) > 1,
                        "is_proper_noun": True,
                        "is_location": False,
                        "is_keep_original": True,
                        "ner_label": ent.label_,
                        "synsets": [],
                    })
                    for idx in range(ent.start, ent.end):
                        used_indices.add(idx)

            # 2. Multi-word Phrase Scanning (n = 4 down to 2) on unconsumed tokens
            for n in range(4, 1, -1):
                for i in range(n_tokens - n + 1):
                    if any(idx in used_indices for idx in range(i, i + n)):
                        continue

                    span_tokens = doc[i:i+n]

                    first_t = span_tokens[0]
                    last_t = span_tokens[-1]

                    if first_t.is_stop or first_t.is_punct or first_t.pos_ in ("PRON", "DET", "PUNCT", "CCONJ", "SCONJ"):
                        continue
                    if last_t.is_punct or last_t.pos_ in ("PUNCT", "DET", "CCONJ", "SCONJ"):
                        continue
                    if not all(t.is_alpha or t.text == "-" for t in span_tokens):
                        continue

                    candidate_lemmas = [t.lemma_.lower() for t in span_tokens if t.is_alpha]
                    candidate_surfaces = [t.text.lower() for t in span_tokens if t.is_alpha]

                    if len(candidate_lemmas) < 2:
                        continue

                    phrase_lemma_underscore = "_".join(candidate_lemmas)
                    phrase_surface_underscore = "_".join(candidate_surfaces)

                    span_pos_tag = ""
                    for t in reversed(span_tokens):
                        if t.pos_ in ("NOUN", "VERB", "ADJ", "ADV"):
                            span_pos_tag = t.pos_
                            break

                    synsets = self._get_synsets(
                        [phrase_lemma_underscore, phrase_surface_underscore],
                        pos_tag=span_pos_tag
                    )

                    if synsets:
                        phrase_display_parts = []
                        for idx_t, t in enumerate(span_tokens):
                            if idx_t == 0 or t.text == "-" or span_tokens[idx_t-1].text == "-":
                                phrase_display_parts.append(t.text)
                            else:
                                phrase_display_parts.append(" " + t.text)
                        phrase_display = "".join(phrase_display_parts)

                        pos_tag = span_pos_tag or "NOUN"
                        wn_pos = synsets[0].pos()
                        pos_reverse_map = {"n": "NOUN", "v": "VERB", "a": "ADJ", "r": "ADV"}
                        if wn_pos in pos_reverse_map:
                            pos_tag = pos_reverse_map[wn_pos]

                        targets.append({
                            "idx": i,
                            "span_len": n,
                            "surface": phrase_display,
                            "lemma": phrase_lemma_underscore,
                            "display_word": phrase_display,
                            "pos": pos_tag,
                            "tag": "NNP" if pos_tag in ("NOUN", "PROPN") else "VB",
                            "doc_tokens_text": doc_tokens_text,
                            "is_phrase": True,
                            "is_proper_noun": False,
                            "is_location": False,
                            "is_keep_original": False,
                            "synsets": synsets,
                        })

                        for idx in range(i, i + n):
                            used_indices.add(idx)

            # 3. Single word target extraction for unconsumed tokens
            for idx, token in enumerate(doc):
                if idx in used_indices:
                    continue
                if not token.is_alpha or token.is_stop:
                    continue

                if token.pos_ == "PROPN":
                    # Standalone proper noun (not caught by NER entities) -> Tên riêng giữ nguyên
                    targets.append({
                        "idx": idx,
                        "span_len": 1,
                        "surface": token.text,
                        "lemma": token.text,
                        "display_word": token.text,
                        "pos": "PROPN",
                        "tag": token.tag_,
                        "morph": str(token.morph),
                        "doc_tokens_text": doc_tokens_text,
                        "is_phrase": False,
                        "is_proper_noun": True,
                        "is_location": False,
                        "is_keep_original": True,
                        "ner_label": "PROPN",
                        "synsets": [],
                    })
                    used_indices.add(idx)
                elif token.pos_ in ("NOUN", "VERB", "ADJ", "ADV"):
                    targets.append({
                        "idx": idx,
                        "span_len": 1,
                        "surface": token.text,
                        "lemma": token.lemma_.lower(),
                        "display_word": token.lemma_.lower(),
                        "pos": token.pos_,
                        "tag": token.tag_,
                        "morph": str(token.morph),
                        "doc_tokens_text": doc_tokens_text,
                        "is_phrase": False,
                        "is_proper_noun": False,
                        "is_location": False,
                        "is_keep_original": False,
                    })

            targets.sort(key=lambda x: x["idx"])
            return targets

        else:
            words = sentence_text.split()
            targets = []
            used_indices = set()
            n_tokens = len(words)

            for n in range(4, 1, -1):
                for i in range(n_tokens - n + 1):
                    if any(idx in used_indices for idx in range(i, i + n)):
                        continue
                    span_words = [w.lower() for w in words[i:i+n] if w.isalpha()]
                    if len(span_words) < 2:
                        continue
                    phrase_underscore = "_".join(span_words)
                    phrase_display = " ".join(words[i:i+n])
                    synsets = self._get_synsets(phrase_underscore, "")
                    if synsets:
                        targets.append({
                            "idx": i,
                            "span_len": n,
                            "surface": phrase_display,
                            "lemma": phrase_underscore,
                            "display_word": phrase_display,
                            "pos": "NOUN",
                            "tag": "NN",
                            "doc_tokens_text": words,
                            "is_phrase": True,
                            "synsets": synsets,
                        })
                        for idx in range(i, i + n):
                            used_indices.add(idx)

            for i, w in enumerate(words):
                if i in used_indices:
                    continue
                if w.isalpha() and len(w) > 2:
                    targets.append({
                        "idx": i,
                        "span_len": 1,
                        "surface": w,
                        "lemma": w.lower(),
                        "display_word": w.lower(),
                        "pos": "NOUN",
                        "tag": "NN",
                        "doc_tokens_text": words,
                        "is_phrase": False,
                    })

            targets.sort(key=lambda x: x["idx"])
            return targets

    def _inflect_word(self, lemma: str, tag: str) -> str:
        """Simple inflect lemma to surface form matching Penn Treebank tag. Used as fallback."""
        try:
            infl = lemminflect.getInflection(lemma, tag=tag)
            if infl and len(infl) > 0:
                return infl[0]
        except Exception as e:
            logger.debug(f"Inflection failed for '{lemma}' ({tag}): {e}")
        return lemma

    def _inflect_synonym_to_match(
        self,
        syn_lemma: str,
        surface: str,
        tag: str,
        morph: str,
        pos_tag: str,
    ) -> str:
        """
        Inflect a synonym lemma to match the grammatical form of the original word in the sentence.

        Pipeline (in order of precision):
        1. Use Penn Treebank tag (tag) with lemminflect.getInflection — most direct mapping.
        2. Use SpaCy morphology features (morph string) to derive the correct inflection.
        3. Try SpaCy's own token._.inflect() if available.
        4. Fall back to the original syn_lemma if no inflection possible.

        Examples:
          "running" (VBG, VerbForm=Part|Tense=Pres) → "sprint" → "sprinting"
          "banks" (NNS, Number=Plur)                → "institution" → "institutions"
          "went" (VBD, Tense=Past)                   → "travel" → "traveled"
          "happiest" (JJS, Degree=Sup)               → "joyful" → "most joyful" (or "joyfulest")
        """
        if not syn_lemma or not syn_lemma.strip():
            return syn_lemma

        # Multi-word synonyms (e.g. from definition fallback): inflect only the first content word
        if " " in syn_lemma:
            parts = syn_lemma.split()
            first_inflected = self._inflect_synonym_to_match(
                parts[0], surface, tag, morph, pos_tag
            )
            return first_inflected + " " + " ".join(parts[1:])

        # ── Step 1: Penn Treebank tag → lemminflect (most reliable for English) ──
        if tag:
            try:
                infl = lemminflect.getInflection(syn_lemma, tag=tag)
                if infl and infl[0].lower() != syn_lemma.lower():
                    logger.debug(f"Inflected '{syn_lemma}' → '{infl[0]}' via tag={tag}")
                    return infl[0]
                elif infl:
                    # Even if same string, it's still the correct form
                    return infl[0]
            except Exception as e:
                logger.debug(f"lemminflect tag inflect failed for '{syn_lemma}' ({tag}): {e}")

        # ── Step 2: Parse SpaCy morphology features and apply manually ────────
        if morph:
            try:
                morph_dict: Dict[str, str] = {}
                for feat in morph.split("|"):
                    if "=" in feat:
                        k, v = feat.split("=", 1)
                        morph_dict[k.strip()] = v.strip()

                verb_form = morph_dict.get("VerbForm", "")
                tense     = morph_dict.get("Tense", "")
                number    = morph_dict.get("Number", "")
                degree    = morph_dict.get("Degree", "")

                # Map morph features → Penn tag for lemminflect
                derived_tag = None
                if pos_tag == "VERB":
                    if verb_form == "Part" and tense in ("Pres", ""):
                        derived_tag = "VBG"   # running, sprinting
                    elif verb_form == "Part" and tense == "Past":
                        derived_tag = "VBN"   # run, sprinted
                    elif verb_form == "Fin" and tense == "Past":
                        derived_tag = "VBD"   # went, traveled
                    elif verb_form == "Fin" and tense == "Pres" and number == "Sing":
                        derived_tag = "VBZ"   # runs, travels
                    elif verb_form == "Fin" and tense == "Pres":
                        derived_tag = "VBP"   # run, travel
                    elif verb_form == "Inf":
                        derived_tag = "VB"    # run, travel (base)
                    elif verb_form == "Ger":
                        derived_tag = "VBG"   # running
                elif pos_tag in ("NOUN", "PROPN"):
                    derived_tag = "NNS" if number == "Plur" else "NN"
                elif pos_tag == "ADJ":
                    if degree == "Cmp":
                        derived_tag = "JJR"   # bigger, more joyful
                    elif degree == "Sup":
                        derived_tag = "JJS"   # biggest, most joyful
                    else:
                        derived_tag = "JJ"
                elif pos_tag == "ADV":
                    if degree == "Cmp":
                        derived_tag = "RBR"
                    elif degree == "Sup":
                        derived_tag = "RBS"
                    else:
                        derived_tag = "RB"

                if derived_tag and derived_tag != tag:
                    try:
                        infl = lemminflect.getInflection(syn_lemma, tag=derived_tag)
                        if infl:
                            logger.debug(
                                f"Inflected '{syn_lemma}' → '{infl[0]}' via morph={morph} "
                                f"derived_tag={derived_tag}"
                            )
                            return infl[0]
                    except Exception:
                        pass
            except Exception as e:
                logger.debug(f"Morph parse failed for '{syn_lemma}' morph='{morph}': {e}")

        # ── Step 3: SpaCy token._.inflect() via lemminflect extension ──────────
        if self.nlp is not None and tag:
            try:
                doc = self.nlp(syn_lemma)
                if doc and len(doc) > 0:
                    inflected = doc[0]._.inflect(tag)
                    if inflected and inflected.lower() != syn_lemma.lower():
                        logger.debug(f"SpaCy inflect '{syn_lemma}' → '{inflected}' via tag={tag}")
                        return inflected
            except Exception as e:
                logger.debug(f"SpaCy token._.inflect failed for '{syn_lemma}': {e}")

        # ── Step 4: Fallback — return the original lemma unchanged ─────────────
        logger.debug(f"No inflection found for '{syn_lemma}' (tag={tag}, morph={morph}), keeping lemma.")
        return syn_lemma

    def _rerank_senses(
        self,
        target_pos: Optional[str],
        top_k_senses: List[Tuple[str, float]],
    ) -> Tuple[str, float]:
        """
        Composite reranking: 0.80 * vote_score + 0.20 * pos_bonus.
        Selects the sense with highest composite score without defaulting to top 1.
        """
        if not top_k_senses:
            return "", 0.0

        best_name = top_k_senses[0][0]
        best_score = -1.0

        for syn_name, vote_score in top_k_senses:
            sense_pos = syn_name.split(".")[1] if syn_name.count(".") >= 1 else ""
            pos_bonus = 1.0 if (target_pos and sense_pos == target_pos) else 0.5

            composite = 0.80 * vote_score + 0.20 * pos_bonus
            if composite > best_score:
                best_score = composite
                best_name  = syn_name

        return best_name, best_score

    async def _translate_terms_batch(
        self,
        terms: List[str],
        source_lang: str = "en",
        target_lang: str = "vi",
    ) -> List[List[str]]:
        """Batch-translate multiple terms via manager and return clean tokens per term."""
        if not terms:
            return []
        try:
            results = await self.engine_manager.translate_batch(
                source=source_lang,
                texts=terms,
                target_lang=target_lang,
            )
            parsed: List[List[str]] = []
            for term, res in zip(terms, results):
                if not res:
                    parsed.append([])
                    continue
                clean = res
                if "(NOTICE:" in clean:
                    clean = clean[:clean.index("(NOTICE:")].strip()
                if clean.strip().lower() == term.lower():
                    parsed.append([])
                    continue
                tokens = [m.strip().lower() for m in clean.split(",") if m.strip()]
                parsed.append(tokens)
            return parsed
        except Exception as e:
            logger.debug(f"Manager translate_batch failed: {e}")
            return [[] for _ in terms]

    async def _translate_term(
        self,
        term: str,
        source_lang: str = "en",
        target_lang: str = "vi",
    ) -> List[str]:
        """Translate a single term via manager and return clean tokens."""
        if not term or not term.strip():
            return []
        try:
            result = await self.engine_manager.translate(
                source=source_lang,
                text=term,
                target_lang=target_lang,
            )
            if not result:
                return []
            if "(NOTICE:" in result:
                result = result[:result.index("(NOTICE:")].strip()
            if result.strip().lower() == term.lower():
                return []
            return [m.strip().lower() for m in result.split(",") if m.strip()]
        except Exception as e:
            logger.debug(f"Manager translate '{term}' failed: {e}")
            return []

    async def _populate_contextual_meanings(
        self,
        meaning_requests: List[Tuple[VocabItem, str, str, str]],
        sentence_text: str,
        translated_sentence: Optional[str],
    ) -> None:
        """
        Populate contextual Vietnamese meanings for each VocabItem.
        meaning_requests: List of (item, display_word, definition, translate_form)
        translate_form is the normalized/lemmatized form of the word used for translation.
        """
        if not meaning_requests:
            return

        grouped_requests: Dict[Tuple[str, str], List[VocabItem]] = {}
        for item, word, definition, translate_form in meaning_requests:
            key = (word.casefold(), definition)
            grouped_requests.setdefault(key, []).append(item)

        batch = [
            (items[0], items[0].word, definition)
            for (_, definition), items in grouped_requests.items()
        ]

        # Build translate_form lookup: keyed by (word.casefold(), definition)
        translate_form_lookup: Dict[Tuple[str, str], str] = {}
        for item, word, definition, translate_form in meaning_requests:
            key = (word.casefold(), definition)
            if key not in translate_form_lookup:
                translate_form_lookup[key] = translate_form

        # 1. Batch translation via manager — use normalized (base lemma) forms for better accuracy
        batch_translate_words = [
            translate_form_lookup.get((item.word.casefold(), definition), word)
            for item, word, definition in batch
        ]
        batch_meanings = await self._translate_terms_batch(
            terms=batch_translate_words,
            source_lang="en",
            target_lang="vi",
        )

        for index, (item, word, definition) in enumerate(batch):
            meanings = batch_meanings[index] if index < len(batch_meanings) else []
            translate_form = translate_form_lookup.get((word.casefold(), definition), word)

            # 2. If no batch meaning or word has synset context, refine via synonym probes
            if not meanings and item.context_id:
                meanings = await self._get_vi_meanings(
                    word=translate_form,
                    synset_name=item.context_id.removeprefix("ctx_wn_"),
                    best_substitutes=item.synonyms[:2],
                    definition=definition,
                    sentence_text=sentence_text,
                    pos_tag=item.pos or "",
                )
            elif not meanings:
                # Fallback to single translation via manager using normalized form
                meanings = await self._translate_term(translate_form, "en", "vi")

            if meanings and translated_sentence:
                meanings = self._verify_against_translation(meanings, translated_sentence)

            contextual_meaning = ", ".join(meanings[:3]) if meanings else None
            if not contextual_meaning and item.pos == "PROPN":
                contextual_meaning = word
            for grouped_item in grouped_requests[(word.casefold(), definition)]:
                grouped_item.contextual_meaning = contextual_meaning

    async def _get_vi_meanings(
        self,
        word: str,
        synset_name: str,
        best_substitutes: List[str],
        definition: str,
        sentence_text: str,
        translated_sentence: Optional[str] = None,
        pos_tag: str = "",
    ) -> List[str]:
        """
        Build Vietnamese meanings via manager using synonyms/definition probes.
        Normalizes synonyms to base lemma form before using as translation probes.
        Translates candidate probes in batch or individually through manager.
        """
        candidates: List[str] = []
        # best_substitutes are WordNet lemmas — already in base form, use directly as probes
        probes = list(best_substitutes[:2])
        if definition:
            probes = probes + [" ".join(definition.split()[:5])]

        # Translate probes via manager in batch
        if probes:
            probe_results = await self._translate_terms_batch(
                terms=probes,
                source_lang="en",
                target_lang="vi",
            )
            for p_tokens in probe_results:
                if p_tokens:
                    candidates.extend(p_tokens)
                    break

        # Fallback to single term translation via manager if candidates empty
        if not candidates and word:
            candidates = await self._translate_term(word, "en", "vi")

        if candidates and translated_sentence:
            return self._verify_against_translation(candidates, translated_sentence)

        if candidates:
            return candidates[:3]

        return []

    def _verify_against_translation(
        self,
        candidates: List[str],
        translated_sentence: str,
    ) -> List[str]:
        """Promote candidate translations that appear in translated_sentence."""
        trans_lower = translated_sentence.lower()
        confirmed   = [c for c in candidates if c.lower() in trans_lower]
        unconfirmed = [c for c in candidates if c.lower() not in trans_lower]
        return (confirmed + unconfirmed)[:3] or candidates[:3]

    def _build_direct_item(
        self,
        word: str,
        sentence_text: str,
        is_translated: bool = False,
        source_lang: Optional[str] = None,
        is_phrase: bool = False,
        pos: Optional[str] = None,
    ) -> VocabItem:
        return VocabItem(
            word=word,
            contextual_meaning=None,
            context_sentence=sentence_text,
            simple_example=None,
            concept_definition=None,
            synonyms=[],
            antonyms=[],
            context_id=None,
            similarity_score=1.0,
            is_translated=is_translated,
            source_lang=source_lang,
            is_phrase=is_phrase,
            is_trusted=True,
            wsd_method_scores=None,
            pos=pos,
        )

    def _build_fallback_item(
        self,
        word: str,
        sentence_text: str,
        pos_tag: str,
        is_translated: bool = False,
        source_lang: Optional[str] = None,
        is_phrase: bool = False,
    ) -> VocabItem:
        return VocabItem(
            word=word,
            contextual_meaning=None,
            context_sentence=sentence_text,
            simple_example=None,
            concept_definition=None,
            synonyms=[],
            antonyms=[],
            context_id=None,
            similarity_score=0.0,
            is_translated=is_translated,
            source_lang=source_lang,
            is_phrase=is_phrase,
            is_trusted=False,
            wsd_method_scores=None,
            pos=pos_tag,
        )

    def _get_synsets(self, word_input, pos_tag: str = ""):
        if pos_tag == "PROPN":
            return []
        pos_map = {"NOUN": wn.NOUN, "VERB": wn.VERB, "ADJ": wn.ADJ, "ADV": wn.ADV}
        wn_pos = pos_map.get(pos_tag)

        if isinstance(word_input, list):
            raw_words = word_input
        elif isinstance(word_input, str):
            raw_words = [word_input]
        else:
            raw_words = []

        candidates = []
        for w in raw_words:
            if not w:
                continue
            candidates.append(w)
            candidates.append(w.replace("_", "-"))
            candidates.append(w.replace("-", "_"))
            if "-" in w or "_" in w:
                candidates.append(w.replace("_", ""))
                candidates.append(w.replace("-", ""))

        seen = set()
        unique_candidates = []
        for c in candidates:
            c_lower = c.lower()
            if c_lower not in seen:
                seen.add(c_lower)
                unique_candidates.append(c_lower)
                if wn_pos:
                    m = wn.morphy(c_lower, wn_pos)
                else:
                    m = wn.morphy(c_lower)
                if m and m not in seen:
                    seen.add(m)
                    unique_candidates.append(m)

        synsets = []
        if wn_pos:
            for c in unique_candidates:
                try:
                    res = wn.synsets(c, pos=wn_pos)
                    if res:
                        synsets.extend(res)
                except Exception:
                    pass

        if not synsets:
            for c in unique_candidates:
                try:
                    res = wn.synsets(c)
                    if res:
                        synsets.extend(res)
                except Exception:
                    pass

        dedup_synsets = []
        synset_names = set()
        for s in synsets:
            if s.name() not in synset_names:
                synset_names.add(s.name())
                dedup_synsets.append(s)

        return dedup_synsets
