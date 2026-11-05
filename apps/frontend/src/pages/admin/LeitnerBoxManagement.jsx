import { useState, useEffect } from "react";
import {
  Boxes,
  Layers,
  ArrowRight,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Info,
  CheckCircle2,
  Calendar,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotify } from "@/hooks/useNotify";
import axiosInstance from "@/services/axiosInstance";

export default function LeitnerBoxManagement() {
  const { user } = useAuth();
  const notify = useNotify();

  const userRoles = user?.roles || (user?.is_admin ? ["ADMIN"] : []);
  const isAdmin = user?.is_admin || userRoles.includes("ADMIN");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [boxes, setBoxes] = useState([1, 2, 5, 8, 14]);
  const [initialBoxes, setInitialBoxes] = useState([1, 2, 5, 8, 14]);
  const [systemStats, setSystemStats] = useState(null);
  const [activeQueueTab, setActiveQueueTab] = useState(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const { data } = await axiosInstance.get("/admin/repetition-config");
      if (data && Array.isArray(data.boxes)) {
        setBoxes(data.boxes);
        setInitialBoxes(data.boxes);
      }
      if (data && data.system_stats) {
        setSystemStats(data.system_stats);
      }
    } catch (err) {
      console.error("Error fetching repetition config:", err);
      // Fallback: Try public endpoint if admin endpoint returns 403 or fallback
      try {
        const { data: pubData } = await axiosInstance.get("/flashcards/repetition-config");
        if (pubData && Array.isArray(pubData.boxes)) {
          setBoxes(pubData.boxes);
          setInitialBoxes(pubData.boxes);
        }
      } catch (pubErr) {
        notify.error("Không thể tải cấu hình Spaced Repetition từ hệ thống.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleBoxChange = (index, value) => {
    const val = parseInt(value, 10);
    const newBoxes = [...boxes];
    newBoxes[index] = isNaN(val) ? 1 : Math.max(1, val);
    setBoxes(newBoxes);
  };

  const handleAddBox = () => {
    const lastDay = boxes.length > 0 ? boxes[boxes.length - 1] : 1;
    const nextDay = Math.round(lastDay * 1.8) + 1;
    setBoxes([...boxes, nextDay]);
  };

  const handleRemoveBox = (index) => {
    if (boxes.length <= 2) {
      notify.error("Hệ thống Spaced Repetition cần tối thiểu 2 Box.");
      return;
    }
    const newBoxes = boxes.filter((_, i) => i !== index);
    setBoxes(newBoxes);
  };

  const handleResetDefaults = () => {
    setBoxes([1, 2, 5, 8, 14]);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      notify.error("Chỉ có tài khoản quyền ADMIN mới có thể thay đổi cấu hình cho cả hệ thống.");
      return;
    }

    // Validation: intervals must be positive and preferably increasing
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i] <= 0) {
        notify.error(`Khoảng cách ngày của Box ${i + 1} phải lớn hơn 0.`);
        return;
      }
    }

    try {
      setSaving(true);
      const { data } = await axiosInstance.put("/admin/repetition-config", {
        boxes: boxes,
      });
      setInitialBoxes(data.boxes || boxes);
      if (data.system_stats) {
        setSystemStats(data.system_stats);
      }
      notify.success("Đã cập nhật cấu hình Box ghi nhớ thành công cho toàn hệ thống!");
    } catch (err) {
      console.error("Save repetition config error:", err);
      notify.error(
        err.response?.data?.detail || "Lỗi khi lưu cấu hình Box ghi nhớ."
      );
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = JSON.stringify(boxes) !== JSON.stringify(initialBoxes);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 font-medium animate-pulse">
        Đang tải cấu hình Box ghi nhớ hệ thống...
      </div>
    );
  }

  return (
    <div className="space-y-10 font-sans pb-16">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center shadow-inner">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight m-0">
                  Cài Đặt Box Ghi Nhớ & Hàng Đợi Leitner
                </h1>
                <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Toàn hệ thống
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium mt-1 m-0">
                Cài đặt chu kỳ lặp lại Spaced Repetition (SRS) và theo dõi các hàng đợi chuyển giao từ vựng giữa các box.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetDefaults}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition-all cursor-pointer active:scale-95"
            title="Khôi phục 5 box chuẩn: 1, 2, 5, 8, 14 ngày"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Mặc định (5 Box)</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !isAdmin}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-md active:scale-95 cursor-pointer ${
              !isAdmin
                ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                : hasChanges
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Đang lưu..." : "Lưu Thay Đổi Toàn Hệ Thống"}</span>
          </button>
        </div>
      </div>

      {/* Admin Privilege Banner */}
      {!isAdmin ? (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-4">
          <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-rose-900 font-black text-sm m-0">
              Quyền Hạn Hạn Chế: Chỉ Quyền ADMIN Mới Được Thay Đổi
            </h3>
            <p className="text-rose-700 text-xs font-semibold mt-1 m-0 leading-relaxed">
              Bạn đang đăng nhập với vai trò không phải ADMIN. Bạn chỉ có quyền xem cấu hình hệ thống hiện tại, không thể sửa đổi khoảng cách lặp lại của các Box ghi nhớ.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-2xl flex items-center justify-between text-indigo-950">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-bold">
              Quyền quản trị ADMIN: Mọi thay đổi về số lượng Box và số ngày lặp lại sẽ áp dụng ngay lập tức cho toàn bộ người dùng khi làm Flashcard.
            </span>
          </div>
          {hasChanges && (
            <span className="text-xs font-black text-amber-600 bg-amber-100/80 px-2.5 py-1 rounded-lg">
              Có thay đổi chưa lưu!
            </span>
          )}
        </div>
      )}

      {/* Section 1: Box Configuration Inputs */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 m-0">
              <Layers className="w-5 h-5 text-indigo-600" />
              <span>Cấu Hình Các Box Ghi Nhớ (Leitner Boxes)</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Quy định khoảng cách số ngày (day_repetition) cần ôn tập cho từng Box. Trả lời đúng từ sẽ thăng cấp lên Box tiếp theo.
            </p>
          </div>

          <button
            onClick={handleAddBox}
            disabled={!isAdmin}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-600 hover:text-white text-indigo-700 rounded-xl text-xs font-black transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Box Mới</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {boxes.map((days, idx) => {
            const boxNum = idx + 1;
            const isLast = idx === boxes.length - 1;
            const statsForBox = systemStats?.boxes?.[boxNum] || {};

            return (
              <div
                key={boxNum}
                className="bg-slate-50/70 border border-slate-200/80 rounded-3xl p-6 flex flex-col justify-between relative group hover:border-indigo-400 hover:shadow-lg transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                      {boxNum}
                    </span>
                    <span className="text-sm font-black text-slate-800">
                      Box {boxNum}
                    </span>
                  </div>

                  {isLast && boxes.length > 2 && isAdmin && (
                    <button
                      onClick={() => handleRemoveBox(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                      title="Xóa Box cuối cùng"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
                      Khoảng cách ngày ôn tập:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={days}
                        disabled={!isAdmin}
                        onChange={(e) => handleBoxChange(idx, e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-3 font-black text-slate-800 text-lg outline-none focus:border-indigo-500 transition-all disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        ngày
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>Chu kỳ ôn:</span>
                      <span className="font-bold text-slate-800">
                        {days === 1 ? "Mỗi ngày" : `Mỗi ${days} ngày`}
                      </span>
                    </div>
                    {statsForBox.total_count !== undefined && (
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Từ toàn hệ thống:</span>
                        <span className="font-black text-indigo-600">
                          {statsForBox.total_count} từ
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Pipeline of Boxes & Transition Queues */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-black text-slate-900 m-0">
              Sơ Đồ Chu Trình Spaced Repetition & Các Hàng Đợi Chuyển Giao
            </h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Hiển thị trực quan luồng từ vựng di chuyển giữa các Box. Khi người dùng trả lời đúng, từ sẽ vào hàng đợi chuyển giao chờ đến hạn ôn tập (next_review) của Box kế tiếp.
          </p>
        </div>

        {/* Visual Pipeline with Queues in between */}
        <div className="overflow-x-auto pb-4">
          <div className="flex items-center gap-3 min-w-[700px]">
            {boxes.map((days, idx) => {
              const boxNum = idx + 1;
              const isLast = idx === boxes.length - 1;
              const nextBoxNum = boxNum + 1;
              const queueKey = `q_${boxNum}_${nextBoxNum}`;
              const queueData = systemStats?.queues?.find(
                (q) => q.from_box === boxNum && q.to_box === nextBoxNum
              );
              const queueCount = queueData?.count || 0;

              return (
                <div key={boxNum} className="flex items-center gap-3 shrink-0">
                  {/* Box Card */}
                  <div className="w-40 p-4 bg-gradient-to-b from-indigo-50/80 to-slate-50 border-2 border-indigo-200 rounded-3xl text-center shadow-xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                      BOX {boxNum}
                    </span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {days} <span className="text-xs font-bold text-slate-500">ngày</span>
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 mt-2">
                      {boxNum === 1 ? "Mới học & Hay quên" : boxNum === boxes.length ? "Làm chủ hoàn toàn" : "Đang ghi nhớ"}
                    </div>
                  </div>

                  {/* Transition Queue Arrow between Box idx and idx+1 */}
                  {!isLast && (
                    <div className="flex flex-col items-center justify-center px-2">
                      <div
                        onClick={() => setActiveQueueTab(activeQueueTab === queueKey ? null : queueKey)}
                        className={`px-3 py-1.5 rounded-2xl border text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-xs ${
                          queueCount > 0
                            ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 scale-105"
                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                        }`}
                        title={`Bấm để xem danh sách từ trong hàng đợi Box ${boxNum} ➔ Box ${nextBoxNum}`}
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>Hàng đợi: {queueCount} từ</span>
                      </div>
                      <div className="flex items-center text-indigo-300 mt-1">
                        <ArrowRight className="w-6 h-6 stroke-[2.5]" />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400">
                        {boxNum} ➔ {nextBoxNum}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Queue Words Drawer / View */}
        {activeQueueTab && (
          <div className="mt-6 p-6 bg-amber-50/60 border border-amber-200 rounded-3xl animate-in fade-in">
            {(() => {
              const activeQueue = systemStats?.queues?.find((q) => q.id === activeQueueTab);
              const wordsList = activeQueue?.words || [];

              return (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-700" />
                      <h3 className="text-base font-black text-amber-950 m-0">
                        Các từ vựng đang trong hàng đợi chuyển giao ({activeQueue?.from_box} ➔ {activeQueue?.to_box})
                      </h3>
                    </div>
                    <span className="text-xs font-black text-amber-800 bg-amber-200/80 px-2.5 py-1 rounded-xl">
                      {wordsList.length} từ hiển thị
                    </span>
                  </div>

                  {wordsList.length === 0 ? (
                    <p className="text-xs font-medium text-amber-800 m-0">
                      Hiện chưa có từ nào trong hàng đợi chuyển giao này trên toàn hệ thống.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {wordsList.map((item, wIdx) => (
                        <div
                          key={wIdx}
                          className="p-3 bg-white border border-amber-200 rounded-2xl shadow-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm text-slate-900">
                              {item.word}
                            </span>
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                              Box {item.to_box}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium truncate m-0">
                            {item.meaning || "—"}
                          </p>
                          {item.next_review && (
                            <p className="text-[10px] font-bold text-indigo-600 mt-2 m-0 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>Đến hạn: {new Date(item.next_review).toLocaleDateString()}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Section 3: Recent Transitions Table */}
      {systemStats?.recent_transitions && systemStats.recent_transitions.length > 0 && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-900 m-0 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <span>Từ Vựng Đang Trong Quá Trình Chuyển Giao (Mới nhất)</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Danh sách các từ gần đây nhất đã được thăng cấp và đang đếm ngược chờ đến hạn ôn tập của Box tiếp theo.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase text-slate-400">
                  <th className="pb-3 px-4">Từ vựng</th>
                  <th className="pb-3 px-4">Nghĩa tiếng Việt</th>
                  <th className="pb-3 px-4">Chuyển giao</th>
                  <th className="pb-3 px-4">Box đích</th>
                  <th className="pb-3 px-4">Lịch ôn tập tiếp theo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {systemStats.recent_transitions.map((item, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-black text-slate-900">
                      {item.word}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-600">
                      {item.meaning || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black border border-indigo-100">
                        <span>Box {item.from_box}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span>Box {item.to_box}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-700">
                      Box {item.to_box}
                    </td>
                    <td className="py-3 px-4 text-xs font-bold text-slate-500">
                      {item.next_review ? new Date(item.next_review).toLocaleString() : "Đang chờ"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

