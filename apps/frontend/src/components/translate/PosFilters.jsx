import { POS_COLORS, POS_REFERENCE } from "@/constants/pos";

/**
 * Row of toggle buttons — one per POS type.
 * Active filters are highlighted in their POS colour.
 */
export default function PosFilters({ activeFilters, onToggle, onToggleAll }) {
  const allActive = activeFilters.length === Object.keys(POS_REFERENCE).length;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {Object.keys(POS_REFERENCE).map((pos) => (
        <button
          key={pos}
          id={`filter-${pos.toLowerCase()}`}
          onClick={() => onToggle(pos)}
          style={{
            backgroundColor: activeFilters.includes(pos)
              ? POS_COLORS[pos]
              : "#f1f5f9",
            color: activeFilters.includes(pos) ? "white" : "#64748b",
          }}
          className="text-[10px] font-bold py-1 px-2.5 rounded-full transition-all border-none cursor-pointer"
        >
          {pos}
        </button>
      ))}
      <button
        id="filter-toggle-all"
        onClick={onToggleAll}
        className="text-[10px] font-bold py-1 px-2.5 rounded-full bg-slate-800 text-white border-none cursor-pointer"
      >
        {allActive ? "Ẩn tất cả" : "Hiện tất cả"}
      </button>
    </div>
  );
}
