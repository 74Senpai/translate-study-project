import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  LogOut,
  Languages,
  Users,
  Layers,
  ArrowLeft,
} from "lucide-react";

const SidebarLink = ({ to, children, icon: Icon, end = false }) => {
  const location = useLocation();
  const isActive = end
    ? location.pathname === to
    : location.pathname === to || (to !== "/admin" && location.pathname.startsWith(to));

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 no-underline ${
        isActive
          ? "bg-blue-600 text-white shadow-lg shadow-blue-200 font-bold"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium"
      }`}
    >
      <Icon size={20} />
      <span>{children}</span>
    </Link>
  );
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const userRoles = user?.roles || (user?.is_admin ? ["ADMIN"] : []);
  const isAdminOrManager = user?.is_admin || userRoles.includes("ADMIN") || userRoles.includes("MANAGER");

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col p-6 sticky top-0 h-screen">
        <div className="mb-10 px-2">
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 mb-4 no-underline transition-colors">
            <ArrowLeft size={14} />
            <span>Về ứng dụng chính</span>
          </Link>
          <h1 className="text-2xl font-bold bg-gradient-to-br from-blue-600 to-indigo-700 bg-clip-text text-transparent tracking-tight m-0">
            CMS Dashboard
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            MANAGEMENT CONSOLE
          </p>
        </div>

        <nav className="flex-1 space-y-2">
          {isAdminOrManager && (
            <SidebarLink to="/admin" icon={LayoutDashboard} end={true}>
              Overview
            </SidebarLink>
          )}

          {isAdminOrManager && (
            <SidebarLink to="/admin/users" icon={Users}>
              Users
            </SidebarLink>
          )}

          <SidebarLink to="/admin/flashcards" icon={Layers}>
            Flashcards
          </SidebarLink>

          {isAdminOrManager && (
            <SidebarLink to="/admin/dictionary" icon={Languages}>
              Dictionary
            </SidebarLink>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-100">
          <div className="px-4 mb-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Đã xác thực
            </p>
            <p className="text-sm font-semibold text-slate-700 truncate m-0">
              {user?.email || user?.display_name || "Admin"}
            </p>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-all font-semibold border-none bg-transparent cursor-pointer"
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
}
