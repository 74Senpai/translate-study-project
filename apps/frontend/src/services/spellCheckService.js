import TypoModule from "typo-js";

const Typo = TypoModule?.default || TypoModule;

let typoInstance = null;
let initPromise = null;

/**
 * Initialize Typo.js by fetching en_US dictionary files asynchronously.
 */
export async function initSpellChecker() {
  if (typoInstance) return typoInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const [affRes, dicRes] = await Promise.all([
        fetch("/dictionaries/en_US/en_US.aff"),
        fetch("/dictionaries/en_US/en_US.dic"),
      ]);

      if (!affRes.ok || !dicRes.ok) {
        throw new Error("Failed to load dictionary files");
      }

      const [affData, dicData] = await Promise.all([
        affRes.text(),
        dicRes.text(),
      ]);

      typoInstance = new Typo("en_US", affData, dicData);
      return typoInstance;
    } catch (err) {
      console.warn("Could not initialize Typo.js spellchecker:", err);
      return null;
    }
  })();

  return initPromise;
}

/**
 * Clean word from leading/trailing punctuation.
 */
export function cleanWord(rawWord) {
  if (!rawWord) return "";
  return rawWord.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Check if a word is correctly spelled.
 */
export function isWordCorrect(word) {
  const cleaned = cleanWord(word);
  if (!cleaned || cleaned.length <= 1) return true;
  if (/^\d+$/.test(cleaned)) return true; // numbers
  if (!typoInstance) return true;

  return typoInstance.check(cleaned);
}

/**
 * Get suggestions for a word. Returns all suggestions if limit is null/omitted.
 */
export function getSuggestions(word, limit = null) {
  const cleaned = cleanWord(word);
  if (!cleaned || !typoInstance) return [];

  const all = typoInstance.suggest(cleaned) || [];
  return limit ? all.slice(0, limit) : all;
}

/**
 * Scan entire text from beginning to end and return all misspelled words
 * in chronological/textual order (from old to new).
 */
export function findAllMisspelledWords(text) {
  if (!text || !typoInstance) return [];
  const regex = /[\p{L}\p{N}_']+/gu;
  const errors = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawWord = match[0];
    const clean = cleanWord(rawWord);
    if (clean && clean.length > 1 && !isWordCorrect(clean)) {
      errors.push({
        rawWord,
        word: clean,
        start: match.index,
        end: match.index + rawWord.length,
      });
    }
  }
  return errors;
}

/**
 * Check if the spellchecker is loaded.
 */
export function isSpellCheckerReady() {
  return typoInstance !== null;
}
