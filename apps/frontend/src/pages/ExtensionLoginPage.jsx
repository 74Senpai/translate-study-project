import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  LogIn,
  Mail,
  Lock,
  ShieldCheck,
  UserCheck,
  UserPlus,
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import axios from "axios";
import { API_BASE_URL } from "@/services/apiConfig";
import useAuthStore from "@/store/authStore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

/**
 * ExtensionLoginPage
 *
 * Auto-login flow (runs on mount when redirect_uri is present):
 *  1. If an explicit token was passed via URL params or route state → redirect immediately.
 *  2. If the user has an access_token cached in localStorage → verify it with GET /auth/me.
 *     • If valid → redirect to extension callback.
 *     • If expired/invalid → fall through to step 3.
 *  3. Try to refresh via the HttpOnly cookie (website session) → POST /auth/refresh.
 *     • If OK → redirect to extension callback.
 *  4. All automatic paths failed → show the manual login form.
 */
export default function ExtensionLoginPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoginStatus, setAutoLoginStatus] = useState("idle"); // idle | checking | failed
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);
  const hasAttemptedAutoLogin = useRef(false);
  const { login, register, isAuthenticated, loginGoogle } = useAuth();

  const redirectUri = searchParams.get("redirect_uri");
  const queryToken = searchParams.get("token");
  const queryRefreshToken = searchParams.get("refresh_token");
  const queryName = searchParams.get("name");
  const queryAvatarUrl = searchParams.get("avatar_url");

  const stateToken = location.state?.token || null;
  const stateRefreshToken = location.state?.refreshToken || null;
  const explicitToken = stateToken || queryToken;
  const explicitRefreshToken = stateRefreshToken || queryRefreshToken;

  const redirectToExtension = useCallback(
    ({ token }) => {
      if (!token) return false;

      setSuccess(true);

      if (redirectUri) {
        const finalUrl = `${redirectUri}#token=${encodeURIComponent(token)}`;

        setTimeout(() => {
          window.location.href = finalUrl;
        }, 1500);
      }

      return true;
    },
    [redirectUri],
  );

  const handleAuth = async (googleResponse) => {
    setErrorMsg("");
    setLoading(true);

    try {
      console.log("Token: ", googleResponse.credential);
      redirectToExtension({ token: googleResponse.credential });
      console.log("Redirect success");
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

  // ─── Success screen ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            Xác thực thành công!
          </h1>
          <p className="text-slate-500 mb-8">
            Đang đồng bộ với DeepTranslate Extension...
          </p>
          <div className="flex items-center justify-center gap-2 text-blue-600 font-medium">
            <Loader2 className="animate-spin" size={20} />
            Vui lòng đợi trong giây lát
          </div>
        </div>
      </div>
    );
  }

  // ─── Checking screen (auto-login in progress) ─────────────────────────────────
  if (loading && autoLoginStatus === "checking") {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
              <UserCheck className="w-10 h-10 text-blue-500 animate-pulse" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-3">
            Đang kiểm tra phiên đăng nhập...
          </h1>
          <p className="text-slate-400 text-sm mb-6">
            Hệ thống đang tự động xác thực tài khoản của bạn
          </p>
          <div className="flex items-center justify-center gap-2 text-blue-600 font-medium">
            <Loader2 className="animate-spin" size={20} />
            Vui lòng chờ
          </div>
        </div>
      </div>
    );
  }

  // ─── Login form ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-50 rounded-full blur-3xl opacity-60" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-50 rounded-full blur-3xl opacity-60" />

      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-blue-100/50 p-8 md:p-12 relative z-10 border border-white">
        <div className="text-center mb-10">
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
