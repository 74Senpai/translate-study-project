from functools import lru_cache
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    app_name: str = "Translate Platform API"
    app_version: str = "1.0.0"
    debug: bool = False
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    cors_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    rate_limit: str = "10000/minute"
    spacy_model: str = "en_core_web_sm"

    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "translate_db"

    ai_translate_enable: bool = False
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    ai_daily_limit: int = 500

    translation_cache_ttl_days: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        return ["*"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
