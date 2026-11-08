/**
 * S-V-O structure card — displays sentence structure breakdown.
 */
export default function SvoStructure({ structure }) {
  if (!structure) return null;

  const isValid = structure.is_valid && structure.pattern !== "Không xác định";
  const items = [
    { key: "subject", label: "Chủ ngữ (S)" },
    { key: "verb", label: "Động từ (V)" },
    { key: "object", label: "Tân ngữ (O)" },
  ];

  return (
    <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-2.5">
        <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase tracking-wider">
          Cấu trúc ngữ pháp
        </label>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            isValid
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-slate-100 text-slate-500 border-slate-200"
          }`}
        >
          {structure.pattern || (isValid ? "S-V-O" : "Không xác định")}
        </span>
      </div>

      {isValid ? (
        <div className="grid grid-cols-3 gap-3">
          {items.map(({ key, label }) => (
            <div key={key} className="bg-slate-50 p-3 rounded-xl text-center">
              <span className="block text-[0.65rem] text-slate-500 uppercase mb-1 font-medium">
                {label}
              </span>
              <strong className="text-blue-600 text-base font-semibold break-words">
                {structure[key] || "—"}
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic text-center py-2 bg-slate-50 rounded-xl">
          Không phát hiện cấu trúc câu hoàn chỉnh (cụm từ hoặc cú pháp không xác định).
        </p>
      )}
    </section>
  );
}
