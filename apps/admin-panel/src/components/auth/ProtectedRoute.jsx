import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Route wrapper for admin-only pages.
 * Redirects to login if not authenticated or not an admin.
 */
export default function ProtectedRoute({ children, requiredRoles = ["ADMIN", "MANAGER", "CREATOR"] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login but save the current location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const hasRequiredRole = user?.roles?.some(role => requiredRoles.includes(role));

  if (!hasRequiredRole) {
    // User is logged in but doesn't have the right permissions for this specific route
    return <Navigate to="/403" replace />;
  }

  return children;
}
