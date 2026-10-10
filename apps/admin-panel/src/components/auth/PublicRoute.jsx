import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Route wrapper for public-only pages (e.g. Login).
 * Redirects to dashboard if already authenticated as admin.
 */
export default function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const allowedRoles = ["ADMIN", "MANAGER", "CREATOR"];
  const isStaff = user?.roles?.some(role => allowedRoles.includes(role));

  if (user && isStaff) {
    return <Navigate to="/" replace />;
  }

  return children;
}
