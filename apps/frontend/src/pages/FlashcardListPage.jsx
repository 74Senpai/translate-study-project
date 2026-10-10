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

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSets();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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
            <button className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm">
              <Filter className="w-4 h-4" />
              All Levels
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">
              Showing <b>{filteredSets.length}</b> public sets
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

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!set.id) return;
                        
                        // Set basic info immediately
                        setSelectedSet(set);
                        setUsageData(null);
                        setFetchingUsage(true);

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
          <div className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10">
              <div className="flex items-center justify-between mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <Layers className="w-8 h-8" />
                </div>
                <button 
                  onClick={() => setSelectedSet(null)}
                  className="p-3 hover:bg-slate-50 rounded-2xl text-slate-400 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <h2 className="text-3xl font-black text-slate-800 mb-4">{selectedSet.title}</h2>
              <p className="text-slate-500 font-medium leading-relaxed mb-8">
                {selectedSet.description || "No description available for this flashcard set."}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <BookOpen className="w-5 h-5 text-indigo-500" />
                    <span className="text-sm font-black text-slate-400 uppercase tracking-wider">Thẻ bài</span>
                  </div>
                  <div className="text-2xl font-black text-slate-800">
                    {(selectedSet.cards || []).length} Units
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-black text-slate-400 uppercase tracking-wider">Lượt chơi</span>
                  </div>
                  <div className="text-2xl font-black text-slate-800">
                    {fetchingUsage ? (
                      <div className="h-8 w-16 bg-slate-200 animate-pulse rounded-lg" />
                    ) : usageData ? (
                      usageData.daily_limit === 0 ? "Vô hạn" : `${usageData.remaining_attempts}/${usageData.daily_limit}`
                    ) : (
                      "5 lượt/ngày"
                    )}
                  </div>
                </div>
              </div>

              {usageData?.remaining_attempts === 0 && (
                <div className="mb-8 p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-4">
                  <AlertCircle className="w-6 h-6 text-rose-500 shrink-0" />
                  <div>
                    <h4 className="text-rose-800 font-black text-sm uppercase tracking-wider">Hết lượt chơi hôm nay</h4>
                    <p className="text-rose-600 text-xs font-bold mt-1">Vui lòng quay lại vào ngày mai để tiếp tục thử thách.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={() => setSelectedSet(null)}
                  className="flex-1 py-4 px-6 bg-slate-50 text-slate-600 font-black rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
                >
                  QUAY LẠI
                </button>
                <button 
                  disabled={usageData?.remaining_attempts === 0}
                  onClick={() => navigate(`/flashcards/play/${selectedSet.id}`)}
                  className={`flex-[2] py-4 px-6 flex items-center justify-center gap-3 font-black rounded-2xl transition-all active:scale-95 shadow-xl ${
                    usageData?.remaining_attempts === 0
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20"
                  }`}
                >
                  <Play className="w-5 h-5 fill-current" />
                  {usageData?.remaining_attempts === 0 ? "HẾT LƯỢT" : "BẮT ĐẦU CHƠI"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

