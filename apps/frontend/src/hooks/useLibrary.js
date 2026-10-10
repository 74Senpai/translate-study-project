import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchLibrary } from "@/services/translateApi";

/**
 * Custom hook quan ly state cho trang Library (Grid List).
 *
 * Tra ve:
 *  - filteredTopics   — danh sách topic tóm tắt sau khi lọc theo category + search
 *  - activeCategory   — danh mục đang được chọn
 *  - changeCategory   — đổi danh mục và reset search
 *  - searchQuery      — từ khóa tìm kiếm
 *  - setSearchQuery   — cập nhật từ khóa
 *  - isLoading        — đang tải dữ liệu
 *  - error            — thông báo lỗi
 *  - allTopics        — danh sach tat ca topic (dung de dem so luong tab)
 */
export function useLibrary() {
  const [allTopics, setAllTopics] = useState([]);
  const [activeCategories, setActiveCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load toan bo topics khi mount
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetchLibrary();
        const topics = res.topics || [];
        setAllTopics(topics);
        
        // Mac dinh chon tat ca category
        const cats = Array.from(new Set(topics.map((t) => t.category))).filter(Boolean);
        setActiveCategories(cats);
      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Filter theo category va search
  const filteredTopics = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allTopics
      .filter((t) => {
        // Neu khong co search, loc theo mang activeCategories
        // Neu co search, hien thi tat ca nhung van uu tien activeCategories len dau (trong sort)
        const isCatActive = activeCategories.includes(t.category);
        const matchCat = q ? true : isCatActive;

        if (!q) return matchCat;

        const inBasicInfo =
          t.title.toLowerCase().includes(q) ||
          t.title_en.toLowerCase().includes(q) ||
          t.summary.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q));

        return matchCat && inBasicInfo;
      })
      .sort((a, b) => {
        if (q) {
          const aActive = activeCategories.includes(a.category);
          const bActive = activeCategories.includes(b.category);
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
        }
        return a.order - b.order;
      });
  }, [allTopics, activeCategories, searchQuery]);

  // Toggle category trong danh sach loc
  const toggleCategory = useCallback((cat) => {
    setActiveCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }, []);

  return {
    filteredTopics,
    activeCategories,
    toggleCategory,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    allTopics,
  };
}
