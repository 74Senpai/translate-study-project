import { create } from "zustand";

/**
 * Auth Store managed by Zustand.
 * Handles user profile, tokens, and initialization state.
 * Syncs user data to localStorage for optimistic UI on page reload.
 */
const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem("user")) || null,
  accessToken: localStorage.getItem("access_token") || null,
  isInitialized: false,

  setAuth: (user, token) => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    if (token) localStorage.setItem("access_token", token);
    set({ user, accessToken: token, isInitialized: true });
  },

  clearAuth: () => {
    localStorage.removeItem("user");
    localStorage.removeItem("access_token");
    set({ user: null, accessToken: null, isInitialized: true });
  },

  updateUser: (user) => {
    if (user) localStorage.setItem("user", JSON.stringify(user));
    set({ user });
  },

  setInitialized: (val) => set({ isInitialized: val }),
}));

export default useAuthStore;
