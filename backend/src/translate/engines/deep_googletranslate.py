import asyncio
from datetime import datetime
from deep_translator import GoogleTranslator
from src.translate.engines.base_engine import TranslateEngine
from loguru import logger


class DeepGoogleTranslate(TranslateEngine):
    def __init__(self):
        super().__init__()
        self.is_use = False
        self.engine: GoogleTranslator | None = None
        self.name_engine = "Deep Google Translate"
        self.max_input_len = 4500
        self.rate_limit = None
        self.available = True

    def stats(self):
        return {
            "name_engine": self.name_engine,
            "max_input_len": self.max_input_len,
            **super().stats()
        }

    async def translate(self, source_lang, target_lang, text: str) -> str:
        if not text or not text.strip():
            return ""
        if len(text) >= self.max_input_len:
            raise Exception(
                f"Input text length exceeds the maximum limit of {self.max_input_len} characters.")

        # Re-create translator with correct source/target to avoid stale lang state
        translator = GoogleTranslator(source=source_lang, target=target_lang)
        result = await asyncio.to_thread(translator.translate, text)

        if not result:
            raise ValueError(f"Engine {self.name_engine} returned empty result.")

        # If result equals input and langs differ, translation failed
        if result.strip() == text.strip() and source_lang != target_lang:
            raise ValueError(
                f"Engine {self.name_engine} returned identical text — possible language detection failure.")

        logger.debug(
            f"Engine {self.name_engine} [{source_lang}->{target_lang}]: {text!r} -> {result!r}")
        self.current_session_token_use_count += len(text)
        self.current_session_rate_count += 1
        return result

    def start_engine(self):
        try:
            self.engine = GoogleTranslator()
            self.available = True
            return True
        except Exception as e:
            self.available = False
            logger.error(f"Engine {self.name_engine} start failed: {e}")
            raise Exception(f"Engine {self.name_engine} start failed: {e}")

    def stop_engine(self):
        self.engine = None
        return True

    def is_available(self):
        return super().is_available()
