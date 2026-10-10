import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-6 py-4 rounded-2xl border shadow-2xl min-w-[320px] animate-in slide-in-from-right-10 duration-300
              ${toast.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-900 shadow-emerald-500/10" : 
                toast.type === "error" ? "bg-rose-50 border-rose-100 text-rose-900 shadow-rose-500/10" : 
                "bg-blue-50 border-blue-100 text-blue-900 shadow-blue-500/10"}
            `}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-white shadow-sm
              ${toast.type === "success" ? "text-emerald-500" : 
                toast.type === "error" ? "text-rose-500" : 
                "text-blue-500"}
            `}>
              {toast.type === "success" ? <CheckCircle2 className="w-6 h-6" /> : 
               toast.type === "error" ? <AlertCircle className="w-6 h-6" /> : 
               <Info className="w-6 h-6" />}
            </div>
            
            <div className="flex-1 mr-4">
              <p className="text-sm font-bold leading-tight">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
