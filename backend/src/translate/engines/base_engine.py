from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional


class TranslateEngine(ABC):
    def __init__(self):
        self.is_use = False
        self.available = False
        self.last_use_at: datetime | None = None
        self.current_session_rate_count: int = 0
        self.current_session_token_use_count: int = 0
        self.avg_rate_per_session: float | None = 0.0
        self.avg_token_per_session: float | None = 0.0
        self.rate_limit: int | None = None
        self.name_engine: str
        self.cooldown_until: datetime | None = None
        self.failure_count: int | None = 0
        self.last_success_time: datetime | None = None

    def set_infor(self,
                  is_use: bool = False,
                  available: bool = False,
                  last_use_at: datetime | None = None,
                  current_session_rate_count: int | None = None,
                  current_session_token_use_count: int | None = None,
                  avg_rate_per_session: float | None = None,
                  avg_token_per_session: float | None = None,
                  rate_limit: int | None = None,
                  cooldown_until: datetime | None = None,
                  failure_count: int | None = None,
                  last_success_time: datetime | None = None
                  ):
        if is_use is not None:
            self.is_use = is_use
        if available is not None:
            self.available = available
        if last_use_at is not None:
            self.last_use_at = last_use_at
        if current_session_rate_count is not None:
            self.current_session_rate_count = current_session_rate_count
        if current_session_token_use_count is not None:
            self.current_session_token_use_count = current_session_token_use_count
        if avg_rate_per_session is not None:
            self.avg_rate_per_session = avg_rate_per_session
        if avg_token_per_session is not None:
            self.avg_token_per_session = avg_token_per_session
        if rate_limit is not None:
            self.rate_limit = rate_limit
        if cooldown_until is not None:
            self.cooldown_until = cooldown_until
        if failure_count is not None:
            self.failure_count = self.failure_count + 1
        if last_success_time is not None:
            self.last_success_time = last_success_time

    @abstractmethod
    def stats(self):
        return {
            "is_use": self.is_use,
            "available": self.available,
            "last_use_at": self.last_use_at.isoformat() if self.last_use_at else None,
            "current_session_rate_count": self.current_session_rate_count,
            "current_session_token_use_count": self.current_session_token_use_count,
            "avg_rate_per_session": self.avg_rate_per_session,
            "avg_token_per_session": self.avg_token_per_session,
            "rate_limit": self.rate_limit,
        }

    @abstractmethod
    def translate(self, source_lang, target_lang, text: str):
        pass

    @abstractmethod
    def start_engine(self):
        pass

    @abstractmethod
    def stop_engine(self):
        pass

    @abstractmethod
    def is_available(self):
        return self.available and (self.cooldown_until is None or datetime.now() >= self.cooldown_until)
