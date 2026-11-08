import { useState, useEffect, useCallback, useRef } from "react";
import { translate } from "@/services/translateApi";
import { POS_REFERENCE } from "@/constants/pos";
import { useAuth } from "@/hooks/useAuth";
import { replaceWordInText } from "@/utils/text";

const DEBOUNCE_MS = 600;

/**
 * Custom hook that encapsulates all translate state and logic.
 *
 * Returns:
 *  - inputText / setInputText  — controlled textarea value
 *  - mode / setMode            — { source_lang, target_lang } as JSON string
 *  - apiData                   — accumulated stream data { data, pos_tags, vocabularies }
 *  - analysisData              — list of sentence grammar analysis items
 *  - typoData                  — list of typo suggestions { origin_text, correction, candidates }
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
  const [typoData, setTypoData] = useState([]);
  const [backendTypoWords, setBackendTypoWords] = useState([]);

  // Persistence for UI settings
  const [showResultDetails, setShowResultDetails] = useState(() => {
    const saved = localStorage.getItem("setting_show_result_details");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showAnalysis, setShowAnalysis] = useState(() => {
    const saved = localStorage.getItem("setting_show_analysis");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [showTypoSuggestions, setShowTypoSuggestions] = useState(() => {
    const saved = localStorage.getItem("setting_show_typo_suggestions");
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
    localStorage.setItem(
      "setting_show_typo_suggestions",
      JSON.stringify(showTypoSuggestions),
    );
  }, [showTypoSuggestions]);

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

  const handleTranslate = useCallback(
    async (text, currentMode, customOptions = null) => {
      if (!text.trim()) {
        setApiData(null);
        setAnalysisData(null);
        setTypoData([]);
        setBackendTypoWords([]);
        setError(null);
        setIsVocabLoading(false);
        return;
      }

      const activeOptions = customOptions || {
        translate: true,
        analysis: Boolean(showAnalysis),
        vocab: Boolean(showResultDetails),
        typo: Boolean(showTypoSuggestions),
        stats: true,
      };

      setIsLoading(true);
      setIsVocabLoading(Boolean(activeOptions.vocab));
      setError(null);

      // Cancel any previous request
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      controllerRef.current = new AbortController();

      // Accumulators for streaming data
      let accumApiData = {
        translated_text: "",
        data: {
          original_text: text,
          translated_text: "",
          source_lang: currentMode?.source_lang || "vi",
        },
        pos_tags: [],
        vocabularies: [],
      };
      let accumAnalysis = [];
      let accumTypos = [];
      setTypoData([]);
      setBackendTypoWords([]);

      try {
        for await (const message of translate(
          text,
          currentMode,
          controllerRef.current.signal,
          activeOptions,
        )) {
        if (!message) continue;

        const { type_response, data } = message;

        if (type_response === "TYPO" && data) {
          if (data.words && Array.isArray(data.words)) {
            accumTypos = [...accumTypos, ...data.words];
            const seen = new Set();
            const uniqueTypos = [];
            for (const w of accumTypos) {
              const key = (w.origin_text || "").toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                uniqueTypos.push(w);
              }
            }
            setTypoData(uniqueTypos);
            setBackendTypoWords(uniqueTypos);
          }
        } else if (type_response === "TRANSLATE" && data) {
          // Update translation text progressively
          const newTranslatedText =
            data.translated_text || accumApiData.data?.translated_text || accumApiData.translated_text || "";
          accumApiData = {
            ...accumApiData,
            translated_text: newTranslatedText,
            data: {
              ...accumApiData.data,
              ...data,
              translated_text: newTranslatedText,
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
              structure: data.structure || accumApiData.structure,
              pos_tags: [
                ...accumApiData.pos_tags,
                ...mappedPosTags,
              ],
            };
            setApiData({ ...accumApiData });
          }

          // Build SentenceAnalysis items
          if (data.sentence_info) {
            const rawTense = data.sentence_info.tense;
            const tenseVal = (!rawTense || rawTense === "Unknown") ? "Không xác định" : rawTense;

            const rawComplexity = data.sentence_info.complexity;
            const complexityVal = (!rawComplexity || rawComplexity === "Unknown") ? "Không xác định" : rawComplexity;

            const rawVoice = data.sentence_info.voice;
            const voiceVal = (!rawVoice || rawVoice === "Unknown") ? "unknown" : rawVoice.toLowerCase();

            const analysisItem = {
              sentence: data.original_text || text,
              tense: {
                tense: tenseVal,
                signal_words: [],
              },
              sentence_types: [{ type: complexityVal, signal_words: [] }],
              voice: voiceVal,
              is_negative:
                data.sentence_info.rule_explanation?.toLowerCase().includes("phủ định") ||
                false,
              is_question: data.sentence_info.form_type === "Interrogative",
              rule_explanation: data.sentence_info.rule_explanation,
              structure: data.structure,
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
                  ipa: vItem.ipa || "",
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
  }, [showAnalysis, showResultDetails, showTypoSuggestions]);

  // Debounced auto-translate on input, mode, or option change
  useEffect(() => {
    const timer = setTimeout(
      () => handleTranslate(inputText, JSON.parse(mode)),
      DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [
    inputText,
    mode,
    showAnalysis,
    showResultDetails,
    showTypoSuggestions,
    handleTranslate,
  ]);

  const clearInput = useCallback(() => {
    setInputText("");
    setApiData(null);
    setAnalysisData(null);
    setTypoData([]);
    setBackendTypoWords([]);
    setError(null);
    setIsVocabLoading(false);
  }, []);

  const changeMode = useCallback((newMode) => {
    setMode(JSON.stringify(newMode));
    setInputText("");
    setApiData(null);
    setAnalysisData(null);
    setTypoData([]);
    setBackendTypoWords([]);
    setError(null);
    setIsVocabLoading(false);
  }, []);

  const applyTypoSuggestion = useCallback((originText, replacementWord) => {
    setInputText((prev) => replaceWordInText(prev, originText, replacementWord));
    setTypoData((prev) =>
      prev.filter(
        (item) => item.origin_text.toLowerCase() !== originText.toLowerCase()
      )
    );
  }, []);

  const applyAllTypoSuggestions = useCallback(() => {
    setInputText((prev) => {
      let updated = prev;
      typoData.forEach((item) => {
        updated = replaceWordInText(updated, item.origin_text, item.correction);
      });
      return updated;
    });
    setTypoData([]);
    setBackendTypoWords([]);
  }, [typoData]);

  const dismissTypoSuggestion = useCallback((originText) => {
    setTypoData((prev) =>
      prev.filter(
        (item) => item.origin_text.toLowerCase() !== originText.toLowerCase()
      )
    );
  }, []);

  const confirmBackendTypo = useCallback((correctedText) => {
    setInputText(correctedText);
    setBackendTypoWords([]);
    setTypoData([]);
  }, []);

  const cancelBackendTypo = useCallback(() => {
    setBackendTypoWords([]);
    setTypoData([]);
    // Tiến hành dịch mà không có typo
    handleTranslate(inputText, JSON.parse(mode), {
      translate: true,
      analysis: Boolean(showAnalysis),
      vocab: Boolean(showResultDetails),
      typo: false,
      stats: true,
    });
  }, [inputText, mode, showAnalysis, showResultDetails, handleTranslate]);

  return {
    inputText,
    setInputText,
    mode,
    changeMode,
    apiData,
    analysisData,
    typoData,
    backendTypoWords,
    confirmBackendTypo,
    cancelBackendTypo,
    showResultDetails,
    setShowResultDetails,
    showAnalysis,
    setShowAnalysis,
    showTypoSuggestions,
    setShowTypoSuggestions,
    applyTypoSuggestion,
    applyAllTypoSuggestions,
    dismissTypoSuggestion,
    isLoading,
    isVocabLoading,
    error,
    activeFilters,
    toggleFilter,
    resetFilters,
    clearInput,
  };
}
