/**
 * S-V-O structure card — displays subject, verb, object breakdown.
 */
export default function SvoStructure({ structure }) {
  const items = [
    { key: "subject", label: "Chủ ngữ" },
    { key: "verb", label: "Động từ" },
    { key: "object", label: "Tân ngữ" },
  ];

  return (
    <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase mb-2.5 tracking-wider">
        Cấu trúc S-V-O
      </label>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ key, label }) => (
          <div key={key} className="bg-slate-50 p-3 rounded-xl text-center">
            <span className="block text-[0.65rem] text-slate-500 uppercase mb-1">
              {label}
            </span>
            <strong className="text-blue-600 text-base font-semibold">
              {structure[key] || "—"}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}
