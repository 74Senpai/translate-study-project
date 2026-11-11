import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  Play,
  Clock,
  Search,
  BookOpen,
  Filter,
  Star,
  Lock,
  Unlock,
  AlertCircle,
  X,
  Key,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Boxes,
} from "lucide-react";
import axiosInstance from "@/services/axiosInstance";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Helmet } from "react-helmet-async";

export default function FlashcardListPage() {
  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSet, setSelectedSet] = useState(null);
  const [fetchingUsage, setFetchingUsage] = useState(false);
  const [usageData, setUsageData] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [leitnerStats, setLeitnerStats] = useState(null);
  const [selectedBoxMode, setSelectedBoxMode] = useState("default");
  const [expandedQueue, setExpandedQueue] = useState(null);
  const navigate = useNavigate();

  const fetchSets = async () => {
    try {
      const { data } = await axiosInstance.get("/flashcards");
      setSets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeitnerStats = async () => {
    try {
      const { data } = await axiosInstance.get("/flashcards/user-leitner-stats");
      setLeitnerStats(data);
    } catch (err) {
      // Guest or not logged in, ignore
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSets();
      fetchLeitnerStats();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleJoinPrivateSet = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      setJoining(true);
      setInviteError("");
      const { data } = await axiosInstance.post("/flashcards/join-private", {
        invite_code: inviteCode.trim(),
      });
      setShowInviteModal(false);
      setInviteCode("");
      await fetchSets();
      if (data.set_id) {
        navigate(`/flashcards/play/${data.set_id}`);
      }
    } catch (err) {
      setInviteError(
        err.response?.data?.detail || "Mã mời không hợp lệ hoặc bộ thẻ không tồn tại."
      );
    } finally {
      setJoining(false);
    }
  };

  const filteredSets = sets
    .filter((set) => set.is_public !== false)
    .filter(
      (set) =>
        set.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        set.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Flashcard Library - DeepTranslate</title>
        <meta
          name="description"
          content="Master languages with our public interactive flashcard sets."
        />
      </Helmet>
      <Header />

      <main className="flex-1 py-12 px-4">
        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 px-4">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flashcard sets..."
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 outline-none text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white transition-all shadow-sm font-semibold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-2xl font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
            >
              <Key className="w-4 h-4" />
              Nhập mã mời
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">
              Showing <b>{filteredSets.length}</b> sets
            </span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-slate-100 rounded-[2.5rem] h-80 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredSets.map((set) => {
              const dailyLimit = set.settings?.daily_limit ?? 5;
              const requiresLogin = dailyLimit > 0;

              return (
                <div
                  key={set.id}
                  className="group bg-white rounded-[2.5rem] p-8 border border-slate-200 hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/5 transition-all duration-500 relative flex flex-col h-full overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500">
                      <Layers className="w-7 h-7" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {requiresLogin ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-black text-amber-700 uppercase tracking-widest">
                          <Lock className="w-3 h-3" />
                          Cần đăng nhập
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                          <Unlock className="w-3 h-3" />
                          Miễn phí
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        Featured
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xl font-black text-slate-800 mb-3 group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {set.title}
                    </h3>
                    <p className="text-slate-500 text-sm font-medium mb-6 line-clamp-3 leading-relaxed">
                      {set.description ||
                        "No description available for this flashcard set."}
                    </p>
                  </div>

                  <div className="space-y-6 mt-auto pt-6 border-t border-slate-100">
                    {(() => {
                      const totalCards = (set.cards || []).length;
                      const sessionCardCount = Math.min(
                        set.settings?.total_cards || 20,
                        totalCards,
                      );
                      const averageTimer =
                        totalCards > 0
                          ? (set.cards || []).reduce(
                              (acc, card) => acc + (card.timer || 15),
                              0,
                            ) / totalCards
                          : 15;
                      const totalTimer = Math.round(
                        averageTimer * sessionCardCount,
                      );
                      const formattedMaxTime =
                        totalTimer >= 60
                          ? `${Math.floor(totalTimer / 60)}m ${totalTimer % 60}s`
                          : `${totalTimer}s`;

                      return (
                        <div className="flex flex-wrap items-center gap-4">
                          <div
                            className="flex items-center gap-1 text-slate-400"
                            title="Total cards in set"
                          >
                            <BookOpen className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-black">
                              {totalCards} Cards
                            </span>
                          </div>
                          <div
                            className="flex items-center gap-1 text-slate-400"
                            title="Maximum play time limit"
                          >
                            <Clock className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-black">
                              {formattedMaxTime}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {set.set_type === "user_dynamic" && (
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200/80 rounded-xl text-xs font-black text-indigo-700 shadow-xs">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Cá nhân hóa</span>
                        </div>
                        <span className="text-[11px] font-bold text-slate-400">
                          Spaced Repetition
                        </span>
                      </div>
                    )}

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!set.id) return;
                        
                        // Set basic info immediately & reset box selection to default
                        setSelectedSet(set);
                        setSelectedBoxMode("default");
                        setExpandedQueue(null);
                        setUsageData(null);
                        setFetchingUsage(true);

                        // Ensure latest leitner stats with transition queues are fetched
                        fetchLeitnerStats();

                        try {
                          // Fetch usage only when clicked to optimize list performance
                          const { data } = await axiosInstance.get(`/flashcards/${set.id}/usage`);
                          setUsageData(data);
                        } catch (err) {
                          console.error("Failed to fetch usage:", err);
                        } finally {
                          setFetchingUsage(false);
                        }
                      }}
                      className="w-full flex items-center justify-center gap-3 py-4 bg-slate-900 group-hover:bg-indigo-600 text-white font-black rounded-2xl transition-all duration-500 active:scale-95 shadow-xl shadow-slate-900/10 group-hover:shadow-indigo-500/20"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      XEM CHI TIẾT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredSets.length === 0 && (
          <div className="text-center py-20 bg-slate-50 rounded-[3rem] border border-dashed border-slate-200">
            <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-300 shadow-sm">
              <Search className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">
              No sets found
            </h3>
            <p className="text-slate-400 font-medium">
              Try adjusting your search or filters.
            </p>
          </div>
        )}
      </main>
      {/* Set Details Overlay */}
      {selectedSet && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div 
            className="absolute inset-0" 
            onClick={() => setSelectedSet(null)} 
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 sm:p-8 pb-4 flex items-start justify-between border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
                  <Layers className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 m-0 line-clamp-1">
                    {selectedSet.title}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-slate-400">
                      {selectedSet.set_type === "user_dynamic" ? "Bộ thẻ cá nhân hóa (Spaced Repetition)" : "Bộ thẻ Flashcard"}
                    </span>
                    {selectedSet.set_type === "user_dynamic" && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-black text-[10px] uppercase tracking-wider border border-indigo-100">
                        Leitner SRS
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedSet(null)}
                className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-400 hover:text-slate-600 transition-colors cursor-pointer border-none bg-transparent"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">
              <p className="text-slate-600 text-sm font-medium leading-relaxed m-0">
                {selectedSet.description || "Bộ thẻ từ vựng với các câu hỏi tương tác theo cấp độ thông thạo."}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Số câu hỏi</span>
                  </div>
                  <div className="text-xl font-black text-slate-800">
                    {(selectedSet.cards && selectedSet.cards.length > 0)
                      ? `${selectedSet.cards.length} thẻ`
                      : `${selectedSet.settings?.total_cards || 20} thẻ/lượt`}
                  </div>
                </div>
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Lượt làm bài</span>
                  </div>
                  <div className="text-xl font-black text-slate-800">
                    {fetchingUsage ? (
                      <div className="h-7 w-20 bg-slate-200 animate-pulse rounded-lg" />
                    ) : usageData ? (
                      usageData.daily_limit === 0 ? "Vô hạn" : `${usageData.remaining_attempts}/${usageData.daily_limit}`
                    ) : (
                      "5 lượt/ngày"
                    )}
                  </div>
                </div>
              </div>

              {/* Leitner Spaced Repetition Section */}
              {selectedSet.set_type === "user_dynamic" && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      Tùy chọn chế độ ôn tập:
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                      {leitnerStats?.total_words ?? 0} từ đang theo dõi
                    </span>
                  </div>

                  {/* Mode Selectors: Default vs Specific Box */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: Theo Mặc Định */}
                    <div
                      onClick={() => {
                        setSelectedBoxMode("default");
                        setExpandedQueue(null);
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                        selectedBoxMode === "default"
                          ? "bg-indigo-50/80 border-indigo-600 shadow-sm"
                          : "bg-slate-50 border-slate-200/80 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          Ôn tập theo mặc định
                        </span>
                        {selectedBoxMode === "default" ? (
                          <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium m-0 leading-relaxed">
                        Thuật toán tự động tổng hợp các từ đến hạn ôn tập từ mọi Box dựa trên độ thông thạo.
                      </p>
                      <span className="mt-2.5 inline-block text-[10px] font-black text-indigo-700 uppercase tracking-wider">
                        ★ Tự động tối ưu (Khuyên dùng)
                      </span>
                    </div>

                    {/* Option 2: Chọn Box Cụ Thể */}
                    <div
                      onClick={() => {
                        if (selectedBoxMode === "default") {
                          setSelectedBoxMode(1);
                        }
                      }}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                        selectedBoxMode !== "default"
                          ? "bg-indigo-50/80 border-indigo-600 shadow-sm"
                          : "bg-slate-50 border-slate-200/80 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <Boxes className="w-4 h-4 text-indigo-600" />
                          Tùy chọn Box cụ thể
                        </span>
                        {selectedBoxMode !== "default" ? (
                          <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium m-0 leading-relaxed">
                        Chọn một Box duy nhất để luyện tập chuyên sâu (Box 1: từ mới, Box 5: củng cố lâu dài).
                      </p>
                      <span className="mt-2.5 inline-block text-[10px] font-black text-slate-600 uppercase tracking-wider">
                        {selectedBoxMode !== "default" ? `Đang chọn: Box ${selectedBoxMode}` : "Nhấn để chọn Box"}
                      </span>
                    </div>
                  </div>

                  {/* Leitner Box Roadmap & Transition Queues */}
                  <div className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl">
                    <div className="text-[11px] font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Các Box & Hàng đợi chuyển giao:</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        Số từ đang chuyển giao giữa các box
                      </span>
                    </div>

                    {/* Boxes and Queues Flow */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                      {(leitnerStats?.box_details || [
                        { box: 1, day_repetition: 1, count: 0, ready_count: 0 },
                        { box: 2, day_repetition: 2, count: 0, ready_count: 0 },
                        { box: 3, day_repetition: 5, count: 0, ready_count: 0 },
                        { box: 4, day_repetition: 8, count: 0, ready_count: 0 },
                        { box: 5, day_repetition: 14, count: 0, ready_count: 0 },
                      ]).map((bItem, idx, allB) => {
                        const bNum = bItem.box;
                        const isSelected = selectedBoxMode === bNum;
                        const isLast = idx === allB.length - 1;
                        const readyCount = bItem.ready_count !== undefined ? bItem.ready_count : (leitnerStats?.boxes?.[String(bNum)] || 0);

                        // Find queue between bNum and next box
                        const nextB = allB[idx + 1]?.box;
                        const queueItem = (leitnerStats?.queues || []).find(
                          (q) => q.from_box === bNum && q.to_box === nextB
                        );
                        const queueCount = queueItem?.count || 0;

                        return (
                          <div key={bNum} className="flex items-center gap-2 shrink-0">
                            {/* Box Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBoxMode(bNum);
                              }}
                              className={`p-2.5 rounded-xl border flex flex-col items-center justify-center min-w-[76px] transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md scale-105"
                                  : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300"
                              }`}
                            >
                              <span className={`text-[11px] font-black ${isSelected ? "text-white" : "text-slate-800"}`}>
                                Box {bNum}
                              </span>
                              <span className={`text-[10px] font-bold ${isSelected ? "text-indigo-100" : "text-indigo-600"}`}>
                                {readyCount} từ sẵn sàng
                              </span>
                              <span className={`text-[9px] font-medium ${isSelected ? "text-indigo-200" : "text-slate-400"}`}>
                                ({bItem.day_repetition}d)
                              </span>
                            </button>

                            {/* Transition Queue Indicator between Box bNum and next (No word list) */}
                            {!isLast && (
                              <div className="flex flex-col items-center">
                                <div
                                  className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1 shadow-2xs select-none ${
                                    queueCount > 0
                                      ? "bg-amber-50 border-amber-300 text-amber-800 font-black"
                                      : "bg-slate-100 border-slate-200 text-slate-400"
                                  }`}
                                  title={`Hàng đợi chuyển giao Box ${bNum} ➔ Box ${nextB}: ${queueCount} từ`}
                                >
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>{queueCount}</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-300 mt-0.5" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {usageData?.remaining_attempts === 0 && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-rose-800 font-black text-xs uppercase tracking-wider m-0">Hết lượt chơi hôm nay</h4>
                    <p className="text-rose-600 text-xs font-semibold mt-1 m-0">Vui lòng quay lại vào ngày mai để tiếp tục thử thách.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer with Actions (Always visible) */}
            <div className="p-6 sm:p-8 pt-4 border-t border-slate-100 bg-white flex gap-4 shrink-0">
              <button 
                onClick={() => setSelectedSet(null)}
                className="flex-1 py-4 px-6 bg-slate-100 text-slate-700 font-black rounded-2xl hover:bg-slate-200 transition-all active:scale-95 cursor-pointer border-none"
              >
                QUAY LẠI
              </button>
              <button 
                disabled={usageData?.remaining_attempts === 0}
                onClick={() => {
                  const boxTarget = selectedSet.set_type === "user_dynamic" && selectedBoxMode !== "default"
                    ? selectedBoxMode
                    : null;
                  if (boxTarget) {
                    navigate(`/flashcards/play/${selectedSet.id}?box=${boxTarget}`);
                  } else {
                    navigate(`/flashcards/play/${selectedSet.id}`);
                  }
                }}
                className={`flex-[2] py-4 px-6 flex items-center justify-center gap-3 font-black rounded-2xl transition-all active:scale-95 shadow-xl border-none cursor-pointer ${
                  usageData?.remaining_attempts === 0
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20"
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                {usageData?.remaining_attempts === 0
                  ? "HẾT LƯỢT"
                  : selectedSet.set_type === "user_dynamic" && selectedBoxMode !== "default"
                  ? `ÔN TẬP BOX ${selectedBoxMode}`
                  : "BẮT ĐẦU CHƠI"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Private Set Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 relative animate-in zoom-in-95 duration-300">
            <button
              onClick={() => {
                setShowInviteModal(false);
                setInviteError("");
              }}
              className="absolute right-6 top-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6">
              <Key className="w-7 h-7" />
            </div>

            <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">
              Tham gia Bộ Thẻ Riêng Tư
            </h3>
            <p className="text-sm text-slate-500 mb-6 font-medium">
              Nhập mã mời được chia sẻ từ người tạo bộ thẻ để mở khóa và bắt đầu luyện tập.
            </p>

            {inviteError && (
              <div className="flex items-center gap-2 p-4 bg-rose-50 text-rose-600 rounded-2xl mb-6 text-sm font-bold border border-rose-100">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleJoinPrivateSet} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="VD: A1B2C3"
                  maxLength={10}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-6 text-center text-xl font-mono font-black text-slate-800 placeholder:text-slate-300 focus:bg-white focus:border-indigo-500 outline-none uppercase tracking-widest transition-all"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all"
                >
                  HỦY
                </button>
                <button
                  type="submit"
                  disabled={joining || !inviteCode.trim()}
                  className="flex-[2] py-4 px-6 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                >
                  {joining ? "ĐANG KIỂM TRA..." : "THAM GIA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

