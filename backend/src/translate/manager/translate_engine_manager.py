from typing import Any, Optional
from src.translate.engines import ENGINES
from loguru import logger
from datetime import datetime, timedelta

from src.translate.models.translate_model import TranslateMode


class TranslateEngineManager:
    def __init__(self):
        self.engines = [engine() for engine in ENGINES]
        self.current_engine: Any = None

    def switch_available_engine(self) -> bool:
        available_engines = self.list_available_engine()
        if not available_engines:
            logger.warning("No available engines to switch to.")
            self.current_engine = None
            return False

        for engine in available_engines:
            engine_name = getattr(engine, "name_engine", "Unknown")
            try:
                engine.start_engine()
            except Exception as e:
                logger.error(f"Failed to start engine {engine_name}: {e}")
                engine.available = False
                continue

            engine.is_use = True
            self.current_engine = engine
            logger.info(f"Switched to engine: {engine_name}")
            self.current_engine.set_infor(
                is_use=True,
                available=True,
                last_use_at=None,
                current_session_rate_count=0,
                current_session_token_use_count=0,
                rate_limit=engine.rate_limit
            )
            return True

        self.current_engine = None
        return False

    def list_all_engine(self):
        return self.engines

    def list_available_engine(self):
        avail = [e for e in self.engines if e.is_available()]
        logger.info(f"Available engines: {[e.name_engine for e in avail]}")
        return avail

    def get_current_engine(self):
        return self.current_engine

    def get_engine_stats(self):
        if self.current_engine:
            return self.current_engine.stats()
        return None

    async def translate(self, source: TranslateMode, text: str) -> str:
        if not self.current_engine:
            self.switch_available_engine()

        tried = set()
        while self.current_engine:
            engine_name = getattr(self.current_engine, "name_engine", "Unknown")

            if engine_name in tried:
                logger.warning("All engines exhausted — returning original text.")
                return text

            tried.add(engine_name)
            try:
                res = await self.current_engine.translate(
                    source.source_lang, source.target_lang, text)

                if res and res.strip():
                    self.current_engine.set_infor(last_success_time=datetime.now())
                    return res
                else:
                    logger.warning(f"Engine {engine_name} returned empty result.")
                    self._mark_failed_and_switch(engine_name, cooldown_minutes=30)

            except ValueError as e:
                # Expected failure: identical output, rate-limited, detection failed
                logger.warning(f"Engine {engine_name} soft failure: {e}")
                self._mark_failed_and_switch(engine_name, cooldown_minutes=30)

            except Exception as e:
                # Hard failure: network, parse error, etc.
                logger.error(f"Engine {engine_name} hard failure: {e}")
                self._mark_failed_and_switch(engine_name, cooldown_minutes=60)

        logger.error("All translation engines failed. Returning original text.")
        return text

    def _mark_failed_and_switch(self, engine_name: str, cooldown_minutes: int = 30):
        if not self.current_engine:
            return
        logger.info(f"Marking engine '{engine_name}' on cooldown ({cooldown_minutes}m) and switching.")
        try:
            self.current_engine.set_infor(
                is_use=False,
                failure_count=getattr(self.current_engine, "failure_count", 0) + 1,
                cooldown_until=datetime.now() + timedelta(minutes=cooldown_minutes)
            )
            self.current_engine.stop_engine()
        except Exception as e:
            logger.warning(f"Error stopping engine {engine_name}: {e}")
        self.current_engine = None
        self.switch_available_engine()
