from typing import List, Optional
from loguru import logger
import spacy
from spacy.tokens import Doc, Span
from src.config import get_settings
from src.translate.models.analysis_model import (
    AnalysisResponse,
    AnalysisToken,
    SentenceStructure,
    SentenceAnalysisInfo,
    SentenceFormType,
    SentenceComplexity,
    SentenceVoice,
    SentenceTense,
)
from src.translate.models.translate_model import TranslateResponse
from src.translate.models.input_chunk_model import Chunk, Sentence


class AnalysService:
    """Service to perform POS tagging, SVO structure analysis, sentence form/type, voice, complexity, and tense analysis based on rulebase."""

    def __init__(self):
        self._settings = get_settings()
        self.name_model = self._settings.spacy_model
        self.model = self._load_spacy()
        self.support_langs = ["en"]
        self.max_input_size = 500

    def _load_spacy(self):
        model_name = self.name_model
        try:
            model = spacy.load(model_name)
            logger.info(f"SpaCy model '{model_name}' loaded successfully.")
            return model
        except Exception as e:
            logger.warning(
                f"SpaCy model '{model_name}' could not be loaded: {e}. NLP analysis fallback enabled.")
            return None

    def is_availabel(self) -> bool:
        return self.model is not None

    async def analysis(
        self,
        lang: str,
        chunks: Optional[List[Chunk]] = None,
        sentences: Optional[List[Sentence]] = None,
        translated_item: Optional[TranslateResponse] = None,
    ):
        if lang not in self.support_langs:
            return

        texts_to_analyze: List[str] = []

        if sentences:
            for s in sentences:
                texts_to_analyze.append(s.sentence_text)
        elif chunks:
            for c in chunks:
                texts_to_analyze.append(c.chunk_text)
        elif translated_item:
            texts_to_analyze.append(translated_item.translated_text)

        for text in texts_to_analyze:
            if not text.strip():
                continue
            if self.model:
                doc = self.model(text)
                for sent in doc.sents:
                    yield self._analyze_single_sentence(sent, text)
            else:
                yield AnalysisResponse(
                    original_text=text,
                    tokens=[],
                    structure=SentenceStructure(),
                    sentence_info=SentenceAnalysisInfo()
                )

    def _analyze_single_sentence(self, sent: Span, original_text: str) -> AnalysisResponse:
        tokens = self.token_analysis(sent)
        structure = self.extract_structure(sent)
        info = self.analyze_sentence_rules(sent)

        return AnalysisResponse(
            original_text=sent.text,
            tokens=tokens,
            structure=structure,
            sentence_info=info,
            metadata={"sentence_start": sent.start_char, "sentence_end": sent.end_char}
        )

    def token_analysis(self, doc_or_span) -> List[AnalysisToken]:
        tokens_analysis = []
        for token in doc_or_span:
            tokens_analysis.append(
                AnalysisToken(
                    index=token.i,
                    text=token.text,
                    lemma=token.lemma_,
                    dictionary_form=token.lemma_,
                    pos=token.pos_,
                    tag=token.tag_,
                    morph=token.morph.to_dict(),
                    dependency=token.dep_,
                    head=token.head.text,
                    entity=token.ent_type_,
                    is_stop=token.is_stop,
                    is_alpha=token.is_alpha,
                    is_punct=token.is_punct,
                    like_num=token.like_num,
                )
            )
        return tokens_analysis

    def extract_structure(self, sent: Span) -> SentenceStructure:
        """Rule-based SVO (Subject-Verb-Object) and Clause structure extraction."""
        subj_tokens = []
        verb_tokens = []
        obj_tokens = []
        clause_tokens = []

        for token in sent:
            dep = token.dep_
            if dep in ("nsubj", "nsubjpass", "csubj", "csubjpass", "expl"):
                subj_tokens.append(token.text)
            elif dep in ("ROOT", "aux", "auxpass"):
                verb_tokens.append(token.text)
            elif dep in ("dobj", "pobj", "attr", "iobj", "oprd"):
                obj_tokens.append(token.text)
            elif dep in ("advcl", "relcl", "ccomp", "xcomp"):
                clause_tokens.append(f"{token.text} ({dep})")

        return SentenceStructure(
            subject=" ".join(subj_tokens) if subj_tokens else None,
            verb=" ".join(verb_tokens) if verb_tokens else None,
            object=" ".join(obj_tokens) if obj_tokens else None,
            clauses=clause_tokens,
        )

    def analyze_sentence_rules(self, sent: Span) -> SentenceAnalysisInfo:
        """Rulebase analysis for Sentence Form/Type, Voice, Complexity, and Tense."""
        text = sent.text.strip()
        first_token = sent[0] if len(sent) > 0 else None

        # 1. Form Type
        if text.endswith("?"):
            form_type = SentenceFormType.INTERROGATIVE
        elif text.endswith("!"):
            form_type = SentenceFormType.EXCLAMATORY
        elif first_token and (
            first_token.pos_ == "VERB" and first_token.tag_ == "VB"
            or first_token.text.lower() in ("please", "don't", "do")
            and len(sent) > 1 and sent[1].pos_ == "VERB"
        ) and not any(t.dep_ in ("nsubj", "nsubjpass") for t in sent):
            form_type = SentenceFormType.IMPERATIVE
        elif first_token and first_token.text.lower() in ("what", "how") and text.endswith("!"):
            form_type = SentenceFormType.EXCLAMATORY
        else:
            form_type = SentenceFormType.DECLARATIVE

        # 2. Voice (Active vs Passive)
        has_passive_aux = any(t.dep_ == "auxpass" for t in sent)
        has_passive_subj = any(t.dep_ == "nsubjpass" for t in sent)
        voice = SentenceVoice.PASSIVE if (has_passive_aux or has_passive_subj) else SentenceVoice.ACTIVE

        # 3. Complexity (Simple, Compound, Complex)
        has_subordinate = any(t.dep_ in ("advcl", "relcl", "ccomp", "mark") or t.pos_ == "SCONJ" for t in sent)
        has_coordinating = any(t.pos_ == "CCONJ" or t.dep_ == "cc" for t in sent)

        if has_subordinate and has_coordinating:
            complexity = SentenceComplexity.COMPOUND_COMPLEX
        elif has_subordinate:
            complexity = SentenceComplexity.COMPLEX
        elif has_coordinating:
            complexity = SentenceComplexity.COMPOUND
        else:
            complexity = SentenceComplexity.SIMPLE

        # 4. Rulebase Tense identification
        tense, explanation = self._determine_tense(sent)

        return SentenceAnalysisInfo(
            form_type=form_type,
            complexity=complexity,
            voice=voice,
            tense=tense,
            rule_explanation=explanation
        )

    def _determine_tense(self, sent: Span) -> (SentenceTense, str):
        aux_lemmas = [t.lemma_.lower() for t in sent if t.pos_ in ("AUX", "VERB") and t.dep_ in ("aux", "auxpass")]
        root_token = None
        for t in sent:
            if t.dep_ == "ROOT":
                root_token = t
                break

        has_will = "will" in aux_lemmas or "shall" in aux_lemmas
        has_have = "have" in aux_lemmas
        has_had = "have" in [t.lemma_.lower() for t in sent if t.tag_ == "VBD" and t.dep_ in ("aux", "auxpass")] or "had" in aux_lemmas
        has_be = any(l in ("be", "am", "is", "are", "was", "were", "been") for l in aux_lemmas)
        has_modal = any(l in ("can", "could", "may", "might", "should", "would", "must") for l in aux_lemmas)

        verb_tags = [t.tag_ for t in sent if t.pos_ in ("VERB", "AUX")]

        if has_modal:
            return SentenceTense.MODAL_CONDITIONAL, "Contains modal auxiliary verb"

        if has_will:
            if has_have and "been" in aux_lemmas and "VBG" in verb_tags:
                return SentenceTense.FUTURE_PERFECT_CONTINUOUS, "Rule: will + have + been + VBG"
            if has_have and "VBN" in verb_tags:
                return SentenceTense.FUTURE_PERFECT, "Rule: will + have + VBN"
            if "be" in aux_lemmas and "VBG" in verb_tags:
                return SentenceTense.FUTURE_CONTINUOUS, "Rule: will + be + VBG"
            return SentenceTense.FUTURE_SIMPLE, "Rule: will/shall + base verb"

        if has_had:
            if "been" in aux_lemmas and "VBG" in verb_tags:
                return SentenceTense.PAST_PERFECT_CONTINUOUS, "Rule: had + been + VBG"
            if "VBN" in verb_tags or "been" in aux_lemmas:
                return SentenceTense.PAST_PERFECT, "Rule: had + VBN"

        if has_have and not has_had:
            if "been" in aux_lemmas and "VBG" in verb_tags:
                return SentenceTense.PRESENT_PERFECT_CONTINUOUS, "Rule: have/has + been + VBG"
            if "VBN" in verb_tags or "been" in aux_lemmas:
                return SentenceTense.PRESENT_PERFECT, "Rule: have/has + VBN"

        if any(t.tag_ in ("VBD",) or t.text.lower() in ("was", "were") for t in sent if t.pos_ in ("AUX", "VERB")):
            if "VBG" in verb_tags:
                return SentenceTense.PAST_CONTINUOUS, "Rule: was/were + VBG"
            return SentenceTense.PAST_SIMPLE, "Rule: past form verb (VBD)"

        if any(t.tag_ in ("VBP", "VBZ") or t.text.lower() in ("am", "is", "are") for t in sent if t.pos_ in ("AUX", "VERB")):
            if "VBG" in verb_tags:
                return SentenceTense.PRESENT_CONTINUOUS, "Rule: am/is/are + VBG"
            return SentenceTense.PRESENT_SIMPLE, "Rule: present tense verb (VBP/VBZ)"

        if root_token and root_token.tag_ in ("VBP", "VBZ", "VB"):
            return SentenceTense.PRESENT_SIMPLE, "Rule: root verb present form"

        return SentenceTense.UNKNOWN, "Default fallback rule"
