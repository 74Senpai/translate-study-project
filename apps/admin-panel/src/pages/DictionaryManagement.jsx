import { useEffect, useState } from "react";
import { cmsService } from "@/services/cms";
import { Search, Trash2, Edit2, Check, X, Languages, Sparkles, Wand2, Database } from "lucide-react";

import { useNotify } from "@/hooks/useNotify";

const DictionaryManagement = () => {
  const notify = useNotify();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState("latest");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  // Removing local state notification since we use global now
  // const [notification, setNotification] = useState(null); 
  const limit = 50;

  const loadDictionary = async () => {
    setLoading(true);
    try {
      const skip = (page - 1) * limit;
      const data = await cmsService.getDictionary(
        skip,
        limit,
        searchTerm,
        sortBy,
        mode,
        status,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load dictionary", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page !== 1) setPage(1);
      else loadDictionary();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadDictionary();
  }, [page, sortBy, mode, status]);

  const handleEdit = (item) => {
    setEditingId(item.id);
    const val = item.translation || item.translations;
    setEditValue(Array.isArray(val) ? val.join(", ") : val);
  };

  const handleSave = async (id) => {
    try {
      await cmsService.updateDictionary(id, editValue);
      setItems(
        items.map((item) =>
          item.id === id
            ? { ...item, translation: editValue, is_manually_edited: true }
            : item,
        ),
      );
      notify.success("Translation updated");
      setEditingId(null);
    } catch {
      notify.error("Failed to update translation");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this cache entry?")) {
      try {
        await cmsService.deleteDictionary(id);
        setItems(items.filter((item) => item.id !== id));
      } catch {
        notify.error("Failed to delete entry");
      }
    }
  };

  // Backend already handles filtering, so we just use items directly
  const displayItems = items || [];

  const [maintaining, setMaintaining] = useState(false);

  const handleVerifyDictionary = async () => {
    const reverifyAll = window.confirm(
      "Bạn có muốn KIỂM TRA LẠI (Re-verify) toàn bộ các từ ĐÃ XÁC MINH trước đây không?\n\n" +
      "Chọn OK: Kiểm tra lại toàn bộ từ điển bằng thuật toán Semantic Logic mới (chậm).\n" +
      "Chọn Cancel: Chỉ kiểm tra các từ MỚI chưa được xác minh (nhanh)."
    );
    
    setMaintaining(true);
    try {
      const data = await cmsService.verifyDictionary(reverifyAll);
      if (data.status === "success") {
        notify.success(`Verification complete! Scanned: ${data.scanned}, Passed: ${data.passed}, Deleted: ${data.deleted}, Replaced: ${data.replaced}`);
        loadDictionary();
      } else {
        notify.error("System error: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      notify.error("Network error: Failed to connect to system.");
    } finally {
      setMaintaining(false);
    }
  };

  const handleCleanupDictionary = async () => {
    if (window.confirm("Bạn có chắc chắn muốn dọn dẹp các từ lỗi trong bộ nhớ đệm từ điển? Các mục không hợp lệ hoặc thiếu nghĩa sẽ bị xóa vĩnh viễn.")) {
      setMaintaining(true);
      try {
        const data = await cmsService.cleanupDictionary();
        if (data.status === "success") {
          notify.success(`Cleanup complete! Checked: ${data.checked}, Deleted: ${data.deleted}`);
          loadDictionary();
        } else {
          notify.error("System error: " + (data.message || "Unknown error"));
        }
      } catch (err) {
        notify.error("Network error: Failed to connect to system.");
      } finally {
        setMaintaining(false);
      }
    }
  };

  const handleCleanupSessions = async () => {
    if (window.confirm("Bạn có chắc chắn muốn dọn dẹp các phiên học flashcard đã hoàn thành trên 1 ngày không?")) {
      setMaintaining(true);
      try {
        const data = await cmsService.cleanupSessions();
        if (data.status === "success") {
          notify.success(`Sessions cleanup complete! Deleted ${data.deleted} old sessions.`);
        } else {
          notify.error("System error: " + (data.message || "Unknown error"));
        }
      } catch (err) {
        notify.error("Network error: Failed to connect to system.");
      } finally {
        setMaintaining(false);
      }
    }
  };



  return (
    <div className="space-y-8 font-sans">
      {/* Premium Maintenance Action Card */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="p-1.5 bg-blue-500 rounded-lg text-white">
              <Sparkles size={18} />
            </span>
            Hệ Thống Bảo Trì & Dọn Dẹp
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Kiểm tra tính nhất quán của bộ nhớ đệm từ điển, dọn dẹp từ lỗi và xóa các phiên học flashcard cũ đã qua 1 ngày.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleVerifyDictionary}
            disabled={maintaining}
            className="px-5 py-3 bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 rounded-2xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
          >
            <Search size={16} /> Kiểm Tra Từ Điển
          </button>
          <button
            onClick={handleCleanupDictionary}
            disabled={maintaining}
            className="px-5 py-3 bg-white hover:bg-slate-50 text-rose-600 border border-rose-200 rounded-2xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
          >
            <Wand2 size={16} /> Dọn Dẹp Từ Điển
          </button>
          <button
            onClick={handleCleanupSessions}
            disabled={maintaining}
            className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold text-sm shadow-sm transition-all flex items-center gap-2 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
          >
            <Database size={16} /> Dọn Phiên Học (&gt;1 Ngày)
          </button>
        </div>
      </div>

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Dictionary Cache
          </h1>
          <p className="text-slate-500 mt-2">
            Monitor and correct AI translations from the cache.
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-semibold text-slate-600"
          >
            <option value="">All Modes</option>
            <option value="en-vi">EN → VI</option>
            <option value="vi-en">VI → EN</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-semibold text-slate-600"
          >
            <option value="">All Status</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
            <option value="pending">Pending</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-semibold text-slate-600"
          >
            <option value="latest">Latest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A-Z</option>
            <option value="hits">Most Hits</option>
          </select>
          <div className="relative w-80">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search words..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-100">
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">
                Original Text
              </th>
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">
                Translation
              </th>
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">
                Stats
              </th>
              <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center py-20 animate-pulse">
                  Syncing dictionary...
                </td>
              </tr>
            ) : displayItems.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-20 text-slate-400">
                  No matching entries found.
                </td>
              </tr>
            ) : (
              displayItems.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/50 transition-all group"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-100 p-2 rounded-lg text-slate-500">
                        <Languages size={16} />
                      </div>
                      <span className="font-bold text-slate-800">
                        {item.original}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {item.src} → {item.dest}
                      </span>
                      {item.confirm === true ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded uppercase flex items-center gap-1" title="Bidirectional Verified">
                          <Check size={10} /> Verified
                        </span>
                      ) : item.confirm === false ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-50 text-rose-600 border border-rose-100 rounded uppercase flex items-center gap-1" title="Failed Bidirectional Verification">
                          <X size={10} /> Unverified
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-50 text-slate-500 border border-slate-200 rounded uppercase" title="Waiting for auto-verification">
                          Pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    {editingId === item.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => handleSave(item.id)}
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">
                          {(() => {
                            const val = item.translation || item.translations;
                            if (!val) return "(Empty)";
                            if (Array.isArray(val)) return val.join(", ");
                            if (typeof val === "object")
                              return (
                                JSON.stringify(val).substring(0, 50) + "..."
                              );
                            return val;
                          })()}
                        </span>
                        {item.is_manually_edited && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-100 rounded uppercase">
                            Edited
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-8 py-6 text-sm text-slate-400">
                    <div className="flex flex-col">
                      <span>{item.hit_count || 0} hits</span>
                      <span className="text-[10px]">
                        ID: {item.id.substring(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <p className="text-slate-500 text-sm">
          Showing{" "}
          <span className="font-bold text-slate-900">{items.length}</span> of{" "}
          <span className="font-bold text-slate-900">{total}</span> items
        </p>
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-all font-semibold"
          >
            Previous
          </button>
          <div className="flex items-center px-4 font-bold text-slate-700 bg-slate-50 rounded-lg border border-slate-200">
            {page}
          </div>
          <button
            disabled={page * limit >= total}
            onClick={() => setPage(page + 1)}
            className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-all font-semibold"
          >
            Next
          </button>
        </div>
      </div>

    </div>
  );
};

export default DictionaryManagement;
