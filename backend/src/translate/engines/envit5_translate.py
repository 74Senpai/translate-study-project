import asyncio
from datetime import datetime
from typing import List, Optional
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
    Supports high-quality bidirectional English <-> Vietnamese translation
    running locally on CPU or CUDA without external API rate limits.
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

    def _normalize_lang(self, lang: str) -> str:
        lang = lang.lower().strip()
        if lang.startswith("vi"):
            return "vi"
        if lang.startswith("en"):
            return "en"
        return lang

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
                _cached_model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name).to(_cached_device)
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

    def _clean_translated_text(self, text: str, target_lang: str) -> str:
        text = text.strip()
        prefix = f"{target_lang}:"
        if text.lower().startswith(prefix):
            text = text[len(prefix):].lstrip()
        return text

    def _infer_sync(self, texts: List[str], source_lang: str, target_lang: str) -> List[str]:
        if not texts or self.model is None or self.tokenizer is None:
            return texts

        # EnViT5 expects inputs formatted as "vi: <text>" or "en: <text>"
        formatted_inputs = [f"{source_lang}: {t}" for t in texts]
        inputs = self.tokenizer(
            formatted_inputs,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=self.max_length,
        ).to(self.device)

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_length=self.max_length,
                num_beams=4,
                early_stopping=True,
            )

        decoded = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)
        results = [self._clean_translated_text(item, target_lang) for item in decoded]
        return results

    async def translate(self, source_lang: str, target_lang: str, text: str) -> str:
        if not text or not text.strip():
            return ""

        src = self._normalize_lang(source_lang)
        tgt = self._normalize_lang(target_lang)

        if src == tgt:
            return text

        if src not in ("vi", "en") or tgt not in ("vi", "en"):
            raise ValueError(
                f"EnViT5 only supports English and Vietnamese ('en' <-> 'vi'), received '{source_lang}' -> '{target_lang}'."
            )

        if len(text) > self.max_input_len:
            raise ValueError(
                f"Input text length ({len(text)}) exceeds maximum limit of {self.max_input_len} characters."
            )

        self._check_engine_started()

        results = await asyncio.to_thread(self._infer_sync, [text], src, tgt)
        res = results[0] if results else ""

        if not res or not res.strip():
            raise ValueError(f"Engine {self.name_engine} returned empty result.")

        logger.debug(f"Engine {self.name_engine} [{src}->{tgt}]: {text!r} -> {res!r}")
        self.current_session_token_use_count += len(text)
        self.current_session_rate_count += 1
        return res

    async def translate_batch(
        self, source_lang: str, target_lang: str, texts: List[str]
    ) -> List[str]:
        if not texts:
            return []

        src = self._normalize_lang(source_lang)
        tgt = self._normalize_lang(target_lang)

        if src == tgt:
            return texts

        if src not in ("vi", "en") or tgt not in ("vi", "en"):
            raise ValueError(
                f"EnViT5 only supports English and Vietnamese ('en' <-> 'vi'), received '{source_lang}' -> '{target_lang}'."
            )

        self._check_engine_started()

        results = await asyncio.to_thread(self._infer_sync, texts, src, tgt)
        self.current_session_token_use_count += sum(len(t) for t in texts)
        self.current_session_rate_count += len(texts)
        return results
