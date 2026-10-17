import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "@/store/authStore";

/**
 * Higher-order component to protect private routes.
 * Redirects to login if not authenticated.
 */
export default function ProtectedRoute({ children, requiredRoles }) {
  const { user, isInitialized } = useAuthStore();
  const location = useLocation();

  if (!isInitialized) return null;

  // If not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check required roles for admin / manager routes
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = user.roles || (user.is_admin ? ["ADMIN"] : []);
    const hasRole = user.is_admin || requiredRoles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return <Navigate to="/403" replace />;
    }
  }

  return children;
}
