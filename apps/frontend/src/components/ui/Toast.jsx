import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, Rocket, X } from "lucide-react";
import { cn } from "@/utils/cn";

export default function Toast({
  message,
  type = "info",
  duration = 5000,
  onClose,
  icon: CustomIcon,
}) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 500); // Wait for exit animation
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    sync: <Rocket className="w-5 h-5 text-indigo-500" />,
  };

  const colors = {
    success:
      "bg-emerald-50 border-emerald-100 text-emerald-900 shadow-emerald-500/10",
    error: "bg-rose-50 border-rose-100 text-rose-900 shadow-rose-500/10",
    info: "bg-blue-50 border-blue-100 text-blue-900 shadow-blue-500/10",
    sync: "bg-indigo-600 border-indigo-400/30 text-white shadow-indigo-600/20",
  };

  if (!message) return null;

  return (
    <div
      className={cn(
        "fixed top-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-500",
        isVisible
          ? "scale-100 opacity-100 translate-y-0"
          : "scale-95 opacity-0 -translate-y-4 pointer-events-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 px-6 py-3.5 rounded-2xl border backdrop-blur-md shadow-2xl min-w-[300px]",
          colors[type],
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
            type === "sync" ? "bg-white/20" : "bg-white shadow-sm",
          )}
        >
          {CustomIcon ? <CustomIcon className="w-5 h-5" /> : icons[type]}
        </div>

        <div className="flex-1 mr-4">
          <p className="text-sm font-black tracking-tight leading-tight">
            {message}
          </p>
        </div>

        {onClose && (
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 500);
            }}
            className={cn(
              "p-1 rounded-lg hover:bg-black/5 transition-colors",
              type === "sync"
                ? "text-white/60 hover:text-white"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
