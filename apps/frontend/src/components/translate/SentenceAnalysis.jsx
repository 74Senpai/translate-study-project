import { Link } from "react-router-dom";
import { Loader2, BookOpen, Sparkles, Tag, HelpCircle, Layers } from "lucide-react";

const SLUG_MAPPING = {
  // Tenses
  "Simple Present": "simple-present",
  "Present Continuous": "present-continuous",
  "Present Perfect": "present-perfect",
  "Present Perfect Continuous": "present-perfect-continuous",
  "Simple Past": "simple-past",
  "Past Continuous": "past-continuous",
  "Past Perfect": "past-perfect",
  "Past Perfect Continuous": "past-perfect-continuous",
  "Future Simple": "simple-future",
  "Future Continuous": "future-continuous",
  "Future Perfect": "future-perfect",
  "Near Future": "near-future",

  // Sentence Types
  "So sánh hơn (Comparative)": "adjective",
  "So sánh nhất (Superlative)": "adjective",
  "Câu điều kiện (Conditional)": "conditional-type-1",
};

/**
 * SentenceAnalysis component displays grammatical analysis & vocabulary breakdown.
 * Shows tense, sentence types, voice, AND extracted vocabulary meanings, definitions, examples.
 */
export default function SentenceAnalysis({ analysis, vocabularies = [], isVocabLoading = false }) {
  if ((!analysis || analysis.length === 0) && !isVocabLoading && vocabularies.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      {/* Grammar Analysis Block */}
      {analysis && analysis.length > 0 && (
        <div className="flex flex-col gap-3">
          <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            Phân tích ngữ pháp
          </label>

          <div className="flex flex-col gap-3">
            {analysis.map((item, index) => (
              <div
                key={index}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-lg shadow-slate-100/50 hover:shadow-xl transition-all"
              >
                <p className="text-slate-800 font-bold text-base mb-3 border-b border-slate-100 pb-2.5">
                  &quot;{item.sentence}&quot;
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Tense */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[0.65rem] text-slate-400 uppercase font-extrabold">
                      Thì (Tense)
                    </span>
                    <div className="flex items-center gap-2">
                      {SLUG_MAPPING[item.tense.tense] ? (
                        <Link
                          to={`/library/topic/${SLUG_MAPPING[item.tense.tense]}`}
                          className="px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors no-underline border border-blue-100"
                        >
                          {item.tense.tense}
                        </Link>
                      ) : (
                        <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold border border-blue-100">
                          {item.tense.tense}
                        </span>
                      )}
                      {item.tense.signal_words.length > 0 && (
                        <span className="text-[0.7rem] text-slate-500 italic">
                          (Nhận biết: {item.tense.signal_words.join(", ")})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sentence Types */}
                  {item.sentence_types.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[0.65rem] text-slate-400 uppercase font-extrabold">
                        Loại câu
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {item.sentence_types.map((type, tIdx) => (
                          <div key={tIdx} className="flex flex-col">
                            {SLUG_MAPPING[type.type] ? (
                              <Link
                                to={`/library/topic/${SLUG_MAPPING[type.type]}`}
                                className="px-3 py-1 bg-purple-50 text-purple-600 rounded-xl text-sm font-bold hover:bg-purple-100 transition-colors no-underline self-start border border-purple-100"
                              >
                                {type.type}
                              </Link>
                            ) : (
                              <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-xl text-sm font-bold border border-purple-100 self-start">
                                {type.type}
                              </span>
                            )}
                            {type.signal_words.length > 0 && (
                              <span className="text-[0.7rem] text-slate-500 italic mt-0.5">
                                (Nhận biết: {type.signal_words.join(", ")})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Voice & Logic Indicators */}
                  <div className="flex flex-wrap gap-2 mt-1 md:col-span-2">
                    {item.voice === "passive" && (
                      <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[0.7rem] font-black uppercase border border-amber-200">
                        Bị động (Passive)
                      </span>
                    )}
                    {item.is_negative && (
                      <span className="px-2.5 py-0.5 bg-rose-50 text-rose-600 rounded-full text-[0.7rem] font-black uppercase border border-rose-200">
                        Phủ định
                      </span>
                    )}
                    {item.is_question && (
                      <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[0.7rem] font-black uppercase border border-emerald-200">
                        Câu hỏi
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vocabulary Analysis Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="block text-[0.7rem] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            Từ vựng & Định nghĩa trong câu
          </label>
          {isVocabLoading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold border border-blue-100">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Đang tra nghĩa...</span>
            </div>
          )}
        </div>

        {/* Loading Skeleton Card when waiting for VOCAB */}
        {isVocabLoading && (!vocabularies || vocabularies.length === 0) && (
          <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-md flex items-center gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-slate-800">
                Đang phân tích nghĩa ngữ cảnh, định nghĩa và ví dụ...
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Hệ thống đang chạy thuật toán tra nghĩa cho từng từ vựng trong câu
              </span>
            </div>
          </div>
        )}

        {/* Vocabulary Cards List */}
        {vocabularies && vocabularies.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vocabularies.map((vocab, vIdx) => (
              <div
                key={vIdx}
                className="bg-white p-5 rounded-3xl border border-slate-100 shadow-md hover:shadow-xl transition-all flex flex-col gap-2.5"
              >
                {/* Top header: Word name & Tag */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-slate-900">
                      {vocab.word}
                    </span>
                    {vocab.is_phrase && (
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[0.65rem] font-bold border border-indigo-100">
                        Cụm từ
                      </span>
                    )}
                  </div>
                  {vocab.contextual_meaning ? (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black border border-emerald-100">
                      {vocab.contextual_meaning}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-400 rounded-xl text-[0.7rem] font-bold">
                      Đang tải nghĩa...
                    </span>
                  )}
                </div>

                {/* Definition */}
                {vocab.concept_definition && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.65rem] font-extrabold text-slate-400 uppercase tracking-wider">
                      Định nghĩa
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium m-0">
                      {vocab.concept_definition}
                    </p>
                  </div>
                )}

                {/* Simple Example */}
                {vocab.simple_example && (
                  <div className="flex flex-col gap-0.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[0.65rem] font-extrabold text-slate-400 uppercase tracking-wider">
                      Ví dụ ứng dụng
                    </span>
                    <p className="text-xs text-slate-600 italic leading-relaxed m-0 font-normal">
                      &quot;{vocab.simple_example}&quot;
                    </p>
                  </div>
                )}

                {/* Synonyms */}
                {vocab.synonyms && vocab.synonyms.length > 0 && (
                  <div className="flex items-center gap-1.5 pt-1 text-[0.7rem]">
                    <span className="font-extrabold text-slate-400 uppercase tracking-wider">
                      Đồng nghĩa:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {vocab.synonyms.map((syn, sIdx) => (
                        <span
                          key={sIdx}
                          className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[0.7rem] font-semibold"
                        >
                          {syn}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
