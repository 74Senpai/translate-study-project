import { useState } from "react";
import { CheckCheck, X, ChevronDown, ChevronUp, Wand2 } from "lucide-react";

/**
 * TypoSuggestions component renders spelling suggestions like IDE tab-completion.
 * Users can accept primary correction with Tab or click, or choose from alternative candidates.
 */
export default function TypoSuggestions({
  suggestions = [],
  onApply,
  onApplyAll,
  onDismiss,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
            <Wand2 className="w-3 h-3" />
          </div>
          <span className="text-[0.7rem] font-black uppercase text-amber-800 tracking-wider">
            Gợi ý sửa chính tả ({suggestions.length})
          </span>
          <span className="hidden sm:inline-block text-[0.65rem] text-slate-400 italic">
            (Nhấn{" "}
            <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200 font-mono text-[0.6rem] font-bold">
              Tab ⇥
            </kbd>{" "}
            trong ô nhập hoặc click vào từ gợi ý để áp dụng)
          </span>
        </div>

        {suggestions.length > 1 && (
          <button
            type="button"
            onClick={onApplyAll}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-bold transition-all border border-amber-200 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Áp dụng tất cả</span>
          </button>
        )}
      </div>

      {/* Suggestion items */}
      <div className="flex flex-wrap gap-2 items-center">
        {suggestions.map((item, idx) => {
          const isExpanded = expandedIndex === idx;
          const otherCandidates = Array.from(
            new Set(
              (item.candidates || []).filter(
                (c) => c.toLowerCase() !== item.correction?.toLowerCase()
              )
            )
          );

          return (
            <div
              key={`${item.origin_text}-${idx}`}
              className="relative inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-amber-300 rounded-xl px-2.5 py-1.5 shadow-sm transition-all text-xs"
            >
              {/* Original misspelled word */}
              <span className="line-through text-rose-500 font-semibold px-1">
                {item.origin_text}
              </span>

              <span className="text-slate-400 font-bold">→</span>

              {/* Primary correction button (with Tab hint) */}
              <button
                type="button"
                onClick={() => onApply(item.origin_text, item.correction)}
                title={`Áp dụng "${item.correction}" (hoặc nhấn Tab trong ô nhập)`}
                className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded-lg font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                <span>{item.correction}</span>
                {idx === 0 && (
                  <kbd className="px-1 py-0.2 bg-emerald-600 text-emerald-100 rounded text-[0.6rem] font-mono font-black ml-0.5">
                    Tab ⇥
                  </kbd>
                )}
              </button>

              {/* Candidates dropdown toggle if more than 1 candidate */}
              {otherCandidates.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    title="Xem các từ gợi ý khác"
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[0.65rem] font-bold border transition-colors cursor-pointer ${
                      isExpanded
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : "bg-white text-slate-500 hover:text-slate-800 border-slate-200"
                    }`}
                  >
                    <span>+{otherCandidates.length}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {/* Dropdown list of candidates */}
                  {isExpanded && (
                    <div className="absolute left-0 bottom-[125%] z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-2.5 min-w-[200px] max-w-[280px] max-h-[180px] overflow-y-auto flex flex-wrap gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="w-full text-[0.65rem] text-slate-400 font-bold uppercase mb-1 pb-1 border-b border-slate-100 flex justify-between items-center">
                        <span>Chọn từ thay thế:</span>
                        <button
                          type="button"
                          onClick={() => setExpandedIndex(null)}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Primary option */}
                      <button
                        type="button"
                        onClick={() => {
                          onApply(item.origin_text, item.correction);
                          setExpandedIndex(null);
                        }}
                        className="w-full text-left px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs border border-emerald-200 transition-colors cursor-pointer"
                      >
                        {item.correction} (khuyên dùng)
                      </button>

                      {/* Candidate alternatives */}
                      {otherCandidates.map((cand, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => {
                            onApply(item.origin_text, cand);
                            setExpandedIndex(null);
                          }}
                          className="px-2 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-medium rounded-lg text-xs border border-slate-200 hover:border-blue-200 transition-colors cursor-pointer"
                        >
                          {cand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => onDismiss(item.origin_text)}
                title="Bỏ qua từ này"
                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors ml-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

