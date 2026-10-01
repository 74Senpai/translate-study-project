from src.translate.engines.deep_googletranslate import DeepGoogleTranslate
from src.translate.engines.googletranslate import Googletrans
from src.translate.engines.gemini_translate import GeminiEngine
from src.translate.engines.mymemory_translate import MyMemoryEngine

__all__ = ["DeepGoogleTranslate", "Googletrans", "GeminiEngine", "MyMemoryEngine"]

# Priority order: Gemini → DeepGoogle → Googletrans → MyMemory
# Gemini is the most accurate AI model; DeepGoogle and Googletrans are fast fallbacks;
# MyMemory is the stable last resort.
ENGINES = [GeminiEngine, DeepGoogleTranslate, Googletrans, MyMemoryEngine]
