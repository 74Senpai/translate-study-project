from src.translate.engines.deep_googletranslate import DeepGoogleTranslate
from src.translate.engines.googletranslate import Googletrans
from src.translate.engines.gemini_translate import GeminiEngine
from src.translate.engines.mymemory_translate import MyMemoryEngine
from src.translate.engines.envit5_translate import EnViT5Engine

__all__ = [
    "DeepGoogleTranslate",
    "Googletrans",
    "GeminiEngine",
    "MyMemoryEngine",
    "EnViT5Engine",
]

# Priority order: Gemini → EnViT5 (Local neural AI) → DeepGoogle → Googletrans → MyMemory
ENGINES = [GeminiEngine, EnViT5Engine, DeepGoogleTranslate, Googletrans, MyMemoryEngine]
