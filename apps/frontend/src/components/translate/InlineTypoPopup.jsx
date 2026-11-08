import { useState, useEffect } from "react";

/**
 * InlineTypoPopup:
 * - Single-line horizontal tabs (tab ngang, 1 dòng)
 * - Minimalist: no visible prompt/instruction text (details appear only on hover tooltip)
 * - Displays a 3-word circular sliding window from all available suggestions
 * - When user tabs, items scroll in a ring (cuộn các từ theo vòng)
 * - Click or Enter to choose
 */
export default function InlineTypoPopup({
  coords,
  suggestions = [],
  selectedIndex = 0,
  onSelectSuggestion,
  onClose,
}) {
  const [windowStart, setWindowStart] = useState(0);

  const total = suggestions.length;

  useEffect(() => {
    setWindowStart(0);
  }, [suggestions]);

  useEffect(() => {
    if (total <= 3) {
      setWindowStart(0);
      return;
    }

    const forwardDist = (selectedIndex - windowStart + total) % total;
    if (forwardDist >= 3) {
      const backwardDist = (windowStart - selectedIndex + total) % total;
      if (backwardDist < forwardDist) {
        setWindowStart(selectedIndex);
      } else {
        setWindowStart((selectedIndex - 2 + total) % total);
      }
    }
  }, [selectedIndex, total, windowStart]);

  if (!coords || !suggestions || suggestions.length === 0) return null;

  const visibleCount = Math.min(3, total);
  const visibleItems = [];

  for (let i = 0; i < visibleCount; i++) {
    const actualIndex = (windowStart + i) % total;
    visibleItems.push({
      item: suggestions[actualIndex],
      originalIndex: actualIndex,
      isSelected: actualIndex === selectedIndex,
    });
  }

  return (
    <div
      style={{
        top: `${coords.top + coords.height + 4}px`,
        left: `${Math.max(8, coords.left)}px`,
      }}
      title={`Gợi ý sửa từ (${selectedIndex + 1}/${total}) • Nhấn Enter hoặc click để chọn • Tab để cuộn • Space để bỏ qua`}
      className="absolute z-50 flex flex-row items-center gap-1.5 p-1.5 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-xl border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150 select-none whitespace-nowrap"
    >
      {visibleItems.map(({ item, originalIndex, isSelected }) => (
        <button
          key={originalIndex}
          type="button"
          title={`Gợi ý: "${item}" (${originalIndex + 1}/${total}) • Nhấn Enter hoặc click để chọn • Tab để chuyển từ • Space để bỏ qua`}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur on textarea
            onSelectSuggestion(item);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            isSelected
              ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30 scale-105"
              : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
