import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Check, X } from "lucide-react";
import { replaceWordInText } from "@/utils/text";

/**
 * BackendTypoBanner renders a banner when the backend detects typos and offers an alternative text.
 * - Collapsed: shows "Bản dịch cho văn bản thay thế"
 * - Expanded: shows full corrected text with replaced words highlighted, with Confirm and Cancel buttons.
 */
export default function BackendTypoBanner({
  originalText = "",
  typoWords = [],
  onConfirm,
  onCancel,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!typoWords || typoWords.length === 0 || !originalText.trim()) {
    return null;
  }

  // Compute corrected text
  let correctedText = originalText;
  typoWords.forEach((tw) => {
    correctedText = replaceWordInText(correctedText, tw.origin_text, tw.correction);
  });

  // Render text with highlighted replaced words
  const renderHighlightedText = () => {
    const escapedWords = typoWords
      .map((w) => w.correction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");

    if (!escapedWords) return correctedText;

    const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}_])(${escapedWords})(?=[^\\p{L}\\p{N}_]|$)`, "giu");
    const parts = correctedText.split(regex);

    return parts.map((part, index) => {
      const isReplaced = typoWords.some(
        (tw) => tw.correction.toLowerCase() === part.toLowerCase()
      );

      if (isReplaced) {
        return (
          <mark
            key={index}
            className="bg-amber-200 text-amber-950 font-black px-1.5 py-0.5 rounded-md mx-0.5 border border-amber-300"
          >
            {part}
          </mark>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-3xl p-4 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {/* Collapsed Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-amber-900">
              Bản dịch cho văn bản thay thế
            </span>
            <span className="text-xs text-amber-700 font-medium">
              Phát hiện {typoWords.length} từ có thể sai chính tả:{" "}
              {typoWords.map((w) => w.origin_text).join(", ")}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-white/70 px-3 py-1.5 rounded-xl border border-amber-200/60 hover:bg-white transition-colors">
          <span>{isExpanded ? "Thu gọn" : "Xem chi tiết"}</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-amber-200/60 flex flex-col gap-3.5 animate-in fade-in duration-200">
          <div className="bg-white/80 p-4 rounded-2xl border border-amber-100 text-slate-800 text-sm leading-relaxed font-sans shadow-inner">
            <span className="block text-[0.65rem] font-black uppercase text-amber-600 mb-1 tracking-wider">
              Văn bản sau khi sửa chính tả (từ thay thế được bôi đậm):
            </span>
            <p className="m-0 text-slate-800 text-[1rem] leading-relaxed">
              {renderHighlightedText()}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy (Giữ văn bản gốc)</span>
            </button>

            <button
              type="button"
              onClick={() => onConfirm(correctedText)}
              className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-200 transition-all active:scale-95 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Xác nhận thay thế</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

