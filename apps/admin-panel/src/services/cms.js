/**
 * Admin CMS Service
 *
 * All requests are made via the authenticated axiosInstance which automatically
 * attaches the Supabase Bearer token. No manual getAuthHeaders() needed.
 *
 * Base URL: VITE_API_BASE_URL/cms  (e.g. http://localhost:8000/api/v1/cms)
 */
import axiosInstance from '@/services/axiosInstance';

const CMS = '/cms';

export const cmsService = {
  // â”€â”€ Feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getFeedback: async () => {
    const { data } = await axiosInstance.get(`${CMS}/feedback`);
    return data;
  },

  getStats: async () => {
    const { data } = await axiosInstance.get(`${CMS}/stats`);
    return data;
  },

  updateFeedback: async (id, payload) => {
    const { data } = await axiosInstance.patch(`${CMS}/feedback/${id}`, payload);
    return data;
  },

  deleteFeedback: async (id) => {
    const { data } = await axiosInstance.delete(`${CMS}/feedback/${id}`);
    return data;
  },

  // â”€â”€ Library â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getLibraryTopics: async () => {
    const { data } = await axiosInstance.get(`${CMS}/library`);
    return data.topics;
  },

  getTopicDetail: async (slug) => {
    // Use CMS endpoint to allow fetching private topics
    const { data } = await axiosInstance.get(`${CMS}/library/${slug}`);
    return data;
  },

  createTopic: async (payload) => {
    const { data } = await axiosInstance.post(`${CMS}/library`, payload);
    return data;
  },

  updateTopic: async (slug, payload) => {
    const { data } = await axiosInstance.put(`${CMS}/library/${slug}`, payload);
    return data;
  },

  deleteTopic: async (slug) => {
    const { data } = await axiosInstance.delete(`${CMS}/library/${slug}`);
    return data;
  },

  reviewLibraryBlocks: async (blocks) => {
    const { data } = await axiosInstance.post(`${CMS}/library/review-ai`, {
      blocks,
    });
    return data;
  },

  generateFlashcardsByAI: async (prompt, difficulty, taskTypes) => {
    const { data } = await axiosInstance.post('/flashcards/generate-ai', {
      prompt,
      difficulty,
      task_types: taskTypes
    });
    return data;
  },

  // â”€â”€ Dictionary Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getDictionary: async (skip = 0, limit = 50, search = '', sortBy = 'latest', mode = '', status = '') => {
    const params = { skip, limit, sort_by: sortBy };
    if (search) params.search = search;
    if (mode)   params.mode   = mode;
    if (status) params.status = status;
    const { data } = await axiosInstance.get(`${CMS}/dictionary`, { params });
    return data;
  },

  updateDictionary: async (id, translation) => {
    const { data } = await axiosInstance.patch(`${CMS}/dictionary/${id}`, { translation });
    return data;
  },

  deleteDictionary: async (id) => {
    const { data } = await axiosInstance.delete(`${CMS}/dictionary/${id}`);
    return data;
  },

  // ── Maintenance Tools (under /admin prefix) ─────────────────────────────
  verifyDictionary: async (reverifyAll = false) => {
    const { data } = await axiosInstance.post(`/admin/dictionary/verify?reverify_all=${reverifyAll}`);
    return data;
  },

  cleanupDictionary: async () => {
    const { data } = await axiosInstance.post('/admin/dictionary/cleanup');
    return data;
  },

  cleanupSessions: async () => {
    const { data } = await axiosInstance.post('/admin/flashcards/sessions/cleanup');
    return data;
  },

  // ── Translation Helper (public, no /cms prefix) ──────────────────────────
  simpleTranslate: async (text, direction = 'en-vi') => {
    const { data } = await axiosInstance.post(`/translate/simple/${direction}`, { raw_text: text });
    return data;
  },
};
