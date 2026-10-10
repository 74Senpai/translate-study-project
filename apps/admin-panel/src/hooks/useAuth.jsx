import { useEffect, useContext, createContext, useCallback } from "react";
import useAuthStore from "@/store/authStore";
import authService from "@/services/authService";

const AuthContext = createContext(null);

/**
 * Admin Auth Bridge Provider
 */
export function AuthProvider({ children }) {
  const { user, accessToken, isInitialized, setAuth, clearAuth, updateUser, setInitialized } = useAuthStore();

  const loadUser = useCallback(async () => {
    // If already initialized or no token, don't run hydration
    if (isInitialized || !accessToken) {
      if (!accessToken) setInitialized(true);
      return;
    }

    try {
      const userData = await authService.getMe();
      updateUser(userData);
    } catch (err) {
      console.error("Admin auth hydration failed:", err);
    } finally {
      setInitialized(true);
    }
  }, [accessToken, updateUser, setInitialized, isInitialized]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    try {
      const data = await authService.login(email, password);
      
      const allowedRoles = ["ADMIN", "MANAGER", "CREATOR"];
      const hasAccess = data.user?.roles?.some(role => allowedRoles.includes(role));

      if (!hasAccess) {
        throw new Error("Access denied. Staff role required.");
      }

      setAuth(data.user, data.access_token);
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error("Logout error:", err);
    }
    clearAuth();
    window.location.href = "/admin/login";
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading: !isInitialized,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
};
