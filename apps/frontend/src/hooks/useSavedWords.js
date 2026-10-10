import { useState, useCallback } from "react";
import {
  getSavedWords,
  deleteWord,
  toggleFavorite,
  saveWord,
} from "@/services/translateApi";

/**
 * useSavedWords — manages saved vocabulary state
 * Handles loading, pagination, search, filter by favorites, save, delete, toggle favorite.
 */
export function useSavedWords() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (pageNum = 1, searchQuery = "", favOnly = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSavedWords(pageNum, LIMIT, searchQuery, favOnly);
      if (pageNum === 1) {
        setItems(data.items);
      } else {
        setItems((prev) => [...prev, ...data.items]);
      }
      setTotal(data.total);
      setPage(pageNum);
      setHasMore(data.has_more);
    } catch (err) {
      setError(err.message || "Không thể tải từ đã lưu.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    load(page + 1, search, onlyFavorites);
  }, [hasMore, isLoading, page, search, onlyFavorites, load]);

  const handleSearch = useCallback(
    (query) => {
      setSearch(query);
      load(1, query, onlyFavorites);
    },
    [load, onlyFavorites]
  );

  const handleToggleFavoritesFilter = useCallback(
    (val) => {
      setOnlyFavorites(val);
      load(1, search, val);
    },
    [load, search]
  );

  const handleSave = useCallback(async (wordData) => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveWord(wordData);
      // Prepend to list if on first page
      setItems((prev) => {
        const exists = prev.find((w) => w.word === result.word?.word);
        if (exists) {
          return prev.map((w) => (w.word === result.word?.word ? result.word : w));
        }
        return [result.word, ...prev];
      });
      setTotal((prev) => prev + 1);
      return result;
    } catch (err) {
      setError(err.message || "Lưu từ thất bại.");
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteWord(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err.message || "Xoá thất bại.");
    }
  }, []);

  const handleToggleFavorite = useCallback(async (id) => {
    try {
      const result = await toggleFavorite(id);
      const updated = result.word;
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (err) {
      setError(err.message || "Cập nhật thất bại.");
    }
  }, []);

  return {
    items,
    total,
    page,
    hasMore,
    isLoading,
    isSaving,
    error,
    search,
    onlyFavorites,
    load,
    loadMore,
    handleSearch,
    handleToggleFavoritesFilter,
    handleSave,
    handleDelete,
    handleToggleFavorite,
  };
}
