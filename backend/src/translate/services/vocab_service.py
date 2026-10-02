"""
Contextual Word Sense Disambiguation (WSD) & Meaning Extraction Pipeline

Pipeline Architecture (Inflected Synonym Substitution + Trace-Back):
  1. SpaCy Token & POS Analysis:
     - Parse sentence into tokens with surface form, lemma, POS, POS tag (e.g. VBZ, NNS, VBD), and index.
  2. Candidate Generation & Synonym Inflection:
     - Retrieve WordNet synsets for target token's lemma & POS.
     - Collect synonym lemmas for each synset (fallback to definition content words if 0 external synonyms).
     - Inflect each synonym lemma to match the exact grammatical tag of the target token via `lemminflect`
       (e.g., "operate" + VBZ -> "operates", "firm" + NNS -> "firms").
  3. Sentence Variant Generation:
     - Replace token at index `i` in original sentence with `inflected_synonym`.
  4. Embedding & Cosine Similarity:
     - Compute vector embedding for original sentence and each variant sentence.
     - Measure cosine similarity between original sentence vector and variant sentence vector.
   5. Top Variants & Synset Trace-Back:
      - Rank variant sentences by similarity.
      - Trace back variants to originating synsets & compute synset vote score.
      - Rerank with POS match bonus.
   6. Vietnamese Meaning & Sentence Verification:
      - Translate best substituting synonyms / sense definition.
      - If `translated_sentence` is provided, verify and promote Vietnamese terms present in it.
"""

from typing import List, Optional, Dict, Tuple
import re
import spacy
import lemminflect
from loguru import logger
import nltk
from nltk.corpus import wordnet as wn
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
    WSD Service using Inflected Synonym Substitution & Synset Trace-Back (WordNet data only).
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

        for pkg in ("wordnet", "omw-1.4", "punkt"):
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
        Analyse content target words using Inflected Synonym Substitution & Trace-Back WSD.
        """
        if not sentence_text or not sentence_text.strip():
            return VocabAnalysisResponse(sentence=sentence_text, vocabularies=[])

        sentence_words = [w.lower() for w in sentence_text.split() if w.isalpha()]
        target_tokens = self._extract_target_tokens(sentence_text)

        # Pre-embed original sentence
        original_vec = self.embedding_service.get_embedding(sentence_text)

        vocab_items: List[VocabItem] = []
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
            is_phrase = t_info.get("is_phrase", False)
            wn_pos    = pos_map.get(pos_tag, None)

            synsets = t_info.get("synsets") or self._get_synsets(lemma, pos_tag)
            if not synsets:
                vocab_items.append(
                    self._build_fallback_item(
                        word=display_word,
                        sentence_text=sentence_text,
                        pos_tag=pos_tag,
                        is_translated=is_translated,
                        source_lang=source_lang,
                        is_phrase=is_phrase,
                    )
                )
                continue

            # ── Stage 1 & 2: Candidates + Inflected Synonym Variants ─────────
            synset_info: Dict[str, dict] = {}
            variants: List[Tuple[str, str, str, str]] = []  # (var_sent, syn_lemma, inflected, synset_name)

            all_tokens_text = t_info["doc_tokens_text"]

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

                synset_info[syn_name] = {
                    "synset": syn,
                    "pos": syn.pos(),
                    "definition": syn.definition(),
                    "examples": syn.examples(),
                    "synonyms": syn_lemmas,
                    "antonyms": antonyms,
                    "context_id": f"ctx_wn_{syn_name}",
                }

                for s_lemma in syn_lemmas:
                    # Inflect synonym to match exact target token tag
                    inflected = self._inflect_word(s_lemma, tag)
                    
                    # Substitute token / phrase span at token_idx in sentence
                    var_words = (
                        all_tokens_text[:token_idx]
                        + [inflected]
                        + all_tokens_text[token_idx + span_len:]
                    )
                    var_sent = " ".join(var_words)

                    variants.append((var_sent, s_lemma, inflected, syn_name))

            # ── Stage 3: Embedding & Similarity Scoring ────────────────────────
            synonym_scores: List[Tuple[str, str, float]] = []  # (syn_lemma, synset_name, score)
            for var_sent, s_lemma, inflected, syn_name in variants:
                var_vec = self.embedding_service.get_embedding(var_sent)
                score   = self.embedding_service.compute_vector_similarity(original_vec, var_vec)
                synonym_scores.append((s_lemma, syn_name, score))

            # ── Stage 4: Sense Voting & Trace-Back ────────────────────────────
            synset_votes: Dict[str, float] = {}
            synset_syn_scores: Dict[str, List[float]] = {}
            for syn_lemma, syn_name, score in synonym_scores:
                synset_syn_scores.setdefault(syn_name, []).append(score)

            for syn_name, scores in synset_syn_scores.items():
                synset_votes[syn_name] = (
                    0.70 * max(scores) + 0.30 * (sum(scores) / len(scores))
                )

            top_k_senses = sorted(synset_votes.items(), key=lambda x: x[1], reverse=True)[:top_k]

            # ── Stage 5: Composite Reranking ──────────────────────────────────
            if not top_k_senses:
                best_synset_name = synsets[0].name()
                best_score = 1.0
            else:
                best_synset_name, best_score = self._rerank_senses(
                    target_pos=wn_pos,
                    top_k_senses=top_k_senses,
                )

            best_info = synset_info[best_synset_name]

            # ── Stage 6: Meaning Assignment & Translation ─────────────────────
            winning_synonyms = sorted(
                [(sl, score) for sl, sn, score in synonym_scores if sn == best_synset_name],
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

            synonyms = best_info["synonyms"][:5]
            antonyms = best_info["antonyms"][:5]
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
            )
            self.repo.save_vocab_item(item)
            vocab_items.append(item)

        return VocabAnalysisResponse(sentence=sentence_text, vocabularies=vocab_items)

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
                            "tag": "NNP" if pos_tag == "NOUN" else "VB",
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
                        and token.pos_ in ("NOUN", "VERB", "ADJ", "ADV")):
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
        """
        best_name, best_score = top_k_senses[0]

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
                result = await asyncio.to_thread(
                    GoogleTranslator(source=source, target=target).translate, term)

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
