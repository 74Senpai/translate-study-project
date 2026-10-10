import { useEffect, useState } from "react";
import { cmsService } from "@/services/cms";
import { MessageSquare, BookOpen, Activity, Languages, Users, Layers } from "lucide-react";

const StatCard = ({ title, value, icon: Icon, color, bg }) => (
  <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
    <div className="flex items-center gap-5">
      <div className={`p-4 rounded-2xl ${bg} ${color}`}>
        <Icon size={28} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          {title}
        </p>
        <p className="text-3xl font-bold text-slate-900 tracking-tight">
          {value}
        </p>
      </div>
    </div>
  </div>
);

const Overview = () => {
  const [stats, setStats] = useState({ feedbackCount: 0, libraryCount: 0, dictionaryCount: 0, userCount: 0, flashcardCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await cmsService.getStats();
        setStats({
          feedbackCount: data.feedback_count,
          libraryCount: data.library_count,
          dictionaryCount: data.dictionary_count,
          userCount: data.user_count || 0,
          flashcardCount: data.flashcard_count || 0,
        });
      } catch (error) {
        console.error("Failed to fetch stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading)
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-10 bg-slate-200 rounded-lg w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="h-32 bg-slate-200 rounded-3xl"></div>
          <div className="h-32 bg-slate-200 rounded-3xl"></div>
          <div className="h-32 bg-slate-200 rounded-3xl"></div>
        </div>
      </div>
    );

  return (
    <div className="space-y-10 font-sans">
      <div>
        <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
          Platform Overview
        </h1>
        <p className="text-slate-500 mt-2 text-lg">
          Real-time data and management stats.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <StatCard
          title="Total Users"
          value={stats.userCount}
          icon={Users}
          color="text-purple-600"
          bg="bg-purple-50"
        />
        <StatCard
          title="Flashcard Sets"
          value={stats.flashcardCount}
          icon={Layers}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          title="Total Feedback"
          value={stats.feedbackCount}
          icon={MessageSquare}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          title="Library Topics"
          value={stats.libraryCount}
          icon={BookOpen}
          color="text-indigo-600"
          bg="bg-indigo-50"
        />
        <StatCard
          title="Dictionary Cache"
          value={stats.dictionaryCount}
          icon={Languages}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-10 rounded-3xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
              <Activity className="text-blue-500" />
              Recent Activity
            </h2>
          </div>
          <div className="space-y-6">
            <p className="text-slate-400 italic text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              No recent activity logs available.
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-10 rounded-3xl text-white shadow-xl shadow-blue-100">
          <h2 className="text-2xl font-bold mb-4">Quick Tip</h2>
          <p className="text-blue-100 leading-relaxed text-lg">
            Regularly reviewing feedback helps improve translation accuracy and
            library content quality. Aim for a 24h response time for bug
            reports.
          </p>
          <div className="mt-10">
            <button className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-all font-semibold">
              View Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
