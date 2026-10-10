import { Link } from "react-router-dom";

const FOOTER_LINKS = [
  { to: "/", label: "Dịch thuật" },
  { to: "/about", label: "Giới thiệu" },
  { to: "/support", label: "Hỗ trợ" },
  { to: "/terms", label: "Điều khoản" },
  { to: "/privacy-policy", label: "Bảo mật" },
  {
    href: "https://chromewebstore.google.com/detail/eopjkbdhdilpobfonepmjjbnldpnlghn?utm_source=item-share-cb",
    label: "Extension",
  },
];

export default function Footer() {
  return (
    <footer className="mt-12 py-10 border-t border-slate-100">
      <div className="max-w-[1200px] mx-auto px-5 md:px-8 flex flex-col sm:flex-row justify-between items-center gap-6">
        <span className="text-[0.8rem] text-slate-400">
          © {new Date().getFullYear()} DeepTranslate — Học tiếng Anh qua dịch
          thuật thông minh
        </span>
        <nav className="flex items-center gap-4">
          {FOOTER_LINKS.map(({ to, href, label }) =>
            href ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.8rem] text-slate-400 hover:text-blue-600 transition-colors no-underline"
              >
                {label}
              </a>
            ) : (
              <Link
                key={to}
                to={to}
                className="text-[0.8rem] text-slate-400 hover:text-blue-600 transition-colors no-underline"
              >
                {label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
