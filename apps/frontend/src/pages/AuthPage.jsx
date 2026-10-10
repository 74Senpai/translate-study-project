import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LogIn,
  UserPlus,
  Loader2,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const { login, register, isAuthenticated, loginGoogle } = useAuth();

  // Redirect if already authenticated (handled by AuthProvider state)
  if (isAuthenticated) {
    const params = new URLSearchParams(window.location.search);
    const redirectUri = params.get("redirect_uri");
    if (redirectUri) {
      navigate(
        `/extension-login?redirect_uri=${encodeURIComponent(redirectUri)}`,
      );
    } else {
      navigate("/");
    }
    return null;
  }

  const handleAuth = async (googleResponse) => {
    setErrorMsg("");
    setLoading(true);

    try {
      const { data, error } = await loginGoogle(googleResponse);
      if (error) throw error;

      const params = new URLSearchParams(window.location.search);
      const redirectUri = params.get("redirect_uri");
      if (redirectUri && data) {
        const avatarUrl = data.user?.avatar_url || "";
        const refreshToken = data.refresh_token || "";
        const extensionLoginUrl = `/extension-login?token=${encodeURIComponent(data.access_token)}&refresh_token=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(data.user.display_name || data.user.email.split("@")[0])}&avatar_url=${encodeURIComponent(avatarUrl)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
        navigate(extensionLoginUrl);
      }
    } catch (error) {
      setErrorMsg(error.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initGoogle = () => {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleAuth,
      });

      window.google.accounts.id.renderButton(
        document.getElementById("google-signin"),
        {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
        },
      );
    };

    if (window.google) {
      initGoogle();
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-60" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-50 rounded-full blur-3xl opacity-60" />

      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-100/50 p-8 md:p-12 relative z-10 border border-white">
        <div className="text-center mb-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 mb-8 no-underline group"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <span className="text-sm font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
              Quay lại trang chủ
            </span>
          </Link>
          <div className="flex justify-center mb-10">
            <Link
              to="/"
              className="flex flex-col items-center gap-4 no-underline group"
            >
              <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-100 group-hover:scale-110 transition-all duration-500 overflow-hidden border border-slate-50">
                <img
                  src="/favicon.svg"
                  alt="DeepTranslate Logo"
                  className="w-12 h-12 object-contain"
                />
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-blue-600 font-black text-3xl leading-none tracking-tighter">
                  DeepTranslate
                </span>
                <span className="text-[0.75rem] text-slate-400 font-bold uppercase tracking-[0.3em] mt-2">
                  Dịch & Hiểu
                </span>
              </div>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Đăng nhập</h1>
        </div>

        {errorMsg && (
          <div
            className={`mb-4 p-4 rounded-xl text-sm font-bold border flex items-center gap-2 animate-in slide-in-from-top-2 ${
              errorMsg.includes("thành công")
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-red-50 text-red-600 border-red-100"
            }`}
          >
            {errorMsg.includes("thành công") ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
            {errorMsg}
          </div>
        )}
        <div className="flex justify-center mb-6">
          <div id="google-signin"></div>
        </div>
        <div className="mt-10 pt-8 border-t border-slate-100 text-center">
          <p className="text-slate-400 text-sm">
            Bằng cách tiếp tục, bạn đồng ý với Điều khoản và Chính sách của
            chúng tôi.
          </p>
        </div>
      </div>
    </div>
  );
}
