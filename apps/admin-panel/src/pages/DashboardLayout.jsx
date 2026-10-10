import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  LogOut,
  Languages,
  Users,
  Layers,
  GraduationCap,
} from "lucide-react";

const SidebarLink = ({ to, children, icon: Icon }) => {
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== "/" && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        isActive
          ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      <Icon size={20} />
      <span className="font-medium">{children}</span>
    </Link>
  );
};

const DashboardLayout = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col p-6 sticky top-0 h-screen">
        <div className="mb-10 px-2">
          <h1 className="text-2xl font-bold bg-gradient-to-br from-blue-600 to-indigo-700 bg-clip-text text-transparent tracking-tight">
            CMS Dashboard
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            MANAGEMENT CONSOLE
          </p>
        </div>

        <nav className="flex-1 space-y-2">
          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER")) && (
            <SidebarLink to="/" icon={LayoutDashboard}>
              Overview
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER")) && (
            <SidebarLink to="/users" icon={Users}>
              Users
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER") ||
            user.roles?.includes("CREATOR")) && (
            <SidebarLink to="/library" icon={BookOpen}>
              Library
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER") ||
            user.roles?.includes("CREATOR")) && (
            <SidebarLink to="/flashcards" icon={Layers}>
              Flashcards
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER") ||
            user.roles?.includes("CREATOR")) && (
            <SidebarLink to="/skills" icon={GraduationCap}>
              Skills
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER")) && (
            <SidebarLink to="/feedback" icon={MessageSquare}>
              Feedback
            </SidebarLink>
          )}

          {(user.roles?.includes("ADMIN") ||
            user.roles?.includes("MANAGER")) && (
            <SidebarLink to="/dictionary" icon={Languages}>
              Dictionary
            </SidebarLink>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="px-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Authenticated
            </p>
            <p className="text-sm font-semibold text-slate-700 truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-all font-semibold"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
