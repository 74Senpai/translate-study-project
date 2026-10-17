/**
 * Admin CMS Service
 *
 * All requests are made via the authenticated axiosInstance which automatically
 * attaches the Supabase Bearer token. No manual getAuthHeaders() needed.
 */
import axiosInstance from '@/services/axiosInstance';

const CMS = '/cms';

export const cmsService = {
  // ── Feedback ────────────────────────────────────────────────────────────
  getFeedback: async () => {
    const { data } = await axiosInstance.get(`${CMS}/feedback`);
    return data;
  },

  getStats: async () => {
    try {
      const { data } = await axiosInstance.get(`${CMS}/stats`);
      return data;
    } catch {
      // Fallback stats nếu endpoint CMS stats chưa khởi tạo
      return {
        feedbackCount: 0,
        libraryCount: 0,
        dictionaryCount: 0,
        userCount: 0,
        flashcardCount: 0,
      };
    }
  },

  updateFeedback: async (id, payload) => {
    const { data } = await axiosInstance.patch(`${CMS}/feedback/${id}`, payload);
    return data;
  },

  deleteFeedback: async (id) => {
    const { data } = await axiosInstance.delete(`${CMS}/feedback/${id}`);
    return data;
  },

  // ── Library ─────────────────────────────────────────────────────────────
  getLibraryTopics: async () => {
    const { data } = await axiosInstance.get(`${CMS}/library`);
    return data.topics;
  },

  getTopicDetail: async (slug) => {
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
      task_types: taskTypes,
    });
    return data;
  },

  // ── Dictionary Cache ────────────────────────────────────────────────────
  getDictionary: async (skip = 0, limit = 50, search = '', sortBy = 'latest', mode = '', status = '') => {
    const params = { skip, limit, sort_by: sortBy };
    if (search) params.search = search;
    if (mode) params.mode = mode;
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

  // ── Maintenance Tools ───────────────────────────────────────────────────
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

  // ── Translation Helper ──────────────────────────────────────────────────
  simpleTranslate: async (text, direction = 'en-vi') => {
    const { data } = await axiosInstance.post(`/translate/simple/${direction}`, { raw_text: text });
    return data;
  },
};

export default cmsService;
