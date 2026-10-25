import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import {
  Calendar,
  Mail,
  Edit3,
  Plus,
  Trash2,
  Search,
  BookOpen,
  Check,
  X,
  Camera,
  MessageSquare,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import axiosInstance from "@/services/axiosInstance";

export default function MyProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Profile Edit State
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef(null);

  // Personal Words State
  const [words, setWords] = useState([]);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [wordsSearch, setWordsSearch] = useState("");
  const [wordsSort, setWordsSort] = useState("last_seen");
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState(null); // null = add new, object = edit
  const [savingWord, setSavingWord] = useState(false);
  const [wordForm, setWordForm] = useState({
    word: "",
    personal_translation: "",
    personal_context: "",
    encountered_count: 1,
    translated_count: 1,
  });

  // Toast feedback
  const [toast, setToast] = useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const fetchProfile = async () => {
    try {
      const { data } = await axiosInstance.get("/user/profile");
      setProfile(data);
      setEditDisplayName(data.full_name || "");
      setEditUsername(data.username || "");
    } catch (err) {
      console.error("Error fetching user profile:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWords = async () => {
    setWordsLoading(true);
    try {
      const params = new URLSearchParams();
      if (wordsSearch) params.append("search", wordsSearch);
      if (wordsSort) params.append("sort_by", wordsSort);
      params.append("limit", "100");

      const { data } = await axiosInstance.get(`/user/words?${params.toString()}`);
      setWords(data.items || []);
    } catch (err) {
      console.error("Error fetching words:", err);
      showToast("Không thể tải danh sách từ cá nhân.", "error");
    } finally {
      setWordsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
      fetchWords();
    }
  }, [isAuthenticated, wordsSort]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchWords();
  };

  // Avatar upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setAvatarUploading(true);
    try {
      const { data } = await axiosInstance.post("/user/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile((prev) => ({ ...prev, avatar_url: data.avatar_url }));
      showToast("Cập nhật ảnh đại diện thành công!");
    } catch (err) {
      console.error("Upload avatar error:", err);
      showToast(err.response?.data?.detail || "Lỗi khi tải ảnh lên.", "error");
    } finally {
      setAvatarUploading(false);
    }
  };

  // Save profile changes
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await axiosInstance.put("/user/profile", {
        display_name: editDisplayName,
        user_name: editUsername,
      });
      setProfile((prev) => ({
        ...prev,
        full_name: editDisplayName,
        username: editUsername,
      }));
      setEditProfileOpen(false);
      showToast("Cập nhật thông tin cá nhân thành công!");
    } catch (err) {
      console.error("Update profile error:", err);
      showToast(err.response?.data?.detail || "Không thể cập nhật hồ sơ.", "error");
    } finally {
      setSavingProfile(false);
    }
  };

  // Open Word Modal for Add
  const openAddWordModal = () => {
    setEditingWord(null);
    setWordForm({
      word: "",
      personal_translation: "",
      personal_context: "",
      encountered_count: 1,
      translated_count: 1,
    });
    setWordModalOpen(true);
  };

  // Open Word Modal for Edit
  const openEditWordModal = (item) => {
    setEditingWord(item);
    setWordForm({
      word: item.word,
      personal_translation: item.personal_translation || item.default_meaning || "",
      personal_context: item.personal_context || "",
      encountered_count: item.encountered_count || 1,
      translated_count: item.translated_count || 1,
    });
    setWordModalOpen(true);
  };

  // Save Word (Add or Edit)
  const handleSaveWord = async (e) => {
    e.preventDefault();
    if (!wordForm.word.trim()) {
      showToast("Vui lòng nhập từ tiếng Anh.", "error");
      return;
    }

    setSavingWord(true);
    try {
      if (editingWord) {
        await axiosInstance.put(`/user/words/${encodeURIComponent(editingWord.word)}`, {
          personal_translation: wordForm.personal_translation,
          personal_context: wordForm.personal_context,
          encountered_count: Number(wordForm.encountered_count),
          translated_count: Number(wordForm.translated_count),
        });
        showToast(`Đã lưu bản dịch cá nhân cho '${editingWord.word}'!`);
      } else {
        await axiosInstance.post("/user/words", {
          word: wordForm.word.trim(),
          personal_translation: wordForm.personal_translation,
          personal_context: wordForm.personal_context,
          encountered_count: Number(wordForm.encountered_count),
          translated_count: Number(wordForm.translated_count),
        });
        showToast(`Đã thêm từ '${wordForm.word.trim()}' vào kho cá nhân!`);
      }
      setWordModalOpen(false);
      fetchWords();
      fetchProfile();
    } catch (err) {
      console.error("Save word error:", err);
      showToast(err.response?.data?.detail || "Lỗi lưu từ vựng.", "error");
    } finally {
      setSavingWord(false);
    }
  };

  // Delete word
  const handleDeleteWord = async (wordText) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa từ '${wordText}' khỏi kho cá nhân không?`)) {
      return;
    }
    try {
      await axiosInstance.delete(`/user/words/${encodeURIComponent(wordText)}`);
      showToast(`Đã xóa '${wordText}' khỏi kho cá nhân.`);
      setWords((prev) => prev.filter((w) => w.word !== wordText));
      fetchProfile();
    } catch (err) {
      console.error("Delete word error:", err);
      showToast("Lỗi khi xóa từ.", "error");
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Chưa rõ";

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Trang cá nhân & Kho từ — DeepTranslate</title>
        <meta
          name="description"
          content="Quản lý thông tin tài khoản và kho từ vựng, bản dịch cá nhân của bạn trên DeepTranslate."
        />
      </Helmet>

      <Header />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white transition-all transform animate-bounce ${
            toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
          }`}
        >
          {toast.type === "error" ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="flex-1 mt-6 flex flex-col gap-8">
        {/* Profile Card Header */}
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100/50 p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start justify-between gap-6 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
            {/* Avatar with Camera upload overlay */}
            <div className="relative group/avatar shrink-0">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 p-1 shadow-lg shadow-indigo-100 flex items-center justify-center relative overflow-hidden">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username || "Avatar"}
                    className="w-full h-full object-cover rounded-full bg-white"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-2xl font-black font-mono">
                    {(profile.full_name || profile.username || "U")
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                )}
                {/* Upload overlay */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-full bg-slate-900/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                  title="Thay đổi ảnh đại diện"
                >
                  {avatarUploading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-5 h-5" />
                  )}
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                className="hidden"
              />
            </div>

            {/* User Meta */}
            <div>
              <div className="flex items-center justify-center md:justify-start gap-3">
                <h1 className="text-2xl md:text-3xl font-black text-slate-800 m-0">
                  {profile.full_name || "Thành viên DeepTranslate"}
                </h1>
                <button
                  onClick={() => setEditProfileOpen(true)}
                  className="p-1.5 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors border border-slate-100 cursor-pointer"
                  title="Chỉnh sửa hồ sơ"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-slate-400 font-semibold mt-1 mb-3">
                @{profile.username || "username"}
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{profile.email || authUser?.email || "Chưa có email"}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Gia nhập: {joinDate}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick Statistics Counters */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center min-w-[100px]">
              <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider block">
                Từ đã gặp
              </span>
              <span className="text-2xl font-black text-slate-800 mt-1 block">
                {profile.total_words_encountered || 0}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center min-w-[100px]">
              <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider block">
                Đã dịch
              </span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {profile.total_words_translated || 0}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center min-w-[100px]">
              <span className="text-[0.65rem] font-bold text-slate-400 uppercase tracking-wider block">
                Từ trong kho
              </span>
              <span className="text-2xl font-black text-indigo-600 mt-1 block">
                {profile.unique_words_count || words.length}
              </span>
            </div>
          </div>
        </div>

        {/* Section: Kho Từ Vựng & Dịch Cá Nhân */}
        <div className="flex flex-col gap-6">
          {/* Header Bar with Action Controls */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-800 m-0 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <span>Kho từ vựng & Dịch cá nhân</span>
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-1 m-0">
                Quản lý các từ bạn đã gặp, đã dịch và bản dịch cá nhân theo ngữ cảnh riêng
              </p>
            </div>

            <button
              onClick={openAddWordModal}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-lg shadow-indigo-100 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm từ / Dịch mới</span>
            </button>
          </div>

          {/* Search & Sort Filter */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm từ vựng trong kho của bạn..."
                value={wordsSearch}
                onChange={(e) => setWordsSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
            </form>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span>Sắp xếp:</span>
                <select
                  value={wordsSort}
                  onChange={(e) => setWordsSort(e.target.value)}
                  className="bg-transparent font-bold text-slate-700 border-none outline-none cursor-pointer"
                >
                  <option value="last_seen">Gần đây nhất</option>
                  <option value="encountered">Gặp nhiều nhất</option>
                  <option value="translated">Dịch nhiều nhất</option>
                  <option value="word">Theo bảng chữ cái (A-Z)</option>
                </select>
              </div>

              <button
                onClick={fetchWords}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                title="Tải lại danh sách"
              >
                <RefreshCw className={`w-4 h-4 ${wordsLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Words Grid */}
          {wordsLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-400">Đang tải kho từ vựng...</p>
            </div>
          ) : words.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-800 m-0">Chưa có từ vựng nào</h3>
              <p className="text-sm font-semibold text-slate-500 max-w-md m-0">
                Các từ xuất hiện trong quá trình học sẽ được lưu vào đây, hoặc bạn có thể tự thêm từ và bản dịch của riêng mình.
              </p>
              <button
                onClick={openAddWordModal}
                className="mt-2 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black shadow-lg shadow-indigo-200 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm từ đầu tiên</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {words.map((item) => (
                <div
                  key={item.id || item.word}
                  className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between group relative overflow-hidden"
                >
                  <div>
                    {/* Header: Word & Action Buttons */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-2xl font-black text-slate-900 m-0 tracking-tight">
                            {item.word}
                          </h3>
                          {item.ipa && (
                            <span className="text-xs text-slate-400 font-mono">
                              {item.ipa}
                            </span>
                          )}
                        </div>
                        {item.default_meaning && (
                          <p className="text-xs text-slate-400 font-semibold mt-0.5">
                            {item.default_meaning}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditWordModal(item)}
                          className="p-1.5 rounded-xl hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                          title="Sửa bản dịch cá nhân"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteWord(item.word)}
                          className="p-1.5 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Xóa từ khỏi kho cá nhân"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Personal Translation / Custom Note */}
                    <div className="mt-4 bg-slate-50/70 rounded-2xl p-3.5 border border-slate-100">
                      <div className="flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-wider text-indigo-600">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Bản dịch cá nhân</span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 mt-1 m-0">
                        {item.personal_translation || (
                          <span className="text-slate-400 italic font-normal text-xs">
                            Chưa có bản dịch cá nhân (Nhấn biểu tượng bút để thêm)
                          </span>
                        )}
                      </p>
                      {item.personal_context && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-xs text-slate-600 font-medium italic">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>"{item.personal_context}"</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stats Badges Footer */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-50 text-amber-700 border border-amber-200/60 px-2.5 py-1 rounded-xl font-bold">
                        Gặp: {item.encountered_count || 0}
                      </span>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1 rounded-xl font-bold">
                        Dịch: {item.translated_count || 0}
                      </span>
                    </div>
                    <span className="text-[0.65rem] font-bold text-slate-400">
                      {item.last_seen
                        ? new Date(item.last_seen).toLocaleDateString("vi-VN")
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* EDIT PROFILE MODAL */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-md w-full p-8 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setEditProfileOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-slate-800 m-0 mb-6">
              Chỉnh sửa thông tin hồ sơ
            </h3>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(false)}
                  className="px-5 py-2.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT PERSONAL WORD MODAL */}
      {wordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-lg w-full p-8 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setWordModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-slate-800 m-0 mb-6">
              {editingWord ? `Sửa dịch cá nhân: '${editingWord.word}'` : "Thêm từ & Bản dịch mới"}
            </h3>

            <form onSubmit={handleSaveWord} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Từ tiếng Anh <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingWord}
                  placeholder="Ví dụ: flexible, implement, resilient..."
                  value={wordForm.word}
                  onChange={(e) => setWordForm({ ...wordForm, word: e.target.value })}
                  className={`w-full px-4 py-3 rounded-2xl border text-sm font-bold text-slate-800 transition-all ${
                    editingWord
                      ? "bg-slate-100 border-slate-200 cursor-not-allowed"
                      : "bg-slate-50 border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Bản dịch / Ghi chú của riêng bạn
                </label>
                <input
                  type="text"
                  placeholder="Nhập nghĩa bạn muốn nhớ cho từ này..."
                  value={wordForm.personal_translation}
                  onChange={(e) =>
                    setWordForm({ ...wordForm, personal_translation: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Ngữ cảnh / Câu ví dụ thực tế
                </label>
                <textarea
                  rows={2}
                  placeholder="Câu ngữ cảnh giúp bạn nhớ từ sâu hơn..."
                  value={wordForm.personal_context}
                  onChange={(e) =>
                    setWordForm({ ...wordForm, personal_context: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Số lần gặp
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={wordForm.encountered_count}
                    onChange={(e) =>
                      setWordForm({ ...wordForm, encountered_count: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Số lần đã dịch
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={wordForm.translated_count}
                    onChange={(e) =>
                      setWordForm({ ...wordForm, translated_count: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setWordModalOpen(false)}
                  className="px-5 py-2.5 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingWord}
                  className="px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm shadow-lg shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingWord ? "Đang lưu..." : editingWord ? "Lưu thay đổi" : "Thêm vào kho"}
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
