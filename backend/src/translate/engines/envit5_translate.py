import asyncio
from datetime import datetime
from typing import List, Optional, Union
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from loguru import logger

from src.config import get_settings
from src.translate.engines.base_engine import TranslateEngine

_settings = get_settings()

# Module-level model cache to prevent reloading ~1GB weights multiple times in RAM
_cached_model = None
_cached_tokenizer = None
_cached_device = None


class EnViT5Engine(TranslateEngine):
    """
    Local Neural Machine Translation engine using VietAI/envit5-translation.
    Supports high-quality bidirectional English <-> Vietnamese translation.

    Input requirements:
        Inputs must be prefixed with the source language:
        - "en: <English text>" for English to Vietnamese
        - "vi: <Vietnamese text>" for Vietnamese to English
    """

    def __init__(self):
        super().__init__()
        self.name_engine = "EnViT5 Translate"
        self.model_name = _settings.envit5_model_name
        self.max_length = _settings.envit5_max_length
        self.max_input_len = 1500
        self.rate_limit = None
        self.is_use = False
        self.available = _settings.envit5_enable
        self.device = None
        self.tokenizer = None
        self.model = None

    def stats(self) -> dict:
        return {
            "name_engine": self.name_engine,
            "model_name": self.model_name,
            "max_input_len": self.max_input_len,
            "device": str(self.device) if self.device else "not_loaded",
            **super().stats(),
        }

    def _normalize_lang(self, lang: Optional[str]) -> str:
        if not lang:
            return ""
        lang_str = str(lang).lower().strip()
        if lang_str.startswith("vi"):
            return "vi"
        if lang_str.startswith("en"):
            return "en"
        return lang_str

    def _format_input(self, text: str, source_lang: Optional[str] = None) -> str:
        """
        Ensure text has source language prefix ('vi: ' or 'en: ').
        If prefix already exists, preserves it without duplicating.
        """
        trimmed = text.strip()
        lower = trimmed.lower()
        if lower.startswith("vi:") or lower.startswith("en:"):
            # Ensure standard spacing after colon
            prefix = trimmed[:2].lower()
            remainder = trimmed[3:].strip() if len(trimmed) > 3 and trimmed[2] == ":" else trimmed[2:].lstrip(": ")
            return f"{prefix}: {remainder}"

        src = self._normalize_lang(source_lang)
        if not src:
            src = "en"
        return f"{src}: {trimmed}"

    def _clean_translated_text(self, text: str, target_lang: Optional[str] = None) -> str:
        """
        Strip target language prefix tag (e.g., 'vi: ' or 'en: ') from the model's decoded output.
        """
        text = text.strip()
        for prefix in ("vi:", "en:"):
            if text.lower().startswith(prefix):
                return text[len(prefix):].strip()
        return text

    def _check_engine_started(self) -> None:
        if self.model is None or self.tokenizer is None:
            self.start_engine()

    def start_engine(self) -> bool:
        global _cached_model, _cached_tokenizer, _cached_device
        if not _settings.envit5_enable:
            self.available = False
            return False

        try:
            if _cached_model is None or _cached_tokenizer is None:
                logger.info(f"Loading local EnViT5 model from '{self.model_name}'...")
                device_str = "cuda" if torch.cuda.is_available() else "cpu"
                _cached_device = torch.device(device_str)

                _cached_tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                _cached_model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)

                if torch.cuda.is_available():
                    _cached_model.cuda()
                else:
                    _cached_model.to(_cached_device)

                _cached_model.eval()
                logger.info(f"EnViT5 model loaded successfully on {_cached_device}.")

            self.tokenizer = _cached_tokenizer
            self.model = _cached_model
            self.device = _cached_device
            self.available = True
            return True
        except Exception as e:
            logger.error(f"Failed to start EnViT5 engine: {e}")
            self.available = False
            raise RuntimeError(f"Engine {self.name_engine} start failed: {e}")

    def stop_engine(self) -> bool:
        self.is_use = False
        return True

    def is_available(self) -> bool:
        return super().is_available()

    def _infer_sync(
        self,
        texts: List[str],
        source_lang: Optional[str] = None,
        target_lang: Optional[str] = None,
        clean_output: bool = True,
    ) -> List[str]:
        if not texts or self.model is None or self.tokenizer is None:
            return texts

        # EnViT5 requires source language prefix "vi: <text>" or "en: <text>"
        formatted_inputs = [self._format_input(t, source_lang) for t in texts]

        # Tokenize with padding=True as specified in VietAI configuration
        tokenized = self.tokenizer(
            formatted_inputs,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=self.max_length,
        )

        input_ids = tokenized.input_ids.to(self.device)

        with torch.no_grad():
            outputs = self.model.generate(
                input_ids,
                max_length=self.max_length,
            )

        decoded = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)

        if clean_output:
            return [self._clean_translated_text(item, target_lang) for item in decoded]
        return decoded

    async def translate(
        self,
        source_lang: str,
        target_lang: str,
        text: Union[str, List[str]],
        clean_output: bool = True,
    ) -> Union[str, List[str]]:
        """
        Translate a single text string or a list of texts (chuỗi text hoặc mảng).

        :param source_lang: Source language code ('en', 'vi', 'en-US', etc.)
        :param target_lang: Target language code ('en', 'vi', etc.)
        :param text: Single text string OR list of strings to translate.
        :param clean_output: Whether to strip the 'vi: ' / 'en: ' prefix from output. Default True.
        :return: Translated string or list of translated strings matching input type.
        """
        is_batch_input = isinstance(text, (list, tuple))

        if is_batch_input:
            if not text:
                return []
            items = list(text)
        else:
            if not text or not str(text).strip():
                return ""
            items = [str(text)]

        src = self._normalize_lang(source_lang)
        tgt = self._normalize_lang(target_lang)

        # Detect lang from input prefixes if not explicitly given
        if not src and items:
            first_lower = items[0].strip().lower()
            if first_lower.startswith("vi:"):
                src = "vi"
            elif first_lower.startswith("en:"):
                src = "en"

        if src and tgt and src == tgt:
            return text

        if src and src not in ("vi", "en"):
            raise ValueError(
                f"EnViT5 only supports English and Vietnamese ('en' <-> 'vi'), received '{source_lang}' -> '{target_lang}'."
            )
        if tgt and tgt not in ("vi", "en"):
            raise ValueError(
                f"EnViT5 only supports English and Vietnamese ('en' <-> 'vi'), received '{source_lang}' -> '{target_lang}'."
            )

        for item in items:
            if len(item) > self.max_input_len:
                raise ValueError(
                    f"Input text length ({len(item)}) exceeds maximum limit of {self.max_input_len} characters."
                )

        self._check_engine_started()

        results = await asyncio.to_thread(self._infer_sync, items, src, tgt, clean_output)

        total_chars = sum(len(it) for it in items)
        self.current_session_token_use_count += total_chars
        self.current_session_rate_count += len(items)

        if is_batch_input:
            return results
        return results[0] if results else ""

    async def translate_batch(
        self,
        source_lang: str,
        target_lang: str,
        texts: List[str],
        clean_output: bool = True,
    ) -> List[str]:
        """
        Batch translate a list of strings (dùng mảng).
        """
        if not texts:
            return []

        res = await self.translate(
            source_lang=source_lang,
            target_lang=target_lang,
            text=texts,
            clean_output=clean_output,
        )
        return res if isinstance(res, list) else [res]
