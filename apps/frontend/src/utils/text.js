/**
 * Replace whole word in text preserving casing (ALL-CAPS, TitleCase, or lower).
 * Uses Unicode-aware boundary matching.
 */
export function replaceWordInText(fullText, targetWord, newWord) {
  if (!fullText || !targetWord || !newWord) return fullText;

  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `(?<=^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`,
    "giu"
  );

  return fullText.replace(regex, (match) => {
    // Preserve ALL-CAPS (e.g. SERFOR -> SENIOR)
    if (match === match.toUpperCase()) {
      return newWord.toUpperCase();
    }
    // Preserve TitleCase (e.g. Chávez -> Chavez)
    if (
      match[0] === match[0].toUpperCase() &&
      match.slice(1) === match.slice(1).toLowerCase()
    ) {
      return newWord.charAt(0).toUpperCase() + newWord.slice(1).toLowerCase();
    }
    return newWord;
  });
}

