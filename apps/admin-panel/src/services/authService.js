import axiosInstance from "./axiosInstance";

/**
 * Admin Auth Service
 * Interacts with backend auth endpoints.
 */
const authService = {
  login: async (email, password) => {
    const { data } = await axiosInstance.post("/auth/login", { email, password });
    return data;
  },

  logout: async () => {
    const { data } = await axiosInstance.post("/auth/logout");
    return data;
  },

  getMe: async () => {
    const { data } = await axiosInstance.get("/auth/me");
    return data;
  },
};

export default authService;
