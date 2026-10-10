import axios from "axios";
import useAuthStore from "@/store/authStore";

const VITE_API_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
// Clean base URL to be host only (e.g. http://localhost:8000)
const API_BASE_URL = VITE_API_URL.replace(/\/api\/(admin|v1)\/?$/, "").replace(
  /\/$/,
  "",
);

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Crucial for cookie-based refresh
});

let isRefreshing = false;
let refreshPromise = null;

// Request Interceptor: Attach token and map urls to the correct backend APIs
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    let url = config.url || "";
    const [path, query] = url.split("?");
    const queryString = query ? `?${query}` : "";

    if (path.startsWith("/auth/")) {
      url = `/api/v1${path}${queryString}`;
    } else if (path.startsWith("/translate/")) {
      url = `/api/v1${path}${queryString}`;
    } else if (path.startsWith("/admin/users")) {
      url = path.replace("/admin/users", "/api/admin/users") + queryString;
    } else if (path === "/admin/roles") {
      url = "/api/admin/users/roles" + queryString;
    } else if (path.startsWith("/admin/dictionary/")) {
      url = path.replace("/admin/dictionary/", "/api/admin/dictionary/") + queryString;
    } else if (path.startsWith("/admin/flashcards/")) {
      url = path.replace("/admin/flashcards/", "/api/admin/flashcards/") + queryString;
    } else if (path.startsWith("/cms/")) {
      url = `/api/admin${path}${queryString}`;
    } else if (path === "/flashcards") {
      url = "/api/admin/flashcards" + queryString;
    } else if (path === "/flashcards/dictionary-cache") {
      url = "/api/v1/flashcards/dictionary-cache" + queryString;
    } else if (path === "/flashcards/generate-ai") {
      url = "/api/v1/flashcards/generate-ai" + queryString;
    } else if (path.startsWith("/flashcards/extension-session/")) {
      url = "/api/v1" + path + queryString;
    } else if (path.startsWith("/skills/")) {
      url = path.replace("/skills/", "/api/admin/skills/") + queryString;
    } else if (path === "/skills") {
      url = "/api/admin/skills" + queryString;
    } else if (path.startsWith("/flashcards/")) {
      url = path.replace("/flashcards/", "/api/admin/flashcards/") + queryString;
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

    // Handle 401 errors
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
            console.warn("Admin session invalid, clearing auth...");
            useAuthStore.getState().clearAuth();
            if (!window.location.pathname.includes("/login")) {
              window.location.href = "/admin/login?expired=true";
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

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error("Access forbidden (403)");
      // Optional: redirect to a specific 403 page
      // window.location.href = "/admin/403";
    }

    return Promise.reject(error);
  },
);

export default axiosInstance;
