import { useState, useEffect } from "react";
import {
  X,
  Settings,
  Volume2,
  Bookmark,
  Trash2,
  Check,
  Play,
  Sliders,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { getVoices } from "@/utils/speech";

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = "voice",
}) {
  const {
    settings,
    updateSettings,
    localWords,
    removeLocalWord,
    clearLocalWords,
  } = useSettings();
  const [voices, setVoices] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const loadVoices = () => {
      const v = getVoices();
      setVoices(v);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  if (!isOpen) return null;

  const testVoice = (voice) => {
    const utter = new SpeechSynthesisUtterance(
      "Hello, this is a test of the selected voice.",
    );
    utter.voice = voice;
    utter.rate = settings.voiceSpeed;
    utter.pitch = settings.voicePitch;
    window.speechSynthesis.speak(utter);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">Cài đặt</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Cấu hình & Dữ liệu
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-4 border-b border-slate-50 gap-2">
          <button
            onClick={() => setActiveTab("voice")}
            className={`px-4 py-2 text-sm font-black rounded-t-xl transition-all flex items-center gap-2 ${activeTab === "voice" ? "text-indigo-600 bg-white border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            <Volume2 className="w-4 h-4" />
            GIỌNG NÓI (TTS)
          </button>
          <button
            onClick={() => setActiveTab("local_cards")}
            className={`px-4 py-2 text-sm font-black rounded-t-xl transition-all flex items-center gap-2 ${activeTab === "local_cards" ? "text-indigo-600 bg-white border-b-2 border-indigo-600" : "text-slate-400 hover:text-slate-600"}`}
          >
            <InfinityIcon className="w-4 h-4" />
            TỪ ĐÃ HỌC (LOCAL)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === "voice" && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
              {/* Voice Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Chọn giọng đọc
                  </label>
                  <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                    {voices.length} giọng sẵn có
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {voices.map((v) => (
                    <button
                      key={v.voiceURI}
                      onClick={() => updateSettings({ voiceId: v.voiceURI })}
                      className={`flex flex-col text-left p-3 rounded-2xl border-2 transition-all group ${settings.voiceId === v.voiceURI ? "border-indigo-600 bg-indigo-50" : "border-slate-50 hover:border-slate-200 bg-slate-50/30"}`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-[11px] font-black text-slate-800 truncate max-w-[120px]">
                          {v.name}
                        </span>
                        {settings.voiceId === v.voiceURI ? (
                          <Check className="w-3 h-3 text-indigo-600" />
                        ) : (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play
                              className="w-3 h-3 text-slate-400 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                testVoice(v);
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">
                        {v.lang} | {v.default ? "Mặc định" : "Bổ sung"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-6 pt-4 border-t border-slate-50">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Tốc độ (Speed)
                      </label>
                    </div>
                    <span className="text-xs font-black text-indigo-600">
                      {settings.voiceSpeed}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.voiceSpeed}
                    onChange={(e) =>
                      updateSettings({ voiceSpeed: parseFloat(e.target.value) })
                    }
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-slate-400" />
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Cao độ (Pitch)
                      </label>
                    </div>
                    <span className="text-xs font-black text-indigo-600">
                      {settings.voicePitch}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={settings.voicePitch}
                    onChange={(e) =>
                      updateSettings({ voicePitch: parseFloat(e.target.value) })
                    }
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "local_cards" && (
            <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-800">
                    Từ vựng đã học
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    Danh sách các từ bạn đã chơi ở chế độ ẩn danh.
                  </p>
                </div>
                {localWords.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm("Xoá toàn bộ lịch sử local?"))
                        clearLocalWords();
                    }}
                    className="text-[10px] font-black text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100 transition-all"
                  >
                    XOÁ HẾT
                  </button>
                )}
              </div>

              {localWords.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {localWords.map((word) => (
                    <div
                      key={word}
                      className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-sm font-black text-indigo-600 shadow-sm border border-slate-50">
                          {word.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                          {word}
                        </span>
                      </div>
                      <button
                        onClick={() => removeLocalWord(word)}
                        className="p-1.5 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mx-auto">
                    <Bookmark className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-bold text-slate-400 italic">
                    Chưa có từ nào trong lịch sử local của bạn.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-slate-50 flex items-center justify-between border-t border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-50">
            DeepTranslate v2.5 Premium Settings
          </p>
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-slate-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-lg shadow-slate-200"
          >
            ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
}
