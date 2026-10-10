import { useState, useCallback } from "react";
import {
  getTranslationHistory,
  deleteHistoryItem,
  clearAllHistory,
} from "@/services/translateApi";

/**
 * useHistory — manages translation history state
 * Handles loading, pagination, search, delete, and clear all.
 */
export function useHistory() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const LIMIT = 20;

  const load = useCallback(async (pageNum = 1, searchQuery = "") => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getTranslationHistory(pageNum, LIMIT, searchQuery);
      if (pageNum === 1) {
        setItems(data.items);
      } else {
        setItems((prev) => [...prev, ...data.items]);
      }
      setTotal(data.total);
      setPage(pageNum);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err.message || "Không thể tải lịch sử dịch.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    load(page + 1, search);
  }, [hasMore, isLoading, page, search, load]);

  const handleSearch = useCallback(
    (query) => {
      setSearch(query);
      load(1, query);
    },
    [load]
  );

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteHistoryItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message || "Xoá thất bại.");
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    try {
      await clearAllHistory();
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } catch (err) {
      setError(err.message || "Xoá thất bại.");
    }
  }, []);

  return {
    items,
    total,
    page,
    hasMore,
    isLoading,
    error,
    search,
    load,
    loadMore,
    handleSearch,
    handleDelete,
    handleClearAll,
  };
}
