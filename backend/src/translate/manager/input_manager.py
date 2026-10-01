import unicodedata
import re
import hashlib
from typing import List, Optional
from nltk.tokenize import PunktTokenizer
from src.translate.models.input_chunk_model import Chunk, Sentence, InputConfig


class InputManager:
    """Manages input validation, hidden character cleanup, normalization, chunking, and sentence tokenization."""

    def __init__(self, default_chunk=500):
        self.config = {}
        self._default_chunk = default_chunk
        self._tokenizer = PunktTokenizer()

    def register_service(
        self,
        service: str,
        option=InputConfig
    ):
        self.config[service] = option

    def validate_and_normalize(self, text: str) -> str:
        """Validate input text and clean up hidden characters, control chars, and NFC normalization."""
        if not isinstance(text, str):
            raise ValueError("Invalid input format. Text must be a string.")

        # Clean hidden / zero-width / control characters
        text = (
            text.replace("\u200b", "")
            .replace("\u200c", "")
            .replace("\u200d", "")
            .replace("\ufeff", "")
            .replace("\u00a0", " ")
        )
        # Remove non-printable control characters
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

        # Unicode NFC normalization
        text = unicodedata.normalize("NFC", text)
        text = text.strip()

        if not text:
            raise ValueError("Input text is empty after normalization.")

        return text

    def get_inputs(self, text: str, service: str):
        clean_text = self.validate_and_normalize(text)
        cfg: Optional[InputConfig] = self.config.get(service)

        if cfg is None:
            return self.split_text_to_chunks(clean_text, self._default_chunk)
        else:
            chunk_size = cfg.max_input_size
            is_complete_sentence = cfg.is_complete_sentence
            overlap = cfg.overlap_ratio

            if chunk_size == -1 and is_complete_sentence:
                return self.split_text_to_sentences(text=clean_text)

            return self.split_text_to_chunks(clean_text, chunk_size, overlap, is_complete_sentence)

    def split_text_to_sentences(self, text: str) -> list[Sentence]:
        text = self.validate_and_normalize(text)
        fingerprint = self._get_fingerprint(text)

        chunks: list[Sentence] = []
        for start, end in self._tokenizer.span_tokenize(text):
            chunks.append(
                Sentence(
                    fingerprint=fingerprint,
                    sentence_text=text[start:end],
                    start=start,
                    end=end,
                )
            )

        if not chunks and text:
            chunks.append(Sentence(fingerprint=fingerprint, sentence_text=text, start=0, end=len(text)))

        return chunks

    def split_text_to_chunks(
        self,
        text: str,
        chunk_size: int,
        overlap_ratio: float = 0.0,
        is_complete_sentence: bool = True,
    ) -> list[Chunk]:

        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")

        text = self.validate_and_normalize(text)
        chunks: list[Chunk] = []

        if is_complete_sentence:
            sentences = self.split_text_to_sentences(text)
            current_chunk: Chunk | None = None

            for sentence in sentences:
                _sentence = sentence.sentence_text

                if len(_sentence) > chunk_size:
                    if current_chunk is not None and current_chunk.chunk_text:
                        chunks.append(current_chunk)
                        current_chunk = None

                    chunks.extend(
                        self.split_sentence_to_chunks(
                            sentence=sentence, chunk_size=chunk_size
                        )
                    )
                    continue

                if current_chunk is None:
                    current_chunk = Chunk(
                        fingerprint=sentence.fingerprint,
                        chunk_text=_sentence,
                        start=sentence.start,
                        end=sentence.end,
                        float_=0.0
                    )
                    candidate = _sentence
                else:
                    candidate = current_chunk.chunk_text + " " + _sentence

                if len(candidate) <= chunk_size:
                    current_chunk.chunk_text = candidate
                    current_chunk.end = sentence.end
                else:
                    chunks.append(current_chunk)
                    current_chunk = Chunk(
                        chunk_text=_sentence,
                        fingerprint=sentence.fingerprint,
                        start=sentence.start,
                        end=sentence.end,
                        float_=0.0,
                    )

            if current_chunk is not None and current_chunk.chunk_text:
                chunks.append(current_chunk)

        else:
            fingerprint = self._get_fingerprint(text)
            overlap = int(chunk_size * overlap_ratio)
            step = chunk_size - overlap

            if step <= 0:
                raise ValueError("overlap_ratio is too large")

            start = 0
            while start < len(text):
                end = min(start + chunk_size, len(text))
                chunks.append(
                    Chunk(
                        chunk_text=text[start:end],
                        fingerprint=fingerprint,
                        start=start,
                        end=end,
                        float_=overlap_ratio
                    )
                )

                if end == len(text):
                    break
                start += step

        return chunks

    def split_sentence_to_chunks(self, sentence: Sentence, chunk_size: int) -> list[Chunk]:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")

        _sentence = sentence.sentence_text
        if len(_sentence) <= chunk_size:
            return [Chunk(
                fingerprint=sentence.fingerprint,
                chunk_text=_sentence,
                start=sentence.start,
                end=sentence.end,
                float_=0.0
            )]

        punctuation = {".", "?", "!", ";", ":", ","}
        chunks: list[Chunk] = []

        start = 0
        length = len(_sentence)

        while start < length:
            if length - start <= chunk_size:
                chunks.append(
                    Chunk(
                        chunk_text=_sentence[start:],
                        fingerprint=sentence.fingerprint,
                        start=sentence.start + start,
                        end=sentence.end,
                        float_=0.0
                    )
                )
                break

            end = start + chunk_size
            split = end

            for i in range(end - 1, start, -1):
                if _sentence[i] in punctuation:
                    split = i + 1
                    break

            chunks.append(
                Chunk(
                    chunk_text=_sentence[start:split],
                    fingerprint=sentence.fingerprint,
                    start=sentence.start + start,
                    end=sentence.start + split,
                    float_=0.0
                )
            )
            start = split
            while start < length and _sentence[start].isspace():
                start += 1

        return chunks

    def _get_fingerprint(self, text: str):
        return hashlib.blake2b(
            text.encode(),
            digest_size=16
        ).hexdigest()
