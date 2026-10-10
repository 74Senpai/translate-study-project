import { useEffect, useState, useCallback, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import {
  Search,
  TrendingUp,
  Clock,
  Volume2,
  Globe,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Zap,
  BarChart2,
  Eye,
  Languages,
  CalendarDays,
  Filter,
  SortAsc,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getTrackedWords } from "@/services/translateApi";
import { speakWord } from "@/utils/speech";

/* ─── helpers ─────────────────────────────────────────────────────── */

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRelative(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ngày trước`;
  return formatDate(iso);
}

/* Last-6-month mini bar chart */
function MonthlyBar({ monthly_stats }) {
  if (!monthly_stats || Object.keys(monthly_stats).length === 0) return null;

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return d.toISOString().slice(0, 7); // "YYYY-MM"
  });

  const max = months.reduce((m, k) => {
    const v = (monthly_stats[k]?.translations ?? 0) + (monthly_stats[k]?.encounters ?? 0);
    return Math.max(m, v);
  }, 1);

  return (
    <div className="flex items-end gap-0.5 h-8">
      {months.map((m) => {
        const val = (monthly_stats[m]?.translations ?? 0) + (monthly_stats[m]?.encounters ?? 0);
        const pct = Math.round((val / max) * 100);
        const label = m.slice(5); // "MM"
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-0.5" title={`${m}: ${val}`}>
            <div
              className="w-full rounded-sm bg-blue-400 transition-all"
              style={{ height: `${Math.max(pct, val > 0 ? 15 : 2)}%`, opacity: val > 0 ? 1 : 0.2 }}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ─── Word Card ────────────────────────────────────────────────────── */

function WordCard({ item }) {
  const [showPages, setShowPages] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const totalUrls = item.pages?.length ?? 0;
  const hasMonthly = item.monthly_stats && Object.values(item.monthly_stats).some(
    (m) => (m.translations ?? 0) + (m.encounters ?? 0) > 0
  );

  const totalActivity = (item.encounters_count ?? 0) + (item.translations_count ?? 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden group">
      {/* ── Top accent bar based on total activity ── */}
      <div
        className="h-1 w-full"
        style={{
          background:
            totalActivity > 20
              ? "linear-gradient(90deg,#7c3aed,#a855f7)"
              : totalActivity > 5
              ? "linear-gradient(90deg,#3b82f6,#6366f1)"
              : "linear-gradient(90deg,#94a3b8,#cbd5e1)",
        }}
      />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black text-slate-800 m-0 leading-snug group-hover:text-blue-600 transition-colors truncate">
              {item.word}
            </h3>
            {item.last_active_at && (
              <p className="text-[0.65rem] text-slate-400 font-medium mt-0.5">
                {formatRelative(item.last_active_at)}
              </p>
            )}
          </div>
          <button
            onClick={() => speakWord(item.word)}
            title="Nghe phát âm"
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-500 transition-all border-none cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <div>
              <p className="text-[0.6rem] font-black text-slate-400 uppercase tracking-wider leading-none">Gặp</p>
              <p className="text-base font-black text-slate-700 leading-snug">{item.encounters_count ?? 0}</p>
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl px-3 py-2 flex items-center gap-2">
            <Languages className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div>
              <p className="text-[0.65rem] font-black text-blue-400 uppercase tracking-wider leading-none">Dịch</p>
              <p className="text-base font-black text-blue-700 leading-snug">{item.translations_count ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Monthly mini chart */}
        {hasMonthly && (
          <div>
            <button
              onClick={() => setShowStats(!showStats)}
              className="w-full flex items-center justify-between mb-1.5 bg-transparent border-none cursor-pointer p-0"
            >
              <span className="text-[0.6rem] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <BarChart2 className="w-3 h-3" /> 6 tháng
              </span>
              {showStats ? (
                <ChevronUp className="w-3 h-3 text-slate-300" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-300" />
              )}
            </button>
            {showStats && <MonthlyBar monthly_stats={item.monthly_stats} />}
          </div>
        )}

        {/* Pages */}
        {totalUrls > 0 && (
          <div className="border-t border-slate-50 pt-2">
            <button
              onClick={() => setShowPages(!showPages)}
              className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0 group/btn"
            >
              <span className="text-[0.65rem] font-bold text-slate-500 flex items-center gap-1 group-hover/btn:text-blue-500 transition-colors">
                <Globe className="w-3 h-3" />
                {totalUrls} trang gặp
              </span>
              {showPages ? (
                <ChevronUp className="w-3 h-3 text-slate-300" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-300" />
              )}
            </button>
            {showPages && (
              <div className="mt-2 space-y-1 max-h-28 overflow-y-auto pr-1">
                {item.pages.map((p, idx) => {
                  let hostname = p.url;
                  try {
                    hostname = new URL(p.url).hostname;
                  } catch (_) {}
                  return (
                    <a
                      key={idx}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex justify-between items-center text-xs bg-slate-50 hover:bg-blue-50 rounded-lg px-2 py-1.5 no-underline transition-colors"
                    >
                      <span className="text-slate-600 truncate max-w-[160px]" title={p.url}>
                        {hostname}
                      </span>
                      <span className="text-blue-500 font-black text-[0.65rem] bg-blue-100 px-1.5 rounded-md ml-2 shrink-0">
                        ×{p.count}
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Last reviewed */}
        {item.last_reviewed_at && (
          <div className="flex items-center gap-1 text-[0.65rem] text-amber-500 font-bold">
            <CalendarDays className="w-3 h-3" />
            Ôn gần nhất: {formatDate(item.last_reviewed_at)}
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── Page ─────────────────────────────────────────────────────────── */

export default function EncounteredWordsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [sortBy, setSortBy] = useState("frequency");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(
    async (p = 1, sort = "frequency", q = "", replace = true) => {
      setIsFetching(true);
      try {
        const data = await getTrackedWords({ page: p, limit: 30, sort, search: q });
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setPage(p);
        setHasMore(data.has_more);
      } catch {
        /* silent */
      } finally {
        setIsFetching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (isAuthenticated) {
      startTransition(() => load(1, sortBy, search, true));
    }
  }, [isAuthenticated, load, sortBy, search]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  if (loading) return null;

  /* ── sort options ── */
  const SORTS = [
    { key: "frequency", label: "Nhiều nhất", icon: TrendingUp },
    { key: "recent", label: "Gần đây", icon: Clock },
  ];

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Từ đã dịch — DeepTranslate</title>
        <meta
          name="description"
          content="Xem toàn bộ từ vựng bạn đã gặp và dịch, thống kê tần suất và trang nguồn."
        />
      </Helmet>

      <Header />

      <main className="flex-1">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
              <Languages className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 m-0 tracking-tight">
                Từ đã dịch
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                {total > 0 ? `${total} từ vựng đã được hệ thống ghi lại` : "Toàn bộ từ vựng tự động ghi lại"}
              </p>
            </div>
          </div>
        </div>

          {/* ── Controls ── */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            {/* Search */}
            <form onSubmit={onSearchSubmit} className="flex gap-2 flex-1">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  id="vocab-search-input"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm từ vựng..."
                  className="w-full text-sm bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10 transition-all"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 text-white text-sm font-black rounded-2xl hover:bg-blue-700 transition border-none cursor-pointer shadow-lg shadow-blue-100 active:scale-95"
              >
                TÌM
              </button>
            </form>

            {/* Sort tabs */}
            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-2xl shadow-sm">
              {SORTS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black transition-all border-none cursor-pointer ${
                    sortBy === key
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-500 hover:text-blue-600 bg-transparent"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Loading ── */}
          {isFetching && items.length === 0 && (
            <div className="flex justify-center py-24">
              <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {/* ── Empty state ── */}
          {!isFetching && items.length === 0 && (
            <div className="text-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <BookOpen className="w-10 h-10 text-blue-200" />
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">
                {search ? `Không tìm thấy "${search}"` : "Chưa có từ nào được ghi lại"}
              </h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {search
                  ? "Thử tìm với từ khác hoặc xoá bộ lọc."
                  : "Khi bạn dùng extension hoặc dịch trực tiếp trên web, các từ sẽ tự động được ghi lại tại đây."}
              </p>
            </div>
          )}

          {/* ── Grid ── */}
          {items.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((item, i) => (
                  <WordCard key={`${item.word}-${i}`} item={item} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="mt-8 text-center">
                  <button
                    id="load-more-vocab-btn"
                    onClick={() => load(page + 1, sortBy, search, false)}
                    disabled={isFetching}
                    className="px-10 py-3.5 bg-white border border-slate-200 text-slate-600 text-sm font-black rounded-2xl hover:border-blue-300 hover:text-blue-700 transition shadow-sm disabled:opacity-50 cursor-pointer active:scale-95"
                  >
                    {isFetching ? "Đang tải..." : "Xem thêm"}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
        <Footer />
    </div>
  );
}
