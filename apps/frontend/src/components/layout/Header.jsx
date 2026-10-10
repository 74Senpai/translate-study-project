import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import {
  Languages,
  History,
  Bookmark,
  LogOut,
  Download,
  ChevronDown,
  User,
  BrainCircuit,
  Settings,
  Menu as MenuIcon,
} from "lucide-react";

const NAV_LINKS = [
  { to: "/", label: "Dịch thuật", icon: Languages },
  { to: "/flashcards", label: "Flashcards", icon: BrainCircuit },
];

const USER_NAV_LINKS = [
  { to: "/profile", label: "Trang cá nhân", icon: User },
  { to: "/history", label: "Lịch sử dịch", icon: History },
  { to: "/saved-words", label: "Từ đã dịch", icon: Bookmark },
];


export default function Header() {
  const { pathname } = useLocation();
  const { user, displayName, avatarUrl, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex justify-between items-center mb-6 flex-nowrap w-full">
      {/* Brand */}
      <div className="flex items-center gap-2 sm:gap-6 flex-nowrap">
        <Link to="/" className="no-underline flex items-center">
          <img
            src="/favicon.svg"
            alt="Logo"
            className="w-8 h-8 sm:hidden shrink-0 object-contain"
          />
          <div className="m-0 text-blue-600 text-[1.6rem] tracking-tight font-bold leading-none hidden sm:block">
            DeepTranslate
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1 sm:gap-2 flex-nowrap shrink-0">
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`group flex items-center h-10 px-3 rounded-xl transition-all duration-300 no-underline overflow-hidden shrink-0 ${
                pathname === to
                  ? "text-blue-600 bg-blue-50"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110 ${pathname === to ? "text-blue-600" : "text-slate-400"}`}
              />
              <span className="2xl:hidden max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-3 text-[0.85rem] font-bold">
                {label}
              </span>
              <span className="hidden 2xl:inline-block ml-3 text-[0.85rem] font-bold whitespace-nowrap">
                {label}
              </span>
            </Link>
          ))}

          <a
            href="https://chromewebstore.google.com/detail/eopjkbdhdilpobfonepmjjbnldpnlghn?utm_source=item-share-cb"
            target="_blank"
            rel="noopener noreferrer"
            className="group hidden md:flex items-center h-10 px-3 rounded-xl transition-all duration-300 no-underline overflow-hidden text-blue-600 bg-blue-50 hover:bg-blue-100 shadow-sm shadow-blue-100/50 shrink-0"
          >
            <Download className="w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110" />
            <span className="2xl:hidden max-w-0 overflow-hidden opacity-0 whitespace-nowrap transition-all duration-300 group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-3 text-[0.85rem] font-black">
              Tải Extension
            </span>
            <span className="hidden 2xl:inline-block ml-3 text-[0.85rem] font-black whitespace-nowrap">
              Tải Extension
            </span>
            <span className="ml-2 text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-md uppercase font-black tracking-tighter shrink-0">
              Free
            </span>
          </a>
        </nav>
      </div>

      {/* Right section: User Profile or Login */}
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3 relative">
            <div className="hidden md:block text-right">
              <p className="text-[0.75rem] font-bold text-slate-800 m-0 leading-tight">
                {displayName}
              </p>
            </div>

            {/* Avatar + dropdown */}
            <div className="relative">
              <button
                id="user-avatar-btn"
                onClick={() => setMenuOpen((o) => !o)}
                className="p-0.5 border-none bg-transparent cursor-pointer flex items-center gap-1 group"
              >
                <div className="relative">
                  <img
                    src={
                      avatarUrl ||
                      "https://api.dicebear.com/7.x/avataaars/svg?seed=Lucky"
                    }
                    alt="Avatar"
                    className="w-9 h-9 rounded-full border border-slate-200 shadow-sm group-hover:border-blue-400 transition"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5 shadow-sm border border-slate-100">
                    <ChevronDown className="w-2.5 h-2.5 text-slate-500" />
                  </div>
                </div>
              </button>

              {menuOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMenuOpen(false)}
                  />
                  {/* Dropdown */}
                  <div className="absolute right-0 top-11 z-50 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-100 py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                    <div className="px-4 py-3 border-b border-slate-50 mb-1">
                      <p className="text-[0.65rem] font-black text-slate-400 uppercase tracking-widest mb-1">
                        Tài khoản
                      </p>
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {displayName}
                      </p>
                    </div>
                    {USER_NAV_LINKS.map(({ to, label, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-2.5 text-sm font-semibold no-underline transition-all
                          ${
                            pathname === to
                              ? "text-blue-600 bg-blue-50"
                              : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"
                          }`}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </Link>
                    ))}
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-600 no-underline transition-all"
                    >
                      <Settings className="w-4 h-4" />
                      Cài đặt
                    </Link>

                    <div className="border-t border-slate-50 my-1" />
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors border-none bg-transparent cursor-pointer flex items-center gap-3"
                    >
                      <LogOut className="w-4 h-4" />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="bg-blue-600 text-white p-2 md:p-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2 active:scale-95 border-none cursor-pointer"
            >
              <MenuIcon className="w-5 h-5 shrink-0" />
              <span className="hidden md:inline font-bold text-sm">Menu</span>
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-12 z-50 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 overflow-hidden animate-in fade-in zoom-in duration-200">
                  <Link
                    to="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-blue-600 hover:bg-blue-50 no-underline transition-colors"
                  >
                    <User className="w-4 h-4" />
                    Đăng nhập
                  </Link>
                  <div className="border-t border-slate-50 mb-1" />
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 no-underline transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Cài đặt
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
