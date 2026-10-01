from src.translate.engines.base_engine import TranslateEngine
from src.config import get_settings
from google import genai
from google.genai import types as genai_types
from src.core.exceptions import AiDailyLimitError, UnsupportedLanguageError, RateLimitError
from loguru import logger


_SYSTEM_PROMPT = (
    "You are a professional translator specialising in Vietnamese and English. "
    "Translate the given text accurately and naturally. "
    "Return ONLY the translated text with no explanation, notes, or extra formatting."
)

_settings = get_settings()


class GeminiEngine(TranslateEngine):
    def __init__(self):
        super().__init__()
        self.system_prompt = _SYSTEM_PROMPT
        self.model = _settings.gemini_model
        self.api_key = _settings.gemini_api_key
        self.rate_limit = _settings.ai_daily_limit
        self.available = bool(self.api_key)
        self.is_use = False
        self.engine: genai.Client | None = None
        self.name_engine = "Gemini Translate"
        self.max_input_len = 1000

    def stats(self):
        return {
            "name_engine": self.name_engine,
            **super().stats(),
            "model": self.model,
            "max_input_len": self.max_input_len,
        }

    async def translate(self, source_lang, target_lang, text: str) -> str:
        if len(text) == 0:
            return ""
        if self.engine == None:
            logger.error(f"Engine {self.name_engine} non start")
            raise RuntimeError(
                f"{self.name_engine} not started"
            )
        if len(text) >= self.max_input_len:
            raise Exception(
                f"Input text length exceeds the maximum limit of {self.max_input_len} characters.")
        else:
            prompt = self._build_prompt(
                text=text, source_lang=source_lang, target_lang=target_lang)
            text = await self._call_gemini(prompt=prompt)
            self.current_session_token_use_count += len(text)
            self.current_session_rate_count += 1
            return text

    def start_engine(self):
        try:
            self.engine = genai.Client(api_key=self.api_key)
            self.available = True
            return True
        except Exception as e:
            logger.error(f"Engine {self.name_engine} start faild: {e}")
            self.available = False
            raise Exception(f"Engine {self.name_engine} start faild: {e}")

    def _build_prompt(self, text: str, source_lang: str, target_lang: str) -> str:
        return (
            f"Translate the following text from {source_lang} to {target_lang}. "
            f"If the text contains mixed languages, ONLY translate the {source_lang} parts into {target_lang}, "
            f"and keep the {target_lang} parts exactly as they are without altering them. "
            f"Return ONLY the final translated text, nothing else.\n\nText: {text}"
        )

    async def _call_gemini(self, prompt: str) -> str:
        if self.rate_limit == 0:
            self.stop_engine()
            logger.error(f"Rate limit block")
            raise RateLimitError(
                f"Rate limit exceeded for engine {self.name_engine}")
        try:
            self.rate_limit = self.rate_limit - 1
            response = await self.engine.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    temperature=0.1,
                ),
            )
            return response.text or ""
        except (AiDailyLimitError, UnsupportedLanguageError):
            raise
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            raise Exception(f"Engine {self.name_engine} API call failed: {e}")

    def stop_engine(self):
        if self.engine is not None:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self.engine.aio.aclose())
                else:
                    loop.run_until_complete(self.engine.aio.aclose())
            except Exception:
                pass
        self.engine = None
        return True

    def is_available(self):
        return super().is_available()
