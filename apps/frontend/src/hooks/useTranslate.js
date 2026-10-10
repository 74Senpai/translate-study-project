import { useState, useEffect, useCallback, useRef } from "react";
import { translate } from "@/services/translateApi";
import { POS_REFERENCE } from "@/constants/pos";
import { useAuth } from "@/hooks/useAuth";

const DEBOUNCE_MS = 600;

/**
 * Custom hook that encapsulates all translate state and logic.
 *
 * Returns:
 *  - inputText / setInputText  — controlled textarea value
 *  - mode / setMode            — { source_lang, target_lang } as JSON string
 *  - apiData                   — accumulated stream data { data, pos_tags, vocabularies }
 *  - analysisData              — list of sentence grammar analysis items
 *  - isLoading                 — true while request in flight
 *  - isVocabLoading            — true while waiting for VOCAB event
 *  - error                     — error message string | null
 *  - activeFilters / toggleFilter / resetFilters — POS filter state
 */
export function useTranslate() {
  const { isAuthenticated } = useAuth();
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem("setting_translate_mode");
    return stored
      ? stored
      : JSON.stringify({
          source_lang: "vi",
          target_lang: "en",
        });
  });

  const [apiData, setApiData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVocabLoading, setIsVocabLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);

  // Persistence for UI settings
  const [showResultDetails, setShowResultDetails] = useState(() => {
    const saved = localStorage.getItem("setting_show_result_details");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showAnalysis, setShowAnalysis] = useState(() => {
    const saved = localStorage.getItem("setting_show_analysis");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [activeFilters, setActiveFilters] = useState(
    Object.keys(POS_REFERENCE),
  );

  useEffect(() => {
    localStorage.setItem(
      "setting_show_result_details",
      JSON.stringify(showResultDetails),
    );
  }, [showResultDetails]);

  useEffect(() => {
    localStorage.setItem("setting_show_analysis", JSON.stringify(showAnalysis));
  }, [showAnalysis]);

  useEffect(() => {
    localStorage.setItem("setting_translate_mode", mode);
  }, [mode]);

  const toggleFilter = useCallback((pos) => {
    setActiveFilters((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos],
    );
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilters(Object.keys(POS_REFERENCE));
  }, []);

  // AbortController ref to cancel in-flight requests
  const controllerRef = useRef(null);

  const handleTranslate = useCallback(async (text, currentMode) => {
    if (!text.trim()) {
      setApiData(null);
      setAnalysisData(null);
      setError(null);
      setIsVocabLoading(false);
      return;
    }

    setIsLoading(true);
    setIsVocabLoading(true);
    setError(null);

    // Cancel any previous request
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    controllerRef.current = new AbortController();

    // Accumulators for streaming data
    let accumApiData = {
      data: {
        original_text: text,
        translated_text: "",
        source_lang: currentMode?.source_lang || "vi",
      },
      pos_tags: [],
      vocabularies: [],
    };
    let accumAnalysis = [];

    try {
      for await (const message of translate(
        text,
        currentMode,
        controllerRef.current.signal,
        { analysis: true },
      )) {
        if (!message) continue;

        const { type_response, data } = message;

        if (type_response === "TRANSLATE" && data) {
          // Update translation text progressively
          accumApiData = {
            ...accumApiData,
            data: {
              ...accumApiData.data,
              ...data,
              translated_text:
                data.translated_text || accumApiData.data.translated_text,
            },
          };
          setApiData({ ...accumApiData });

        } else if (type_response === "ANALYSIS" && data) {
          // Map analysis tokens → pos_tags (leave meaning empty until VOCAB event arrives)
          if (data.tokens && Array.isArray(data.tokens)) {
            const mappedPosTags = data.tokens.map((t) => ({
              text: t.text,
              pos: t.pos || "IGNORE",
              meaning: "", // Do NOT display raw English lemma as meaning!
              lemma: t.lemma || t.dictionary_form || t.text,
              sentence: data.original_text || text,
              tense: data.sentence_info?.tense,
              sentence_type: data.sentence_info?.form_type,
            }));
            accumApiData = {
              ...accumApiData,
              pos_tags: [
                ...accumApiData.pos_tags,
                ...mappedPosTags,
              ],
            };
            setApiData({ ...accumApiData });
          }

          // Build SentenceAnalysis items
          if (data.sentence_info) {
            const analysisItem = {
              sentence: data.original_text || text,
              tense: {
                tense: data.sentence_info.tense || "Present Simple",
                signal_words: [],
              },
              sentence_types: data.sentence_info.complexity
                ? [{ type: data.sentence_info.complexity, signal_words: [] }]
                : [],
              voice: (data.sentence_info.voice || "Active").toLowerCase(),
              is_negative:
                data.sentence_info.rule_explanation?.toLowerCase().includes("phủ định") ||
                false,
              is_question: data.sentence_info.form_type === "Interrogative",
              rule_explanation: data.sentence_info.rule_explanation,
            };
            accumAnalysis = [...accumAnalysis, analysisItem];
            setAnalysisData([...accumAnalysis]);
          }

        } else if (type_response === "VOCAB" && data) {
          setIsVocabLoading(false);
          const vocabs = data.vocabularies || [];
          if (Array.isArray(vocabs) && vocabs.length > 0) {
            const vocabMap = new Map();
            vocabs.forEach((v) => {
              if (v.word) {
                vocabMap.set(v.word.toLowerCase(), v);
              }
            });
            const updatedPos = accumApiData.pos_tags.map((t) => {
              const vItem =
                vocabMap.get(t.text.toLowerCase()) ||
                vocabMap.get((t.lemma || "").toLowerCase());
              if (vItem) {
                return {
                  ...t,
                  meaning: vItem.contextual_meaning || "",
                  definition: vItem.concept_definition || "",
                  example: vItem.simple_example || "",
                  synonyms: vItem.synonyms || [],
                  antonyms: vItem.antonyms || [],
                };
              }
              return t;
            });
            accumApiData = {
              ...accumApiData,
              pos_tags: updatedPos,
              vocabularies: vocabs,
            };
            setApiData({ ...accumApiData });
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Đã xảy ra lỗi khi dịch");
    } finally {
      setIsLoading(false);
      setIsVocabLoading(false);
    }
  }, []);

  // Debounced auto-translate on input/mode change
  useEffect(() => {
    const timer = setTimeout(
      () => handleTranslate(inputText, JSON.parse(mode)),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [inputText, mode, handleTranslate]);

  const clearInput = useCallback(() => {
    setInputText("");
    setApiData(null);
    setAnalysisData(null);
    setError(null);
    setIsVocabLoading(false);
  }, []);

  const changeMode = useCallback((newMode) => {
    setMode(JSON.stringify(newMode));
    setInputText("");
    setApiData(null);
    setAnalysisData(null);
    setError(null);
    setIsVocabLoading(false);
  }, []);

  return {
    inputText,
    setInputText,
    mode,
    changeMode,
    apiData,
    analysisData,
    showResultDetails,
    setShowResultDetails,
    showAnalysis,
    setShowAnalysis,
    isLoading,
    isVocabLoading,
    error,
    activeFilters,
    toggleFilter,
    resetFilters,
    clearInput,
  };
}
