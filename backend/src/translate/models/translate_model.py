from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel


class TranslateMode(BaseModel):
    source_lang: Literal['en', 'vi']
    target_lang: Literal['en', 'vi']


class TranslateRequest(BaseModel):
    source: TranslateMode
    text: str
    option: Optional[dict] = None


class SimpleTranslateResponse(BaseModel):
    original_text: str
    translated_text: str
    source_lang: str


class TranslateResponse(BaseModel):
    original_text: str
    translated_text: str
    source_lang: str
    metadata: Optional[dict] = None
