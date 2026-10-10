import { Link, useNavigate } from "react-router-dom";

const ERROR_CONFIG = {
  404: {
    code: "404",
    emoji: "🔍",
    title: "Page Not Found",
    description: "The resource you're looking for doesn't exist or has been moved.",
    accent: "#6366f1",
    bg: "from-indigo-50 to-violet-50",
    btnClass: "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200",
  },
  403: {
    code: "403",
    emoji: "🚫",
    title: "Access Forbidden",
    description: "You don't have permission to view this page. Administrator access required.",
    accent: "#f97316",
    bg: "from-orange-50 to-red-50",
    btnClass: "bg-orange-600 hover:bg-orange-700 shadow-orange-200",
  },
  500: {
    code: "500",
    emoji: "💥",
    title: "Internal Server Error",
    description: "Something went wrong on the server. Check the backend logs for details.",
    accent: "#ef4444",
    bg: "from-red-50 to-rose-50",
    btnClass: "bg-red-600 hover:bg-red-700 shadow-red-200",
  },
  503: {
    code: "503",
    emoji: "⚙️",
    title: "Service Unavailable",
    description: "The service is temporarily down for maintenance. Please try again shortly.",
    accent: "#f59e0b",
    bg: "from-amber-50 to-orange-50",
    btnClass: "bg-amber-600 hover:bg-amber-700 shadow-amber-200",
  },
};

const DEFAULT = {
  code: "ERR",
  emoji: "⚠️",
  title: "Unexpected Error",
  description: "An unexpected error occurred. Please try again.",
  accent: "#64748b",
  bg: "from-slate-50 to-slate-100",
  btnClass: "bg-slate-700 hover:bg-slate-800 shadow-slate-200",
};

export default function AdminErrorPage({ code = 404, message }) {
  const navigate = useNavigate();
  const cfg = ERROR_CONFIG[code] || DEFAULT;

  return (
    <div className={`min-h-screen bg-gradient-to-br ${cfg.bg} flex items-center justify-center p-8 font-sans`}>
      <div className="max-w-lg w-full text-center">

        {/* Icon + code cluster */}
        <div className="relative mb-10 inline-flex items-center justify-center">
          <div
            className="w-40 h-40 rounded-[2.5rem] flex items-center justify-center text-6xl shadow-2xl"
            style={{ background: `${cfg.accent}18`, border: `2px solid ${cfg.accent}30` }}
          >
            {cfg.emoji}
          </div>
          <span
            className="absolute -top-4 -right-4 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full text-white shadow-lg"
            style={{ background: cfg.accent }}
          >
            {cfg.code}
          </span>
        </div>

        <h1 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">{cfg.title}</h1>
        <p className="text-slate-500 leading-relaxed mb-10">{message || cfg.description}</p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all text-sm"
          >
            ← Go Back
          </button>
          <Link
            to="/"
            className={`px-6 py-3 text-white font-bold rounded-xl shadow-lg hover:-translate-y-0.5 transition-all text-sm no-underline ${cfg.btnClass}`}
          >
            🏠 Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
