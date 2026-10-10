import { Navigate } from "react-router-dom";
import useAuthStore from "@/store/authStore";

/**
 * Component for public-only routes (Login, Register).
 * Redirects to home if already authenticated.
 */
export default function PublicRoute({ children }) {
  const { user } = useAuthStore();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
