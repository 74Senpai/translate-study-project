"""
IPA (International Phonetic Alphabet) Pronunciation Service.

Provides IPA transcription for English words and phrases with a two-tier strategy:
  1. Primary: `eng_to_ipa` library (rule-based and dictionary CMU transcription with stress).
  2. Fallback: NLTK CMU Pronouncing Dictionary (`nltk.corpus.cmudict`) with ARPAbet-to-IPA mapping.
  3. Supports both individual words and multi-word phrases.
  4. Returns IPA formatted with standard slashes: `/{ipa}/`.
  5. Built-in caching for fast lookups.
"""

import re
from typing import Optional, List, Dict
from loguru import logger

# Try importing eng_to_ipa
try:
    import eng_to_ipa as eng_ipa
    _HAS_ENG_TO_IPA = True
except ImportError:
    eng_ipa = None
    _HAS_ENG_TO_IPA = False

# Try importing NLTK cmudict
try:
    import nltk
    from nltk.corpus import cmudict
    _HAS_NLTK = True
except ImportError:
    nltk = None
    cmudict = None
    _HAS_NLTK = False


# ARPAbet to IPA phonetic mapping
_ARPABET_TO_IPA = {
    # Vowels
    "AA": "ɑː",
    "AE": "æ",
    "AH0": "ə",    # Unstressed schwa
    "AH": "ʌ",     # Stressed central vowel
    "AO": "ɔː",
    "AW": "aʊ",
    "AY": "aɪ",
    "EH": "ɛ",
    "ER0": "ər",
    "ER": "ɜːr",
    "EY": "eɪ",
    "IH": "ɪ",
    "IY": "iː",
    "OW": "oʊ",
    "OY": "ɔɪ",
    "UH": "ʊ",
    "UW": "uː",

    # Consonants
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "F": "f",
    "G": "ɡ",
    "HH": "h",
    "JH": "dʒ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "P": "p",
    "R": "r",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ",
}


class IpaService:
    """
    Service for generating and managing IPA phonetic transcriptions.
    """

    def __init__(self):
        self._cache: Dict[str, Optional[str]] = {}
        self._cmu_dict = None
        self._init_cmu_dict()

    def _init_cmu_dict(self):
        """Lazily initialize NLTK CMUDict if available."""
        if not _HAS_NLTK:
            return
        try:
            # Download cmudict if not already available
            try:
                self._cmu_dict = cmudict.dict()
            except LookupError:
                nltk.download("cmudict", quiet=True)
                self._cmu_dict = cmudict.dict()
        except Exception as e:
            logger.debug(f"Could not initialize NLTK cmudict: {e}")
            self._cmu_dict = None

    @staticmethod
    def _clean_word(text: str) -> str:
        """Strip punctuation and trailing spaces, preserve internal apostrophes."""
        if not text:
            return ""
        # Remove surrounding punctuation
        cleaned = re.sub(r"^[^\w']+|[^\w']+$", "", text.strip().lower())
        return cleaned

    def convert_arpabet_to_ipa(self, phonemes: List[str]) -> str:
        """
        Convert a list of CMUDict ARPAbet phoneme tokens (e.g. ['AH0', 'CH', 'IY1', 'V'])
        into an IPA phonetic string (e.g. 'əˈtʃiːv').
        """
        ipa_parts: List[str] = []
        for p in phonemes:
            # Check stress digit (0, 1, 2)
            stress = ""
            base = p
            if p[-1].isdigit():
                digit = p[-1]
                base = p[:-1]
                if digit == "1":
                    stress = "ˈ"
                elif digit == "2":
                    stress = "ˌ"

            # Check specific unstressed variant like AH0 -> ə
            lookup_key = p if p in _ARPABET_TO_IPA else base
            ipa_sym = _ARPABET_TO_IPA.get(lookup_key, _ARPABET_TO_IPA.get(base, base.lower()))

            ipa_parts.append(f"{stress}{ipa_sym}")

        return "".join(ipa_parts)

    def _get_cmu_ipa(self, word: str) -> Optional[str]:
        """Lookup word in NLTK cmudict and convert to IPA."""
        if self._cmu_dict is None:
            return None
        entries = self._cmu_dict.get(word.lower())
        if not entries:
            return None
        # Use first pronunciation variant
        return self.convert_arpabet_to_ipa(entries[0])

    def _get_single_word_ipa(self, word: str) -> Optional[str]:
        """
        Get IPA transcription for a single clean word.
        Tries eng_to_ipa first, falls back to CMUDict.
        """
        clean = self._clean_word(word)
        if not clean:
            return None

        # Check cache
        if clean in self._cache:
            return self._cache[clean]

        ipa_result = None

        # Tier 1: Try eng_to_ipa
        if _HAS_ENG_TO_IPA and eng_ipa:
            try:
                converted = eng_ipa.convert(clean)
                # eng_to_ipa appends '*' if word was not found in dictionary
                if converted and not converted.endswith("*"):
                    # Standardize characters (e.g. ʧ -> tʃ, ʤ -> dʒ)
                    converted = converted.replace("ʧ", "tʃ").replace("ʤ", "dʒ")
                    ipa_result = converted
            except Exception as e:
                logger.debug(f"eng_to_ipa error on '{clean}': {e}")

        # Tier 2: Fallback to NLTK CMUDict
        if not ipa_result:
            try:
                ipa_result = self._get_cmu_ipa(clean)
            except Exception as e:
                logger.debug(f"cmudict error on '{clean}': {e}")

        # Cache result
        self._cache[clean] = ipa_result
        return ipa_result

    def get_ipa(self, text: str) -> Optional[str]:
        """
        Get formatted IPA for a word or phrase.
        Returns format: '/əˈtʃiːv/' or None if not transcribable.
        """
        if not text or not text.strip():
            return None

        stripped = text.strip()

        # If already formatted with slashes e.g. /.../, check and normalize
        if stripped.startswith("/") and stripped.endswith("/") and len(stripped) > 2:
            return stripped

        words = stripped.split()
        if not words:
            return None

        if len(words) == 1:
            ipa = self._get_single_word_ipa(words[0])
            if ipa:
                return f"/{ipa.strip('/')}/"
            return None

        # Multi-word phrase: look up each word
        ipa_tokens: List[str] = []
        found_any = False
        for w in words:
            w_ipa = self._get_single_word_ipa(w)
            if w_ipa:
                found_any = True
                ipa_tokens.append(w_ipa.strip("/"))
            else:
                ipa_tokens.append(w.lower())

        if not found_any:
            return None

        combined = " ".join(ipa_tokens)
        return f"/{combined}/"

    def get_ipa_for_words(self, words: List[str]) -> Dict[str, Optional[str]]:
        """Batch lookup helper."""
        return {w: self.get_ipa(w) for w in words}


# Singleton instance
_ipa_service: Optional[IpaService] = None


def get_ipa_service() -> IpaService:
    global _ipa_service
    if _ipa_service is None:
        _ipa_service = IpaService()
    return _ipa_service
