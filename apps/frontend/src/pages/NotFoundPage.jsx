import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const [count, setCount] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timer);
          navigate("/");
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="max-w-[1400px] mx-auto w-full px-8 py-6">
        <Header />
      </div>

      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          {/* Animated 404 */}
          <div className="relative mb-12 select-none">
            <div
              className="text-[12rem] font-black leading-none tracking-tighter"
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 20px 40px rgba(99,102,241,0.25))",
              }}
            >
              404
            </div>

            {/* Floating dots */}
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full opacity-30"
                style={{
                  width: `${12 + i * 8}px`,
                  height: `${12 + i * 8}px`,
                  background: `hsl(${220 + i * 20}, 80%, 65%)`,
                  top: `${10 + (i % 3) * 30}%`,
                  left: i < 3 ? `${5 + i * 10}%` : `${75 + (i - 3) * 8}%`,
                  animation: `bounce ${1.5 + i * 0.3}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-slate-800 mb-4 tracking-tight">
            Trang này không tồn tại
          </h1>
          <p className="text-slate-500 text-lg mb-3 leading-relaxed">
            Đường dẫn bạn đang tìm kiếm đã bị xóa, đổi tên hoặc chưa từng tồn tại.
          </p>
          <p className="text-slate-400 text-sm mb-10">
            Tự động chuyển hướng về trang chủ sau{" "}
            <span className="font-bold text-blue-500">{count}</span> giây...
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/"
              className="px-8 py-4 bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-1 transition-all duration-300 text-sm no-underline"
            >
              ← Về trang chủ
            </Link>
            <Link
              to="/library"
              className="px-8 py-4 bg-white text-slate-700 font-bold rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 text-sm no-underline"
            >
              📚 Thư viện bài học
            </Link>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes bounce {
          from { transform: translateY(0px) rotate(0deg); }
          to   { transform: translateY(-20px) rotate(15deg); }
        }
      `}</style>

      <Footer />
    </div>
  );
}
