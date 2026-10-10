import { useEffect, useRef } from "react";
import LoadingBar from "@/components/ui/LoadingBar";
import { ArrowRightLeft } from "lucide-react";

/**
 * Controlled textarea for text input.
 * Displays a loading indicator and a clear button.
 */
export default function TranslateInput({
  mode,
  onModeChange,
  value,
  onChange,
  onClear,
  isLoading,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`;
    }
  }, [value]);
  const mode_ = JSON.parse(mode);
  const placeholder =
    mode_["source_lang"] === "vi"
      ? "Gõ hoặc dán văn bản tiếng Việt vào đây..."
      : "Gõ hoặc dán văn bản tiếng Anh vào đây...";

  return (
    <section className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden transition-all duration-300 focus-within:border-blue-400 focus-within:shadow-md focus-within:ring-4 focus-within:ring-blue-50">
      {/* Input Header / Mode Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
          <button
            onClick={() =>
              onModeChange({ source_lang: "vi", target_lang: "en" })
            }
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
            onClick={() =>
              onModeChange({ source_lang: "en", target_lang: "vi" })
            }
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
            onClick={onClear}
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[120px] border-none resize-none outline-none text-[1.2rem] leading-relaxed text-slate-800 placeholder-slate-300 font-sans bg-transparent overflow-hidden"
        autoFocus
      />

      {isLoading && <LoadingBar />}
    </section>
  );
}
