/**
 * Frontend — Axios Client
 *
 * Two instances are exported:
 *
 *  - `apiClient`      Public instance (no auth token, no retry logic).
 *                     Used for: translate, library, feedback, and other
 *                     public endpoints.
 *                     Also doubles as the refresh-token caller inside
 *                     authApiClient's interceptor — it is safe because it
 *                     has NO 401-retry interceptor, preventing an infinite
 *                     refresh loop.
 *
 *  - `authApiClient`  Authenticated instance. Full interceptor chain:
 *                       1. Request  → auto-attach Bearer token
 *                       2. Response → 401 silent refresh → retry
 *                       3. Response → 403 redirect to /403
 *                       4. Response → error normalisation
 */
import axios from "axios";

const BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// ── Public client (no auth, no retry) ────────────────────────────────────────
// Used for public endpoints AND as the refresh-token caller (safe — no retry loop)
export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      return Promise.reject(
        new Error("Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng."),
      );
    }
    const { status, data } = error.response;
    const message = data?.detail || data?.message || `Lỗi máy chủ (${status})`;
    return Promise.reject(new Error(message));
  },
);

// ── Authenticated client — Full interceptor chain ─────────────────────────────
export const authApiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ── [1] Request interceptor: auto-attach Bearer token ────────────────────────
authApiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("access_token");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── [2/3/4] Response interceptor: 401 refresh + 403 redirect + normalize ──────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

authApiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Network / no-response errors
    if (!error.response) {
      return Promise.reject(
        new Error("Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng."),
      );
    }

    const { status, data } = error.response;

    // ── [2] 401: silent token refresh → retry ────────────────────────────────
    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue subsequent 401s while a refresh is already in flight
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers["Authorization"] = "Bearer " + token;
            return authApiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Use the PUBLIC apiClient for refresh — it has NO retry interceptor,
        // so a 401 from /auth/refresh won't recurse back here.
        const { data: refreshData } = await apiClient.post("/auth/refresh", {});

        const newToken = refreshData.access_token;
        localStorage.setItem("access_token", newToken);

        authApiClient.defaults.headers.common["Authorization"] =
          "Bearer " + newToken;
        originalRequest.headers["Authorization"] = "Bearer " + newToken;

        processQueue(null, newToken);
        return authApiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem("access_token");
        window.location.href = "/login";
        return Promise.reject(
          new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
        );
      } finally {
        isRefreshing = false;
      }
    }

    // ── [3] 403: redirect to forbidden page ──────────────────────────────────
    if (status === 403) {
      window.location.href = "/403";
      return Promise.reject(
        new Error("Bạn không có quyền truy cập tài nguyên này."),
      );
    }

    // ── [4] Other errors: normalise message ──────────────────────────────────
    const message = data?.detail || data?.message || `Lỗi máy chủ (${status})`;
    return Promise.reject(new Error(message));
  },
);

export default apiClient;
