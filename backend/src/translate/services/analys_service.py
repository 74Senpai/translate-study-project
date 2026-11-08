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
        info = self.analyze_sentence_rules(sent, structure)

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

    def _is_clause_token(self, token, head_node) -> bool:
        """Check if a token belongs to a nested clause below head_node."""
        clause_deps = {"relcl", "advcl", "ccomp", "acl", "csubj", "csubjpass"}
        curr = token
        while curr != head_node and curr.head != curr:
            if curr.dep_ in clause_deps:
                return True
            curr = curr.head
        return False

    def _get_phrase_text(self, token, head_node=None) -> str:
        """Extract clean phrase text for a syntactic node, excluding punctuation and nested clauses."""
        target_head = head_node if head_node is not None else token
        tokens = [
            t.text for t in token.subtree
            if not t.is_punct and not self._is_clause_token(t, target_head)
        ]
        return " ".join(tokens) if tokens else token.text

    def extract_structure(self, sent: Span) -> SentenceStructure:
        """Strict rule-based sentence structure extraction (S-V, S-V-O, S-V-C, S-V-O-O, S-V-O-C, S-V-A, Imperative, Passive).

        If the sentence does not match a valid clause structure (e.g. phrase, fragment, word),
        returns pattern='Không xác định' and is_valid=False without guessing.
        """
        root = sent.root

        # 1. Finite predicate / verb verification
        has_verb = False
        if root.pos_ in ("VERB", "AUX"):
            aux_children = [c for c in root.children if c.dep_ in ("aux", "auxpass")]
            if root.tag_ in ("VBG", "VBN") and not aux_children:
                has_verb = False
            elif root.tag_ == "VB" and any(c.dep_ == "aux" and c.text.lower() == "to" for c in root.children):
                has_verb = False
            else:
                has_verb = True
        else:
            cop = [c for c in root.children if c.dep_ in ("cop", "aux")]
            if cop:
                has_verb = True

        # Check dependent clause fragment (e.g. 'Because it was raining.')
        if any(c.dep_ == "mark" for c in root.children):
            return SentenceStructure(pattern="Không xác định", is_valid=False)

        # 2. Subject detection
        subjs = [c for c in root.children if c.dep_ in ("nsubj", "nsubjpass", "csubj", "csubjpass", "expl")]
        if not subjs and root.dep_ == "conj" and root.head:
            subjs = [c for c in root.head.children if c.dep_ in ("nsubj", "nsubjpass", "csubj", "csubjpass", "expl")]

        is_passive = (
            any(c.dep_ == "auxpass" for c in root.children)
            or any(s.dep_ in ("nsubjpass", "csubjpass") for s in subjs)
        )

        # 3. Imperative detection
        is_imperative = False
        if not subjs and not is_passive and root.pos_ in ("VERB", "AUX") and root.tag_ == "VB":
            first_token = sent[0] if len(sent) > 0 else None
            if first_token == root or (
                first_token and first_token.text.lower() in ("please", "never", "do", "don't", "dont")
            ):
                is_imperative = True

        # 4. Exclamatory formula detection
        is_exclamatory = False
        first_lower = sent[0].text.lower() if len(sent) > 0 else ""
        if sent.text.strip().endswith("!") and first_lower in ("what", "how"):
            is_exclamatory = True

        # Strictly enforce valid grammatical sentence requirements
        if not ((has_verb and (subjs or is_imperative)) or is_exclamatory):
            return SentenceStructure(
                pattern="Không xác định",
                is_valid=False,
                subject=None,
                verb=None,
                object=None,
                clauses=[]
            )

        # Extract components
        subj_text = self._get_phrase_text(subjs[0]) if subjs else None

        verb_tokens = [c for c in root.children if c.dep_ in ("aux", "auxpass", "prt", "neg")] + [root]
        verb_tokens.sort(key=lambda t: t.i)
        verb_text = " ".join([t.text for t in verb_tokens]) if has_verb else None

        dobjs = [c for c in root.children if c.dep_ == "dobj"]
        dobj_text = self._get_phrase_text(dobjs[0]) if dobjs else None

        dat_objs = [c for c in root.children if c.dep_ in ("dative", "iobj")]
        iobj_text = self._get_phrase_text(dat_objs[0]) if dat_objs else None

        attrs = [c for c in root.children if c.dep_ in ("attr", "acomp")]
        oprds = [c for c in root.children if c.dep_ in ("oprd",) or (c.dep_ == "xcomp" and dobjs)]
        comp_token = attrs[0] if attrs else (oprds[0] if oprds else None)
        comp_text = self._get_phrase_text(comp_token) if comp_token else None

        preps = [c for c in root.children if c.dep_ in ("prep", "agent", "advmod", "npadvmod")]
        clause_tokens = [
            f"{self._get_phrase_text(c)} ({c.dep_})"
            for c in root.children
            if c.dep_ in ("advcl", "relcl", "ccomp", "xcomp")
        ]

        # Canonical pattern determination
        if is_exclamatory:
            pattern = "Cảm thán (Exclamatory)"
        elif is_passive:
            if dobjs:
                pattern = "S-V-O (Bị động)"
            elif preps:
                pattern = "S-V-A (Bị động)"
            else:
                pattern = "S-V (Bị động)"
        elif is_imperative:
            if dat_objs and dobjs:
                pattern = "V-O-O (Mệnh lệnh)"
            elif dobjs and oprds:
                pattern = "V-O-C (Mệnh lệnh)"
            elif attrs:
                pattern = "V-C (Mệnh lệnh)"
            elif dobjs:
                pattern = "V-O (Mệnh lệnh)"
            elif preps:
                pattern = "V-A (Mệnh lệnh)"
            else:
                pattern = "V (Mệnh lệnh)"
        else:
            if (dat_objs and dobjs) or len(dobjs) >= 2:
                pattern = "S-V-O-O"
            elif dobjs and oprds:
                pattern = "S-V-O-C"
            elif attrs:
                pattern = "S-V-C"
            elif dobjs:
                pattern = "S-V-O"
            elif preps:
                pattern = "S-V-A"
            else:
                pattern = "S-V"

        return SentenceStructure(
            pattern=pattern,
            is_valid=True,
            subject=subj_text,
            verb=verb_text,
            object=dobj_text,
            indirect_object=iobj_text,
            complement=comp_text,
            clauses=clause_tokens,
        )

    def analyze_sentence_rules(self, sent: Span, structure: Optional[SentenceStructure] = None) -> SentenceAnalysisInfo:
        """Rulebase analysis for Sentence Form/Type, Voice, Complexity, and Tense.

        If the sentence structure is not valid, strictly returns UNKNOWN values without arbitrary guessing.
        """
        if structure is None:
            structure = self.extract_structure(sent)

        if not structure.is_valid:
            return SentenceAnalysisInfo(
                form_type=SentenceFormType.UNKNOWN,
                complexity=SentenceComplexity.UNKNOWN,
                voice=SentenceVoice.UNKNOWN,
                tense=SentenceTense.UNKNOWN,
                rule_explanation="Không xác định: Đoạn văn bản không tạo thành cấu trúc câu hoàn chỉnh (thiếu chủ ngữ hoặc vị ngữ hợp lệ)."
            )

        text = sent.text.strip()
        is_imperative = "Mệnh lệnh" in structure.pattern
        is_exclamatory = "Cảm thán" in structure.pattern

        # 1. Form Type
        has_question_syntax = (
            text.endswith("?") and (
                any(t.dep_ == "aux" and t.i < (sent[0].i + 2) for t in sent)
                or sent[0].text.lower() in (
                    "what", "who", "which", "where", "when", "why", "how", "whose", "whom",
                    "is", "are", "am", "was", "were", "do", "does", "did", "can", "could", "will", "would", "have", "has", "had"
                )
            )
        )

        if text.endswith("?") and has_question_syntax:
            form_type = SentenceFormType.INTERROGATIVE
        elif is_imperative:
            form_type = SentenceFormType.IMPERATIVE
        elif is_exclamatory:
            form_type = SentenceFormType.EXCLAMATORY
        elif structure.subject and structure.verb:
            form_type = SentenceFormType.DECLARATIVE
        else:
            form_type = SentenceFormType.UNKNOWN

        # 2. Voice
        if "Bị động" in structure.pattern:
            voice = SentenceVoice.PASSIVE
        elif structure.is_valid:
            voice = SentenceVoice.ACTIVE
        else:
            voice = SentenceVoice.UNKNOWN

        # 3. Complexity
        has_compound_clause = any(
            t.dep_ == "conj" and t.pos_ in ("VERB", "AUX") and any("subj" in c.dep_ for c in t.children)
            for t in sent
        )
        has_subordinate = any(
            t.dep_ in ("advcl", "relcl", "ccomp") or (t.pos_ == "SCONJ" and t.dep_ == "mark")
            for t in sent
        )

        if has_compound_clause and has_subordinate:
            complexity = SentenceComplexity.COMPOUND_COMPLEX
        elif has_compound_clause:
            complexity = SentenceComplexity.COMPOUND
        elif has_subordinate:
            complexity = SentenceComplexity.COMPLEX
        else:
            complexity = SentenceComplexity.SIMPLE

        # 4. Tense
        tense, explanation = self._determine_tense(sent, structure.is_valid, is_imperative)

        return SentenceAnalysisInfo(
            form_type=form_type,
            complexity=complexity,
            voice=voice,
            tense=tense,
            rule_explanation=explanation
        )

    def _determine_tense(self, sent: Span, is_valid: bool = True, is_imperative: bool = False) -> (SentenceTense, str):
        """Rulebase tense identification focusing on root predicate clause."""
        if not is_valid:
            return SentenceTense.UNKNOWN, "Không xác định: Thiếu cấu trúc câu hoàn chỉnh."
        if is_imperative:
            return SentenceTense.UNKNOWN, "Câu mệnh lệnh (không chia thì ngữ pháp)."

        root = sent.root
        aux_tokens = [c for c in root.children if c.dep_ in ("aux", "auxpass")]
        verb_tokens = [root] + aux_tokens
        verb_tags = [t.tag_ for t in verb_tokens]

        # 1. Modals
        modals = [t for t in aux_tokens if t.lemma_.lower() in ("can", "could", "may", "might", "must", "should", "would", "ought")]
        if modals:
            return SentenceTense.MODAL_CONDITIONAL, f"Chứa trợ động từ khuyết thiếu: {modals[0].text}"

        has_will = any(t.lemma_.lower() in ("will", "shall") for t in aux_tokens)
        has_have_aux = any(t.lemma_.lower() == "have" for t in aux_tokens)
        has_had_aux = any(t.lemma_.lower() == "have" and t.tag_ == "VBD" for t in aux_tokens) or any(t.text.lower() == "had" for t in aux_tokens)
        has_been = any(t.text.lower() == "been" for t in aux_tokens + [root])
        has_vbg = "VBG" in verb_tags
        has_vbn = "VBN" in verb_tags

        # 2. Future
        if has_will:
            if has_have_aux and has_been and has_vbg:
                return SentenceTense.FUTURE_PERFECT_CONTINUOUS, "Quy tắc: will + have + been + V-ing"
            if has_have_aux and (has_vbn or has_been):
                return SentenceTense.FUTURE_PERFECT, "Quy tắc: will + have + V-ed/V3"
            if any(t.lemma_.lower() == "be" for t in aux_tokens) and has_vbg:
                return SentenceTense.FUTURE_CONTINUOUS, "Quy tắc: will + be + V-ing"
            return SentenceTense.FUTURE_SIMPLE, "Quy tắc: will/shall + động từ nguyên thể"

        # 3. Past Perfect
        if has_had_aux:
            if has_been and has_vbg:
                return SentenceTense.PAST_PERFECT_CONTINUOUS, "Quy tắc: had + been + V-ing"
            if has_vbn or has_been:
                return SentenceTense.PAST_PERFECT, "Quy tắc: had + V-ed/V3"

        # 4. Present Perfect
        if has_have_aux and not has_had_aux:
            if has_been and has_vbg:
                return SentenceTense.PRESENT_PERFECT_CONTINUOUS, "Quy tắc: have/has + been + V-ing"
            if has_vbn or has_been:
                return SentenceTense.PRESENT_PERFECT, "Quy tắc: have/has + V-ed/V3"

        # 5. Past Continuous
        if any(t.text.lower() in ("was", "were") for t in aux_tokens) and has_vbg:
            return SentenceTense.PAST_CONTINUOUS, "Quy tắc: was/were + V-ing"

        # 6. Past Simple
        if any(t.tag_ == "VBD" or t.text.lower() in ("was", "were") for t in verb_tokens) or any(t.text.lower() == "did" for t in aux_tokens):
            return SentenceTense.PAST_SIMPLE, "Quy tắc: Động từ quá khứ (VBD) hoặc trợ động từ did"

        # 7. Present Continuous
        if any(t.text.lower() in ("am", "is", "are", "'s", "'re", "'m") for t in aux_tokens) and has_vbg:
            return SentenceTense.PRESENT_CONTINUOUS, "Quy tắc: am/is/are + V-ing"

        # 8. Present Simple
        if any(t.tag_ in ("VBP", "VBZ") or t.text.lower() in ("am", "is", "are") for t in verb_tokens) or any(t.text.lower() in ("do", "does") for t in aux_tokens):
            return SentenceTense.PRESENT_SIMPLE, "Quy tắc: Động từ hiện tại (VBP/VBZ) hoặc trợ động từ do/does"

        # 9. Present Simple base form with overt subject
        subjs = [c for c in root.children if "subj" in c.dep_]
        if subjs and root.tag_ == "VB":
            return SentenceTense.PRESENT_SIMPLE, "Quy tắc: Động từ hiện tại nguyên thể đi với chủ ngữ"

        return SentenceTense.UNKNOWN, "Không xác định thì: Không khớp quy tắc nhận diện thì ngữ pháp."
