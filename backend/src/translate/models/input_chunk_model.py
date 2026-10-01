from pydantic import BaseModel


class Chunk(BaseModel):
    fingerprint: str
    chunk_text: str
    start: int
    end: int
    float_: float


class Sentence(BaseModel):
    fingerprint: str
    sentence_text: str
    start: int
    end: int


class InputConfig(BaseModel):
    max_input_size: int
    overlap_ratio: float = 0.0
    is_complete_sentence: bool = True
