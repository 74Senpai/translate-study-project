import axios from "axios";
import useAuthStore from "@/store/authStore";
import { API_BASE_URL } from "./apiConfig";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial for cookie-based refresh
});

let isRefreshing = false;
let refreshPromise = null;

// Request Interceptor: Attach token and map URLs to the correct backend APIs
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // URL routing: map logical paths to actual backend API routes
    let url = config.url || "";
    const [path, query] = url.split("?");
    const qs = query ? `?${query}` : "";

    if (path.startsWith("/auth/")) {
      url = `/api/v1${path}${qs}`;
    } else if (path.startsWith("/translate/")) {
      url = `/api/v1${path}${qs}`;
    } else if (path.startsWith("/admin/users")) {
      url = path.replace("/admin/users", "/api/admin/users") + qs;
    } else if (path === "/admin/roles") {
      url = "/api/admin/users/roles" + qs;
    } else if (path.startsWith("/admin/dictionary/")) {
      url = path.replace("/admin/dictionary/", "/api/admin/dictionary/") + qs;
    } else if (path.startsWith("/admin/flashcards/")) {
      url = path.replace("/admin/flashcards/", "/api/admin/flashcards/") + qs;
    } else if (path.startsWith("/cms/")) {
      url = `/api/admin${path}${qs}`;
    } else if (path === "/flashcards") {
      url = "/api/admin/flashcards" + qs;
    } else if (path === "/flashcards/dictionary-cache") {
      url = "/api/v1/flashcards/dictionary-cache" + qs;
    } else if (path === "/flashcards/generate-ai") {
      url = "/api/v1/flashcards/generate-ai" + qs;
    } else if (path.startsWith("/flashcards/extension-session/")) {
      url = "/api/v1" + path + qs;
    } else if (path.startsWith("/skills/")) {
      url = path.replace("/skills/", "/api/admin/skills/") + qs;
    } else if (path === "/skills") {
      url = "/api/admin/skills" + qs;
    } else if (path.startsWith("/flashcards/")) {
      url = path.replace("/flashcards/", "/api/admin/flashcards/") + qs;
    }

    config.url = url;
    return config;
  },
  (error) => Promise.reject(error),
);

// Response Interceptor: Handle 401 & Auto-refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
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

      refreshPromise = (async () => {
        try {
          const { data } = await axios.post(
            `${API_BASE_URL}/api/v1/auth/refresh`,
            {},
            { withCredentials: true },
          );

          const { access_token, user } = data;
          useAuthStore.getState().setAuth(user, access_token);
          return access_token;
        } catch (err) {
          const errorMsg = err.response?.data?.detail || "";
          if (
            errorMsg.includes("Already Used") ||
            errorMsg.includes("expired")
          ) {
            console.warn("Session invalid, clearing auth...");
            useAuthStore.getState().clearAuth();
            const isAdminPath = window.location.pathname.startsWith("/admin");
            if (!window.location.pathname.includes("/login")) {
              window.location.href = isAdminPath
                ? "/admin/login?expired=true"
                : "/login?expired=true";
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
