from spellchecker import SpellChecker
from src.translate.models.typo_model import Word, TypoSentence
from collections.abc import AsyncGenerator
from src.translate.models.input_chunk_model import Sentence


class TypoService:
    def __init__(self):
        self._spell = SpellChecker()
        self.support_langs = ["en"]
        self.max_input_size = 500

    def word_spell_check(self, words: list[str], sentence_i: int, lang: str) -> list[Word]:
        misspelled = self._spell.unknown(words)
        res: list[Word] = []
        for idx, word in enumerate(words):
            if word in misspelled:
                corr = self._spell.correction(word) or word
                cands = list(self._spell.candidates(word) or [])
                res.append(Word(
                    index=idx,
                    origin_text=word,
                    correction=corr,
                    candidates=cands,
                    sentence_i=sentence_i
                ))

        return res

    async def sentence_spell_check(self, sentences: list[Sentence], lang: str) -> AsyncGenerator[TypoSentence, None]:
        if not self.is_support(lang=lang):
            return

        for i in range(0, len(sentences)):
            sentence = sentences[i]
            words_raw = self._spell.split_words(sentence.sentence_text.lower())
            words = self.word_spell_check(words_raw, i, lang)
            if words:
                correction = self._merge_correction_sentence(words, sentence.sentence_text)
                yield TypoSentence(
                    origin_text=sentence.sentence_text,
                    words=words,
                    correction=correction,
                    metadata={
                        "fingerprint": sentence.fingerprint,
                        "start": sentence.start,
                        "end": sentence.end
                    }
                )

    def _merge_correction_sentence(self, words: list[Word], sentence: str):
        words_raw = self._spell.split_words(sentence)
        for typo in words:
            if typo.index < len(words_raw):
                words_raw[typo.index] = typo.correction

        correction = " ".join(words_raw)
        return correction

    def is_support(self, lang: str) -> bool:
        return lang in self.support_langs
