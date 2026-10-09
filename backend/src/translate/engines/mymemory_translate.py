import asyncio
from deep_translator import MyMemoryTranslator
from typing import List
from src.translate.engines.base_engine import TranslateEngine
from loguru import logger


_LANG_MAP = {
    "en": "en-US",
    "vi": "vi-VN",
    "zh": "zh-CN",
    "fr": "fr-FR",
    "de": "de-DE",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "es": "es-ES",
}


class MyMemoryEngine(TranslateEngine):
    """
    MyMemory free translation engine via deep_translator.
    Limit: ~5 000 characters/day for anonymous requests.
    No API key required — acts as a stable last-resort fallback
    when Google-based engines are rate-limited.
    """

    def __init__(self):
        super().__init__()
        self.is_use = False
        self.engine = None
        self.name_engine = "MyMemory Translate"
        self.max_input_len = 500   # MyMemory hard limit per request
        self.rate_limit = None
        self.available = True

    def stats(self):
        return {
            "name_engine": self.name_engine,
            "max_input_len": self.max_input_len,
            **super().stats()
        }

    def _lang_code(self, code: str) -> str:
        return _LANG_MAP.get(code, code)

    async def translate(self, source_lang: str, target_lang: str, text: str) -> str:
        if not text or not text.strip():
            return ""
        if len(text) >= self.max_input_len:
            raise Exception(
                f"Input text length exceeds the maximum limit of {self.max_input_len} characters.")

        src = self._lang_code(source_lang)
        tgt = self._lang_code(target_lang)
        translator = MyMemoryTranslator(source=src, target=tgt)

        result = await asyncio.to_thread(translator.translate, text)

        if not result or not result.strip():
            raise ValueError(f"Engine {self.name_engine} returned empty result.")

        if result.strip() == text.strip() and source_lang != target_lang:
            raise ValueError(
                f"Engine {self.name_engine} returned identical text — possible limit hit.")

        # MyMemory sometimes appends a quality warning in parentheses — strip it
        # e.g. "Xin chào (NOTICE: ...)"
        if "(NOTICE:" in result:
            result = result[:result.index("(NOTICE:")].strip()

        logger.debug(
            f"Engine {self.name_engine} [{source_lang}->{target_lang}]: {text!r} -> {result!r}")
        self.current_session_token_use_count += len(text)
        self.current_session_rate_count += 1
        return result

    async def translate_batch(
        self, source_lang: str, target_lang: str, texts: List[str]
    ) -> List[str]:
        """Batch translation with staggered delays to avoid MyMemory rate limits."""
        if not texts:
            return []

        async def _safe_translate(text: str, delay: float) -> str:
            if delay > 0:
                await asyncio.sleep(delay)
            try:
                return await self.translate(source_lang, target_lang, text)
            except Exception as e:
                logger.warning(f"Batch item failed in {self.name_engine}: {e}")
                return text

        # Stagger requests by 0.3s to avoid MyMemory rate limiting
        tasks = [_safe_translate(t, i * 0.3) for i, t in enumerate(texts)]
        results = await asyncio.gather(*tasks)
        return list(results)

    def start_engine(self):
        try:
            # Quick smoke-test: init is cheap, translation happens per-call
            self.available = True
            return True
        except Exception as e:
            self.available = False
            logger.error(f"Engine {self.name_engine} start failed: {e}")
            raise

    def stop_engine(self):
        self.engine = None
        return True

    def is_available(self):
        return super().is_available()
