import asyncio
from typing import List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types as genai_types
from loguru import logger

from src.translate.engines.base_engine import TranslateEngine
from src.config import get_settings
from src.core.exceptions import AiDailyLimitError, UnsupportedLanguageError, RateLimitError

_SYSTEM_PROMPT = (
    "You are a professional translator specialising in Vietnamese and English. "
    "Translate the given text accurately and naturally. "
    "Return ONLY the translated text with no explanation, notes, or extra formatting."
)

_settings = get_settings()


class BatchTranslationItem(BaseModel):
    id: int = Field(description="Original index of text in the input batch")
    original: str = Field(description="Original input text")
    translated: str = Field(description="Translated text into target language")


class BatchTranslationResponse(BaseModel):
    translations: List[BatchTranslationItem] = Field(description="List of translation items")


class GeminiEngine(TranslateEngine):
    def __init__(self):
        super().__init__()
        self.system_prompt = _SYSTEM_PROMPT
        self.model = _settings.gemini_model
        self.api_key = _settings.gemini_api_key
        self.rate_limit = _settings.ai_daily_limit
        self.available = bool(self.api_key)
        self.is_use = False
        self.engine: Optional[genai.Client] = None
        self.name_engine = "Gemini Translate"
        self.max_input_len = 1000

    def stats(self) -> dict:
        return {
            "name_engine": self.name_engine,
            **super().stats(),
            "model": self.model,
            "max_input_len": self.max_input_len,
        }

    def _should_translate(self, text: str, source_lang: str, target_lang: str) -> bool:
        """Kiểm tra xem văn bản có thực sự cần dịch hay không."""
        if not text or not text.strip():
            return False
        if source_lang and target_lang and source_lang.lower() == target_lang.lower():
            return False
        # Không dịch nếu văn bản không chứa bất kỳ chữ cái nào (chỉ có số, ký tự đặc biệt...)
        if not any(c.isalpha() for c in text):
            return False
        return True

    def _check_engine_started(self) -> None:
        """Kiểm tra xem Client đã được khởi tạo chưa."""
        if self.engine is None:
            logger.error(f"Engine {self.name_engine} not started")
            raise RuntimeError(f"{self.name_engine} not started")

    def _check_rate_limit(self) -> None:
        if self.rate_limit is not None and self.rate_limit <= 0:
            self.stop_engine()
            logger.error("Rate limit exceeded")
            raise RateLimitError(f"Rate limit exceeded for engine {self.name_engine}")
        if self.rate_limit is not None:
            self.rate_limit -= 1

    def _build_prompt(self, text: str, source_lang: str, target_lang: str) -> str:
        return (
            f"Translate the following text from {source_lang} to {target_lang}. "
            f"If the text contains mixed languages, ONLY translate the {source_lang} parts into {target_lang}, "
            f"and keep the {target_lang} parts exactly as they are without altering them. "
            f"Return ONLY the final translated text, nothing else.\n\nText: {text}"
        )

    async def translate(self, source_lang: str, target_lang: str, text: str) -> str:
        if not self._should_translate(text, source_lang, target_lang):
            return text or ""

        self._check_engine_started()

        if len(text) >= self.max_input_len:
            raise ValueError(
                f"Input text length exceeds maximum limit of {self.max_input_len} characters."
            )

        prompt = self._build_prompt(text=text, source_lang=source_lang, target_lang=target_lang)
        translated = await self._call_gemini(prompt=prompt)
        
        self.current_session_token_use_count += len(translated)
        self.current_session_rate_count += 1
        return translated

    async def translate_batch(
        self, source_lang: str, target_lang: str, texts: List[str]
    ) -> List[str]:
        """Dịch hàng loạt (Batch translation) sử dụng Pydantic Structured Output."""
        if not texts:
            return []

        items_to_translate = []
        result_map = {}

        for idx, t in enumerate(texts):
            if self._should_translate(t, source_lang, target_lang):
                items_to_translate.append((idx, t))
            else:
                result_map[idx] = t

        if not items_to_translate:
            return [result_map[i] for i in range(len(texts))]

        self._check_engine_started()

        formatted_inputs = [f"ID: {idx}\nText: {t}" for idx, t in items_to_translate]
        batch_prompt = (
            f"Translate the following list of texts from {source_lang} to {target_lang}.\n"
            f"Maintain the exact ID for each translation item.\n\n"
            + "\n---\n".join(formatted_inputs)
        )

        try:
            self._check_rate_limit()

            response = await self.engine.aio.models.generate_content(
                model=self.model,
                contents=batch_prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    temperature=0.1,
                    response_mime_type="application/json",
                    response_schema=BatchTranslationResponse,
                ),
            )

            if response and response.text:
                parsed = BatchTranslationResponse.model_validate_json(response.text)
                for item in parsed.translations:
                    result_map[item.id] = item.translated

            self.current_session_rate_count += 1
            self.current_session_token_use_count += sum(
                len(result_map.get(idx, "")) for idx, _ in items_to_translate
            )

        except Exception as e:
            logger.warning(
                f"Gemini Batch translation call failed: {e}. Falling back to individual translation."
            )
            for idx, t in items_to_translate:
                if idx not in result_map:
                    try:
                        result_map[idx] = await self.translate(source_lang, target_lang, t)
                    except Exception as err:
                        logger.error(f"Fallback translation for item {idx} failed: {err}")
                        result_map[idx] = t

        return [result_map.get(i, texts[i]) for i in range(len(texts))]

    async def _call_gemini(self, prompt: str) -> str:
        self._check_rate_limit()

        try:
            response = await self.engine.aio.models.generate_content(
                model=self.model,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    temperature=0.1,
                ),
            )
            return response.text or ""

        except (AiDailyLimitError, UnsupportedLanguageError, RateLimitError):
            raise
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            raise RuntimeError(f"Engine {self.name_engine} API call failed: {e}") from e

    def start_engine(self) -> bool:
        try:
            self.engine = genai.Client(api_key=self.api_key)
            self.available = True
            return True
        except Exception as e:
            logger.error(f"Engine {self.name_engine} start failed: {e}")
            self.available = False
            raise RuntimeError(f"Engine {self.name_engine} start failed: {e}") from e

    def stop_engine(self) -> bool:
        if self.engine is not None:
            try:
                # Đảm bảo đóng client bất đồng bộ một cách an toàn
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(self.engine.aio.aclose())
                except RuntimeError:
                    asyncio.run(self.engine.aio.aclose())
            except Exception as e:
                logger.warning(f"Error while closing engine {self.name_engine}: {e}")
        self.engine = None
        self.available = False
        return True

    def is_available(self) -> bool:
        return super().is_available()
