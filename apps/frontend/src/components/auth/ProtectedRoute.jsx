import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "@/store/authStore";

/**
 * Higher-order component to protect private routes.
 * Redirects to login if not authenticated.
 */
export default function ProtectedRoute({ children }) {
  const { user, isInitialized } = useAuthStore();
  const location = useLocation();

  // If not authenticated, redirect to login
  if (!user && isInitialized) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
