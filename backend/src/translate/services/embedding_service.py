import numpy as np
from typing import List, Tuple, Dict, Optional
import hashlib
from loguru import logger
import spacy

try:
    from sentence_transformers import SentenceTransformer
    _HAS_SENTENCE_TRANSFORMERS = True
except ImportError:
    _HAS_SENTENCE_TRANSFORMERS = False


class EmbeddingService:
    """
    High-precision Sentence Embedding Service.
    Uses SentenceTransformers (all-MiniLM-L6-v2) when available for 384D dense semantic embeddings,
    with automatic fallback to SpaCy or TF-IDF dense representations.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2", spacy_model: str = "en_core_web_sm"):
        self.st_model = None
        self.spacy_nlp = None

        if _HAS_SENTENCE_TRANSFORMERS:
            try:
                self.st_model = SentenceTransformer(model_name)
                logger.info(f"Loaded SentenceTransformer model '{model_name}' successfully.")
            except Exception as e:
                logger.warning(f"SentenceTransformer '{model_name}' could not be loaded: {e}")

        if self.st_model is None:
            try:
                self.spacy_nlp = spacy.load(spacy_model)
                logger.info(f"SpaCy embedding model '{spacy_model}' loaded.")
            except Exception as e:
                logger.warning(f"SpaCy '{spacy_model}' loading warning: {e}")

    def get_embedding(self, text: str) -> np.ndarray:
        """Compute normalized vector embedding for input text."""
        if not text or not text.strip():
            return np.zeros(384 if self.st_model else 128, dtype=np.float32)

        if self.st_model is not None:
            try:
                vec = self.st_model.encode(text, convert_to_numpy=True)
                norm = np.linalg.norm(vec)
                return (vec / (norm + 1e-9)).astype(np.float32)
            except Exception as e:
                logger.warning(f"SentenceTransformer encode failed: {e}")

        if self.spacy_nlp is not None:
            doc = self.spacy_nlp(text)
            if doc.has_vector and np.any(doc.vector):
                norm = np.linalg.norm(doc.vector)
                return (doc.vector / (norm + 1e-9)).astype(np.float32)

        # Hash-based n-gram dense vector fallback
        words = text.lower().split()
        vec = np.zeros(128, dtype=np.float32)
        for idx, word in enumerate(words):
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            vec[h % 128] += 1.0 / (idx + 1)
        norm = np.linalg.norm(vec)
        return (vec / norm if norm > 0 else vec).astype(np.float32)

    def compute_cosine_similarity(self, text1: str, text2: str) -> float:
        """Compute cosine similarity between two texts."""
        v1 = self.get_embedding(text1)
        v2 = self.get_embedding(text2)
        sim = float(np.dot(v1, v2))
        return max(0.0, min(1.0, sim))

    def compute_vector_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity between two pre-computed vector embeddings."""
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        sim = float(np.dot(vec1, vec2) / (norm1 * norm2))
        return max(0.0, min(1.0, sim))
