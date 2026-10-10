/**
 * Frontend — Public & Authenticated API Service
 *
 * - `apiClient`     → public endpoints (translate, library, feedback)
 * - `authApiClient` → authenticated endpoints (history, saved words)
 */
import { apiClient, authApiClient } from "@/lib/apiClient";
import { API_BASE_URL } from "./apiConfig";

// ── Translation (Streaming NDJSON) ────────────────────────────────────────────
/**
 * Calls the backend /api/v1/translate/stream endpoint.
 * Yields TranslateWorkflowResponse objects: { type_response, data }
 * type_response can be: "TRANSLATE" | "ANALYSIS" | "TYPO" | "STATS" | "VOCAB"
 */
export async function* translate(rawText, mode, signal, option = {}) {
  const endpoint = `${API_BASE_URL}/api/v1/translate/stream`;
  const headers = {
    "Content-Type": "application/json",
  };

  const accessToken = localStorage.getItem("access_token");
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const parsedMode = typeof mode === "string" ? JSON.parse(mode) : mode;

  const response = await fetch(endpoint, {
    method: "POST",
    signal: signal,
    headers: headers,
    body: JSON.stringify({
      text: rawText,
      source: parsedMode,
      option: option,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Lỗi máy chủ (${response.status})`;
    try {
      const errObj = JSON.parse(errorText);
      errorMessage = errObj.detail || errObj.message || errorMessage;
    } catch (_) {}
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line);
      } catch (e) {
        console.warn("Failed to parse NDJSON line:", line, e);
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch (_) {}
  }
}

// ── Library ───────────────────────────────────────────────────────────────────

/** GET /library */
export const fetchLibrary = async () => {
  const { data } = await apiClient.get("/library");
  return data;
};

/** GET /library/category/{category} */
export const fetchLibraryByCategory = async (category) => {
  const { data } = await apiClient.get(`/library/category/${category}`);
  return data;
};

/** GET /library/search?q={query} */
export const searchLibrary = async (query) => {
  const { data } = await apiClient.get("/library/search", {
    params: { q: query },
  });
  return data;
};

/** GET /library/topic/{slug} */
export const fetchLibraryTopic = async (slug) => {
  const { data } = await apiClient.get(`/library/topic/${slug}`);
  return data;
};

// ── History (auth required) ───────────────────────────────────────────────────

/** GET /user/history — paginated list */
export const getTranslationHistory = async (
  page = 1,
  limit = 20,
  search = "",
) => {
  const { data } = await authApiClient.get("/user/history", {
    params: { page, limit, search: search || undefined },
  });
  return data;
};

/** DELETE /user/history/{id} — delete one entry */
export const deleteHistoryItem = async (id) => {
  const { data } = await authApiClient.delete(`/user/history/${id}`);
  return data;
};

/** DELETE /user/history — clear all */
export const clearAllHistory = async () => {
  const { data } = await authApiClient.delete("/user/history");
  return data;
};

// ── Saved Words (auth required) ───────────────────────────────────────────────

/** POST /user/words — save/upsert a word */
export const saveWord = async (wordData) => {
  const { data } = await authApiClient.post("/user/words", wordData);
  return data;
};

/** GET /user/words — paginated list */
export const getSavedWords = async (
  page = 1,
  limit = 20,
  search = "",
  onlyFavorites = false,
) => {
  const { data } = await authApiClient.get("/user/words", {
    params: {
      page,
      limit,
      search: search || undefined,
      only_favorites: onlyFavorites || undefined,
    },
  });
  return data;
};

/** DELETE /user/words/{id} */
export const deleteWord = async (id) => {
  const { data } = await authApiClient.delete(`/user/words/${id}`);
  return data;
};

/** PATCH /user/words/{id}/favorite — toggle favorite */
export const toggleFavorite = async (id) => {
  const { data } = await authApiClient.patch(`/user/words/${id}/favorite`);
  return data;
};

// ── Word Tracking (auth required) ─────────────────────────────────────────────

/** POST /user/stats/track-word */
export const trackWord = async (
  word,
  actionType = "translate",
  sourceUrl = "",
) => {
  const { data } = await authApiClient.post("/user/stats/track-word", {
    word,
    action_type: actionType,
    source_url: sourceUrl || window.location.href,
  });
  return data;
};

/** GET /user/stats/tracked-words — paginated list of encountered words */
export const getTrackedWords = async ({
  page = 1,
  limit = 30,
  sort = "frequency",
  search,
} = {}) => {
  const { data } = await authApiClient.get("/user/stats/tracked-words", {
    params: { page, limit, sort, search: search || undefined },
  });
  return data;
};

export default apiClient;
