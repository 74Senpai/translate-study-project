from collections.abc import AsyncGenerator
from loguru import logger
from src.translate.manager.translate_engine_manager import TranslateEngineManager
from src.translate.models.translate_model import TranslateMode, TranslateResponse
from src.translate.models.input_chunk_model import Chunk


class TranslateService:
    def __init__(self):
        self.engine_manager = TranslateEngineManager()
        try:
            self.engine_manager.switch_available_engine()
        except Exception as e:
            logger.warning(f"Could not switch engine during init: {e}")

    async def translate(self, source: TranslateMode, chunks: list[Chunk]) -> AsyncGenerator[TranslateResponse, None]:
        for chunk in chunks:
            try:
                res = await self.engine_manager.translate(source, chunk.chunk_text)
            except Exception as e:
                logger.error(f"Translation failed for chunk: {e}")
                res = ""

            yield TranslateResponse(
                original_text=chunk.chunk_text,
                translated_text=res if res else chunk.chunk_text,
                source_lang=source.source_lang,
                metadata={
                    "fingerprint": chunk.fingerprint,
                    "start": chunk.start,
                    "end": chunk.end
                }
            )

    def get_max_input_size(self) -> int:
        current = self.engine_manager.get_current_engine()
        if current:
            return getattr(current, "max_input_len", 500)
        return 500
