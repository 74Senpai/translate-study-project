import { useState, useEffect } from "react";
import {
  Volume2,
  Play,
  Sliders,
  ChevronLeft,
  Check,
  Rocket,
  Monitor,
  Zap,
  Plus,
  Trash2,
  History,
  HelpCircle,
  Layout,
  Shield,
  Clock,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/hooks/useAuth";
import axiosInstance from "@/services/axiosInstance";
import { getVoices, speakWord } from "@/utils/speech";
import Header from "@/components/layout/Header";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { settings, updateSettings, localProficiency, syncLocalData } =
    useSettings();
  const [voices, setVoices] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("tts"); // tts | extension
  
  // Extension Settings State
  const [extSettings, setExtSettings] = useState({
    translation: { enabled_all: true, allowed_urls: [] },
    history: { collect_all: true },
    flashcard_popup: {
      enabled: false,
      source: "mix",
      public_set_id: null,
      task_types: ["choice", "fill"],
      question_count: 10,
      timeout: 15,
      daily_frequency: 5,
      entertainment_urls: [
        {url: "youtube.com", enabled: true}, 
        {url: "facebook.com", enabled: true}, 
        {url: "tiktok.com", enabled: true}
      ],
    }
  });
  const [loadingExt, setLoadingExt] = useState(false);
  const [savingExt, setSavingExt] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEntUrl, setNewEntUrl] = useState("");

  useEffect(() => {
    const loadVoices = () => {
      const v = getVoices();
      if (v.length > 0) {
        setVoices(v);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fetch Extension Settings if authenticated
    if (isAuthenticated) {
      fetchExtensionSettings();
    }
  }, [isAuthenticated]);

  const fetchExtensionSettings = async () => {
    setLoadingExt(true);
    try {
      const { data } = await axiosInstance.get("/user/extension-settings");
      setExtSettings(data);
    } catch (err) {
      console.error("Failed to fetch extension settings", err);
    } finally {
      setLoadingExt(false);
    }
  };

  const handleUpdateExtSettings = async (updates) => {
    const newData = { ...extSettings, ...updates };
    setExtSettings(newData);
    setSavingExt(true);
    try {
      await axiosInstance.patch("/user/extension-settings", newData);
    } catch (err) {
      console.error("Failed to update extension settings", err);
    } finally {
      setSavingExt(false);
    }
  };

  const addUrl = () => {
    if (!newUrl || extSettings.translation.allowed_urls.includes(newUrl)) return;
    const urls = [...extSettings.translation.allowed_urls, newUrl];
    handleUpdateExtSettings({ translation: { ...extSettings.translation, allowed_urls: urls } });
    setNewUrl("");
  };

  const removeUrl = (url) => {
    const urls = extSettings.translation.allowed_urls.filter(u => u !== url);
    handleUpdateExtSettings({ translation: { ...extSettings.translation, allowed_urls: urls } });
  };

  const addEntUrl = () => {
    if (!newEntUrl || extSettings.flashcard_popup.entertainment_urls.some(e => e.url === newEntUrl)) return;
    const urls = [...extSettings.flashcard_popup.entertainment_urls, { url: newEntUrl, enabled: true }];
    handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, entertainment_urls: urls } });
    setNewEntUrl("");
  };

  const toggleEntUrl = (url) => {
    const urls = extSettings.flashcard_popup.entertainment_urls.map(e => 
      e.url === url ? { ...e, enabled: !e.enabled } : e
    );
    handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, entertainment_urls: urls } });
  };

  const removeEntUrl = (url) => {
    const urls = extSettings.flashcard_popup.entertainment_urls.filter(e => e.url !== url);
    handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, entertainment_urls: urls } });
  };

  const handleTestVoice = () => {
    speakWord(
      "Hello, this is a test of your configured voice settings.",
      "en",
      settings,
    );
  };

  const handleSync = async () => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/settings");
      return;
    }
    setIsSyncing(true);
    try {
      const count = await syncLocalData(axiosInstance);
      setSyncStatus(`Đã đồng bộ thành công ${count || 0} từ vựng!`);
      setTimeout(() => setSyncStatus(null), 5000);
    } catch {
      setSyncStatus("Lỗi khi đồng bộ. Vui lòng thử lại.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 w-full py-12">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-3 bg-white rounded-2xl border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm"
          >
            <ChevronLeft className="w-6 h-6 " />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-800">
              Cài đặt hệ thống
            </h1>
            <p className="text-slate-500 font-medium">
              Tùy chỉnh trải nghiệm học tập của bạn
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Menu bên trái */}
          <div className="md:col-span-1 space-y-3">
            <button 
              onClick={() => setActiveTab("tts")}
              className={`w-full flex items-center gap-3 px-6 py-4 border-2 transition-all rounded-2xl shadow-sm font-extrabold ${activeTab === 'tts' ? 'bg-white border-indigo-500 text-indigo-600' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-white hover:border-slate-200'}`}
            >
              <Volume2 className="w-5 h-5" />
              Giọng nói (TTS)
            </button>
            <button 
              onClick={() => setActiveTab("extension")}
              className={`w-full flex items-center gap-3 px-6 py-4 border-2 transition-all rounded-2xl shadow-sm font-extrabold ${activeTab === 'extension' ? 'bg-white border-indigo-500 text-indigo-600' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-white hover:border-slate-200'}`}
            >
              <Monitor className="w-5 h-5" />
              Cấu hình Extension
            </button>

            {Object.keys(localProficiency).length > 0 && (
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-[2rem] mt-6">
                <div className="flex items-center gap-3 mb-3 text-amber-700">
                  <Rocket className="w-5 h-5" />
                  <span className="font-black uppercase tracking-wider text-xs">
                    Dữ liệu Local
                  </span>
                </div>
                <p className="text-xs text-amber-600 font-bold mb-4 leading-relaxed">
                  Bạn có <b>{Object.keys(localProficiency).length}</b> từ vựng
                  chưa được đồng bộ lên tài khoản.
                </p>
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 text-xs"
                >
                  {isSyncing ? "ĐANG ĐỒNG BỘ..." : "ĐỒNG BỘ NGAY"}
                </button>
                {syncStatus && (
                  <p className="text-[10px] text-emerald-600 font-black mt-3 text-center uppercase tracking-tight animate-pulse">
                    {syncStatus}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Nội dung bên phải */}
          <div className="md:col-span-2 space-y-6">
            {activeTab === "tts" ? (
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                      <Sliders className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-black text-slate-800">
                      Cấu hình âm thanh
                    </h2>
                  </div>
                  <button
                    onClick={handleTestVoice}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white font-black rounded-xl transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Nghe thử
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Voice Selection */}
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                      Chọn giọng đọc (System Voices)
                    </label>
                    <select
                      value={settings.voiceId || ""}
                      onChange={(e) =>
                        updateSettings({ voiceId: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 outline-none font-bold text-slate-700 focus:border-indigo-500 transition-all appearance-none"
                    >
                      <option value="">Mặc định hệ thống</option>
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-[10px] text-slate-400 font-medium px-4">
                      * Lưu ý: Danh sách giọng nói phụ thuộc vào thiết bị và trình
                      duyệt của bạn.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    {/* Speed Control */}
                    <div>
                      <label className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                        <span>Tốc độ (Speed)</span>
                        <span className="text-indigo-600">
                          {settings.voiceSpeed}x
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={settings.voiceSpeed}
                        onChange={(e) =>
                          updateSettings({
                            voiceSpeed: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>

                    {/* Pitch Control */}
                    <div>
                      <label className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                        <span>Cao độ (Pitch)</span>
                        <span className="text-indigo-600">
                          {settings.voicePitch}x
                        </span>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={settings.voicePitch}
                        onChange={(e) =>
                          updateSettings({
                            voicePitch: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-100">
                  <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                      <Check className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-emerald-700 leading-relaxed">
                      Mọi thay đổi sẽ được tự động lưu lại trên trình duyệt của
                      bạn và áp dụng ngay lập tức cho các bài học tiếp theo.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Section 1: Translation Controls */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800">Dịch thuật trực tiếp</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Translation behavior</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl cursor-pointer group hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${extSettings.translation.enabled_all ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {extSettings.translation.enabled_all && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <div>
                          <span className="block font-black text-slate-700">Dịch trên tất cả trang web</span>
                          <span className="block text-xs text-slate-400 font-medium">Mặc định bật tính năng dịch trên mọi URL</span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={extSettings.translation.enabled_all}
                        onChange={(e) => handleUpdateExtSettings({ translation: { ...extSettings.translation, enabled_all: e.target.checked } })}
                      />
                    </label>

                    {!extSettings.translation.enabled_all && (
                      <div className="mt-8 space-y-4 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex gap-3">
                          <input 
                            type="text" 
                            placeholder="Nhập URL trang web (vd: example.com)"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 outline-none font-bold text-slate-700 focus:border-indigo-500 transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
                          />
                          <button 
                            onClick={addUrl}
                            className="bg-indigo-600 text-white p-4 rounded-2xl hover:bg-indigo-700 transition-all"
                          >
                            <Plus className="w-6 h-6" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {extSettings.translation.allowed_urls.map(url => (
                            <div key={url} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-sm border border-indigo-100">
                              {url}
                              <button onClick={() => removeUrl(url)}><Trash2 className="w-4 h-4 text-rose-500" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: History Collection */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                      <History className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-slate-800">Lịch sử & Thống kê</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Data collection</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl cursor-pointer group hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${extSettings.history.collect_all ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                          {extSettings.history.collect_all && <Check className="w-4 h-4 text-white" />}
                        </div>
                        <div>
                          <span className="block font-black text-slate-700">Thu thập lịch sử dịch</span>
                          <span className="block text-xs text-slate-400 font-medium">Lưu lại các từ bạn đã gặp trên các trang web</span>
                        </div>
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={extSettings.history.collect_all}
                        onChange={(e) => handleUpdateExtSettings({ history: { ...extSettings.history, collect_all: e.target.checked } })}
                      />
                    </label>

                    <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex gap-4">
                      <HelpCircle className="w-6 h-6 text-blue-500 shrink-0" />
                      <p className="text-xs font-bold text-blue-700 leading-relaxed">
                        <b>Tại sao chúng tôi thu thập dữ liệu?</b> Hệ thống sử dụng lịch sử này để thống kê xem bạn dịch ở trang nào nhiều nhất, gặp từ gì thường xuyên nhất. Từ đó, chúng tôi cá nhân hóa các bộ thẻ Flashcard để ưu tiên những từ quan trọng nhất với bạn.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Section 3: Flashcard Popups */}
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                  {!extSettings.flashcard_popup.enabled && <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-10 pointer-events-none" />}
                  
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                        <Layout className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-slate-800">Flashcard Ôn tập</h2>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Interactive Reminders</p>
                      </div>
                    </div>
                    <label className="relative z-20 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={extSettings.flashcard_popup.enabled}
                        onChange={(e) => handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, enabled: e.target.checked } })}
                      />
                      <div className="w-14 h-8 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  <div className={`space-y-8 relative z-20 transition-all duration-500 ${!extSettings.flashcard_popup.enabled ? 'opacity-50 grayscale select-none' : ''}`}>
                    <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl">
                      <p className="text-xs font-bold text-slate-600 leading-relaxed mb-6">
                        Flashcard sẽ hiển thị ngẫu nhiên khi bạn truy cập các trang web giải trí để giúp bạn ôn tập từ vựng thường xuyên hơn.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                        {/* Source Selection */}
                        <div className="space-y-4">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nguồn từ vựng (Vocabulary Source)</label>
                          <select 
                            value={extSettings.flashcard_popup.source}
                            onChange={(e) => handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, source: e.target.value } })}
                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-black text-sm text-slate-700 outline-none focus:border-indigo-500"
                          >
                            <option value="saved">Từ vựng đã lưu (Saved)</option>
                            <option value="flashcard">Lịch sử Flashcard (Review)</option>
                            <option value="translated">Lịch sử Dịch (Translation)</option>
                            <option value="mix">Tất cả (Mix All)</option>
                            <option value="most_translated">Dịch nhiều nhất (Top Translated)</option>
                            <option value="most_failed">Dễ sai nhất (Most Failed)</option>
                          </select>
                        </div>

                        {/* Question Count */}
                        <div className="space-y-4">
                          <label className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                            <span>Số câu hỏi (Quantity)</span>
                            <span className="text-indigo-600">{extSettings.flashcard_popup.question_count}</span>
                          </label>
                          <input 
                            type="range" min="5" max="20" step="1"
                            value={extSettings.flashcard_popup.question_count}
                            onChange={(e) => handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, question_count: parseInt(e.target.value) } })}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>

                        {/* Timeout */}
                        <div className="space-y-4">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Thời gian chờ (Popup Delay)</label>
                          <div className="relative">
                            <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                              type="number" 
                              value={extSettings.flashcard_popup.timeout}
                              onChange={(e) => handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, timeout: parseInt(e.target.value) } })}
                              className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 font-black text-sm text-slate-700 outline-none"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">phút</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold px-2 italic">Flashcard sẽ hiện sau khi bạn vào trang được X phút</p>
                        </div>

                        {/* Daily Frequency */}
                        <div className="space-y-4">
                          <label className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">
                            <span>Tần suất xuất hiện (Daily)</span>
                            <span className="text-indigo-600 font-black">{extSettings.flashcard_popup.daily_frequency} lần/ngày</span>
                          </label>
                          <input 
                            type="range" min="3" max="10" step="1"
                            value={extSettings.flashcard_popup.daily_frequency}
                            onChange={(e) => handleUpdateExtSettings({ flashcard_popup: { ...extSettings.flashcard_popup, daily_frequency: parseInt(e.target.value) } })}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>

                        {/* Entertainment Sites List */}
                        <div className="md:col-span-2 space-y-4 mt-4 border-t border-slate-100 pt-8">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2 mb-4">Trang web giải trí (Entertainment Sites)</label>
                          <div className="flex gap-3 mb-4">
                            <input 
                              type="text" 
                              placeholder="Thêm trang giải trí (vd: netflix.com)"
                              value={newEntUrl}
                              onChange={(e) => setNewEntUrl(e.target.value)}
                              className="flex-1 bg-white border border-slate-200 rounded-2xl px-6 py-4 outline-none font-bold text-slate-700 focus:border-indigo-500 transition-all text-sm"
                              onKeyDown={(e) => e.key === 'Enter' && addEntUrl()}
                            />
                            <button 
                              onClick={addEntUrl}
                              className="bg-slate-900 text-white px-6 rounded-2xl hover:bg-black transition-all font-black text-xs uppercase tracking-widest"
                            >
                              Thêm
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {extSettings.flashcard_popup.entertainment_urls?.map(item => (
                              <div key={item.url} className={`flex items-center gap-3 px-4 py-3 bg-white border rounded-2xl shadow-sm transition-all group ${item.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                                <div 
                                  onClick={() => toggleEntUrl(item.url)}
                                  className={`w-8 h-4 rounded-full relative cursor-pointer transition-all ${item.enabled ? 'bg-indigo-500' : 'bg-slate-200'}`}
                                >
                                  <div className={`absolute top-1 w-2 h-2 bg-white rounded-full transition-all ${item.enabled ? 'right-1' : 'left-1'}`} />
                                </div>
                                <span className={`text-xs font-black ${item.enabled ? 'text-slate-600' : 'text-slate-400 line-through'}`}>{item.url}</span>
                                <button onClick={() => removeEntUrl(item.url)} className="opacity-0 group-hover:opacity-100 transition-all text-rose-500 ml-2">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold px-2 italic mt-4">Flashcard sẽ chỉ hiện khi bạn truy cập các trang này sau thời gian chờ</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-8 bg-slate-900 rounded-[2.5rem] shadow-xl text-white">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="font-black text-lg">Đang đồng bộ trực tuyến</h4>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cloud sync active</p>
                    </div>
                  </div>
                  {savingExt ? (
                    <div className="flex items-center gap-2 text-indigo-400 font-black uppercase text-[10px] tracking-widest">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang lưu...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-400 font-black uppercase text-[10px] tracking-widest">
                      <Check className="w-4 h-4" />
                      Đã lưu
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
