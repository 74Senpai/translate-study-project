import { useState } from "react";
import { saveWord } from "@/services/translateApi";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus,
  Check,
  BookPlus,
  Languages,
  StickyNote,
  X,
  Loader2,
} from "lucide-react";

/**
 * SaveWordButton — floats over a POS token.
 * Shows a bookmark icon; on click opens a small confirmation modal
 * to save the word + meaning to the user's vocabulary.
 */
export default function SaveWordButton({
  word,
  meaning,
  sentence,
  tense,
  sentenceType,
  forceShow = false,
}) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  if (!isAuthenticated) return null;

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      let finalTense = tense;
      let finalSentenceType = sentenceType;

      // On-demand grammar analysis if missing
      if (sentence && (!finalTense || !finalSentenceType)) {
        try {
          const analysis = await analyzeText(sentence);
          if (analysis?.results?.length > 0) {
            const firstRes = analysis.results[0];
            finalTense = firstRes.tense?.tense || null;
            finalSentenceType =
              firstRes.sentence_types?.length > 0
                ? firstRes.sentence_types[0].type
                : firstRes.is_question
                  ? "Interrogative"
                  : "Declarative";
          }
        } catch (err) {
          console.error("On-demand analysis failed:", err);
        }
      }

      await saveWord({
        word,
        meaning_vi: meaning,
        note: note || undefined,
        sentence_en: sentence || undefined,
        grammar_tense: finalTense || undefined,
        sentence_type: finalSentenceType || undefined,
      });
      setSaved(true);
      setTimeout(() => setOpen(false), 800);
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Bookmark trigger */}
      <button
        id={`save-word-${word}`}
        title={saved ? "Đã lưu" : "Lưu từ này"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center
          transition-all shadow-lg border z-20
          ${forceShow ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100"}
          ${
            saved
              ? "bg-emerald-500 text-white border-emerald-400"
              : "bg-white text-slate-400 border-slate-100 hover:bg-blue-600 hover:text-white hover:border-blue-500"
          }`}
      >
        {saved ? <Check className="w-3 h-3" /> : <Plus className="w-4 h-4" />}
      </button>

      {/* Confirmation modal */}
      {open && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{
            backdropFilter: "blur(8px)",
            background: "rgba(15,23,42,0.4)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-[360px] p-7 relative overflow-hidden animate-in zoom-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl opacity-60 -mr-12 -mt-12" />

            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 transition-colors border-none bg-transparent cursor-pointer text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <BookPlus className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-black text-slate-800 m-0">
                Lưu từ vựng
              </h3>
            </div>

            <div className="space-y-4 mb-6 relative z-10">
              {/* Word */}
              <div>
                <label className="flex items-center gap-1.5 text-[0.65rem] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  <Languages className="w-3 h-3" />
                  Từ vựng
                </label>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <p className="text-base font-black text-blue-600 m-0">
                    {word}
                  </p>
                </div>
              </div>

              {/* Meaning */}
              <div>
                <label className="flex items-center gap-1.5 text-[0.65rem] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  <BookPlus className="w-3 h-3 text-slate-400" />
                  Nghĩa Tiếng Việt
                </label>
                <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <p className="text-sm text-slate-700 font-bold m-0">
                    {meaning || "—"}
                  </p>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="flex items-center gap-1.5 text-[0.65rem] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  <StickyNote className="w-3 h-3 text-slate-400" />
                  Ghi chú
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Cách dùng trong ngữ cảnh..."
                  rows={3}
                  className="w-full text-sm font-medium text-slate-600 border border-slate-200 rounded-xl px-4 py-3 resize-none outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 transition-all bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 relative z-10">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl text-sm font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer"
              >
                HUỶ
              </button>
              <button
                id={`confirm-save-word-${word}`}
                onClick={handleSave}
                disabled={saving || saved}
                className={`flex-[1.5] py-3 rounded-xl text-sm font-black transition-all border-none cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2
                  ${
                    saved
                      ? "bg-emerald-500 text-white shadow-emerald-100"
                      : saving
                        ? "bg-blue-300 text-white cursor-wait"
                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100"
                  }`}
              >
                {saved ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>ĐÃ LƯU!</span>
                  </>
                ) : saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>XÁC NHẬN LƯU</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
