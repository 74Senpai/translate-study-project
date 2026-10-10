import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import {
  Flame,
  Zap,
  Brain,
  Calendar,
  Mail,
  Award,
  Trophy,
  Activity,
  ArrowRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import axiosInstance from "@/services/axiosInstance";

export default function MyProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading, user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data } = await axiosInstance.get("/user/profile");
        setProfile(data);
      } catch (err) {
        console.error("Error fetching user profile:", err);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50/50">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  // Level computation: x2 required XP per level (Level 1: 100, Level 2: 200, Level 3: 400, etc.)
  const xp = profile.xp || 0;
  const level = Math.floor(Math.log2(xp / 100 + 1)) + 1;
  const xpToCurrent = 100 * (Math.pow(2, level - 1) - 1);
  const xpToNext = 100 * (Math.pow(2, level) - 1);
  const xpRequiredForStep = xpToNext - xpToCurrent; // 100 * 2^(level - 1)
  const xpInCurrentLevel = xp - xpToCurrent;
  const progressPercent = Math.min(
    100,
    Math.round((xpInCurrentLevel / xpRequiredForStep) * 100),
  );
  const xpNeededForNextLevel = xpRequiredForStep - xpInCurrentLevel;

  // Formats date
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Chưa rõ";

  // Tier description based on Level
  const getTier = (lvl) => {
    if (lvl >= 20)
      return {
        name: "Thần Thoại",
        color: "from-purple-600 to-indigo-600",
        border: "border-purple-200",
      };
    if (lvl >= 10)
      return {
        name: "Huyền Thoại",
        color: "from-amber-500 to-orange-600",
        border: "border-amber-200",
      };
    if (lvl >= 5)
      return {
        name: "Bậc Thầy",
        color: "from-blue-500 to-indigo-600",
        border: "border-blue-200",
      };
    return {
      name: "Tập Sự",
      color: "from-emerald-400 to-teal-600",
      border: "border-emerald-200",
    };
  };

  const tier = getTier(level);

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>Trang cá nhân — DeepTranslate</title>
        <meta
          name="description"
          content="Xem chuỗi ngày học tập, điểm kinh nghiệm và cấp độ học của bạn trên DeepTranslate."
        />
      </Helmet>

      <Header />

      <main className="flex-1 mt-6">
        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Column 1: Profile Summary Card */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50 p-8 flex flex-col items-center relative overflow-hidden text-center group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-60 -mr-12 -mt-12 transition-all group-hover:scale-125" />

              {/* Profile Avatar */}
              <div className="relative mb-6 mt-4">
                <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-1 shadow-xl shadow-indigo-100 flex items-center justify-center">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username || "User avatar"}
                      className="w-full h-full object-cover rounded-full bg-white"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white text-3xl font-black font-mono">
                      {(profile.full_name || profile.username || "U")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                {/* Level badge overlapping avatar */}
                <div className="absolute -bottom-2 right-0 bg-slate-900 text-white border-2 border-white rounded-full px-3 py-1 text-xs font-black shadow-md flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  <span>LV {level}</span>
                </div>
              </div>

              {/* Names */}
              <h2 className="text-2xl font-black text-slate-800 m-0 leading-tight">
                {profile.full_name || "Thành viên DeepTranslate"}
              </h2>
              <p className="text-sm text-slate-400 font-semibold mt-1">
                @{profile.username || "username"}
              </p>

              {/* Title / Tier Badge */}
              <div
                className={`mt-4 px-4 py-1.5 rounded-full bg-gradient-to-r ${tier.color} text-white text-xs font-black uppercase tracking-wider shadow-md`}
              >
                {tier.name}
              </div>

              {/* Divider */}
              <div className="w-full h-[1px] bg-slate-100 my-6" />

              {/* Info Rows */}
              <div className="w-full flex flex-col gap-4 text-left">
                <div className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider m-0">
                      Email
                    </p>
                    <p className="text-sm text-slate-700 font-bold truncate m-0">
                      {authUser?.email || "Chưa cập nhật"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-50">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider m-0">
                      Ngày gia nhập
                    </p>
                    <p className="text-sm text-slate-700 font-bold m-0">
                      {joinDate}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2 & 3: Statistics Dashboard */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* Gamification Block: Streak & XP Progress */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Streak Card */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50 p-8 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full blur-3xl opacity-60 -mr-12 -mt-12 group-hover:scale-125 transition-all" />

                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[0.65rem] font-black text-orange-600/80 bg-orange-50 px-3 py-1 rounded-full uppercase tracking-wider border border-orange-100">
                      Chuỗi liên tục
                    </span>
                    <h3 className="text-4xl font-black text-slate-800 mt-4 mb-1 tracking-tight">
                      {profile.streak_days || 0}{" "}
                      <span className="text-lg font-bold text-slate-400">
                        ngày
                      </span>
                    </h3>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-tr from-orange-400 to-amber-500 rounded-3xl flex items-center justify-center shadow-xl shadow-orange-100 animate-pulse">
                    <Flame className="w-7 h-7 text-white fill-white" />
                  </div>
                </div>

                <div className="mt-8">
                  <p className="text-sm text-slate-600 font-bold leading-relaxed">
                    {profile.streak_days > 0
                      ? "Bạn đang giữ lửa học tập cực tốt! Hãy hoàn thành ít nhất 1 flashcard hôm nay để tiếp tục."
                      : "Lửa học tập đã nguội! Hãy chơi ngay 1 ván flashcard để bắt đầu lại chuỗi học tập 1 ngày mới."}
                  </p>
                  <button
                    onClick={() => navigate("/flashcards")}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-orange-600 hover:text-orange-700 transition-colors border-none bg-transparent cursor-pointer"
                  >
                    <span>
                      {profile.streak_days > 0
                        ? "TIẾP TỤC CHINH PHỤC"
                        : "BẮT ĐẦU CHUỖI MỚI"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* XP Level Progress Card */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50 p-8 flex flex-col justify-between relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-60 -mr-12 -mt-12 group-hover:scale-125 transition-all" />

                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[0.65rem] font-black text-indigo-600/80 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider border border-indigo-100">
                      Kinh nghiệm (XP)
                    </span>
                    <h3 className="text-4xl font-black text-slate-800 mt-4 mb-1 tracking-tight">
                      {xp}{" "}
                      <span className="text-lg font-bold text-slate-400">
                        XP
                      </span>
                    </h3>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-100">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-8">
                  <div className="flex justify-between text-xs font-black text-slate-400 mb-2">
                    <span>CẤP ĐỘ {level}</span>
                    <span>{xpInCurrentLevel}/{xpRequiredForStep} XP</span>
                  </div>

                  {/* Outer Bar */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    {/* Inner progress with gradient & micro-animation */}
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full transition-all duration-1000 ease-out shadow-inner"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <p className="text-[0.7rem] text-slate-400 font-semibold mt-2.5">
                    Còn {xpNeededForNextLevel} XP nữa để lên cấp {level + 1}!
                  </p>
                </div>
              </div>
            </div>

            {/* Quick stats milestones */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-100/50 p-8">
              <h3 className="text-lg font-black text-slate-800 m-0 mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                <span>Thành tích của bạn</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Milestone 1 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100/80 p-5 hover:border-indigo-100 hover:bg-slate-50 transition-all flex flex-col gap-1.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Brain className="w-4 h-4" />
                  </div>
                  <h4 className="text-[0.62rem] font-black text-slate-400 uppercase tracking-widest mt-2 m-0">
                    Tiến trình học
                  </h4>
                  <p className="text-xs text-slate-600 font-bold m-0">
                    Tích luỹ điểm từ các bộ Flashcard
                  </p>
                </div>

                {/* Milestone 2 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100/80 p-5 hover:border-orange-100 hover:bg-slate-50 transition-all flex flex-col gap-1.5">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <h4 className="text-[0.62rem] font-black text-slate-400 uppercase tracking-widest mt-2 m-0">
                    Bền bỉ học
                  </h4>
                  <p className="text-xs text-slate-600 font-bold m-0">
                    Học mỗi ngày giúp nhớ lâu gấp 4 lần
                  </p>
                </div>

                {/* Milestone 3 */}
                <div className="bg-slate-50/50 rounded-2xl border border-slate-100/80 p-5 hover:border-emerald-100 hover:bg-slate-50 transition-all flex flex-col gap-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Zap className="w-4 h-4 animate-bounce" />
                  </div>
                  <h4 className="text-[0.62rem] font-black text-slate-400 uppercase tracking-widest mt-2 m-0">
                    Nhận XP
                  </h4>
                  <p className="text-xs text-slate-600 font-bold m-0">
                    Hoàn thành ván đấu nhận XP giá trị
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
