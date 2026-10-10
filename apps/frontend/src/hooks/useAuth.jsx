import { useEffect, useContext, createContext, useCallback } from "react";
import useAuthStore from "@/store/authStore";
import authService from "@/services/authService";

const AuthContext = createContext(null);

/**
 * Bridge Provider to maintain backward compatibility with existing components
 * while transitioning to Zustand for state management.
 */
export function AuthProvider({ children }) {
  const {
    user,
    accessToken,
    isInitialized,
    setAuth,
    clearAuth,
    updateUser,
    setInitialized,
  } = useAuthStore();

  const loadUser = useCallback(async () => {
    // If already initialized or no token, don't run hydration
    if (isInitialized || !accessToken) {
      if (!accessToken) setInitialized(true);
      return;
    }

    try {
      // Validate token in background
      const userData = await authService.getMe();
      updateUser(userData);
    } catch (err) {
      // Interceptor handles refresh. If it reaches here, refresh failed.
      console.error("Auth hydration failed:", err);
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
      setAuth(data.user, data.access_token);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const loginGoogle = async (token) => {
    try {
      const data = await authService.loginWithGoogle(token);
      setAuth(data.user, data.access_token);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const register = async (email, password, fullName) => {
    try {
      const data = await authService.register(email, password, fullName);
      setAuth(data.user, data.access_token);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore
    }
    clearAuth();
    window.location.href = "/login";
  };

  const value = {
    user,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    loginGoogle,
    // Derived fields
    displayName:
      user?.full_name ||
      user?.display_name ||
      user?.email?.split("@")[0] ||
      "User",
    avatarUrl: user?.avatar_url || null,
    email: user?.email || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export default useAuth;
