import axiosInstance from "./axiosInstance";

/**
 * Authentication service wrapping API endpoints.
 */
const authService = {
  login: async (email, password) => {
    const { data } = await axiosInstance.post("/auth/login", { email, password });
    return data;
  },

  register: async (email, password, fullName) => {
    const { data } = await axiosInstance.post("/auth/register", {
      email,
      password,
      full_name: fullName,
    });
    return data;
  },

  loginWithGoogle: async (googleResponse) => {
  try {
    const { data } = await axiosInstance.post(
      "/auth/callback",
      googleResponse
    );

    return data;
  } catch (error) {
    console.error("Google login error:", error);
    throw error;
  }
},

  logout: async () => {
    await axiosInstance.post("/auth/logout");
  },

  getMe: async () => {
    const { data } = await axiosInstance.get("/auth/me");
    return data;
  },

  refresh: async () => {
    const { data } = await axiosInstance.post("/auth/refresh");
    return data;
  },
};

export default authService;
