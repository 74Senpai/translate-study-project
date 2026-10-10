import { useState } from "react";
import { POS_COLORS, mapSpacyPos } from "@/constants/pos";
import PosFilters from "@/components/translate/PosFilters";
import SaveWordButton from "@/components/translate/SaveWordButton";
import { Copy, Check, Volume2, Loader2 } from "lucide-react";
import { speakWord } from "@/utils/speech";

/**
 * Translation result panel.
 * Shows highlighted POS tokens with hover tooltips and the Vietnamese translation.
 */
export default function TranslateResult({
  apiData,
  mode,
  isLoading,
  isVocabLoading,
  activeFilters,
  onToggleFilter,
  onToggleAll,
  showDetails,
}) {
  const [activeTokenIndex, setActiveTokenIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const mode_ = JSON.parse(mode);

  // Check if we are in the middle of a "Full" analysis (Dual-stage)
  const isPendingFull = isLoading && (apiData?.pos_tags?.length || 0) === 0;

  const handleCopy = () => {
    if (!apiData?.translated_text) return;
    navigator.clipboard.writeText(apiData.translated_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase tracking-wider">
            {mode_["target_lang"] === "en"
              ? "English Result"
              : "English Analysis"}
          </label>
          {isPendingFull && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full border border-blue-100">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-[0.6rem] font-bold text-blue-500 uppercase tracking-tight">
                Phân tích...
              </span>
            </div>
          )}
          {isVocabLoading && !isPendingFull && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-50/80 rounded-full border border-blue-100 text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-[0.65rem] font-bold uppercase tracking-tight">
                Đang tra nghĩa...
              </span>
            </div>
          )}
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.7rem] font-black transition-all border outline-none
            ${
              copied
                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                : "bg-slate-50 text-slate-500 border-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-100"
            }`}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>ĐÃ SAO CHÉP</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>SAO CHÉP</span>
            </>
          )}
        </button>
      </div>

      {/* POS filters */}
      {showDetails && (
        <PosFilters
          activeFilters={activeFilters}
          onToggle={onToggleFilter}
          onToggleAll={onToggleAll}
        />
      )}

      {/* Vietnamese translation (en-vi mode) */}
      {mode_["target_lang"] === "vi" && (
        <div
          className={`mb-6 ${showDetails ? "pb-4 border-b border-slate-100" : ""}`}
        >
          {!showDetails && (
            <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase mb-2.5 tracking-wider">
              Bản dịch Tiếng Việt
            </label>
          )}
          <p
            className={`text-[1.1rem] text-slate-800 m-0 leading-relaxed ${
              showDetails ? "italic text-slate-500 font-medium" : "font-bold"
            }`}
          >
            {apiData.data.translated_text}
          </p>
        </div>
      )}

      {/* Highlighted tokens (English Analysis) */}
      {(mode_["target_lang"] === "en" ||
        (mode_["target_lang"] === "en" && showDetails)) && (
        <div
          className={`min-h-[60px] flex flex-wrap gap-x-1 gap-y-0.5 rounded-xl text-[1.1rem] leading-relaxed text-slate-800 transition-all ${
            !showDetails
              ? "bg-transparent border-none p-0"
              : "bg-slate-50 p-4 border border-slate-100"
          }`}
        >
          {(apiData?.pos_tags?.length || 0) === 0 ? (
            <span>{apiData.data.translated_text}</span>
          ) : (
            apiData.pos_tags.map((item, index) => {
              const posType = mapSpacyPos(item.pos);
              const isHighlighted =
                showDetails &&
                item.pos !== "IGNORE" &&
                activeFilters.includes(posType);
              const isActive = activeTokenIndex === index;

              return (
                <div
                  key={index}
                  className="relative inline-block group"
                  onClick={() =>
                    isHighlighted &&
                    setActiveTokenIndex(isActive ? null : index)
                  }
                >
                  <span
                    className={`py-0.5 px-1 rounded transition-colors ${
                      isHighlighted
                        ? "cursor-help font-semibold hover:bg-slate-200"
                        : ""
                    } ${isActive ? "bg-slate-200" : ""}`}
                    style={{
                      color: isHighlighted ? POS_COLORS[posType] : "inherit",
                    }}
                  >
                    {item.text}
                  </span>

                  {/* Hover/Tap tooltip */}
                  {isHighlighted && (
                    <div
                      className={`absolute bottom-[115%] left-1/2 -translate-x-1/2 min-w-[220px] max-w-[280px] bg-white rounded-[12px] shadow-[0_10px_25px_rgba(0,0,0,0.12)] z-50 transition-all duration-200 border border-slate-200 pointer-events-auto mb-1
                      ${isActive ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100"}
                    `}
                    >
                      <div
                        className="text-white py-1 px-3 text-[0.7rem] font-extrabold rounded-t-[11px] uppercase flex items-center justify-between"
                        style={{ backgroundColor: POS_COLORS[posType] }}
                      >
                        <span>{posType}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            speakWord(item.text);
                          }}
                          title="Nghe phát âm"
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 transition-colors border-none cursor-pointer"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="p-3 text-[0.85rem] text-slate-700 flex flex-col gap-1">
                        {!item.meaning && isVocabLoading ? (
                          <div className="flex items-center gap-2 text-blue-600 py-1 font-semibold text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Đang tra nghĩa ngữ cảnh...</span>
                          </div>
                        ) : item.meaning ? (
                          <>
                            <p className="m-0 text-slate-800">
                              <strong className="text-slate-900">Nghĩa:</strong>{" "}
                              <span className="font-semibold text-blue-700">{item.meaning}</span>
                            </p>
                            {item.definition && (
                              <p className="m-0 text-[0.75rem] text-slate-600 leading-snug">
                                <strong className="text-slate-800">Định nghĩa:</strong> {item.definition}
                              </p>
                            )}
                            {item.example && (
                              <p className="m-0 text-[0.75rem] text-slate-500 italic leading-snug">
                                <strong className="not-italic text-slate-700">Ví dụ:</strong> &quot;{item.example}&quot;
                              </p>
                            )}
                            {item.synonyms && item.synonyms.length > 0 && (
                              <p className="m-0 text-[0.7rem] text-slate-500">
                                <strong className="text-slate-700">Đồng nghĩa:</strong> {item.synonyms.join(", ")}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="m-0 text-[0.75rem] text-slate-400 italic">
                            Chưa có dữ liệu nghĩa cho từ này
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Save word button — only for real highlighted tokens with meanings */}
                  {isHighlighted && item.meaning && (
                    <SaveWordButton
                      word={item.text}
                      meaning={item.meaning}
                      sentence={item.sentence}
                      tense={item.tense}
                      sentenceType={item.sentence_type}
                      forceShow={isActive}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
