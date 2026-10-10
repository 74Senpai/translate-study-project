import React, { useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Clock,
  Tag,
  Share2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { fetchLibraryTopic, fetchLibrary } from "@/services/translateApi";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Helmet } from "react-helmet-async";

const TopicDetailPage = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const contentRef = useRef(null);

  const [topic, setTopic] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prevSlug, setPrevSlug] = useState(slug);
  const [navigation, setNavigation] = useState({ prev: null, next: null });

  if (slug !== prevSlug) {
    setPrevSlug(slug);
    setLoading(true);
    setTopic(null);
    setError(null);
  }

  useEffect(() => {
    if (!topic?.html || !contentRef.current) return;

    const scripts = contentRef.current.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value),
      );
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }, [topic?.html]);

  useEffect(() => {
    fetchLibraryTopic(slug)
      .then((data) => {
        setTopic(data);
        setError(null);

        fetchLibrary().then((listData) => {
          const topics = listData.topics || [];
          const currentIndex = topics.findIndex((item) => item.slug === slug);

          setNavigation({
            prev: currentIndex > 0 ? topics[currentIndex - 1] : null,
            next:
              currentIndex >= 0 && currentIndex < topics.length - 1
                ? topics[currentIndex + 1]
                : null,
          });
        });

        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(
          err.message || "Không thể tải nội dung bài học. Vui lòng thử lại sau.",
        );
        setLoading(false);
      });

    window.scrollTo(0, 0);
  }, [slug]);

  const handleShare = () => {
    if (!topic) return;

    if (navigator.share) {
      navigator
        .share({
          title: topic.title,
          text: topic.summary,
          url: window.location.href,
        })
        .catch(console.error);
      return;
    }

    navigator.clipboard.writeText(window.location.href);
    alert("Đã sao chép liên kết vào bộ nhớ tạm");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
          </div>
          <p className="text-xl font-black text-slate-900">
            Đang nạp kiến thức...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 font-sans min-h-screen flex flex-col">
      <Helmet>
        <title>
          {topic?.title ? `${topic.title} | DeepTranslate` : "DeepTranslate"}
        </title>
        <meta
          name="description"
          content={topic?.summary || "Tìm hiểu thêm về các chủ đề tiếng Anh."}
        />
        <link
          rel="canonical"
          href={`https://deeptranslate.io/library/topic/${slug}`}
        />
      </Helmet>

      <Header />

      <main className="mt-4 mb-20 max-w-4xl mx-auto w-full flex-1">
        <section className="space-y-6">
          <button
            onClick={() => navigate("/library")}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-sm font-bold"
          >
            <ChevronLeft size={16} />
            Quay lại thư viện
          </button>

          {error ? (
            <div className="bg-red-50 border border-red-100 p-8 rounded-3xl text-center">
              <AlertCircle className="mx-auto text-red-500 mb-4" size={48} />
              <h2 className="text-xl font-bold text-red-800 mb-2">{error}</h2>
              <Link to="/library" className="text-red-600 font-bold underline">
                Về trang danh sách
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              <article className="bg-white rounded-[1.5rem] md:rounded-[3rem] border border-slate-100 shadow-sm p-6 md:p-16">
                <header className="mb-10">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                        {topic?.category?.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-2 text-slate-400 text-xs font-medium">
                        <Clock size={12} />
                        <span>5 phút đọc</span>
                      </div>
                    </div>

                    <button
                      onClick={handleShare}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-100 hover:bg-blue-50 hover:text-blue-600 transition-all"
                    >
                      <Share2 size={14} />
                      Chia sẻ
                    </button>
                  </div>

                  <h1 className="text-2xl md:text-4xl font-black text-slate-800 mb-4 leading-tight">
                    {topic?.title}
                  </h1>
                  <p className="text-slate-500 font-medium leading-relaxed">
                    {topic?.summary}
                  </p>

                  {topic?.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-6">
                      {topic.tags.map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-100"
                        >
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                <div className="space-y-8 md:space-y-12">
                  {topic?.html ? (
                    <div
                      ref={contentRef}
                      className="rendered-html-content"
                      dangerouslySetInnerHTML={{ __html: topic.html }}
                    />
                  ) : (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm font-medium text-amber-900">
                      Nội dung bài viết chưa được server render HTML.
                    </div>
                  )}
                </div>
              </article>

              <nav className="mt-16 pt-8 border-t border-slate-100 flex justify-between items-center gap-4">
                {navigation.prev ? (
                  <Link
                    to={`/library/topic/${navigation.prev.slug}`}
                    className="flex flex-col items-start group"
                  >
                    <span className="text-[10px] font-bold text-slate-300 uppercase mb-1">
                      Trước đó
                    </span>
                    <span className="text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                      {navigation.prev.title}
                    </span>
                  </Link>
                ) : (
                  <div />
                )}

                {navigation.next ? (
                  <Link
                    to={`/library/topic/${navigation.next.slug}`}
                    className="flex flex-col items-end group"
                  >
                    <span className="text-[10px] font-bold text-slate-300 uppercase mb-1">
                      Tiếp theo
                    </span>
                    <span className="text-sm font-bold text-slate-500 group-hover:text-blue-600 transition-colors">
                      {navigation.next.title}
                    </span>
                  </Link>
                ) : (
                  <div />
                )}
              </nav>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default TopicDetailPage;
