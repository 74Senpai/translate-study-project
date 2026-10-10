import { useTranslate } from "@/hooks/useTranslate";
import { POS_REFERENCE } from "@/constants/pos";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import TranslateInput from "@/components/translate/TranslateInput";
import TranslateResult from "@/components/translate/TranslateResult";
// import SvoStructure from "@/components/translate/SvoStructure";
import PosSidebar from "@/components/translate/PosSidebar";
import SentenceAnalysis from "@/components/translate/SentenceAnalysis";
// import AdBanner from "@/components/AdBanner";
import { Helmet } from "react-helmet-async";
import {
  Eye,
  EyeOff,
  AlertCircle,
  LayoutDashboard,
  Puzzle,
  Zap,
} from "lucide-react";

export default function TranslatePage() {
  const {
    inputText,
    setInputText,
    mode,
    changeMode,
    apiData,
    analysisData,
    showResultDetails,
    setShowResultDetails,
    showAnalysis,
    setShowAnalysis,
    isLoading,
    isVocabLoading,
    error,
    activeFilters,
    toggleFilter,
    resetFilters,
    clearInput,
  } = useTranslate();

  const handleToggleAll = () => {
    if (activeFilters.length === Object.keys(POS_REFERENCE).length) {
      // deselect all — pass empty array via the resetFilters mechanism inverted
      activeFilters.forEach(toggleFilter);
    } else {
      resetFilters();
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Dịch và Hiểu - DeepTranslate</title>
        <meta
          name="description"
          content="Công cụ dịch thuật thông minh kết hợp phân tích ngữ pháp NLP chuyên sâu. Giúp bạn không chỉ dịch mà còn hiểu cấu trúc câu."
        />
        <link rel="canonical" href="https://deeptranslate.io" />
      </Helmet>
      <Header />

      <main className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div className="flex flex-col gap-5">
          {/* Input */}
          <TranslateInput
            mode={mode}
            onModeChange={changeMode}
            value={inputText}
            onChange={setInputText}
            onClear={clearInput}
            isLoading={isLoading}
          />

          {/* Error banner */}
          {error && (
            <div
              id="error-banner"
              className="bg-red-50 border border-red-100 text-red-600 text-sm px-5 py-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          {apiData && (
            <TranslateResult
              apiData={apiData}
              mode={mode}
              isLoading={isLoading}
              isVocabLoading={isVocabLoading}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              onToggleAll={handleToggleAll}
              showDetails={showResultDetails}
            />
          )}
          {(analysisData || isVocabLoading || (apiData?.vocabularies?.length || 0) > 0) && showAnalysis && (
            <SentenceAnalysis
              analysis={analysisData}
              vocabularies={apiData?.vocabularies || []}
              isVocabLoading={isVocabLoading}
            />
          )}
          {/* <AdBanner
            dataAdSlot="7273812366"
            className="mt-6"
            displayMode="desktop"
          /> */}
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6">
          {/* Toggles */}
          <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <label className="text-[0.65rem] font-black text-slate-400 uppercase tracking-widest">
                Tùy chọn hiển thị
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowResultDetails(!showResultDetails)}
                className={`flex items-center justify-between px-5 py-4 rounded-3xl text-[0.8rem] font-black transition-all active:scale-[0.98] border ${
                  showResultDetails
                    ? "bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-200"
                    : "bg-white text-slate-500 border-slate-100 hover:bg-blue-50/50 hover:text-blue-600 hover:border-blue-100"
                }`}
              >
                <span>Chi tiết từ loại</span>
                {showResultDetails ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4 opacity-30" />
                )}
              </button>
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className={`flex items-center justify-between px-5 py-4 rounded-3xl text-[0.8rem] font-black transition-all active:scale-[0.98] border ${
                  showAnalysis
                    ? "bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200"
                    : "bg-white text-slate-500 border-slate-100 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-200"
                }`}
              >
                <span>Phân tích ngữ pháp</span>
                {showAnalysis ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4 opacity-30" />
                )}
              </button>
            </div>
          </div>

          <PosSidebar activeFilters={activeFilters} onToggle={toggleFilter} />

          {/* Extension Promo - Updated to System Blue */}
          <div className="bg-blue-600 p-6 rounded-[2rem] text-white shadow-2xl shadow-blue-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl opacity-20 -mr-16 -mt-16" />
            <div className="relative z-10">
              <h4 className="text-[0.65rem] font-black mb-2 flex items-center gap-2 text-white/70 tracking-widest uppercase">
                <Puzzle className="w-3.5 h-3.5" />
                Extension
              </h4>
              <h3 className="text-base font-black mb-5 leading-tight">
                Dịch trực tiếp trên Chrome
              </h3>
              <a
                href="https://chromewebstore.google.com/detail/eopjkbdhdilpobfonepmjjbnldpnlghn?utm_source=item-share-cb"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-white text-blue-600 text-[0.75rem] font-black py-3.5 rounded-xl hover:bg-blue-50 transition-all no-underline shadow-lg active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-blue-600" />
                TẢI MIỄN PHÍ
              </a>
            </div>
          </div>

          {/* <div className="mt-2">
            <AdBanner
              dataAdSlot="1122334455"
              dataAdFormat="rectangle"
              displayMode="desktop"
            />
          </div> */}
        </aside>
      </main>

      <Footer />
    </div>
  );
}
