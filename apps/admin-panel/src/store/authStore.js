import { create } from "zustand";

/**
 * Admin Auth Store managed by Zustand.
 * Handles admin profile, tokens, and initialization state.
 * Syncs data to localStorage for optimistic UI.
 */
const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem("admin_user")) || null,
  accessToken: localStorage.getItem("admin_access_token") || null,
  isInitialized: false,

  setAuth: (user, token) => {
    if (user) localStorage.setItem("admin_user", JSON.stringify(user));
    if (token) localStorage.setItem("admin_access_token", token);
    set({ user, accessToken: token, isInitialized: true });
  },

  clearAuth: () => {
    localStorage.removeItem("admin_user");
    localStorage.removeItem("admin_access_token");
    set({ user: null, accessToken: null, isInitialized: true });
  },

  updateUser: (user) => {
    if (user) localStorage.setItem("admin_user", JSON.stringify(user));
    set({ user });
  },

  setInitialized: (val) => set({ isInitialized: val }),
}));

export default useAuthStore;
