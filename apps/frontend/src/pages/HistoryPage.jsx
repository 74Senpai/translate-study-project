import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useHistory } from "@/hooks/useHistory";
import { History, Trash2, Search, Inbox, AlertCircle } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ModeBadge({ sourceLang }) {
  const isViEn = sourceLang === "vi";
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${isViEn ? "bg-blue-500" : "bg-purple-500"} animate-pulse`}
      />
      <span
        className={`inline-block text-[0.6rem] font-black px-2 py-0.5 rounded-md uppercase tracking-widest
        ${isViEn ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"}`}
      >
        {isViEn ? "VI → EN" : "EN → VI"}
      </span>
    </div>
  );
}

function HistoryCard({ item, onDelete }) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start gap-3 mb-2">
        <ModeBadge sourceLang={item.source_lang} />
        <span className="text-[0.65rem] text-slate-400 shrink-0">
          {formatTime(item.created_at)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Gốc
          </p>
          <p className="text-sm text-slate-800 font-medium leading-relaxed line-clamp-3">
            {item.source_text}
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Dịch
          </p>
          <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
            {item.translated_text}
          </p>
        </div>
      </div>

      <div className="flex justify-end mt-3 pt-2 border-t border-slate-50">
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="flex items-center gap-1.5 text-[0.7rem] text-slate-400 hover:text-red-500 transition-all border-none bg-transparent cursor-pointer font-bold group/del"
          >
            <Trash2 className="w-3.5 h-3.5 group-hover/del:scale-110 transition-transform" />
            <span>Xoá</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <span className="text-[0.7rem] text-slate-500 font-medium">
              Xác nhận xoá?
            </span>
            <button
              onClick={() => onDelete(item.id)}
              className="text-[0.7rem] font-bold text-white bg-red-500 px-3 py-1 rounded-lg hover:bg-red-600 border-none cursor-pointer transition shadow-sm shadow-red-100"
            >
              Xoá
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="text-[0.7rem] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg hover:bg-slate-200 border-none cursor-pointer transition"
            >
              Huỷ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const {
    items,
    total,
    hasMore,
    isLoading,
    error,
    load,
    loadMore,
    handleSearch,
    handleDelete,
    handleClearAll,
  } = useHistory();

  const [searchInput, setSearchInput] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (isAuthenticated) load(1, "");
  }, [isAuthenticated, load]);

  const onSearchSubmit = (e) => {
    e.preventDefault();
    handleSearch(searchInput);
  };

  if (loading) return null;

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Lịch sử dịch — DeepTranslate</title>
        <meta
          name="description"
          content="Xem lại lịch sử các lượt dịch của bạn trên DeepTranslate."
        />
      </Helmet>

      <Header />

      <main className="flex-1">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
              <History className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 m-0 tracking-tight">
                Lịch sử dịch
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                {total > 0 ? `${total} lượt dịch đã lưu` : "Chưa có lịch sử"}
              </p>
            </div>
          </div>

          {total > 0 && (
            <div className="shrink-0">
              {!showClearConfirm ? (
                <button
                  id="clear-all-history-btn"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-2 text-sm font-bold text-red-500 hover:text-white hover:bg-red-500 bg-red-50 px-4 py-2.5 rounded-xl border-none cursor-pointer transition-all active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Xoá tất cả</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-xl animate-in zoom-in duration-200">
                  <span className="text-sm text-red-600 font-bold">
                    Xoá hết?
                  </span>
                  <button
                    onClick={() => {
                      handleClearAll();
                      setShowClearConfirm(false);
                    }}
                    className="text-sm font-bold text-white bg-red-500 px-4 py-1.5 rounded-lg border-none cursor-pointer hover:bg-red-600 transition shadow-sm"
                  >
                    Có
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="text-sm font-bold text-slate-600 bg-white px-4 py-1.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition"
                  >
                    Huỷ
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <form onSubmit={onSearchSubmit} className="mb-8 flex gap-2 relative">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
            <input
              id="history-search-input"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm kiếm trong lịch sử..."
              className="w-full text-sm border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-500/5 transition-all bg-white"
            />
          </div>
          <button
            type="submit"
            className="px-8 py-3.5 bg-slate-900 text-white text-sm font-black rounded-2xl hover:bg-blue-600 transition-all border-none cursor-pointer active:scale-95 shadow-lg shadow-slate-200"
          >
            TÌM KIẾM
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-5 py-4 rounded-2xl mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-24 bg-white rounded-[2rem] border border-slate-100 shadow-sm mb-8">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Inbox className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-1">
              Chưa có lịch sử dịch nào
            </h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Hãy dịch một câu gì đó và hệ thống sẽ tự động lưu lại lịch sử cho
              bạn.
            </p>
          </div>
        )}

        {/* History list */}
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} onDelete={handleDelete} />
          ))}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="mt-5 text-center">
            <button
              id="load-more-history-btn"
              onClick={loadMore}
              disabled={isLoading}
              className="px-8 py-2.5 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200 transition border-none cursor-pointer disabled:opacity-50"
            >
              {isLoading ? "Đang tải..." : "Xem thêm"}
            </button>
          </div>
        )}

        {isLoading && items.length === 0 && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
