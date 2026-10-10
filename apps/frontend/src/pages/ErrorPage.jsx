import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ERROR_CONFIG = {
  403: {
    emoji: "🔒",
    title: "Không có quyền truy cập",
    description: "Bạn không có quyền xem trang này. Vui lòng đăng nhập hoặc liên hệ quản trị viên.",
    color: "from-orange-500 to-red-500",
    shadow: "shadow-orange-200",
    badge: "bg-orange-50 text-orange-600 border-orange-100",
  },
  500: {
    emoji: "⚙️",
    title: "Lỗi máy chủ nội bộ",
    description: "Có điều gì đó không ổn ở phía chúng tôi. Chúng tôi đang xem xét vấn đề này. Vui lòng thử lại sau.",
    color: "from-red-500 to-rose-600",
    shadow: "shadow-red-200",
    badge: "bg-red-50 text-red-600 border-red-100",
  },
  503: {
    emoji: "🛠️",
    title: "Dịch vụ tạm thời không khả dụng",
    description: "Hệ thống đang được bảo trì. Vui lòng quay lại sau ít phút.",
    color: "from-amber-500 to-orange-500",
    shadow: "shadow-amber-200",
    badge: "bg-amber-50 text-amber-600 border-amber-100",
  },
};

const DEFAULT_CONFIG = {
  emoji: "💥",
  title: "Đã xảy ra lỗi",
  description: "Một lỗi không mong muốn đã xảy ra. Vui lòng thử lại hoặc về trang chủ.",
  color: "from-slate-500 to-slate-700",
  shadow: "shadow-slate-200",
  badge: "bg-slate-50 text-slate-600 border-slate-100",
};

export default function ErrorPage({ code = 500, message }) {
  const navigate = useNavigate();
  const config = ERROR_CONFIG[code] || DEFAULT_CONFIG;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="max-w-[1400px] mx-auto w-full px-8 py-6">
        <Header />
      </div>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          {/* Status badge */}
          <span className={`inline-block px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border mb-8 ${config.badge}`}>
            Error {code}
          </span>

          {/* Large emoji with gradient backdrop */}
          <div className="relative mb-10 flex items-center justify-center">
            <div
              className={`absolute w-48 h-48 rounded-full bg-gradient-to-br ${config.color} opacity-10 blur-3xl`}
            />
            <div className="text-[7rem] leading-none relative z-10 select-none"
              style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.15))" }}>
              {config.emoji}
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-slate-800 mb-4 tracking-tight">
            {config.title}
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed mb-10">
            {message || config.description}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="px-8 py-4 bg-white text-slate-700 font-bold rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 text-sm"
            >
              ← Quay lại
            </button>
            <Link
              to="/"
              className={`px-8 py-4 bg-gradient-to-br ${config.color} text-white font-bold rounded-2xl shadow-xl ${config.shadow} hover:-translate-y-1 transition-all duration-300 text-sm no-underline`}
            >
              🏠 Về trang chủ
            </Link>
          </div>

          {code >= 500 && (
            <p className="mt-12 text-slate-400 text-xs">
              Nếu vấn đề vẫn tiếp tục, hãy{" "}
              <Link to="/support" className="text-blue-500 hover:underline">liên hệ hỗ trợ</Link>.
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
