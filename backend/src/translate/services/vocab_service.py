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
     - Translate target word in context via Gemini AI Model (or online fallback) verified with translated sentence.
"""

from typing import List, Optional, Dict, Tuple
import re
import spacy
import lemminflect
from loguru import logger
import nltk
from nltk.corpus import wordnet as wn
from nltk.wsd import lesk
from deep_translator import GoogleTranslator, MyMemoryTranslator
from google import genai
from google.genai import types as genai_types
import asyncio

from src.config import get_settings
from src.translate.models.vocab_model import VocabItem, VocabAnalysisResponse
from src.translate.repositories.vocab_repository import VocabRepository
from src.translate.services.embedding_service import EmbeddingService


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
    ):
        self.repo = repo or VocabRepository()
        self.embedding_service = embedding_service or EmbeddingService(spacy_model=spacy_model)
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

        # Gemini Client for in-context vocabulary translation
        self.gemini_client = None
        settings = get_settings()
        if settings.gemini_api_key:
            try:
                self.gemini_client = genai.Client(api_key=settings.gemini_api_key)
                self.gemini_model = settings.gemini_model
                logger.info(f"VocabService initialized Gemini Client with model '{self.gemini_model}'.")
            except Exception as e:
                logger.warning(f"VocabService could not init Gemini Client: {e}")

    # ── Public API ─────────────────────────────────────────────────────────────

    async def extract_and_save_vocab(
        self,
        sentence_text: str,
        top_k: int = 5,
        translated_sentence: Optional[str] = None,
        is_translated: bool = False,
        source_lang: Optional[str] = None,
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
        pos_map = {"NOUN": "n", "VERB": "v", "ADJ": "a", "ADV": "r", "PROPN": "n"}
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
            is_phrase = t_info.get("is_phrase", False)
            wn_pos    = pos_map.get(pos_tag, None)

            synsets = t_info.get("synsets") or self._get_synsets(lemma, pos_tag)

            # ── Case: no synsets at all → translate directly ───────────────────
            if not synsets:
                vi_meanings = await self._translate_direct(
                    word=display_word,
                    sentence_text=sentence_text,
                    translated_sentence=translated_sentence,
                )
                item = self._build_direct_item(
                    word=display_word,
                    sentence_text=sentence_text,
                    vi_meanings=vi_meanings,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                )
                self.repo.save_vocab_item(item)
                vocab_items.append(item)
                continue

            # ── Case: only 1 sense OR 1 sense with no synonyms → translate directly ──
            single_sense_no_wsd = False
            if len(synsets) == 1:
                single_sense_no_wsd = True
            elif len(synsets) > 1:
                # Check if all senses combined have no usable synonyms
                all_synonyms = []
                for syn in synsets:
                    raw_lemmas = [l.name().replace("_", " ") for l in syn.lemmas()]
                    syn_lemmas = [l for l in raw_lemmas
                                  if l.lower() != lemma.lower() and l.lower() != display_word.lower()]
                    all_synonyms.extend(syn_lemmas)
                # Only treat as "no synonyms" when exactly 1 synset has no external synonyms
                if len(synsets) == 1 and not all_synonyms:
                    single_sense_no_wsd = True

            if single_sense_no_wsd:
                only_syn = synsets[0]
                definition = only_syn.definition() or ""
                examples = only_syn.examples()
                raw_lemmas = [l.name().replace("_", " ") for l in only_syn.lemmas()]
                synonyms = [l for l in raw_lemmas
                            if l.lower() != lemma.lower() and l.lower() != display_word.lower()][:max_synonyms]
                antonyms = [l.antonyms()[0].name().replace("_", " ")
                            for l in only_syn.lemmas() if l.antonyms()][:max_synonyms]

                vi_meanings = await self._get_vi_meanings(
                    word=display_word,
                    synset_name=only_syn.name(),
                    best_substitutes=synonyms[:2],
                    definition=definition,
                    sentence_text=sentence_text,
                    translated_sentence=translated_sentence,
                )

                # Fallback: direct translation if still empty
                if not vi_meanings:
                    vi_meanings = await self._translate_direct(
                        word=display_word,
                        sentence_text=sentence_text,
                        translated_sentence=translated_sentence,
                    )

                item = VocabItem(
                    word=display_word,
                    contextual_meaning=", ".join(vi_meanings[:3]) if vi_meanings else None,
                    context_sentence=sentence_text,
                    simple_example=examples[0] if examples else None,
                    concept_definition=definition or None,
                    synonyms=synonyms,
                    antonyms=antonyms,
                    context_id=f"ctx_wn_{only_syn.name()}",
                    similarity_score=1.0,
                    is_translated=is_translated,
                    source_lang=source_lang,
                    is_phrase=is_phrase,
                    is_trusted=True,
                    wsd_method_scores=None,
                )
                self.repo.save_vocab_item(item)
                vocab_items.append(item)
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
                raw_lemmas = [l.name().replace("_", " ") for l in syn.lemmas()]
                syn_lemmas = [l for l in raw_lemmas if l.lower() != lemma.lower() and l.lower() != display_word.lower()]
                antonyms   = [l.antonyms()[0].name().replace("_", " ")
                              for l in syn.lemmas() if l.antonyms()]

                # Fallback to definition keywords if synset has no external synonyms
                if not syn_lemmas and syn.definition():
                    def_words = [
                        w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', syn.definition())
                        if w.lower() not in stopwords and w.lower() != lemma.lower() and w.lower() != display_word.lower()
                    ]
                    syn_lemmas = def_words[:4]

                # Max synonyms per sense rule (configurable via wsd_max_synonyms)
                syn_lemmas = syn_lemmas[:max_synonyms]

                synset_info[syn_name] = {
                    "synset": syn,
                    "pos": syn.pos(),
                    "definition": syn.definition(),
                    "examples": syn.examples(),
                    "synonyms": syn_lemmas,
                    "antonyms": antonyms,
                    "context_id": f"ctx_wn_{syn_name}",
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
                    inflected = self._inflect_word(s_lemma, tag)

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

            vi_meanings = await self._get_vi_meanings(
                word=display_word,
                synset_name=best_synset_name,
                best_substitutes=best_subs,
                definition=best_info["definition"],
                sentence_text=sentence_text,
                translated_sentence=translated_sentence,
            )

            synonyms = best_info["synonyms"][:max_synonyms]
            antonyms = best_info["antonyms"][:max_synonyms]
            simple_ex = (best_info["examples"][0]
                         if best_info.get("examples") else None)

            item = VocabItem(
                word=display_word,
                contextual_meaning=", ".join(vi_meanings[:3]) if vi_meanings else None,
                context_sentence=sentence_text,
                simple_example=simple_ex,
                concept_definition=best_info.get("definition") or None,
                synonyms=synonyms,
                antonyms=antonyms,
                context_id=best_info["context_id"],
                similarity_score=round(best_score, 4),
                is_translated=is_translated,
                source_lang=source_lang,
                is_phrase=is_phrase,
                is_trusted=is_trusted,
                wsd_method_scores=synset_method_details.get(best_synset_name),
            )
            self.repo.save_vocab_item(item)
            vocab_items.append(item)

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

            # 1. Multi-word Phrase Scanning (n = 4 down to 2)
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
                        if t.pos_ in ("NOUN", "VERB", "ADJ", "ADV", "PROPN"):
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
                            "synsets": synsets,
                        })

                        for idx in range(i, i + n):
                            used_indices.add(idx)

            # 2. Single word target extraction for unconsumed tokens
            for idx, token in enumerate(doc):
                if idx in used_indices:
                    continue
                if (token.is_alpha and not token.is_stop
                        and token.pos_ in ("NOUN", "VERB", "ADJ", "ADV", "PROPN")):
                    targets.append({
                        "idx": idx,
                        "span_len": 1,
                        "surface": token.text,
                        "lemma": token.lemma_.lower(),
                        "display_word": token.lemma_.lower(),
                        "pos": token.pos_,
                        "tag": token.tag_,
                        "doc_tokens_text": doc_tokens_text,
                        "is_phrase": False,
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
        """Inflect lemma into surface form matching grammatical tag."""
        try:
            infl = lemminflect.getInflection(lemma, tag=tag)
            if infl and len(infl) > 0:
                return infl[0]
        except Exception as e:
            logger.debug(f"Inflection failed for '{lemma}' ({tag}): {e}")
        return lemma

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

    async def _get_vi_meanings(
        self,
        word: str,
        synset_name: str,
        best_substitutes: List[str],
        definition: str,
        sentence_text: str,
        translated_sentence: Optional[str] = None,
    ) -> List[str]:
        """
        Build Vietnamese meanings in priority order:
        P1 (Gemini)   → translate target word IN CONTEXT using Gemini AI Model
        P2 (online)   → fallback translate best synonym substitutes via Google / MyMemory
        P3 (verify)   → promote meanings appearing in translated_sentence
        """
        # P1: Gemini AI Contextual Translation
        gemini_vi = await self._translate_with_gemini(word, sentence_text, definition)
        if gemini_vi:
            if translated_sentence:
                return self._verify_against_translation(gemini_vi, translated_sentence)
            return gemini_vi

        # P2: Online translators fallback (Google / MyMemory)
        candidates: List[str] = []
        probes = list(best_substitutes[:2])
        if definition:
            probes.append(" ".join(definition.split()[:5]))

        for term in probes:
            if candidates:
                break
            await asyncio.sleep(0.35)
            candidates.extend(await self._translate_term(term, "en", "vi"))

        if not candidates:
            for term in probes:
                if candidates:
                    break
                await asyncio.sleep(0.25)
                candidates.extend(await self._translate_term(term, "en-US", "vi-VN", engine="mymemory"))

        if candidates and translated_sentence:
            return self._verify_against_translation(candidates, translated_sentence)

        if candidates:
            return candidates[:3]

        return []

    async def _translate_with_gemini(
        self,
        word: str,
        sentence_text: str,
        definition: str,
    ) -> List[str]:
        """Use Gemini Client to translate target word in exact sentence context."""
        if not self.gemini_client:
            return []
        prompt = (
            f"Sentence: \"{sentence_text}\"\n"
            f"Target word: \"{word}\" (concept: {definition})\n"
            f"Translate ONLY the target word \"{word}\" as used in this exact sentence context into 1-3 natural Vietnamese dictionary meanings separated by commas.\n"
            f"Do NOT translate the sentence. Return ONLY the Vietnamese word meanings."
        )
        try:
            resp = await self.gemini_client.aio.models.generate_content(
                model=self.gemini_model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(temperature=0.1),
            )
            if resp and resp.text:
                clean_text = resp.text.strip()
                if "(NOTICE:" in clean_text:
                    clean_text = clean_text[:clean_text.index("(NOTICE:")].strip()
                meanings = [m.strip().lower() for m in clean_text.split(",") if m.strip()]
                return meanings[:3]
        except Exception as e:
            logger.debug(f"Gemini word translation failed for '{word}': {e}")
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

    async def _translate_term(
        self,
        term: str,
        source: str,
        target: str,
        engine: str = "google",
    ) -> List[str]:
        """Translate a term and return clean tokens."""
        try:
            if engine == "mymemory":
                result = await asyncio.to_thread(
                    MyMemoryTranslator(source=source, target=target).translate, term)
            else:
                try:
                    result = await asyncio.to_thread(
                        GoogleTranslator(source=source, target=target).translate, term)
                except Exception as g_err:
                    logger.debug(f"[google] translate '{term}' error: {g_err}, trying mymemory fallback")
                    result = await asyncio.to_thread(
                        MyMemoryTranslator(source="en-US", target="vi-VN").translate, term)

            if not result:
                return []
            if "(NOTICE:" in result:
                result = result[:result.index("(NOTICE:")].strip()
            if result.strip().lower() == term.lower():
                return []

            return [m.strip().lower() for m in result.split(",") if m.strip()]
        except Exception as e:
            logger.debug(f"[{engine}] translate '{term}': {e}")
            return []

    async def _translate_direct(
        self,
        word: str,
        sentence_text: str,
        translated_sentence: str = "",
    ) -> List[str]:
        """Directly translate a word/phrase using Gemini AI or Google/MyMemory fallback."""
        gemini_vi = await self._translate_with_gemini(word, sentence_text, definition="")
        if gemini_vi:
            if translated_sentence:
                return self._verify_against_translation(gemini_vi, translated_sentence)
            return gemini_vi

        candidates: List[str] = await self._translate_term(word, "en", "vi")
        if not candidates:
            candidates = await self._translate_term(word, "en-US", "vi-VN", engine="mymemory")

        if candidates and translated_sentence:
            return self._verify_against_translation(candidates, translated_sentence)

        return candidates[:3]

    def _build_direct_item(
        self,
        word: str,
        sentence_text: str,
        vi_meanings: List[str],
        is_translated: bool = False,
        source_lang: Optional[str] = None,
        is_phrase: bool = False,
    ) -> VocabItem:
        return VocabItem(
            word=word,
            contextual_meaning=", ".join(vi_meanings[:3]) if vi_meanings else None,
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
        )

    def _get_synsets(self, word_input, pos_tag: str = ""):
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
