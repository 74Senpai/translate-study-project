import { useEffect, useRef, useState, useCallback } from "react";
import LoadingBar from "@/components/ui/LoadingBar";
import { ArrowRightLeft } from "lucide-react";
import InlineTypoPopup from "@/components/translate/InlineTypoPopup";
import {
  initSpellChecker,
  getSuggestions,
  isSpellCheckerReady,
  findAllMisspelledWords,
} from "@/services/spellCheckService";
import { getCaretCoordinates } from "@/utils/caretCoordinates";

/**
 * Controlled textarea for text input.
 * Features:
 * - Real-time fast client-side typo suggestions via Typo.js
 * - Minimalist horizontal tab popup (1 row, 3 words visible with ring scrolling)
 * - Navigation: Tab cycles words in a loop, Enter/Click to apply, Space or Esc to dismiss
 * - Error progression: automatically advances from old to new errors (từ cũ tới mới)
 */
export default function TranslateInput({
  mode,
  onModeChange,
  value,
  onChange,
  onClear,
  isLoading,
  showTypoSuggestions = true,
}) {
  const textareaRef = useRef(null);
  const [inlinePopup, setInlinePopup] = useState(null);

  const mode_ = typeof mode === "string" ? JSON.parse(mode) : mode;
  const isEnglishSource = mode_["source_lang"] === "en";

  useEffect(() => {
    initSpellChecker();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`;
    }
  }, [value]);

  // Check word under caret or find error from old to new
  const checkErrorsAndShow = useCallback(
    (text, caretPos, preferCurrentCaret = true) => {
      if (!showTypoSuggestions || !isEnglishSource || !isSpellCheckerReady()) {
        setInlinePopup(null);
        return;
      }

      if (!text || !text.trim()) {
        setInlinePopup(null);
        return;
      }

      const allErrors = findAllMisspelledWords(text);
      if (allErrors.length === 0) {
        setInlinePopup(null);
        return;
      }

      // 1. If preferCurrentCaret, find if caret is on or right at one of the error words
      let targetError = null;
      if (caretPos !== undefined && caretPos !== null) {
        targetError = allErrors.find(
          (err) => caretPos >= err.start && caretPos <= err.end
        );
      }

      // 2. Fallback: if not on an error, pick earliest error from old to new (từ cũ tới mới)
      if (!targetError && !preferCurrentCaret) {
        targetError =
          caretPos !== undefined && caretPos !== null
            ? allErrors.find((err) => err.start >= caretPos) || allErrors[0]
            : allErrors[0];
      }

      if (!targetError) {
        setInlinePopup(null);
        return;
      }

      const suggestions = getSuggestions(targetError.word); // All suggestions
      if (!suggestions || suggestions.length === 0) {
        setInlinePopup(null);
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea) return;

      const caretCoords = getCaretCoordinates(textarea, targetError.start);
      const adjustedCoords = {
        top: textarea.offsetTop + caretCoords.top - textarea.scrollTop,
        left: textarea.offsetLeft + caretCoords.left - textarea.scrollLeft,
        height: caretCoords.height || 24,
      };

      setInlinePopup((prev) => {
        const prevIdx =
          prev && prev.word === targetError.word ? prev.selectedIndex : 0;
        return {
          word: targetError.word,
          rawWord: targetError.rawWord,
          start: targetError.start,
          end: targetError.end,
          suggestions,
          coords: adjustedCoords,
          selectedIndex: Math.min(prevIdx, suggestions.length - 1),
        };
      });
    },
    [showTypoSuggestions, isEnglishSource]
  );

  const handleApplySuggestion = useCallback(
    (suggestedWord) => {
      if (!inlinePopup || !textareaRef.current) return;
      const { start, end, rawWord } = inlinePopup;

      // Preserve capitalization style
      let formattedWord = suggestedWord;
      if (/^[A-Z][a-z]/.test(rawWord)) {
        formattedWord =
          suggestedWord.charAt(0).toUpperCase() + suggestedWord.slice(1);
      } else if (/^[A-Z]+$/.test(rawWord)) {
        formattedWord = suggestedWord.toUpperCase();
      }

      const before = value.substring(0, start);
      const after = value.substring(end);
      const newText = before + formattedWord + after;
      onChange(newText);

      const nextCaretPos = start + formattedWord.length;

      // Check remaining errors from old to new (từ cũ tới mới)
      setTimeout(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();

        const remainingErrors = findAllMisspelledWords(newText);
        if (remainingErrors.length === 0) {
          setInlinePopup(null);
          textareaRef.current.setSelectionRange(nextCaretPos, nextCaretPos);
          return;
        }

        // Find next error whose start >= nextCaretPos (or wrap to first error)
        const nextError =
          remainingErrors.find((err) => err.start >= nextCaretPos) ||
          remainingErrors[0];

        if (nextError) {
          textareaRef.current.setSelectionRange(nextError.end, nextError.end);
          const suggestions = getSuggestions(nextError.word);
          if (suggestions && suggestions.length > 0) {
            const caretCoords = getCaretCoordinates(
              textareaRef.current,
              nextError.start
            );
            setInlinePopup({
              word: nextError.word,
              rawWord: nextError.rawWord,
              start: nextError.start,
              end: nextError.end,
              suggestions,
              coords: {
                top:
                  textareaRef.current.offsetTop +
                  caretCoords.top -
                  textareaRef.current.scrollTop,
                left:
                  textareaRef.current.offsetLeft +
                  caretCoords.left -
                  textareaRef.current.scrollLeft,
                height: caretCoords.height || 24,
              },
              selectedIndex: 0,
            });
            return;
          }
        }

        setInlinePopup(null);
        textareaRef.current.setSelectionRange(nextCaretPos, nextCaretPos);
      }, 50);
    },
    [inlinePopup, value, onChange]
  );

  const handleKeyDown = (e) => {
    if (inlinePopup) {
      // Space key: dismiss popup if not choosing a word
      if (e.key === " ") {
        setInlinePopup(null);
        return;
      }

      // Tab key: cycle words in circular ring
      if (e.key === "Tab") {
        e.preventDefault();
        setInlinePopup((prev) => {
          if (!prev || !prev.suggestions || prev.suggestions.length === 0) {
            return null;
          }
          const total = prev.suggestions.length;
          const nextIdx = e.shiftKey
            ? (prev.selectedIndex - 1 + total) % total
            : (prev.selectedIndex + 1) % total;
          return { ...prev, selectedIndex: nextIdx };
        });
        return;
      }

      // Enter key: apply active suggestion
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const chosen = inlinePopup.suggestions[inlinePopup.selectedIndex];
        if (chosen) {
          handleApplySuggestion(chosen);
        }
        return;
      }

      // Escape key: dismiss popup
      if (e.key === "Escape") {
        e.preventDefault();
        setInlinePopup(null);
        return;
      }
    }
  };

  const handleInputChange = (e) => {
    const newText = e.target.value;
    onChange(newText);
    const caret = e.target.selectionStart;
    setTimeout(() => {
      if (textareaRef.current) {
        checkErrorsAndShow(newText, caret, true);
      }
    }, 40);
  };

  const handleKeyUp = (e) => {
    if (["Tab", "Enter", "Escape", " "].includes(e.key)) return;
    if (textareaRef.current) {
      checkErrorsAndShow(value, textareaRef.current.selectionStart, true);
    }
  };

  const handleClick = () => {
    if (textareaRef.current) {
      checkErrorsAndShow(value, textareaRef.current.selectionStart, true);
    }
  };

  const handleScroll = () => {
    if (inlinePopup && textareaRef.current) {
      checkErrorsAndShow(value, textareaRef.current.selectionStart, true);
    }
  };

  const handleClear = () => {
    setInlinePopup(null);
    onClear();
  };

  const placeholder =
    mode_["source_lang"] === "vi"
      ? "Gõ hoặc dán văn bản tiếng Việt vào đây..."
      : "Gõ hoặc dán văn bản tiếng Anh vào đây...";

  return (
    <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative transition-all duration-300 focus-within:border-blue-400 focus-within:shadow-md focus-within:ring-4 focus-within:ring-blue-50">
      {/* Input Header / Mode Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
          <button
            onClick={() => {
              setInlinePopup(null);
              onModeChange({ source_lang: "vi", target_lang: "en" });
            }}
            className={`px-6 py-2.5 rounded-xl text-[0.75rem] font-black border-none cursor-pointer transition-all ${
              mode_["source_lang"] === "vi"
                ? "bg-white text-blue-600 shadow-md shadow-blue-100"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="uppercase tracking-widest">Tiếng Việt</span>
          </button>

          <div className="mx-2 text-slate-300 flex items-center justify-center">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </div>

          <button
            onClick={() => {
              setInlinePopup(null);
              onModeChange({ source_lang: "en", target_lang: "vi" });
            }}
            className={`px-6 py-2.5 rounded-xl text-[0.75rem] font-black border-none cursor-pointer transition-all ${
              mode_["source_lang"] === "en"
                ? "bg-white text-blue-600 shadow-md shadow-blue-100"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <span className="uppercase tracking-widest">Tiếng Anh</span>
          </button>
        </div>

        {value && (
          <button
            id="btn-clear-input"
            onClick={handleClear}
            className="text-[0.65rem] font-black text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 px-4 py-2.5 rounded-xl transition-all cursor-pointer border border-slate-100 hover:border-red-100 uppercase tracking-widest"
          >
            Xóa nội dung
          </button>
        )}
      </div>

      <textarea
        id="translate-input"
        ref={textareaRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onClick={handleClick}
        onScroll={handleScroll}
        placeholder={placeholder}
        className="w-full min-h-[120px] border-none resize-none outline-none text-[1.2rem] leading-relaxed text-slate-800 placeholder-slate-300 font-sans bg-transparent"
        autoFocus
      />

      {/* Floating horizontal tab inline typo popup directly under misspelled word */}
      {showTypoSuggestions && inlinePopup && (
        <InlineTypoPopup
          coords={inlinePopup.coords}
          suggestions={inlinePopup.suggestions}
          selectedIndex={inlinePopup.selectedIndex}
          onSelectSuggestion={handleApplySuggestion}
          onClose={() => setInlinePopup(null)}
        />
      )}

      {isLoading && <LoadingBar />}
    </section>
  );
}
