import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Layers,
  ChevronLeft,
  Plus,
  Trash2,
  Settings2,
  Clock,
  Trophy,
  HelpCircle,
  Type,
  CheckCircle2,
  LayoutGrid,
  AlertCircle,
  Save,
  Check,
  X,
  Globe,
  Lock,
  Search,
  Library,
  Sparkles,
  BookOpen,
  Volume2,
  ChevronDown,
  Zap,
} from "lucide-react";
import axiosInstance from "@/services/axiosInstance";

const DIFFICULTY_LEVELS = [
  {
    value: "easy",
    label: "Easy",
    color: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
  {
    value: "medium",
    label: "Medium",
    color: "bg-amber-50 text-amber-600 border-amber-100",
  },
  {
    value: "hard",
    label: "Hard",
    color: "bg-rose-50 text-rose-600 border-rose-100",
  },
];

const SOUND_PRESETS = {
  gaming: {
    preset: "gaming",
    correct: {
      wave: "sine",
      volume: 0.12,
      duration: 0.45,
      note_delay: 0.12,
      notes_by_streak: {
        default: [261.63, 329.63],
        x5: [587.33, 698.46, 880.0],
        x10: [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98],
      },
    },
    wrong: {
      wave: "triangle",
      volume: 0.18,
      duration: 0.25,
      frequencies: [150, 85],
    },
    finisher: {
      wave: "sine",
      volume: 0.1,
      duration: 1.8,
      preset_type: "triumphant",
    },
  },
  retro: {
    preset: "retro",
    correct: {
      wave: "square",
      volume: 0.08,
      duration: 0.2,
      note_delay: 0.08,
      notes_by_streak: {
        default: [440.0, 554.37],
        x5: [523.25, 659.25, 783.99],
        x10: [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5],
      },
    },
    wrong: {
      wave: "sawtooth",
      volume: 0.06,
      duration: 0.3,
      frequencies: [220, 110],
    },
    finisher: {
      wave: "square",
      volume: 0.08,
      duration: 1.0,
      preset_type: "arcade",
    },
  },
  zen: {
    preset: "zen",
    correct: {
      wave: "sine",
      volume: 0.14,
      duration: 0.8,
      note_delay: 0.25,
      notes_by_streak: {
        default: [329.63, 392.0],
        x5: [329.63, 392.0, 440.0],
        x10: [329.63, 392.0, 440.0, 523.25, 587.33],
      },
    },
    wrong: {
      wave: "sine",
      volume: 0.14,
      duration: 0.5,
      frequencies: [120, 90],
    },
    finisher: {
      wave: "sine",
      volume: 0.12,
      duration: 2.2,
      preset_type: "zen",
    },
  },
  scifi: {
    preset: "scifi",
    correct: {
      wave: "sine",
      volume: 0.09,
      duration: 0.35,
      note_delay: 0.08,
      notes_by_streak: {
        default: [587.33, 880.0],
        x5: [880.0, 1174.66, 1760.0],
        x10: [880.0, 987.77, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0],
      },
    },
    wrong: {
      wave: "sawtooth",
      volume: 0.1,
      duration: 0.2,
      frequencies: [300, 120],
    },
    finisher: {
      wave: "sine",
      volume: 0.1,
      duration: 1.8,
      preset_type: "scifi",
    },
  },
  guitar: {
    preset: "guitar",
    correct: {
      wave: "triangle",
      volume: 0.15,
      duration: 0.6,
      note_delay: 0.15,
      notes_by_streak: {
        default: [329.63, 440.0],
        x5: [329.63, 440.0, 554.37],
        x10: [220.0, 277.18, 329.63, 440.0, 554.37, 659.25, 880.0],
      },
    },
    wrong: {
      wave: "triangle",
      volume: 0.15,
      duration: 0.4,
      frequencies: [180, 130],
    },
    finisher: {
      wave: "triangle",
      volume: 0.12,
      duration: 2.0,
      preset_type: "guitar",
    },
  },
  epic: {
    preset: "epic",
    correct: {
      wave: "sine",
      volume: 0.12,
      duration: 0.5,
      note_delay: 0.1,
      notes_by_streak: {
        default: [349.23, 523.25],
        x5: [523.25, 659.25, 783.99],
        x10: [261.63, 349.23, 392.0, 523.25, 587.33, 659.25, 783.99],
      },
    },
    wrong: {
      wave: "triangle",
      volume: 0.18,
      duration: 0.35,
      frequencies: [140, 90],
    },
    finisher: {
      wave: "sine",
      volume: 0.12,
      duration: 2.2,
      preset_type: "epic",
    },
  },
};

// Sound testing helpers for Admin Sound Designer
const testCorrectSound = (config) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = config.notes_by_streak?.x5 || [261.63, 329.63];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = config.wave || "sine";
      osc.frequency.setValueAtTime(
        freq,
        ctx.currentTime + idx * (config.note_delay || 0.12),
      );

      const startTime = ctx.currentTime + idx * (config.note_delay || 0.12);
      const duration = config.duration || 0.45;
      const peakVol = config.volume || 0.12;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peakVol, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (err) {
    console.error("Test sound failed:", err);
  }
};

const testWrongSound = (config) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = config.wave || "triangle";
    const freqs = config.frequencies || [150, 85];
    osc.frequency.setValueAtTime(freqs[0], ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      freqs[1],
      ctx.currentTime + (config.duration || 0.25),
    );

    gain.gain.setValueAtTime(config.volume || 0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + (config.duration || 0.25),
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (config.duration || 0.25));
  } catch (err) {
    console.error("Test wrong sound failed:", err);
  }
};

const testFinisherSound = (config) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    let notes = [];
    if (config.preset_type === "arcade") {
      notes = [
        { freq: 130.81, time: 0.0, dur: 0.15, wave: "square" },
        { freq: 196.0, time: 0.1, dur: 0.15, wave: "square" },
        { freq: 261.63, time: 0.2, dur: 0.15, wave: "square" },
        { freq: 392.0, time: 0.3, dur: 0.15, wave: "square" },
        { freq: 523.25, time: 0.4, dur: 0.4, wave: "square" },
        { freq: 783.99, time: 0.4, dur: 0.4, wave: "square" },
      ];
    } else if (config.preset_type === "zen") {
      notes = [
        { freq: 329.63, time: 0.0, dur: 1.5, wave: "sine" },
        { freq: 392.0, time: 0.3, dur: 1.5, wave: "sine" },
        { freq: 440.0, time: 0.6, dur: 1.5, wave: "sine" },
        { freq: 523.25, time: 0.9, dur: 2.0, wave: "sine" },
      ];
    } else if (config.preset_type === "scifi") {
      notes = [
        { freq: 440.0, time: 0.0, dur: 0.15, wave: "sine" },
        { freq: 587.33, time: 0.1, dur: 0.15, wave: "sine" },
        { freq: 880.0, time: 0.2, dur: 0.15, wave: "sine" },
        { freq: 1174.66, time: 0.3, dur: 0.4, wave: "sine" },
        { freq: 1760.0, time: 0.3, dur: 0.4, wave: "triangle" },
      ];
    } else if (config.preset_type === "guitar") {
      notes = [
        { freq: 164.81, time: 0.0, dur: 1.0, wave: "triangle" },
        { freq: 220.0, time: 0.2, dur: 1.0, wave: "triangle" },
        { freq: 277.18, time: 0.4, dur: 1.0, wave: "triangle" },
        { freq: 329.63, time: 0.6, dur: 1.2, wave: "triangle" },
        { freq: 440.0, time: 0.8, dur: 1.5, wave: "triangle" },
      ];
    } else if (config.preset_type === "epic") {
      notes = [
        { freq: 261.63, time: 0.0, dur: 0.2, wave: "sine" },
        { freq: 349.23, time: 0.1, dur: 0.2, wave: "sine" },
        { freq: 392.0, time: 0.2, dur: 0.2, wave: "sine" },
        { freq: 523.25, time: 0.3, dur: 0.4, wave: "sine" },
        { freq: 523.25, time: 0.5, dur: 0.2, wave: "sine" },
        { freq: 587.33, time: 0.6, dur: 0.2, wave: "sine" },
        { freq: 659.25, time: 0.7, dur: 0.2, wave: "sine" },
        { freq: 783.99, time: 0.8, dur: 1.8, wave: "sine" },
        { freq: 523.25, time: 0.8, dur: 1.8, wave: "triangle" },
        { freq: 349.23, time: 0.8, dur: 1.8, wave: "sine" },
      ];
    } else {
      notes = [
        { freq: 261.63, time: 0.0, dur: 0.3, wave: "sine" },
        { freq: 329.63, time: 0.15, dur: 0.3, wave: "sine" },
        { freq: 392.0, time: 0.3, dur: 0.3, wave: "sine" },
        { freq: 523.25, time: 0.45, dur: 0.3, wave: "sine" },
        { freq: 659.25, time: 0.6, dur: 0.45, wave: "triangle" },
        { freq: 783.99, time: 0.75, dur: 0.5, wave: "triangle" },
        { freq: 523.25, time: 0.95, dur: 1.6, wave: "sine" },
        { freq: 659.25, time: 0.95, dur: 1.6, wave: "triangle" },
        { freq: 783.99, time: 0.95, dur: 1.6, wave: "sine" },
        { freq: 1046.5, time: 0.95, dur: 1.8, wave: "triangle" },
      ];
    }

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = note.wave || config.wave || "sine";
      osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.time);

      const startTime = ctx.currentTime + note.time;
      const volume = config.volume || 0.1;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + note.dur);
    });
  } catch (err) {
    console.error("Test finisher failed:", err);
  }
};

