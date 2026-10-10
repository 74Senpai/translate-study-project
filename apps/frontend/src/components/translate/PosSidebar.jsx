import { POS_COLORS, POS_REFERENCE } from "@/constants/pos";
import { BookOpen } from "lucide-react";

/**
 * Sidebar reference card listing all POS types with hover details.
 */
export default function PosSidebar({ activeFilters, onToggle }) {
  return (
    <aside className="hidden lg:block relative">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm sticky top-5">
        <h3 className="text-base font-black m-0 mb-4 text-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-blue-600" />
          </div>
          Thư viện từ loại
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          Rê chuột để tra cứu, Click để bật/tắt
        </p>

        <div className="flex flex-col gap-2">
          {Object.entries(POS_REFERENCE).map(([key, info]) => {
            const isActive = activeFilters.includes(key);
            return (
              <div
                key={key}
                id={`sidebar-${key.toLowerCase()}`}
                onClick={() => onToggle(key)}
                className={`group rounded-xl p-2.5 transition-all duration-300 border cursor-pointer ${
                  isActive
                    ? "bg-slate-50 hover:bg-white hover:shadow-md hover:border-slate-200 border-transparent"
                    : "bg-white border-dashed border-slate-200 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: POS_COLORS[key] }}
                  />
                  <div className="flex justify-between items-center w-full">
                    <div>
                      <span className="font-bold text-[0.85rem] text-slate-800">
                        {key}
                      </span>
                      <span className="text-[0.8rem] text-slate-500">
                        {" "}
                        ({info.vn})
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold ${
                        isActive ? "text-blue-600" : "text-slate-400"
                      }`}
                    >
                      {isActive ? "ON" : "OFF"}
                    </span>
                  </div>
                </div>

                {/* Hover expand */}
                <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-[100px] group-hover:opacity-100 group-hover:mt-2 group-hover:pt-2 group-hover:border-t group-hover:border-dashed group-hover:border-slate-200">
                  <p className="text-[0.8rem] m-0 text-slate-500 mb-1">
                    <strong className="text-slate-700 font-semibold">
                      Đặc điểm:
                    </strong>{" "}
                    {info.definition}
                  </p>
                  <p className="text-[0.8rem] m-0 text-slate-500">
                    <strong className="text-slate-700 font-semibold">
                      Nhận biết:
                    </strong>{" "}
                    {info.identity}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
