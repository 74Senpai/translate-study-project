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
     - Rerank with domain context boost + POS match bonus.
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
    WSD Service using Inflected Synonym Substitution & Synset Trace-Back.
    """

    # ── Offline sense → Vietnamese map ────────────────────────────────────────
    _SENSE_VI_MAP: Dict[str, List[str]] = {
        # run
        "run.v.01": ["chạy", "di chuyển nhanh"],
        "run.v.02": ["vận hành", "điều hành"],
        "run.v.03": ["chạy bộ"],
        "run.v.04": ["quản lý", "điều hành"],
        "run.v.05": ["vận hành", "hoạt động"],
        "run.v.06": ["ứng cử", "tranh cử"],
        "run.v.18": ["xảy ra thường xuyên", "phổ biến"],
        "run.v.26": ["chạy", "di chuyển"],
        "run.v.30": ["chạy", "di chuyển", "diễn ra"],
        "race.v.01": ["đua", "thi đua"],
        "race.v.02": ["đua tốc độ", "chạy thi"],
        "campaign.v.01": ["quản lý", "điều hành", "ứng cử"],
        "operate.v.01": ["vận hành", "điều hành", "quản lý"],
        # fast
        "fast.a.01": ["nhanh", "nhanh nhẹn"],
        "fast.a.04": ["chặt", "vững chắc"],
        "fast.r.01": ["nhanh", "nhanh chóng"],
        "fast.r.02": ["chắc chắn", "vững chặt"],
        # company
        "company.n.01": ["công ty", "doanh nghiệp"],
        "company.n.02": ["bầu bạn", "bạn đồng hành"],
        "company.n.03": ["đoàn thể", "nhóm người"],
        # education
        "teach.v.01": ["dạy", "giảng dạy"],
        "teach.v.02": ["giảng dạy", "hướng dẫn"],
        "learn.v.01": ["học", "tiếp thu"],
        "study.v.01": ["học", "nghiên cứu"],
        "study.v.02": ["nghiên cứu", "tìm hiểu"],
        "student.n.01": ["học sinh", "sinh viên"],
        "pupil.n.01": ["học sinh"],
        "school.n.01": ["trường học"],
        "school.n.06": ["trường học", "cơ sở giáo dục"],
        "educate.v.01": ["giáo dục", "đào tạo"],
        "class.n.01": ["lớp học"],
        "teacher.n.01": ["giáo viên", "thầy cô"],
        # tech
        "process.v.01": ["xử lý", "chế biến"],
        "process.v.02": ["xử lý", "giải quyết"],
        "process.v.03": ["xử lý", "tính toán"],
        "process.n.01": ["quy trình", "tiến trình"],
        "datum.n.01": ["dữ liệu", "thông tin"],
        "data.n.01": ["dữ liệu"],
        "algorithm.n.01": ["thuật toán"],
        "software.n.01": ["phần mềm"],
        "develop.v.01": ["phát triển", "xây dựng"],
        "develop.v.02": ["phát triển", "tạo ra"],
        "design.v.01": ["thiết kế"],
        "design.n.01": ["thiết kế", "mô hình"],
        "intelligence.n.01": ["trí tuệ", "thông minh"],
        "intelligence.n.02": ["trí thông minh"],
        "language.n.01": ["ngôn ngữ", "tiếng"],
        "engineer.n.01": ["kỹ sư"],
        # adverbs
        "efficiently.r.01": ["hiệu quả", "có hiệu suất"],
        "effectively.r.01": ["hiệu quả"],
        "quickly.r.01": ["nhanh chóng"],
        "slowly.r.01": ["chậm rãi"],
        "well.r.01": ["tốt", "giỏi"],
        # adjectives
        "smart.a.01": ["thông minh"],
        "smart.a.02": ["thông minh", "sắc sảo"],
        "good.a.01": ["tốt", "giỏi"],
        "large.a.01": ["lớn", "rộng"],
        "small.a.01": ["nhỏ"],
        "new.a.01": ["mới"],
        "old.a.01": ["cũ", "già"],
        "high.a.01": ["cao"],
        "low.a.01": ["thấp"],
        # family / social
        "family.n.01": ["gia đình"],
        "family.n.02": ["gia đình", "người thân"],
        "family.n.04": ["dòng dõi gia đình", "gia tộc"],
        "talent.n.01": ["tài năng"],
        "talent.n.02": ["người có tài", "nhân tài"],
        "musical.a.01": ["âm nhạc", "có tính nhạc"],
        "musical.a.02": ["âm nhạc", "thuộc về âm nhạc"],
    }

    # ── Domain keyword sets for context boosting ───────────────────────────────
    _DOMAIN_KEYWORDS: Dict[str, List[str]] = {
        "business":  ["company", "firm", "business", "organization", "enterprise",
                      "manage", "manager", "office", "ceo", "startup", "corporation"],
        "motion":    ["fast", "slow", "quickly", "speed", "sprint", "walk", "race",
                      "hurry", "rapidly", "rush"],
        "tech":      ["algorithm", "data", "process", "software", "compute", "code",
                      "program", "system", "network", "database"],
        "education": ["student", "teacher", "school", "class", "learn", "study",
                      "university", "lecture", "exam", "course"],
    }
    _DOMAIN_SENSE_AFFINITY: Dict[str, List[str]] = {
        "business":  ["operate.v", "run.v.02", "run.v.04", "run.v.05", "campaign.v", "company.n.01", "company.n.02"],
        "motion":    ["run.v.01", "run.v.03", "run.v.26", "run.v.30", "race.v", "scat.v", "fast.r.01", "fast.a.01"],
        "tech":      ["process.v", "algorithm.n", "data.n", "datum.n", "develop.v"],
        "education": ["teach.v", "learn.v", "study.v", "student.n", "school.n.01", "school.n.06"],
    }

    # ── Static fallback when WordNet has nothing ───────────────────────────────
    _FALLBACK_DICT: Dict[str, List[str]] = {
        "run": ["chạy", "quản lý", "vận hành"],
        "company": ["công ty", "doanh nghiệp"],
        "develop": ["phát triển"],
        "algorithm": ["thuật toán"],
        "engineer": ["kỹ sư"],
        "design": ["thiết kế"],
        "software": ["phần mềm"],
        "study": ["nghiên cứu", "học tập"],
        "intelligence": ["trí tuệ"],
        "process": ["xử lý", "quy trình"],
        "language": ["ngôn ngữ"],
        "fast": ["nhanh"],
        "smart": ["thông minh"],
        "teacher": ["giáo viên"],
    }

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
            surface   = t_info["surface"]
            lemma     = t_info["lemma"]
            pos_tag   = t_info["pos"]
            tag       = t_info["tag"]
            wn_pos    = pos_map.get(pos_tag, None)

            synsets = self._get_synsets(lemma, pos_tag)
            if not synsets:
                vocab_items.append(self._build_fallback_item(lemma, sentence_text, pos_tag))
                continue

            # ── Stage 1 & 2: Candidates + Inflected Synonym Variants ─────────
            synset_info: Dict[str, dict] = {}
            variants: List[Tuple[str, str, str, str]] = []  # (var_sent, syn_lemma, inflected, synset_name)

            all_tokens_text = t_info["doc_tokens_text"]

            for syn in synsets:
                syn_name = syn.name()
                raw_lemmas = [l.name().replace("_", " ") for l in syn.lemmas()]
                syn_lemmas = [l for l in raw_lemmas if l.lower() != lemma.lower()]
                antonyms   = [l.antonyms()[0].name().replace("_", " ")
                              for l in syn.lemmas() if l.antonyms()]

                # Fallback to definition keywords if synset has no external synonyms
                if not syn_lemmas and syn.definition():
                    def_words = [
                        w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', syn.definition())
                        if w.lower() not in stopwords and w.lower() != lemma.lower()
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
                    
                    # Substitute token at token_idx in sentence
                    var_words = list(all_tokens_text)
                    var_words[token_idx] = inflected
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
            best_synset_name, best_score = self._rerank_senses(
                sentence_words=sentence_words,
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
                word=lemma,
                synset_name=best_synset_name,
                best_substitutes=best_subs,
                definition=best_info["definition"],
                sentence_text=sentence_text,
                translated_sentence=translated_sentence,
            )

            synonyms = best_info["synonyms"][:5]
            antonyms = best_info["antonyms"][:5]
            simple_ex = (best_info["examples"][0]
                         if best_info.get("examples") else f"Example for {lemma}.")

            item = VocabItem(
                word=lemma,
                contextual_meaning=", ".join(vi_meanings[:3]),
                context_sentence=sentence_text,
                simple_example=simple_ex,
                concept_definition=best_info.get("definition", ""),
                synonyms=synonyms,
                antonyms=antonyms,
                context_id=best_info["context_id"],
                similarity_score=round(best_score, 4),
            )
            self.repo.save_vocab_item(item)
            vocab_items.append(item)

        return VocabAnalysisResponse(sentence=sentence_text, vocabularies=vocab_items)

    # ── Private Helpers ────────────────────────────────────────────────────────

    def _extract_target_tokens(self, sentence_text: str) -> List[dict]:
        """Extract content target tokens with positional index and POS tag."""
        if self.nlp is not None:
            doc = self.nlp(sentence_text)
            doc_tokens_text = [t.text for t in doc]
            targets = []
            for idx, token in enumerate(doc):
                if (token.is_alpha and not token.is_stop
                        and token.pos_ in ("NOUN", "VERB", "ADJ", "ADV")):
                    targets.append({
                        "idx": idx,
                        "surface": token.text,
                        "lemma": token.lemma_.lower(),
                        "pos": token.pos_,
                        "tag": token.tag_,
                        "doc_tokens_text": doc_tokens_text,
                    })
            return targets
        else:
            words = sentence_text.split()
            return [
                {
                    "idx": i,
                    "surface": w,
                    "lemma": w.lower(),
                    "pos": "NOUN",
                    "tag": "NN",
                    "doc_tokens_text": words,
                }
                for i, w in enumerate(words)
                if w.isalpha() and len(w) > 2
            ]

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
        sentence_words: List[str],
        target_pos: Optional[str],
        top_k_senses: List[Tuple[str, float]],
    ) -> Tuple[str, float]:
        """
        Composite reranking: 0.70 * vote_score + 0.20 * domain_boost + 0.10 * pos_bonus.
        """
        sentence_set = set(sentence_words)

        domain_hits: Dict[str, int] = {}
        for domain, kws in self._DOMAIN_KEYWORDS.items():
            domain_hits[domain] = len(sentence_set & set(kws))

        best_name, best_score = top_k_senses[0]

        for syn_name, vote_score in top_k_senses:
            sense_pos = syn_name.split(".")[1] if syn_name.count(".") >= 1 else ""
            pos_bonus = 1.0 if (target_pos and sense_pos == target_pos) else 0.5

            domain_boost = 0.0
            for domain, hit_count in domain_hits.items():
                if hit_count > 0:
                    for prefix in self._DOMAIN_SENSE_AFFINITY.get(domain, []):
                        if syn_name.startswith(prefix):
                            domain_boost = min(1.0, hit_count * 0.5)
                            break

            composite = 0.70 * vote_score + 0.20 * domain_boost + 0.10 * pos_bonus
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
        P1 (instant)  → offline _SENSE_VI_MAP lookup by exact synset name
        P2 (Gemini)   → translate target word IN CONTEXT using Gemini AI Model
        P3 (online)   → fallback translate best synonym substitutes via Google / MyMemory
        P4 (verify)   → promote meanings appearing in translated_sentence
        P5 (fallback) → _FALLBACK_DICT
        """
        # P1: Offline exact map
        offline = self._lookup_vi(synset_name)
        if offline:
            if translated_sentence:
                return self._verify_against_translation(offline, translated_sentence)
            return offline

        # P2: Gemini AI Contextual Translation
        gemini_vi = await self._translate_with_gemini(word, sentence_text, definition)
        if gemini_vi:
            if translated_sentence:
                return self._verify_against_translation(gemini_vi, translated_sentence)
            return gemini_vi

        # P3: Online translators fallback (Google / MyMemory)
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

        return self._FALLBACK_DICT.get(word, [word])

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

    def _lookup_vi(self, synset_name: str) -> List[str]:
        """Exact lookup from offline sense map."""
        if synset_name in self._SENSE_VI_MAP:
            return list(self._SENSE_VI_MAP[synset_name])
        return []

    def _build_fallback_item(self, word: str, sentence_text: str, pos_tag: str) -> VocabItem:
        vi = self._FALLBACK_DICT.get(word, [word])
        return VocabItem(
            word=word,
            contextual_meaning=", ".join(vi),
            context_sentence=sentence_text,
            simple_example=f"Example using {word}.",
            concept_definition=f"No WordNet definition found for '{word}'.",
            synonyms=[], antonyms=[],
            context_id=f"ctx_fallback_{word}",
            similarity_score=0.0,
        )

    def _get_synsets(self, word: str, pos_tag: str):
        pos_map = {"NOUN": wn.NOUN, "VERB": wn.VERB, "ADJ": wn.ADJ, "ADV": wn.ADV}
        wn_pos = pos_map.get(pos_tag)
        try:
            return wn.synsets(word, pos=wn_pos) if wn_pos else wn.synsets(word)
        except Exception:
            return []
