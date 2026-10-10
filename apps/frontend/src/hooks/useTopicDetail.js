import { useState, useEffect } from "react";
import { fetchLibraryTopic, fetchLibrary } from "@/services/translateApi";

/**
 * Custom hook quản lý state cho trang Chi tiết Topic.
 * @param {string} slug - Slug của topic cần lấy chi tiết.
 */
export function useTopicDetail(slug) {
  const [topic, setTopic] = useState(null);
  const [navigation, setNavigation] = useState({ prev: null, next: null });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!slug) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [topicData, libraryData] = await Promise.all([
          fetchLibraryTopic(slug),
          fetchLibrary()
        ]);
        
        setTopic(topicData);

        const topics = libraryData.topics || [];
        const currentIndex = topics.findIndex(t => t.slug === slug);
        
        let prev = null;
        let next = null;
        
        if (currentIndex > 0) prev = topics[currentIndex - 1];
        if (currentIndex < topics.length - 1) next = topics[currentIndex + 1];

        setNavigation({ prev, next });

      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [slug]);

  return {
    topic,
    navigation,
    isLoading,
    error,
  };
}
