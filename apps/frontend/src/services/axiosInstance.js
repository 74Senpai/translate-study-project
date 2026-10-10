import axios from "axios";
import useAuthStore from "@/store/authStore";
import { API_BASE_URL } from "./apiConfig";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial for cookie-based refresh
});

let isRefreshing = false;
let refreshPromise = null;

// Request Interceptor: Attach token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Handle 401 & Auto-refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors
    if (error.response?.status === 401 && !originalRequest._retry) {
      // If already refreshing, wait for the existing promise
      if (isRefreshing) {
        try {
          const access_token = await refreshPromise;
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return axiosInstance(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      originalRequest._retry = true;
      isRefreshing = true;

      // Create a singleton promise for the refresh call
      refreshPromise = (async () => {
        try {
          const { data } = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          );

          const { access_token, user } = data;
          useAuthStore.getState().setAuth(user, access_token);
          return access_token;
        } catch (err) {
          // Specific handling for "Already Used" or other terminal refresh errors
          const errorMsg = err.response?.data?.detail || "";
          if (
            errorMsg.includes("Already Used") ||
            errorMsg.includes("expired")
          ) {
            console.warn("Session invalid, clearing auth...");
            useAuthStore.getState().clearAuth();
            if (!window.location.pathname.includes("/login")) {
              window.location.href = "/login?expired=true";
            }
          }
          throw err;
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      })();

      try {
        const access_token = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
