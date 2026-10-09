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

    # WSD (Word Sense Disambiguation) 5-Method Configuration
    # Method weights (will be normalised to sum=1.0 at runtime)
    wsd_weight_sentence_embed: float = 40.0       # M1: sentence embedding vs synonym-substituted sentence
    wsd_weight_ctx_synonym: float = 30.0           # M2: context window embedding vs synonym-substituted context
    wsd_weight_lesk: float = 10.0                  # M3: WordNet Lesk overlap
    wsd_weight_ctx_definition: float = 10.0        # M4: context window embedding vs sense definition
    wsd_weight_generated_example: float = 10.0     # M5: generated example (same word count) similarity
    wsd_context_window_size: int = 5
    wsd_top_k: int = 6
    wsd_max_synonyms: int = 5
    # Trust threshold: composite score >= threshold → trusted
    wsd_trust_threshold: float = 0.65

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