const generateCardFromVocab = (vocabItem, allVocabs) => {
  const word = vocabItem.word;
  const meaning = vocabItem.meaning_vi || "Undefined";
  const len = word.length;

  let difficulty = "medium";
  let timer = 10;
  let points = 10;

  if (len < 5) {
    difficulty = "easy";
    timer = 5;
    points = 5;
  } else if (len > 8) {
    difficulty = "hard";
    timer = 15;
    points = 15;
  }

  // 1. Choices Distractors
  const otherMeanings = allVocabs
    .filter((v) => v.word !== word)
    .map((v) => v.meaning_vi)
    .filter((m) => m && m !== meaning);

  // Fallback if not enough vocabs
  while (otherMeanings.length < 3) {
    otherMeanings.push("Từ sai " + (otherMeanings.length + 1));
  }

  const shuffledMeanings = [...otherMeanings]
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);
  const options = [
    { text: meaning, is_correct: true },
    ...shuffledMeanings.map((m) => ({ text: m, is_correct: false })),
  ].sort(() => 0.5 - Math.random());

  // 2. Complete Patterns
  const patterns = [];
  for (let i = 0; i < 4; i++) {
    const targetBlankCount = Math.max(
      1,
      Math.floor(len * (Math.random() * (0.5 - 0.3) + 0.3)),
    );
    const indices = Array.from({ length: len }, (_, k) => k)
      .sort(() => 0.5 - Math.random())
      .slice(0, targetBlankCount);

    let displayText = "";
    const blanks = [];
    for (let j = 0; j < len; j++) {
      if (indices.includes(j)) {
        displayText += "_";
        blanks.push(word[j]);
      } else {
        displayText += word[j];
      }
    }
    patterns.push({ display_text: displayText, blanks });
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    word,
    meaning,
    question: "",
    difficulty,
    timer,
    points,
    tasks: {
      choice: { enabled: true, multiple: false, options },
      fill: { enabled: true, answers: [word] },
      complete: { enabled: true, patterns },
    },
  };
};

// Helper to convert UTC ISO string from DB to local datetime-local value (YYYY-MM-DDTHH:MM)
const convertUTCToLocalInput = (utcStr) => {
  if (!utcStr) return "";
  try {
    const d = new Date(utcStr);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return "";
  }
};

