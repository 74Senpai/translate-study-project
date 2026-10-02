import asyncio
from typing import Optional
from collections.abc import AsyncGenerator
from loguru import logger

from src.translate.services.translate_service import TranslateService
from src.translate.services.analys_service import AnalysService
from src.translate.services.typo_service import TypoService
from src.translate.services.stats_service import StatsService
from src.translate.services.vocab_service import VocabService

from src.translate.models.translate_model import TranslateRequest
from src.translate.models.translate_workflow_model import TypeResponse, TranslateWorkflowResponse
from src.translate.manager.input_manager import InputManager, InputConfig

_input = InputManager()


class TranslateWorkflow:
    """
    Workflow runner for EN -> VI (and VI -> EN) translation.
    EN -> VI Flow:
    1. Validation & normalization (remove hidden chars, control chars, NFC normalization).
    2. Typo check: if typos exist, yield TYPO response for user replacement confirmation, while original text proceeds in parallel.
    3. Concurrently run 4 tasks:
       a) Update Statistics (word frequency, source, daily/weekly/monthly stats).
       b) Language Translation.
       c) Sentence Structure, POS, Sentence Form & Tense Analysis (rulebase per sentence).
       d) Vocabulary & Semantics Context Extraction & Storage (embedding cosine similarity context matching, simple examples, definitions, synonyms, antonyms, context ID).
    """

    def __init__(
        self,
        translator: TranslateService,
        analysis: AnalysService,
        typo: TypoService,
        stats: Optional[StatsService] = None,
        vocab: Optional[VocabService] = None,
    ):
        self.translator = translator
        self.analysis = analysis
        self.typo = typo
        self.stats = stats or StatsService()
        self.vocab = vocab or VocabService()

        self._event_count = 0
        self._queue = asyncio.Queue()

        _input.register_service(
            translator.__class__.__name__,
            InputConfig(max_input_size=translator.get_max_input_size())
        )
        _input.register_service(
            analysis.__class__.__name__,
            InputConfig(max_input_size=analysis.max_input_size)
        )
        _input.register_service(
            typo.__class__.__name__,
            InputConfig(max_input_size=-1, is_complete_sentence=True)
        )

    def simple_translate(self, req: TranslateRequest):
        clean_text = _input.validate_and_normalize(req.text)
        chunks = _input.get_inputs(text=clean_text, service=self.translator.__class__.__name__)
        return self.translator.translate(req.source, chunks)

    async def translate(self, req: TranslateRequest) -> AsyncGenerator[TranslateWorkflowResponse, None]:
        # 1. Validation & Normalization
        clean_text = _input.validate_and_normalize(req.text)
        req.text = clean_text

        # Run translation core pipeline
        async for item in self._translate_core(req):
            yield item

    async def _run_stream_task(self, task, type_resp: TypeResponse):
        try:
            if hasattr(task, "__aiter__"):
                async for chunk in task:
                    await self._queue.put(TranslateWorkflowResponse(type_response=type_resp, data=chunk))
            else:
                res = await task
                if res is not None:
                    await self._queue.put(TranslateWorkflowResponse(type_response=type_resp, data=res))
        except Exception as e:
            logger.error(f"Error in stream task {type_resp}: {e}")
        finally:
            await self._queue.put(None)

    def _add_event(self, task, type_resp: TypeResponse):
        asyncio.create_task(self._run_stream_task(task, type_resp))
        self._event_count += 1

    async def _process_vi_en_flow(self, req: TranslateRequest, sentences):
        curr_engine = self.translator.engine_manager.get_current_engine()
        engine_name = curr_engine.name_engine if curr_engine else "default"

        chunks = _input.get_inputs(text=req.text, service=self.translator.__class__.__name__)
        translated_pieces = []
        async for resp in self.translator.translate(source=req.source, chunks=chunks):
            translated_pieces.append(resp.translated_text)
            await self._queue.put(TranslateWorkflowResponse(type_response=TypeResponse.TRANSLATE, data=resp))

        translated_text = " ".join(translated_pieces).strip()
        if not translated_text:
            translated_text = req.text

        english_sentences = _input.split_text_to_sentences(translated_text)

        # 3a. Update statistics for translated English words (marked as is_translated=True)
        self._add_event(
            self.stats.update_statistics(
                text=translated_text,
                source_engine=engine_name,
                is_translated=True
            ),
            type_resp=TypeResponse.STATS
        )

        # 3b. Run sentence structure, POS, voice, tense, form analysis on translated English text
        self._add_event(
            self.analysis.analysis(lang="en", sentences=english_sentences),
            type_resp=TypeResponse.ANALYSIS
        )

        # 3c. Extract and save new vocabulary from translated English text in context
        for i, eng_s in enumerate(english_sentences):
            vi_context = sentences[i].sentence_text if i < len(sentences) else req.text
            self._add_event(
                self.vocab.extract_and_save_vocab(
                    sentence_text=eng_s.sentence_text,
                    translated_sentence=vi_context,
                    is_translated=True,
                    source_lang="vi"
                ),
                type_resp=TypeResponse.VOCAB
            )

    async def _translate_core(self, req: TranslateRequest):
        self._event_count = 0
        self._queue = asyncio.Queue()
        finished = 0

        source_lang = req.source.source_lang
        target_lang = req.source.target_lang

        # 2. Spell / Typo Check
        sentences = _input.split_text_to_sentences(req.text)

        if source_lang == "en" and self.typo.is_support(source_lang):
            # Run typo check stream for English
            self._add_event(
                self.typo.sentence_spell_check(sentences=sentences, lang=source_lang),
                type_resp=TypeResponse.TYPO
            )

        # 3. EN -> VI Flow
        if source_lang == "en" and target_lang == "vi":
            curr_engine = self.translator.engine_manager.get_current_engine()
            engine_name = curr_engine.name_engine if curr_engine else "default"
            self._add_event(
                self.stats.update_statistics(
                    text=req.text,
                    source_engine=engine_name,
                    is_translated=False
                ),
                type_resp=TypeResponse.STATS
            )

            # Task 4b: Language Translation
            chunks = _input.get_inputs(text=req.text, service=self.translator.__class__.__name__)
            self._add_event(
                self.translator.translate(source=req.source, chunks=chunks),
                type_resp=TypeResponse.TRANSLATE
            )

            # Task 4c: Sentence Structure, POS, Form & Tense Analysis
            self._add_event(
                self.analysis.analysis(lang=source_lang, sentences=sentences),
                type_resp=TypeResponse.ANALYSIS
            )

            # Task 4d: Vocabulary & Semantics Extraction in Context
            for s in sentences:
                self._add_event(
                    self.vocab.extract_and_save_vocab(sentence_text=s.sentence_text, is_translated=False),
                    type_resp=TypeResponse.VOCAB
                )

        # 4. VI -> EN Flow (Vietnamese -> English translation then English analysis & stats & vocab saving)
        elif source_lang == "vi" and target_lang == "en":
            await self._process_vi_en_flow(req, sentences)

        else:
            # Standard fallback flow for other language directions
            chunks = _input.get_inputs(text=req.text, service=self.translator.__class__.__name__)
            self._add_event(
                self.translator.translate(source=req.source, chunks=chunks),
                type_resp=TypeResponse.TRANSLATE
            )
            if self.analysis.is_availabel():
                self._add_event(
                    self.analysis.analysis(lang=source_lang, sentences=sentences),
                    type_resp=TypeResponse.ANALYSIS
                )

        # Stream items out of the queue as they arrive
        while finished < self._event_count:
            item = await self._queue.get()
            if item is None:
                finished += 1
                continue
            yield item

        self._event_count = 0
