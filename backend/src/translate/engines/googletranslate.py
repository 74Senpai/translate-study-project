from datetime import datetime
from googletrans import Translator
from src.translate.engines.base_engine import TranslateEngine
from loguru import logger


class Googletrans(TranslateEngine):
    def __init__(self):
        super().__init__()
        self.is_use = False
        self.engine: Translator | None = None
        self.name_engine = "Google Translate"
        self.max_input_len = 500
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
        if self.engine is None:
            raise RuntimeError(f"{self.name_engine} not started")
        if len(text) >= self.max_input_len:
            raise Exception(
                f"Input text length exceeds the maximum limit of {self.max_input_len} characters.")

        result = await self.engine.translate(text, src=source_lang, dest=target_lang)

        if not result or not result.text:
            raise ValueError(f"Engine {self.name_engine} returned empty result.")

        # Detect failed translation: result text identical to input and detected src == target
        if result.text.strip() == text.strip() and source_lang != target_lang:
            detected = getattr(result, 'src', source_lang)
            raise ValueError(
                f"Engine {self.name_engine} returned identical text "
                f"(detected_src={detected}, target={target_lang}) — possible rate limit or detection failure."
            )

        logger.debug(
            f"Engine {self.name_engine} [{source_lang}->{target_lang}]: {text!r} -> {result.text!r}")
        self.current_session_token_use_count += len(text)
        self.current_session_rate_count += 1
        return result.text

    def start_engine(self):
        try:
            self.engine = Translator()
            self.available = True
            return True
        except Exception as e:
            logger.error(f"Engine {self.name_engine} start failed: {e}")
            self.available = False
            raise Exception(f"Engine {self.name_engine} start failed: {e}")

    def stop_engine(self):
        self.engine = None
        return True

    def is_available(self):
        return super().is_available()