// Helper to convert datetime-local value (YYYY-MM-DDTHH:MM) to UTC ISO string
const convertLocalInputToUTC = (localStr) => {
  if (!localStr) return null;
  try {
    const d = new Date(localStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
};

import { useNotify } from "@/hooks/useNotify";

export default function FlashcardEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [loading, setLoading] = useState(id && id !== "new");
  const [saving, setSaving] = useState(false);
  
  const showToast = (message, type = "info") => {
    if (type === "error") notify.error(message);
    else if (type === "success") notify.success(message);
    else notify.info(message);
  };

  const [setInfo, setSetInfo] = useState({
    title: "",
    description: "",
    is_public: false,
    settings: {
      total_cards: 20,
      difficulty_distribution: { easy: 5, medium: 10, hard: 5 },
      allowed_task_types: ["choice", "fill", "complete"],
      daily_limit: 5,
      reset_time: "07:00",
      event_start_at: null,
      event_end_at: null,
      sound_config: { ...SOUND_PRESETS.gaming },
    },
    cards: [],
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState(["medium"]);
  const [aiCount, setAiCount] = useState(10);
  const [aiTaskTypes, setAiTaskTypes] = useState([
    "choice",
    "fill",
    "complete",
  ]);
  const [aiHint, setAiHint] = useState(false);

  const [customImportCount, setCustomImportCount] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedCardIds, setExpandedCardIds] = useState([]);
  const cardsPerPage = 20;

  const toggleCardExpand = (cardId) => {
    setExpandedCardIds((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId],
    );
  };
  const [vocabList, setVocabList] = useState([]);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [selectedVocabIds, setSelectedVocabIds] = useState([]);
  const [importSearch, setImportSearch] = useState("");
  const [importSource, setImportSource] = useState("vocab"); // 'vocab' or 'dict'
  const [importLang, setImportLang] = useState("all"); // 'all', 'en-vi', 'vi-en'

  const fetchSet = async () => {
    try {
      const { data } = await axiosInstance.get(`/flashcards/${id}`);
      // Ensure data settings exists and has all required properties
      if (data.settings) {
        if (!data.settings.sound_config) {
          data.settings.sound_config = { ...SOUND_PRESETS.gaming };
        }
        if (!data.settings.reset_time) {
          data.settings.reset_time = "07:00";
        }
      } else {
        data.settings = {
          total_cards: 20,
          difficulty_distribution: { easy: 5, medium: 10, hard: 5 },
          allowed_task_types: ["choice", "fill", "complete"],
          daily_limit: 5,
          reset_time: "07:00",
          event_start_at: null,
          event_end_at: null,
          sound_config: { ...SOUND_PRESETS.gaming },
        };
      }
      if (data.cards && Array.isArray(data.cards)) {
        data.cards = data.cards.map((c) => ({
          ...c,
          id: c.id || `card_${Math.random().toString(36).substr(2, 9)}`,
        }));
      }
      setSetInfo(data);
    } catch (err) {
      console.error(err);
      showToast("Failed to load flashcard set", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id && id !== "new") {
      fetchSet();
    }
  }, [id]);

  const handleAddCard = () => {
    const cardId = Math.random().toString(36).substr(2, 9);
    const newCard = {
      id: cardId,
      word: "",
      meaning: "",
      question: "",
      tasks: {
        choice: {
          enabled: true,
          multiple: false,
          options: [{ text: "", is_correct: true }],
        },
        fill: { enabled: false, answers: [""] },
        complete: {
          enabled: false,
          patterns: [{ display_text: "", blanks: [""] }],
        },
      },
      hint: "",
      feedback_correct: "Great job!",
      feedback_incorrect: "Try again!",
      difficulty: "medium",
      timer: 15,
      points: 10,
    };
    setSetInfo({ ...setInfo, cards: [...setInfo.cards, newCard] });
    setExpandedCardIds((prev) => [...prev, cardId]);
    const nextTotalCards = setInfo.cards.length + 1;
    const lastPage = Math.ceil(nextTotalCards / cardsPerPage);
    setCurrentPage(lastPage);
  };

  const handleRemoveCard = (cardId) => {
    const updatedCards = setInfo.cards.filter((c) => c.id !== cardId);
    setSetInfo({
      ...setInfo,
      cards: updatedCards,
    });
    setExpandedCardIds((prev) => prev.filter((id) => id !== cardId));
    const lastPage = Math.ceil(updatedCards.length / cardsPerPage);
    if (currentPage > lastPage && lastPage > 0) {
      setCurrentPage(lastPage);
    }
  };

  const fetchVocab = async () => {
    setVocabLoading(true);
    try {
      let endpoint =
        importSource === "vocab"
          ? "/user/words?limit=200"
          : "/flashcards/dictionary-cache?limit=200";

      if (importSource === "dict" && importLang !== "all") {
        const [src, dest] = importLang.split("-");
        endpoint += `&src=${src}&dest=${dest}`;
      }

      const { data } = await axiosInstance.get(endpoint);
      const words = importSource === "vocab" ? data.words || [] : data;
      setVocabList(words);
    } catch (err) {
      console.error(err);
    } finally {
      setVocabLoading(false);
    }
  };

  useEffect(() => {
    if (showImportModal) {
      fetchVocab();
    }
  }, [showImportModal, importSource, importLang]);

  const handleImportSelected = () => {
    const selected = vocabList.filter((v) => selectedVocabIds.includes(v.id));
    const newCards = selected.map((v) => generateCardFromVocab(v, vocabList));
    setSetInfo({ ...setInfo, cards: [...setInfo.cards, ...newCards] });
    setShowImportModal(false);
    setSelectedVocabIds([]);
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return showToast("Vui lòng nhập chủ đề (Prompt)!", "error");
    setAiLoading(true);
    try {
      const { data } = await axiosInstance.post("/flashcards/generate-ai", {
        prompt: aiPrompt,
        difficulty: aiDifficulty,
        task_types: aiTaskTypes,
        count: aiCount,
        hint: aiHint,
      });
      if (data && data.length > 0) {
        setSetInfo({ ...setInfo, cards: [...setInfo.cards, ...data] });
        setShowAIModal(false);
        setAiPrompt("");
      } else {
        showToast(
          "AI không trả về thẻ nào hoặc yêu cầu bị từ chối do vi phạm bảo mật (Prompt Injection).",
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi khi tạo thẻ bằng AI. Có thể do quá tải hoặc kết nối mạng.", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAutoImport = async (count) => {
    setVocabLoading(true);
    try {
      let endpoint =
        importSource === "vocab"
          ? `/user/words?limit=${count}`
          : `/flashcards/dictionary-cache?limit=${count}`;

      if (importSource === "dict" && importLang !== "all") {
        const [src, dest] = importLang.split("-");
        endpoint += `&src=${src}&dest=${dest}`;
      }

      const { data } = await axiosInstance.get(endpoint);
      const words = importSource === "vocab" ? data.words || [] : data;

      const available = words.filter(
        (v) => !setInfo.cards.some((c) => c.word === v.word),
      );
      const toImport = available
        .sort(() => 0.5 - Math.random())
        .slice(0, count);
      const newCards = toImport.map((v) => generateCardFromVocab(v, words));
      setSetInfo({ ...setInfo, cards: [...setInfo.cards, ...newCards] });
      setShowImportModal(false);
    } catch (err) {
      console.error(err);
      showToast("Failed to auto-import words. Please check limit.", "error");
    } finally {
      setVocabLoading(false);
    }
  };

  const handleCardChange = (cardId, field, value) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) =>
        c.id === cardId ? { ...c, [field]: value } : c,
      ),
    });
  };

  const handleTaskToggle = (cardId, taskType) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          return {
            ...c,
            tasks: {
              ...c.tasks,
              [taskType]: {
                ...c.tasks[taskType],
                enabled: !c.tasks[taskType].enabled,
              },
            },
          };
        }
        return c;
      }),
    });
  };

  const handleChoiceOptionChange = (cardId, optIdx, field, value) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newOptions = [...c.tasks.choice.options];
          newOptions[optIdx] = { ...newOptions[optIdx], [field]: value };
          return {
            ...c,
            tasks: {
              ...c.tasks,
              choice: { ...c.tasks.choice, options: newOptions },
            },
          };
        }
        return c;
      }),
    });
  };

  const addChoiceOption = (cardId) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newOptions = [
            ...c.tasks.choice.options,
            { text: "", is_correct: false },
          ];
          return {
            ...c,
            tasks: {
              ...c.tasks,
              choice: { ...c.tasks.choice, options: newOptions },
            },
          };
        }
        return c;
      }),
    });
  };

  const removeChoiceOption = (cardId, optIdx) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newOptions = c.tasks.choice.options.filter(
            (_, idx) => idx !== optIdx,
          );
          return {
            ...c,
            tasks: {
              ...c.tasks,
              choice: { ...c.tasks.choice, options: newOptions },
            },
          };
        }
        return c;
      }),
    });
  };

  const handleListTaskChange = (cardId, taskType, listField, idx, value) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newList = [...c.tasks[taskType][listField]];
          newList[idx] = value;
          return {
            ...c,
            tasks: {
              ...c.tasks,
              [taskType]: { ...c.tasks[taskType], [listField]: newList },
            },
          };
        }
        return c;
      }),
    });
  };

  const addListItem = (cardId, taskType, listField) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newList = [...c.tasks[taskType][listField], ""];
          return {
            ...c,
            tasks: {
              ...c.tasks,
              [taskType]: { ...c.tasks[taskType], [listField]: newList },
            },
          };
        }
        return c;
      }),
    });
  };

  const removeListItem = (cardId, taskType, listField, idx) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newList = c.tasks[taskType][listField].filter(
            (_, i) => i !== idx,
          );
          return {
            ...c,
            tasks: {
              ...c.tasks,
              [taskType]: { ...c.tasks[taskType], [listField]: newList },
            },
          };
        }
        return c;
      }),
    });
  };

  // Complete Pattern Helpers
  const addPattern = (cardId) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = [
            ...c.tasks.complete.patterns,
            { display_text: "", blanks: [""] },
          ];
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const autoGenerateFill = (cardId, word) => {
    if (!word || !word.trim()) return showToast("Vui lòng nhập từ vựng trước khi tự tạo từ khuyết!", "error");
    const words = word.split(/[,;]+/).map(w => w.trim()).filter(w => w);
    if (!words.length) return;

    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const existingAnswers = c.tasks.fill.answers || [];
          const newAnswers = [...existingAnswers];
          words.forEach(w => {
            if (!newAnswers.includes(w)) newAnswers.push(w);
          });
          return {
            ...c,
            tasks: {
              ...c.tasks,
              fill: { ...c.tasks.fill, answers: newAnswers },
            },
          };
        }
        return c;
      }),
    });
    showToast(`Đã tự động điền ${words.length} đáp án fill!`, "success");
  };

  const autoGeneratePattern = (cardId, word) => {
    if (!word || !word.trim()) return showToast("Vui lòng nhập từ vựng trước khi tự động tạo mẫu!", "error");
    const words = word.split(/[,;]+/).map(w => w.trim()).filter(w => w);
    
    let totalGenerated = 0;
    
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const existingPatterns = c.tasks.complete.patterns || [];
          let newPatterns = [...existingPatterns];
          const existingTexts = newPatterns.map((p) => p.display_text);

          words.forEach(cleanWord => {
            const len = cleanWord.length;
            if (len < 2) return;
            
            let numVariants = 1;
            if (len >= 6) numVariants = 3;
            else if (len >= 4) numVariants = 2;
            
            for (let v = 0; v < numVariants; v++) {
              let newPattern = null;
              for (let attempt = 0; attempt < 20; attempt++) {
                const targetBlankCount = Math.max(
                  1,
                  Math.floor(len * (Math.random() * (0.6 - 0.3) + 0.3))
                );

                const indices = Array.from({ length: len }, (_, k) => k)
                  .sort(() => 0.5 - Math.random())
                  .slice(0, targetBlankCount);

                let displayText = "";
                const blanks = [];
                for (let j = 0; j < len; j++) {
                  if (indices.includes(j)) {
                    displayText += "_";
                    blanks.push(cleanWord[j]);
                  } else {
                    displayText += cleanWord[j];
                  }
                }

                if (!existingTexts.includes(displayText)) {
                  newPattern = { display_text: displayText, blanks };
                  existingTexts.push(displayText);
                  break;
                }
              }

              if (!newPattern) {
                const indices = Array.from({ length: len }, (_, k) => k)
                  .sort(() => 0.5 - Math.random())
                  .slice(0, Math.max(1, Math.floor(len * 0.4)));

                let displayText = "";
                const blanks = [];
                for (let j = 0; j < len; j++) {
                  if (indices.includes(j)) {
                    displayText += "_";
                    blanks.push(cleanWord[j]);
                  } else {
                    displayText += cleanWord[j];
                  }
                }
                if (!existingTexts.includes(displayText)) {
                  newPattern = { display_text: displayText, blanks };
                  existingTexts.push(displayText);
                }
              }

              if (newPattern) {
                newPatterns.push(newPattern);
                totalGenerated++;
              }
            }
          });

          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
    
    if (totalGenerated > 0) {
      showToast(`Đã tạo ${totalGenerated} mẫu hoàn thành từ!`, "success");
    } else {
      showToast("Không thể tạo thêm mẫu mới cho từ này.", "error");
    }
  };

  const bulkAutoGenerateFill = () => {
    const cards = setInfo.cards || [];
    if (!cards.length) return showToast("Chưa có card nào!", "error");
    let count = 0;
    const updatedCards = cards.map((c) => {
      const word = c.word;
      if (!word || !word.trim()) return c;
      const words = word.split(/[,;]+/).map(w => w.trim()).filter(w => w);
      if (!words.length) return c;
      const existingAnswers = c.tasks?.fill?.answers || [];
      const newAnswers = [...existingAnswers];
      words.forEach(w => {
        if (!newAnswers.includes(w)) { newAnswers.push(w); count++; }
      });
      return { ...c, tasks: { ...(c.tasks || {}), fill: { ...(c.tasks?.fill || {}), enabled: true, answers: newAnswers } } };
    });
    setSetInfo({ ...setInfo, cards: updatedCards });
    showToast(`Đã tự động tạo Fill cho ${count} đáp án trên tất cả cards!`, "success");
  };

  const bulkAutoGenerateComplete = () => {
    const cards = setInfo.cards || [];
    if (!cards.length) return showToast("Chưa có card nào!", "error");
    let totalGenerated = 0;
    const updatedCards = cards.map((c) => {
      const word = c.word;
      if (!word || !word.trim()) return c;
      const words = word.split(/[,;]+/).map(w => w.trim()).filter(w => w);
      const existingPatterns = c.tasks?.complete?.patterns || [];
      let newPatterns = [...existingPatterns];
      const existingTexts = newPatterns.map(p => p.display_text);
      words.forEach(cleanWord => {
        const len = cleanWord.length;
        if (len < 2) return;
        let numVariants = 1;
        if (len >= 6) numVariants = 3;
        else if (len >= 4) numVariants = 2;
        for (let v = 0; v < numVariants; v++) {
          let newPattern = null;
          for (let attempt = 0; attempt < 20; attempt++) {
            const targetBlankCount = Math.max(1, Math.floor(len * (Math.random() * 0.3 + 0.3)));
            const indices = Array.from({ length: len }, (_, k) => k).sort(() => 0.5 - Math.random()).slice(0, targetBlankCount);
            let displayText = "";
            const blanks = [];
            for (let j = 0; j < len; j++) {
              if (indices.includes(j)) { displayText += "_"; blanks.push(cleanWord[j]); } else { displayText += cleanWord[j]; }
            }
            if (!existingTexts.includes(displayText)) {
              newPattern = { display_text: displayText, blanks };
              existingTexts.push(displayText);
              break;
            }
          }
          if (newPattern) { newPatterns.push(newPattern); totalGenerated++; }
        }
      });
      return { ...c, tasks: { ...(c.tasks || {}), complete: { ...(c.tasks?.complete || {}), enabled: true, patterns: newPatterns } } };
    });
    setSetInfo({ ...setInfo, cards: updatedCards });
    showToast(`Đã tạo ${totalGenerated} mẫu Complete cho tất cả cards!`, "success");
  };

  const removePattern = (cardId, pIdx) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = c.tasks.complete.patterns.filter(
            (_, idx) => idx !== pIdx,
          );
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const handlePatternChange = (cardId, pIdx, field, value) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = [...c.tasks.complete.patterns];
          newPatterns[pIdx] = { ...newPatterns[pIdx], [field]: value };
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const handlePatternBlankChange = (cardId, pIdx, bIdx, value) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = [...c.tasks.complete.patterns];
          const newBlanks = [...newPatterns[pIdx].blanks];
          newBlanks[bIdx] = value;
          newPatterns[pIdx] = { ...newPatterns[pIdx], blanks: newBlanks };
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const addPatternBlank = (cardId, pIdx) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = [...c.tasks.complete.patterns];
          const newBlanks = [...newPatterns[pIdx].blanks, ""];
          newPatterns[pIdx] = { ...newPatterns[pIdx], blanks: newBlanks };
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const removePatternBlank = (cardId, pIdx, bIdx) => {
    setSetInfo({
      ...setInfo,
      cards: setInfo.cards.map((c) => {
        if (c.id === cardId) {
          const newPatterns = [...c.tasks.complete.patterns];
          const newBlanks = newPatterns[pIdx].blanks.filter(
            (_, idx) => idx !== bIdx,
          );
          newPatterns[pIdx] = { ...newPatterns[pIdx], blanks: newBlanks };
          return {
            ...c,
            tasks: {
              ...c.tasks,
              complete: { ...c.tasks.complete, patterns: newPatterns },
            },
          };
        }
        return c;
      }),
    });
  };

  const handleSave = async () => {
    if (!setInfo.title) return showToast("Title is required", "error");
    if (!setInfo.is_dynamic && setInfo.cards.length === 0) return showToast("Add at least one card", "error");

    try {
      setSaving(true);
      if (id && id !== "new") {
        await axiosInstance.put(`/flashcards/${id}`, setInfo);
      } else {
        await axiosInstance.post("/flashcards", setInfo);
      }
      navigate("/flashcards");
    } catch {
      showToast("Failed to save flashcard set", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="p-10 text-center text-slate-500 font-medium">
        Loading...
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto pb-20 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md py-6 -mx-4 px-4 border-b border-slate-200/50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/flashcards")}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 transition-all shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Flashcard Editor
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Multi-task challenges configuration
            </p>
          </div>
        </div>

        {!setInfo.is_dynamic && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 font-bold rounded-xl transition-all shadow-md shadow-indigo-200"
            >
              <Sparkles className="w-4 h-4 text-purple-100" />
              <span>Tạo bằng AI</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-bold rounded-xl transition-all border border-indigo-100"
            >
              <Library className="w-4 h-4" />
              <span>Import from Library</span>
            </button>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-100 active:scale-95"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span>{id === "new" ? "Publish" : "Update"}</span>
        </button>
      </div>

      {/* Set Info */}
      <div className="bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm mb-10 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Set Title
          </label>
          <input
            type="text"
            value={setInfo.title || ""}
            onChange={(e) => setSetInfo({ ...setInfo, title: e.target.value })}
            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white px-4 py-3 rounded-xl outline-none transition-all text-lg font-black text-slate-800"
            placeholder="e.g. Master IELTS Vocabulary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            Description
          </label>
          <input
            type="text"
            value={setInfo.description || ""}
            onChange={(e) =>
              setSetInfo({ ...setInfo, description: e.target.value })
            }
            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white px-4 py-3 rounded-xl outline-none transition-all text-slate-600 font-medium text-sm"
            placeholder="Brief overview of this set"
          />
        </div>

        {/* Public/Private Toggle */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${setInfo.is_public ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"}`}
            >
              {setInfo.is_public ? (
                <Globe className="w-5 h-5" />
              ) : (
                <Lock className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 tracking-tight">
                Public Visibility
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {setInfo.is_public
                  ? "Visible to everyone"
                  : "Only you can see this"}
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              setSetInfo({ ...setInfo, is_public: !setInfo.is_public })
            }
            className={`relative w-14 h-7 rounded-full transition-all duration-300 outline-none border-none cursor-pointer ${setInfo.is_public ? "bg-indigo-600" : "bg-slate-200"}`}
          >
            <div
              className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-sm ${setInfo.is_public ? "translate-x-7" : "translate-x-0"}`}
            />
          </button>
        </div>
      </div>

      {/* Session Settings */}
      <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm mb-10 space-y-8">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
          <Settings2 className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">
              Session Settings
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-wrap">
              How challenges are generated for users
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Daily Limit & Length
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Daily Attempts
                  </span>
                  <input
                    type="number"
                    value={setInfo.settings?.daily_limit ?? ""}
                    onChange={(e) =>
                      setSetInfo({
                        ...setInfo,
                        settings: {
                          ...setInfo.settings,
                          daily_limit:
                            e.target.value === ""
                              ? ""
                              : parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full bg-transparent border-none outline-none font-black text-xl text-slate-800"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Cards per Play
                  </span>
                  <input
                    type="number"
                    value={setInfo.settings?.total_cards ?? 0}
                    onChange={(e) => {
                      if (setInfo.is_dynamic) {
                        setSetInfo({
                          ...setInfo,
                          settings: {
                            ...setInfo.settings,
                            total_cards: parseInt(e.target.value) || 0,
                          },
                        });
                      }
                    }}
                    readOnly={!setInfo.is_dynamic}
                    className={`w-full bg-transparent border-none outline-none font-black text-xl ${!setInfo.is_dynamic ? "text-slate-400 cursor-not-allowed" : "text-slate-800"}`}
                  />
                </div>
              </div>
            </div>

            {/* Dynamic Mode Toggle */}
            <div className="p-6 bg-indigo-50/50 rounded-[2.5rem] border border-indigo-100/50 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${setInfo.is_dynamic ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white text-slate-400 border border-slate-200"}`}>
                    <Zap className={`w-5 h-5 ${setInfo.is_dynamic ? "animate-pulse" : ""}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight">Dynamic User Mode</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Generate cards from user data</p>
                  </div>
                </div>
                <button
                  onClick={() => setSetInfo({ ...setInfo, is_dynamic: !setInfo.is_dynamic })}
                  className={`w-12 h-6 rounded-full transition-all relative ${setInfo.is_dynamic ? "bg-indigo-600" : "bg-slate-200"}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${setInfo.is_dynamic ? "left-7 shadow-sm" : "left-1"}`} />
                </button>
              </div>

              {setInfo.is_dynamic && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Vocabulary Source</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "saved", label: "Saved Words" },
                        { id: "flashcard", label: "History Card" },
                        { id: "translated", label: "Translation" },
                        { id: "mix", label: "Mix All" }
                      ].map((source) => (
                        <button
                          key={source.id}
                          onClick={() => setSetInfo({
                            ...setInfo,
                            settings: {
                              ...setInfo.settings,
                              dynamic_source: source.id
                            }
                          })}
                          className={`px-3 py-2 rounded-xl border-2 text-[10px] font-black uppercase transition-all ${setInfo.settings?.dynamic_source === source.id ? "bg-white border-indigo-500 text-indigo-600 shadow-sm" : "bg-white/50 border-transparent text-slate-400 hover:bg-white"}`}
                        >
                          {source.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Allowed Task Types
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "choice", label: "Choices", color: "indigo" },
                  { id: "fill", label: "Fill-in", color: "emerald" },
                  { id: "complete", label: "Completion", color: "amber" },
                ].map((type) => {
                  const isActive =
                    setInfo.settings?.allowed_task_types?.includes(type.id);
                  return (
                    <button
                      key={type.id}
                      onClick={() => {
                        const current =
                          setInfo.settings?.allowed_task_types || [];
                        const next = isActive
                          ? current.filter((t) => t !== type.id)
                          : [...current, type.id];
                        setSetInfo({
                          ...setInfo,
                          settings: {
                            ...setInfo.settings,
                            allowed_task_types: next,
                          },
                        });
                      }}
                      className={`px-4 py-2 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${isActive ? `bg-${type.color}-600 border-${type.color}-600 text-white shadow-lg shadow-${type.color}-200` : "bg-white border-slate-100 text-slate-400"}`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Reset Time Config */}
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Giờ làm mới (Daily Reset Time)
              </label>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all w-full sm:w-44">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Thời gian Reset (HH:MM)
                  </span>
                  <input
                    type="time"
                    value={setInfo.settings?.reset_time || "07:00"}
                    onChange={(e) =>
                      setSetInfo({
                        ...setInfo,
                        settings: {
                          ...setInfo.settings,
                          reset_time: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-transparent border-none outline-none font-black text-lg text-slate-800"
                  />
                </div>
                <div className="text-xs font-bold text-slate-400 leading-relaxed">
                  <span className="font-black text-slate-600 block mb-0.5">
                    Múi giờ Việt Nam (ICT)
                  </span>
                  Hệ thống tự động đồng bộ theo múi giờ UTC để đảm bảo chuỗi
                  ngày và XP luôn chính xác.
                </div>
              </div>
            </div>

            {/* Special Event Timing Config */}
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Lịch trình Sự kiện Đặc biệt
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Bắt đầu (Giờ VN)
                  </span>
                  <input
                    type="datetime-local"
                    value={
                      setInfo.settings?.event_start_at
                        ? convertUTCToLocalInput(
                            setInfo.settings.event_start_at,
                          )
                        : ""
                    }
                    onChange={(e) => {
                      const utcStr = e.target.value
                        ? convertLocalInputToUTC(e.target.value)
                        : null;
                      setSetInfo({
                        ...setInfo,
                        settings: {
                          ...setInfo.settings,
                          event_start_at: utcStr,
                        },
                      });
                    }}
                    className="w-full bg-transparent border-none outline-none font-black text-[11px] text-slate-800"
                  />
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Kết thúc (Giờ VN)
                  </span>
                  <input
                    type="datetime-local"
                    value={
                      setInfo.settings?.event_end_at
                        ? convertUTCToLocalInput(setInfo.settings.event_end_at)
                        : ""
                    }
                    onChange={(e) => {
                      const utcStr = e.target.value
                        ? convertLocalInputToUTC(e.target.value)
                        : null;
                      setSetInfo({
                        ...setInfo,
                        settings: {
                          ...setInfo.settings,
                          event_end_at: utcStr,
                        },
                      });
                    }}
                    className="w-full bg-transparent border-none outline-none font-black text-[11px] text-slate-800"
                  />
                </div>
              </div>
              <p className="text-[10px] font-bold text-slate-400 leading-normal mt-1">
                * Bỏ trống nếu là bộ flashcard bình thường. Điền thông tin nếu
                muốn biến thành sự kiện giới hạn thời gian.
              </p>
            </div>

            {/* Event Rewards Config */}
            <div className="space-y-3 pt-6 border-t border-slate-100">
              <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                Phần thưởng XP Sự kiện
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-amber-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Thưởng hoàn thành lần đầu
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={setInfo.settings?.reward_first_time ?? ""}
                      onChange={(e) =>
                        setSetInfo({
                          ...setInfo,
                          settings: {
                            ...setInfo.settings,
                            reward_first_time: e.target.value === "" ? "" : (parseInt(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-transparent border-none outline-none font-black text-xl text-slate-800"
                    />
                    <span className="text-[10px] font-black text-slate-400 uppercase">XP</span>
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group hover:border-amber-200 transition-all">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">
                    Thưởng tinh thông (Mastery)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={setInfo.settings?.reward_mastery ?? ""}
                      onChange={(e) =>
                        setSetInfo({
                          ...setInfo,
                          settings: {
                            ...setInfo.settings,
                            reward_mastery: e.target.value === "" ? "" : (parseInt(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-transparent border-none outline-none font-black text-xl text-slate-800"
                    />
                    <span className="text-[10px] font-black text-slate-400 uppercase">XP</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] font-bold text-amber-600 leading-normal mt-1 italic">
                * Chỉ áp dụng khi bộ thẻ có thiết lập lịch trình Sự kiện bên trên.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {!setInfo.is_dynamic ? (
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                  Difficulty Balance
                </label>
                <div className="space-y-4">
                  {["easy", "medium", "hard"].map((level) => {
                    const availableCount = setInfo.cards.filter(
                      (c) => (c.difficulty || "medium").toLowerCase() === level,
                    ).length;
                    const currentValue =
                      setInfo.settings?.difficulty_distribution?.[level] || 0;

                    return (
                      <div key={level} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between px-1">
                          <span
                            className={`text-[9px] font-black uppercase tracking-widest ${level === "easy" ? "text-emerald-500" : level === "medium" ? "text-amber-500" : "text-rose-500"}`}
                          >
                            {level}{" "}
                            <span className="opacity-40 ml-1">
                              ({availableCount} available)
                            </span>
                          </span>
                          <span className="font-black text-slate-800 text-[11px] tabular-nums">
                            {currentValue}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max={availableCount}
                            value={
                              currentValue > availableCount
                                ? availableCount
                                : currentValue
                            }
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const nextDist = {
                                ...(setInfo.settings?.difficulty_distribution || {}),
                                [level]: val,
                              };
                              const nextTotal =
                                (nextDist.easy || 0) +
                                (nextDist.medium || 0) +
                                (nextDist.hard || 0);

                              setSetInfo({
                                ...setInfo,
                                settings: {
                                  ...setInfo.settings,
                                  difficulty_distribution: nextDist,
                                  total_cards: nextTotal,
                                },
                              });
                            }}
                            className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] font-medium text-slate-400 italic">
                  Distribute how many cards of each level should appear in a
                  session.
                </p>
              </div>
            ) : (
              <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-3xl p-6 space-y-3">
                <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider">Dynamic Generation Active</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Hệ thống tự động thiết lập số lượng và phân bổ độ khó dựa trên dữ liệu học tập thực tế của từng người dùng.
                </p>
                <p className="text-[10px] text-indigo-600 font-bold leading-normal">
                  ✓ Không cần nhập thủ công câu hỏi hay danh sách thẻ.<br/>
                  ✓ Cấu hình thẻ chơi mỗi lượt bằng input "Cards per Play" bên trái.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Synthesizer Sound Designer & Cards List - Hidden in Dynamic Mode */}
      {!setInfo.is_dynamic && (
        <>
          {/* Synthesizer Sound Designer */}
          <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-sm mb-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-50 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                Synthesizer Sound Designer
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Design custom sound effects & chimes for this set
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 self-start sm:self-auto">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Preset:
            </span>
            <select
              value={setInfo.settings?.sound_config?.preset || "gaming"}
              onChange={(e) => {
                const pName = e.target.value;
                setSetInfo({
                  ...setInfo,
                  settings: {
                    ...setInfo.settings,
                    sound_config: { ...SOUND_PRESETS[pName] },
                  },
                });
              }}
              className="bg-transparent text-slate-700 font-bold text-xs outline-none cursor-pointer border-none"
            >
              <option value="gaming">Cyber Gaming (Valorant)</option>
              <option value="retro">8-Bit Retro Arcade</option>
              <option value="zen">Soft Zen Harmony</option>
              <option value="scifi">Sci-Fi Cosmic Synth</option>
              <option value="guitar">Warm Plucked Guitar</option>
              <option value="epic">Epic Victory Fanfare</option>
            </select>
          </div>
        </div>

        {setInfo.settings?.sound_config &&
          (() => {
            const config = setInfo.settings.sound_config;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Correct Chime */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                        Correct Chime
                      </span>
                      <span className="text-[10px] font-black text-slate-400 capitalize bg-white px-2 py-0.5 rounded border border-slate-100">
                        {config.correct?.wave}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Chime scale played upon answering a flashcard correctly.
                    </p>

                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Waveform</span>
                        </div>
                        <select
                          value={config.correct?.wave || "sine"}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  correct: {
                                    ...config.correct,
                                    wave: e.target.value,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-white border border-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl outline-none cursor-pointer"
                        >
                          <option value="sine">Sine (Pure/Sweet)</option>
                          <option value="triangle">
                            Triangle (Soft Chime)
                          </option>
                          <option value="square">Square (Arcade Chime)</option>
                          <option value="sawtooth">
                            Sawtooth (Sharp Synth)
                          </option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Volume</span>
                          <span className="text-slate-600 font-bold">
                            {Math.round((config.correct?.volume || 0.12) * 100)}
                            %
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.3"
                          step="0.01"
                          value={config.correct?.volume || 0.12}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  correct: {
                                    ...config.correct,
                                    volume: parseFloat(e.target.value),
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => testCorrectSound(config.correct)}
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100/70 text-emerald-600 font-black rounded-2xl transition-all border border-emerald-100 text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <Volume2 className="w-4 h-4" /> TEST CORRECT CHIME
                  </button>
                </div>

                {/* Wrong Alert */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
                        Wrong Alert
                      </span>
                      <span className="text-[10px] font-black text-slate-400 capitalize bg-white px-2 py-0.5 rounded border border-slate-100">
                        {config.wrong?.wave}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Descending frequencies alert triggered on incorrect
                      answers.
                    </p>

                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Waveform</span>
                        </div>
                        <select
                          value={config.wrong?.wave || "triangle"}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  wrong: {
                                    ...config.wrong,
                                    wave: e.target.value,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-white border border-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl outline-none cursor-pointer"
                        >
                          <option value="sine">Sine (Pure/Sweet)</option>
                          <option value="triangle">
                            Triangle (Soft Chime)
                          </option>
                          <option value="square">Square (Arcade Chime)</option>
                          <option value="sawtooth">
                            Sawtooth (Sharp Synth)
                          </option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Volume</span>
                          <span className="text-slate-600 font-bold">
                            {Math.round((config.wrong?.volume || 0.18) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.4"
                          step="0.01"
                          value={config.wrong?.volume || 0.18}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  wrong: {
                                    ...config.wrong,
                                    volume: parseFloat(e.target.value),
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => testWrongSound(config.wrong)}
                    className="w-full py-3 bg-rose-50 hover:bg-rose-100/70 text-rose-600 font-black rounded-2xl transition-all border border-rose-100 text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <Volume2 className="w-4 h-4" /> TEST WRONG ALERT
                  </button>
                </div>

                {/* Finisher Theme */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                        Finisher Theme
                      </span>
                      <span className="text-[10px] font-black text-slate-400 capitalize bg-white px-2 py-0.5 rounded border border-slate-100">
                        {config.finisher?.wave}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Triumphant finisher melody unlocked by keeping high
                      streak.
                    </p>

                    <div className="space-y-4 pt-2">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Waveform</span>
                        </div>
                        <select
                          value={config.finisher?.wave || "sine"}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  finisher: {
                                    ...config.finisher,
                                    wave: e.target.value,
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full bg-white border border-slate-200 text-slate-700 font-bold text-xs px-3 py-2 rounded-xl outline-none cursor-pointer"
                        >
                          <option value="sine">Sine (Pure/Sweet)</option>
                          <option value="triangle">
                            Triangle (Soft Chime)
                          </option>
                          <option value="square">Square (Arcade Chime)</option>
                          <option value="sawtooth">
                            Sawtooth (Sharp Synth)
                          </option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase">
                          <span>Volume</span>
                          <span className="text-slate-600 font-bold">
                            {Math.round((config.finisher?.volume || 0.1) * 100)}
                            %
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.3"
                          step="0.01"
                          value={config.finisher?.volume || 0.1}
                          onChange={(e) => {
                            setSetInfo({
                              ...setInfo,
                              settings: {
                                ...setInfo.settings,
                                sound_config: {
                                  ...config,
                                  finisher: {
                                    ...config.finisher,
                                    volume: parseFloat(e.target.value),
                                  },
                                },
                              },
                            });
                          }}
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => testFinisherSound(config.finisher)}
                    className="w-full py-3 bg-amber-50 hover:bg-amber-100/70 text-amber-600 font-black rounded-2xl transition-all border border-amber-100 text-xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <Volume2 className="w-4 h-4" /> TEST FINISHER MELODY
                  </button>
                </div>
              </div>
            );
          })()}
      </div>

      {/* Cards List */}
      <div className="space-y-8">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            Cards ({setInfo.cards.length})
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleAddCard}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-lg border border-indigo-100 transition-all hover:bg-indigo-100 active:scale-95"
            >
              <Plus className="w-4 h-4" /> Add Card
            </button>
            <button
              onClick={bulkAutoGenerateFill}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-lg border border-emerald-100 transition-all hover:bg-emerald-100 active:scale-95"
              title="Tự động tạo Fill cho tất cả cards từ trường word"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto Fill All
            </button>
            <button
              onClick={bulkAutoGenerateComplete}
              className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg border border-amber-100 transition-all hover:bg-amber-100 active:scale-95"
              title="Tự động tạo Complete patterns cho tất cả cards từ trường word"
            >
              <Sparkles className="w-3.5 h-3.5" /> Auto Complete All
            </button>
          </div>
        </div>

        {(() => {
          const totalCards = (setInfo.cards || []).length;
          const indexOfLastCard = currentPage * cardsPerPage;
          const indexOfFirstCard = indexOfLastCard - cardsPerPage;
          const currentCards = (setInfo.cards || []).slice(
            indexOfFirstCard,
            indexOfLastCard,
          );
          const totalPages = Math.ceil(totalCards / cardsPerPage);

          const renderPagination = () => {
            if (totalPages <= 1) return null;
            return (
              <div className="flex items-center justify-between bg-white border border-slate-200 px-6 py-4 rounded-3xl shadow-sm flex-wrap gap-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Page {currentPage} of {totalPages} ({totalCards} cards)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (p) => {
                        if (
                          totalPages > 6 &&
                          Math.abs(p - currentPage) > 1 &&
                          p !== 1 &&
                          p !== totalPages
                        ) {
                          if (p === 2 || p === totalPages - 1) {
                            return (
                              <span
                                key={p}
                                className="text-slate-300 text-xs px-1 font-bold"
                              >
                                ...
                              </span>
                            );
                          }
                          return null;
                        }
                        return (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p)}
                            className={`w-8 h-8 rounded-xl font-black text-[11px] transition-all ${currentPage === p ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                          >
                            {p}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition-all"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-6">
              {renderPagination()}

              <div className="space-y-6">
                {currentCards.map((card, index) => {
                  const globalIndex = indexOfFirstCard + index;
                  const isExpanded = expandedCardIds.includes(card.id);

                  return (
                    <div
                      key={card.id}
                      className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col group transition-all duration-300"
                    >
                      {/* Top Bar: Word & Meaning */}
                      <div className="bg-slate-50/50 px-8 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <span className="w-8 h-8 bg-white border border-slate-200 text-slate-400 rounded-full flex items-center justify-center font-black text-[10px] shrink-0">
                            {globalIndex + 1}
                          </span>

                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex flex-col flex-1 min-w-[120px] gap-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Word
                              </label>
                              <input
                                type="text"
                                value={card.word || ""}
                                onChange={(e) =>
                                  handleCardChange(
                                    card.id,
                                    "word",
                                    e.target.value,
                                  )
                                }
                                className="bg-transparent border-none outline-none font-black text-slate-800 placeholder:text-slate-300 w-full text-sm"
                                placeholder="e.g. Hello"
                              />
                            </div>
                            <div className="w-px h-6 bg-slate-200 shrink-0 self-end mb-1" />
                            <div className="flex flex-col flex-1 min-w-[120px] gap-1">
                              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Meaning
                              </label>
                              <input
                                type="text"
                                value={card.meaning || ""}
                                onChange={(e) =>
                                  handleCardChange(
                                    card.id,
                                    "meaning",
                                    e.target.value,
                                  )
                                }
                                className="bg-transparent border-none outline-none font-bold text-indigo-600 placeholder:text-slate-300 w-full text-sm"
                                placeholder="e.g. Xin chào"
                              />
                            </div>
                          </div>

                          {/* Quick Preview Badges */}
                          {!isExpanded && (
                            <div className="hidden lg:flex items-center gap-2 px-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${card.difficulty === "easy" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : card.difficulty === "hard" ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}
                              >
                                {card.difficulty}
                              </span>
                              <div className="flex gap-1">
                                {card.tasks?.choice?.enabled && (
                                  <span
                                    className="w-4 h-4 rounded bg-indigo-50 text-indigo-500 border border-indigo-100 flex items-center justify-center font-bold text-[8px] uppercase"
                                    title="Choice Option"
                                  >
                                    C
                                  </span>
                                )}
                                {card.tasks?.fill?.enabled && (
                                  <span
                                    className="w-4 h-4 rounded bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center font-bold text-[8px] uppercase"
                                    title="Fill Option"
                                  >
                                    F
                                  </span>
                                )}
                                {card.tasks?.complete?.enabled && (
                                  <span
                                    className="w-4 h-4 rounded bg-amber-50 text-amber-500 border border-amber-100 flex items-center justify-center font-bold text-[8px] uppercase"
                                    title="Complete Option"
                                  >
                                    P
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => toggleCardExpand(card.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all border-none bg-transparent"
                            title={
                              isExpanded
                                ? "Collapse Card Details"
                                : "Expand Card Details"
                            }
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </button>
                          <button
                            onClick={() => handleRemoveCard(card.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-all border-none bg-transparent"
                            title="Delete Card"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expandable Details Container */}
                      {isExpanded && (
                        <div className="p-8 space-y-8 animate-in slide-in-from-top-4 duration-300">
                          {/* Question / Instruction */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                              Primary Question / Instruction (Prompt)
                            </label>
                            <input
                              type="text"
                              value={card.question || ""}
                              onChange={(e) =>
                                handleCardChange(
                                  card.id,
                                  "question",
                                  e.target.value,
                                )
                              }
                              className="w-full bg-indigo-50/30 border-2 border-indigo-100/10 focus:border-indigo-500/30 p-3.5 rounded-xl outline-none transition-all font-bold text-slate-800 text-sm"
                              placeholder="e.g. What is the English translation for 'Xin chào'?"
                            />
                          </div>

                          {/* Task Toggle Row */}
                          <div className="flex gap-2 p-1 bg-slate-50 rounded-xl border border-slate-100">
                            {[
                              {
                                id: "choice",
                                label: "Choices",
                                icon: LayoutGrid,
                                color: "indigo",
                              },
                              {
                                id: "fill",
                                label: "Fill-in",
                                icon: Type,
                                color: "emerald",
                              },
                              {
                                id: "complete",
                                label: "Complete",
                                icon: CheckCircle2,
                                color: "amber",
                              },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => handleTaskToggle(card.id, t.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all font-bold text-[11px] ${card.tasks?.[t.id]?.enabled ? `border-${t.color}-200 bg-white text-${t.color}-600 shadow-sm` : "border-transparent text-slate-400 hover:text-slate-600"}`}
                              >
                                <t.icon className="w-3.5 h-3.5" />
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {/* Dynamic Task Content */}
                          <div className="space-y-4">
                            {card.tasks?.choice?.enabled && (
                              <div className="p-6 rounded-2xl border-2 border-indigo-50 bg-indigo-50/10 space-y-4 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-black text-indigo-900 text-[10px] uppercase tracking-wider">
                                    Multiple Choice
                                  </h4>
                                  <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                      type="checkbox"
                                      checked={card.tasks.choice.multiple}
                                      onChange={(e) =>
                                        handleCardChange(card.id, "tasks", {
                                          ...card.tasks,
                                          choice: {
                                            ...card.tasks.choice,
                                            multiple: e.target.checked,
                                          },
                                        })
                                      }
                                      className="w-3.5 h-3.5 accent-indigo-600"
                                    />
                                    <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600">
                                      Multi-select
                                    </span>
                                  </label>
                                </div>
                                <div className="space-y-2">
                                  {card.tasks.choice.options.map(
                                    (opt, oIdx) => (
                                      <div
                                        key={oIdx}
                                        className="flex items-center gap-2"
                                      >
                                        <button
                                          onClick={() =>
                                            handleChoiceOptionChange(
                                              card.id,
                                              oIdx,
                                              "is_correct",
                                              !opt.is_correct,
                                            )
                                          }
                                          className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all shrink-0 ${opt.is_correct ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-100 text-slate-100"}`}
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <input
                                          type="text"
                                          value={opt.text}
                                          onChange={(e) =>
                                            handleChoiceOptionChange(
                                              card.id,
                                              oIdx,
                                              "text",
                                              e.target.value,
                                            )
                                          }
                                          className="flex-1 bg-white border border-slate-100 focus:border-indigo-500/20 px-3 py-2 rounded-lg outline-none font-bold text-slate-700 text-xs"
                                          placeholder="Option text..."
                                        />
                                        <button
                                          onClick={() =>
                                            removeChoiceOption(card.id, oIdx)
                                          }
                                          className="text-slate-200 hover:text-rose-500 p-1 bg-transparent border-none"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ),
                                  )}
                                  <button
                                    onClick={() => addChoiceOption(card.id)}
                                    className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 bg-transparent border-none mt-1 hover:underline"
                                  >
                                    <Plus className="w-3 h-3" /> ADD OPTION
                                  </button>
                                </div>
                              </div>
                            )}

                            {card.tasks?.fill?.enabled && (
                              <div className="p-6 rounded-2xl border-2 border-emerald-50 bg-emerald-50/10 space-y-4 animate-in fade-in duration-300">
                                <h4 className="font-black text-emerald-900 text-[10px] uppercase tracking-wider">
                                  Fill-in Answers
                                </h4>
                                <div className="space-y-2">
                                  {card.tasks.fill.answers.map((ans, aIdx) => (
                                    <div
                                      key={aIdx}
                                      className="flex items-center gap-2"
                                    >
                                      <div className="w-8 h-8 bg-emerald-500 text-white rounded-lg flex items-center justify-center shrink-0">
                                        <Check className="w-4 h-4" />
                                      </div>
                                      <input
                                        type="text"
                                        value={ans}
                                        onChange={(e) =>
                                          handleListTaskChange(
                                            card.id,
                                            "fill",
                                            "answers",
                                            aIdx,
                                            e.target.value,
                                          )
                                        }
                                        className="flex-1 bg-white border border-slate-100 focus:border-emerald-500/20 px-3 py-2 rounded-lg outline-none font-bold text-slate-700 text-xs"
                                        placeholder="Correct answer..."
                                      />
                                      <button
                                        onClick={() =>
                                          removeListItem(
                                            card.id,
                                            "fill",
                                            "answers",
                                            aIdx,
                                          )
                                        }
                                        className="text-slate-200 hover:text-rose-500 p-1 bg-transparent border-none"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <div className="flex items-center gap-4 mt-2">
                                    <button
                                      onClick={() =>
                                        addListItem(card.id, "fill", "answers")
                                      }
                                      className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-transparent border-none hover:underline"
                                    >
                                      <Plus className="w-3 h-3" /> ADD ALTERNATIVE
                                    </button>
                                    <button
                                      onClick={() => autoGenerateFill(card.id, card.word)}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition-all"
                                      title="Tự động bóc tách từ gốc thành đáp án điền"
                                    >
                                      <Sparkles className="w-3 h-3" /> AUTO GENERATE
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {card.tasks?.complete?.enabled && (
                              <div className="p-6 rounded-2xl border-2 border-amber-50 bg-amber-50/10 space-y-6 animate-in fade-in duration-300">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-black text-amber-900 text-[10px] uppercase tracking-wider">
                                    Completion Patterns
                                  </h4>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => autoGeneratePattern(card.id, card.word)}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black rounded-lg transition-all"
                                      title="Tự động tạo biến thể điền từ không trùng lặp"
                                    >
                                      <Sparkles className="w-3 h-3" /> AUTO GENERATE
                                    </button>
                                    <button
                                      onClick={() => addPattern(card.id)}
                                      className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-white text-[10px] font-black rounded-lg hover:bg-amber-600 transition-all"
                                    >
                                      <Plus className="w-3 h-3" /> ADD PATTERN
                                    </button>
                                  </div>
                                </div>

                                <div className="space-y-6">
                                  {(card.tasks.complete.patterns || []).map(
                                    (p, pIdx) => (
                                      <div
                                        key={pIdx}
                                        className="bg-white rounded-2xl border border-amber-100 p-5 space-y-4 relative group"
                                      >
                                        <button
                                          onClick={() =>
                                            removePattern(card.id, pIdx)
                                          }
                                          className="absolute top-4 right-4 text-slate-200 hover:text-rose-500 transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>

                                        <div className="space-y-1.5">
                                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                            Pattern Display (e.g. Z__o)
                                          </label>
                                          <input
                                            type="text"
                                            value={p.display_text}
                                            onChange={(e) =>
                                              handlePatternChange(
                                                card.id,
                                                pIdx,
                                                "display_text",
                                                e.target.value,
                                              )
                                            }
                                            className="w-full bg-slate-50 border-none px-4 py-2.5 rounded-xl outline-none font-black text-slate-800 text-base"
                                            placeholder="Mẫu: Z__o"
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                            Missing Letters (Answers)
                                          </label>
                                          <div className="flex flex-wrap gap-2">
                                            {p.blanks.map((blk, bIdx) => (
                                              <div
                                                key={bIdx}
                                                className="flex items-center gap-1"
                                              >
                                                <input
                                                  type="text"
                                                  value={blk}
                                                  onChange={(e) =>
                                                    handlePatternBlankChange(
                                                      card.id,
                                                      pIdx,
                                                      bIdx,
                                                      e.target.value,
                                                    )
                                                  }
                                                  className="w-10 h-10 bg-amber-50 border border-amber-100 text-center rounded-lg font-black text-amber-600 outline-none"
                                                  maxLength={2}
                                                />
                                                <button
                                                  onClick={() =>
                                                    removePatternBlank(
                                                      card.id,
                                                      pIdx,
                                                      bIdx,
                                                    )
                                                  }
                                                  className="text-slate-200 hover:text-rose-500"
                                                >
                                                  <X className="w-3 h-3" />
                                                </button>
                                              </div>
                                            ))}
                                            <button
                                              onClick={() =>
                                                addPatternBlank(card.id, pIdx)
                                              }
                                              className="w-10 h-10 border-2 border-dashed border-amber-200 text-amber-300 rounded-lg flex items-center justify-center hover:bg-amber-50 transition-all"
                                            >
                                              <Plus className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Feedback Section */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <HelpCircle className="w-3 h-3 text-indigo-400" />{" "}
                                Study Hint
                              </label>
                              <textarea
                                rows={2}
                                value={card.hint || ""}
                                onChange={(e) =>
                                  handleCardChange(
                                    card.id,
                                    "hint",
                                    e.target.value,
                                  )
                                }
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500/20 p-3 rounded-xl outline-none font-medium text-slate-600 text-xs resize-none"
                                placeholder="Enter tip..."
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <Check className="w-3 h-3 text-emerald-400" />{" "}
                                Correct Text
                              </label>
                              <textarea
                                rows={2}
                                value={card.feedback_correct || ""}
                                onChange={(e) =>
                                  handleCardChange(
                                    card.id,
                                    "feedback_correct",
                                    e.target.value,
                                  )
                                }
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-emerald-500/20 p-3 rounded-xl outline-none font-medium text-slate-600 text-xs resize-none"
                                placeholder="Success message..."
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                <X className="w-3 h-3 text-rose-400" />{" "}
                                Incorrect Text
                              </label>
                              <textarea
                                rows={2}
                                value={card.feedback_incorrect || ""}
                                onChange={(e) =>
                                  handleCardChange(
                                    card.id,
                                    "feedback_incorrect",
                                    e.target.value,
                                  )
                                }
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-rose-500/20 p-3 rounded-xl outline-none font-medium text-slate-600 text-xs resize-none"
                                placeholder="Fail message..."
                              />
                            </div>
                          </div>

                          {/* Card Footer: Settings */}
                          <div className="pt-6 border-t border-slate-100 flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-4">
                              <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                                {DIFFICULTY_LEVELS.map((lvl) => (
                                  <button
                                    key={lvl.value}
                                    onClick={() =>
                                      handleCardChange(
                                        card.id,
                                        "difficulty",
                                        lvl.value,
                                      )
                                    }
                                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all ${card.difficulty === lvl.value ? `${lvl.color} shadow-sm` : "text-slate-400 hover:bg-white"}`}
                                  >
                                    {lvl.label}
                                  </button>
                                ))}
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <input
                                    type="number"
                                    value={card.timer ?? ""}
                                    onChange={(e) =>
                                      handleCardChange(
                                        card.id,
                                        "timer",
                                        e.target.value === ""
                                          ? ""
                                          : parseInt(e.target.value),
                                      )
                                    }
                                    className="w-12 bg-white border border-slate-200 p-1 rounded-md font-black text-slate-700 text-[10px] text-center"
                                  />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                    sec
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <Trophy className="w-3 h-3 text-indigo-400" />
                                  <input
                                    type="number"
                                    value={card.points ?? ""}
                                    onChange={(e) =>
                                      handleCardChange(
                                        card.id,
                                        "points",
                                        e.target.value === ""
                                          ? ""
                                          : parseInt(e.target.value),
                                      )
                                    }
                                    className="w-12 bg-white border border-slate-200 p-1 rounded-md font-black text-indigo-600 text-[10px] text-center"
                                  />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                                    pts
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 italic">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Auto-saved
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {renderPagination()}
            </div>
          );
        })()}

        <button
          onClick={handleAddCard}
          className="w-full py-8 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50/10 transition-all flex flex-col items-center justify-center gap-2 group shadow-sm active:scale-[0.99]"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-indigo-100/50 transition-colors">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-black text-sm tracking-tight">
            Add New Task Card
          </span>
        </button>
        </div>
      </>
      )}
      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-slate-900/40 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Library className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight">
                    {importSource === "vocab"
                      ? "Vocabulary Library"
                      : "Dictionary Cache"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => setImportSource("vocab")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${importSource === "vocab" ? "bg-white text-indigo-600" : "bg-white/10 text-white hover:bg-white/20"}`}
                    >
                      Personal Library
                    </button>
                    <button
                      onClick={() => setImportSource("dict")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${importSource === "dict" ? "bg-white text-indigo-600" : "bg-white/10 text-white hover:bg-white/20"}`}
                    >
                      Global Cache
                    </button>
                    {importSource === "dict" && (
                      <div className="flex items-center gap-1 ml-4 border-l border-white/20 pl-4">
                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mr-2">
                          Direction:
                        </span>
                        {["all", "en-vi", "vi-en"].map((l) => (
                          <button
                            key={l}
                            onClick={() => setImportLang(l)}
                            className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter transition-all ${importLang === l ? "bg-indigo-400 text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                          >
                            {l === "all" ? "Both" : l}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[300px] relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search your vocabulary..."
                  value={importSearch}
                  onChange={(e) => setImportSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 pl-11 pr-4 py-3 rounded-2xl outline-none focus:border-indigo-500/30 transition-all font-bold text-slate-700"
                />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  {[10, 50].map((n) => (
                    <button
                      key={n}
                      disabled={vocabLoading}
                      onClick={() => handleAutoImport(n)}
                      className="px-4 py-2.5 bg-white border border-slate-200 text-indigo-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all active:scale-95"
                    >
                      +{n}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 pl-3 pr-1.5 py-1.5 rounded-2xl shadow-sm">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    Count:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    disabled={vocabLoading}
                    value={customImportCount}
                    onChange={(e) =>
                      setCustomImportCount(
                        Math.max(1, parseInt(e.target.value) || 1),
                      )
                    }
                    className="w-16 py-0.5 outline-none font-black text-slate-700 text-xs bg-transparent"
                  />
                  <button
                    disabled={vocabLoading}
                    onClick={() => handleAutoImport(customImportCount)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5 active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    Auto Import
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vocabLoading ? (
                <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">
                    Accessing your library...
                  </p>
                </div>
              ) : vocabList.length === 0 ? (
                <div className="col-span-full py-20 text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                    <BookOpen className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="font-black text-slate-400">
                    Your vocabulary library is empty.
                  </p>
                </div>
              ) : (
                vocabList
                  .filter(
                    (v) =>
                      v.word
                        .toLowerCase()
                        .includes(importSearch.toLowerCase()) ||
                      v.meaning_vi
                        ?.toLowerCase()
                        .includes(importSearch.toLowerCase()),
                  )
                  .map((vocab) => (
                    <div
                      key={vocab.id}
                      onClick={() => {
                        setSelectedVocabIds((prev) =>
                          prev.includes(vocab.id)
                            ? prev.filter((id) => id !== vocab.id)
                            : [...prev, vocab.id],
                        );
                      }}
                      className={`p-5 rounded-3xl border-2 cursor-pointer transition-all flex items-start gap-4 ${selectedVocabIds.includes(vocab.id) ? "bg-indigo-50 border-indigo-500 shadow-lg shadow-indigo-100" : "bg-white border-slate-100 hover:border-indigo-200"}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${selectedVocabIds.includes(vocab.id) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-transparent"}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-lg leading-tight">
                          {vocab.word}
                        </h4>
                        <p className="text-sm font-bold text-slate-500 mt-1 line-clamp-1">
                          {vocab.meaning_vi || "No meaning"}
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[8px] font-black uppercase text-slate-400">
                            {vocab.word.length < 5
                              ? "Easy"
                              : vocab.word.length <= 8
                                ? "Medium"
                                : "Hard"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex items-center justify-between">
              <p className="text-sm font-bold text-slate-400">
                <span className="text-indigo-600 font-black">
                  {selectedVocabIds.length}
                </span>{" "}
                words selected
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-8 py-3 font-black text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSelected}
                  disabled={selectedVocabIds.length === 0}
                  className="px-10 py-3 bg-indigo-600 disabled:bg-slate-200 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Import Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Generate Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white flex items-center justify-center shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">
                    Tạo thẻ tự động bằng AI
                  </h2>
                  <p className="text-xs text-indigo-600/80 font-bold">
                    Hệ thống tạo Flashcards bằng AI
                  </p>
                </div>
              </div>
              <button
                onClick={() => !aiLoading && setShowAIModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/50 text-slate-400 hover:bg-white hover:text-slate-600 transition-all"
                disabled={aiLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Yêu cầu (Prompt)
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ví dụ: Tạo 10 từ vựng tiếng Anh chủ đề Công Nghệ Thông Tin..."
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-purple-500/20 focus:bg-white px-4 py-3 rounded-xl outline-none transition-all text-sm font-medium text-slate-700 min-h-[100px] resize-none"
                  disabled={aiLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Độ khó (Có thể chọn nhiều)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFICULTY_LEVELS.map((diff) => {
                    const isSelected = aiDifficulty.includes(diff.value);
                    return (
                      <button
                        key={diff.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            if (aiDifficulty.length > 1) {
                              setAiDifficulty(aiDifficulty.filter((d) => d !== diff.value));
                            }
                          } else {
                            setAiDifficulty([...aiDifficulty, diff.value]);
                          }
                        }}
                        disabled={aiLoading}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          isSelected
                            ? diff.color
                            : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
                        }`}
                      >
                        {diff.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Số lượng thẻ muốn sinh (AI Count)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[10, 50, 100, 200, 300].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setAiCount(num)}
                      disabled={aiLoading}
                      className={`py-2 px-1 rounded-xl text-xs font-black transition-all ${
                        aiCount === num
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
                          : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {num} thẻ
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Cấu hình bổ sung
                </label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={aiHint}
                      disabled={aiLoading}
                      onChange={(e) => setAiHint(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-700 block">Tạo gợi ý học tập (Hints)</span>
                      <span className="text-[10px] text-slate-400 font-medium block">AI sẽ tự động sinh giải nghĩa hoặc mẹo nhớ nhanh bằng tiếng Việt cho từ</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-[2rem]">
              <button
                onClick={() => setShowAIModal(false)}
                disabled={aiLoading}
                className="px-5 py-2.5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={aiLoading}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-100 disabled:opacity-70"
              >
                {aiLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Đang tạo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Tạo thẻ ngay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
