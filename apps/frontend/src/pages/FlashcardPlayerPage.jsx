import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  X,
  HelpCircle,
  Trophy,
  Award,
  Clock,
  ChevronRight,
  Brain,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Zap,
  Volume2,
  VolumeX,
  Sparkles,
  Star,
  Check,
  History,
  Crown,
  Flame,
  SkipForward,
} from "lucide-react";
import axiosInstance from "@/services/axiosInstance";
import confetti from "canvas-confetti";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/contexts/SettingsContext";
import { speakWord } from "@/utils/speech";

// Device Detection — used for platform-specific audio strategies
const _ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOSDevice = /iPad|iPhone|iPod/.test(_ua) && !window.MSStream;
const hasSpeechSupport = typeof window !== 'undefined' && !!window.speechSynthesis;

// Global Unlocked AudioContext Manager for iOS/Chrome/Safari Gesture Compliance
let globalAudioCtx = null;
let _iosKeepAliveInterval = null;

const getAudioContext = () => {
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        globalAudioCtx = new AudioContextClass();
      } catch (e) {
        console.warn("AudioContext creation failed:", e);
        return null;
      }
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === "suspended") {
    globalAudioCtx
      .resume()
      .catch((err) => console.warn("Failed to resume AudioContext:", err));
  }
  // iOS: periodically nudge AudioContext to prevent auto-suspension between interactions
  if (isIOSDevice && globalAudioCtx && !_iosKeepAliveInterval) {
    _iosKeepAliveInterval = setInterval(() => {
      if (!globalAudioCtx) return;
      if (globalAudioCtx.state === "suspended") {
        globalAudioCtx.resume().catch(() => { });
      } else if (globalAudioCtx.state === "running") {
        // Play a silent 1-sample buffer to prevent iOS from sleeping the context
        try {
          const buf = globalAudioCtx.createBuffer(1, 1, 22050);
          const src = globalAudioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(globalAudioCtx.destination);
          src.start(0);
        } catch {
          console.warn("Failed to play silent buffer");
        }
      }
    }, 20000);
  }
  return globalAudioCtx;
};

// Dynamic pitch audio generator for custom sound designer parameters
const playCorrectSound = (streak, soundConfig) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const config = soundConfig?.correct;

    // Pitch progression: 5% frequency increase per streak level, capped at +60% (1.60x)
    const pitchFactor = 1 + Math.min((streak - 1) * 0.05, 0.6);
    // Volume progression: +4% volume per streak level, capped at +40% (1.40x)
    const volFactor = 1 + Math.min((streak - 1) * 0.04, 0.4);

    if (config) {
      let notes = config.notes_by_streak?.default || [261.63, 329.63];
      if (streak >= 10 && config.notes_by_streak?.x10) {
        notes = config.notes_by_streak.x10;
      } else if (streak >= 5 && config.notes_by_streak?.x5) {
        notes = config.notes_by_streak.x5;
      } else if (config.notes_by_streak?.[`x${streak}`]) {
        notes = config.notes_by_streak[`x${streak}`];
      }

      notes.forEach((freq, noteIdx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (streak >= 10) {
          osc.type = noteIdx % 2 === 0 ? "triangle" : "square";
        } else {
          osc.type = config.wave || "sine";
        }

        const delay = config.note_delay || 0.12;
        const startTime = ctx.currentTime + noteIdx * delay;
        // Pitch-shifted frequency
        osc.frequency.setValueAtTime(freq * pitchFactor, startTime);

        const duration = config.duration || 0.45;
        // Volume-boosted peak volume, clamped at 0.85 to avoid distortion
        const peakVol = Math.min(0.85, (config.volume || 0.12) * volFactor);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(peakVol, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
      return;
    }

    // Default Fallback
    if (streak >= 10) {
      const godlikeFrequencies = [
        523.25, 659.25, 783.99, 987.77, 1046.5, 1318.51, 1567.98,
      ];
      godlikeFrequencies.forEach((freq, noteIdx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = noteIdx % 2 === 0 ? "triangle" : "square";
        osc.frequency.setValueAtTime(
          freq * pitchFactor,
          ctx.currentTime + noteIdx * 0.075,
        );
        const startTime = ctx.currentTime + noteIdx * 0.075;
        const duration = 0.25;
        const peakVol = Math.min(0.85, 0.08 * volFactor);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(peakVol, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
      });
      return;
    }

    const scale = [
      [261.63, 329.63],
      [329.63, 392.0],
      [392.0, 493.88],
      [493.88, 587.33],
      [587.33, 698.46, 880.0],
    ];
    const index = Math.min(streak - 1, scale.length - 1);
    const notes = scale[index] || scale[0];

    notes.forEach((freq, noteIdx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        freq * pitchFactor,
        ctx.currentTime + noteIdx * 0.12,
      );
      const startTime = ctx.currentTime + noteIdx * 0.12;
      const duration = 0.45;
      const peakVol = Math.min(0.85, 0.12 * volFactor);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(peakVol, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    });
  } catch (err) {
    console.error("Failed to play correct sound:", err);
  }
};

const playWrongSound = (soundConfig) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const config = soundConfig?.wrong;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (config) {
      osc.type = config.wave || "triangle";
      const freqs = config.frequencies || [150, 85];
      const duration = config.duration || 0.25;
      const vol = config.volume || 0.18;

      osc.frequency.setValueAtTime(freqs[0], ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        freqs[1],
        ctx.currentTime + duration,
      );

      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
      return;
    }

    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(85, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (err) {
    console.error("Failed to play wrong sound:", err);
  }
};

const playTickSound = (timeLeft, initialTimer, soundConfig) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const config = soundConfig?.tick;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const ratio = timeLeft / initialTimer;

    if (config) {
      const freqRange = config.frequency_range || [95, 285];
      const volRange = config.volume_range || [0.04, 0.19];
      const baseFreq =
        freqRange[0] + (1 - ratio) * (freqRange[1] - freqRange[0]);
      osc.type = config.wave || (ratio < 0.28 ? "triangle" : "sine");
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

      const maxVolume = volRange[0] + (1 - ratio) * (volRange[1] - volRange[0]);
      const duration = config.duration || 0.15;

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(maxVolume, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration,
      );

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      return;
    }

    const baseFreq = 95 + (1 - ratio) * 190;
    osc.type = ratio < 0.28 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    const maxVolume = 0.04 + (1 - ratio) * 0.15;
    const duration = 0.15;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(maxVolume, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    console.error("Failed to play tick sound:", err);
  }
};

const playFinisherSound = (soundConfig) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const config = soundConfig?.finisher;
    let notes = [];

    if (config) {
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
      return;
    }

    notes = [
      { freq: 261.63, time: 0.0, dur: 0.3, type: "sine" },
      { freq: 329.63, time: 0.15, dur: 0.3, type: "sine" },
      { freq: 392.0, time: 0.3, dur: 0.3, type: "sine" },
      { freq: 523.25, time: 0.45, dur: 0.3, type: "sine" },
      { freq: 659.25, time: 0.6, dur: 0.45, type: "triangle" },
      { freq: 783.99, time: 0.75, dur: 0.5, type: "triangle" },
      { freq: 523.25, time: 0.95, dur: 1.6, type: "sine" },
      { freq: 659.25, time: 0.95, dur: 1.6, type: "triangle" },
      { freq: 783.99, time: 0.95, dur: 1.6, type: "sine" },
      { freq: 1046.5, time: 0.95, dur: 1.8, type: "triangle" },
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type;
      osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.time);
      const startTime = ctx.currentTime + note.time;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + note.dur);
    });
  } catch (err) {
    console.error("Failed to play finisher sound:", err);
  }
};

export default function FlashcardPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { localProficiency, addLocalResult } = useSettings();

  const [showLimitModal, setShowLimitModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [set, setSet] = useState(null);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);
  const [errorModal, setErrorModal] = useState({
    show: false,
    message: "",
    navigateBack: false,
  });
  const [dynamicHint, setDynamicHint] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [sessionXpGained, setSessionXpGained] = useState(null);
  const [newXpTotal, setNewXpTotal] = useState(null);
  const [updatedStreak, setUpdatedStreak] = useState(null);
  const [gameState, setGameState] = useState("start"); // start, playing, feedback, finished
  const [sessionId, setSessionId] = useState(null);
  const [userAnswer, setUserAnswer] = useState(null); // depends on task type
  const userAnswerRef = useRef(userAnswer);

  useEffect(() => {
    userAnswerRef.current = userAnswer;
  }, [userAnswer]);

  const [isCorrect, setIsCorrect] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [activeTaskType, setActiveTaskType] = useState(null); // choice, fill, complete

  const [audioModeEnabled, setAudioModeEnabled] = useState(() => {
    if (!hasSpeechSupport) return false;
    try {
      const saved = localStorage.getItem("audio_mode_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [wordRevealed, setWordRevealed] = useState(false);

  const toggleAudioMode = () => {
    const nextVal = !audioModeEnabled;
    setAudioModeEnabled(nextVal);
    try {
      localStorage.setItem("audio_mode_enabled", JSON.stringify(nextVal));
    } catch (e) {
      console.error(e);
    }
    if (!nextVal) {
      setIsAudioMode(false);
    }
  };

  // Auto-focus input when starting a new card or task
  useEffect(() => {
    if (gameState === "playing") {
      const timer = setTimeout(() => {
        if (activeTaskType === "fill") {
          document.getElementById("fill-input")?.focus();
        } else if (activeTaskType === "complete") {
          document.getElementById("complete-input-0")?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [gameState, currentCardIdx, activeTaskType]);

  // Auto-speak in Audio Listening Mode
  useEffect(() => {
    if (isAudioMode && gameState === "playing" && set?.cards?.[currentCardIdx]) {
      const card = set.cards[currentCardIdx];
      const timer = setTimeout(() => {
        speakWord(card.word);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [gameState, currentCardIdx, isAudioMode, set]);

  const [activePatternIdx, setActivePatternIdx] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(0);
  const [userResults, setUserResults] = useState([]); // Array of { card, isCorrect, userAnswer, targetAnswer }
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "running") {
        if (audioUnlocked) return;
        setAudioUnlocked(true);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("mousedown", unlock);
      }
    };
    window.addEventListener("touchstart", unlock);
    window.addEventListener("mousedown", unlock);
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("mousedown", unlock);
    };
  }, []);

  const [showReview, setShowReview] = useState(false);
  const [correctSelected, setCorrectSelected] = useState([]);
  const [wrongSelected, setWrongSelected] = useState([]);
  const [usage, setUsage] = useState(null); // { remaining_attempts, daily_limit, reset_at, can_play }
  const [countdown, setCountdown] = useState("");
  const [streak, setStreak] = useState(0);
  const [soundStreak, setSoundStreak] = useState(0);
  const [showMasteredModal, setShowMasteredModal] = useState(false);
  const [fastCards, setFastCards] = useState([]);
  const [currentFastCardIdx, setCurrentFastCardIdx] = useState(0);
  const [fastCardTimeLeft, setFastCardTimeLeft] = useState(5);
  const [achievementToasts, setAchievementToasts] = useState([]); // Array of { id, type, word, meaning, title, xp }

  const addAchievementToast = (toastData) => {
    const id = crypto.randomUUID();
    setAchievementToasts((prev) => [...prev, { ...toastData, id }]);
    setTimeout(() => {
      setAchievementToasts((prev) => prev.filter((t) => t.id !== id));
    }, toastData.duration || 4500);
  };
  const [newWordsInSession, setNewWordsInSession] = useState([]); // Array of { word, meaning }
  const [skipCountdown, setSkipCountdown] = useState(3);
  const [canSkipFastCard, setCanSkipFastCard] = useState(false);

  const startChallenge = async (forceContinue = false) => {
    if (loading) return;

    if (!isAuthenticated) {
      const draftCount = Object.keys(localProficiency).length;
      if (draftCount >= 100) {
        setShowLimitModal(true);
        return;
      }
    }

    if (
      !forceContinue &&
      (!usage?.can_play ||
        usage?.event_status === "upcoming" ||
        usage?.event_status === "ended")
    )
      return;
    // Resume and unlock global AudioContext on direct user gesture click
    getAudioContext();

    try {
      setLoading(true);
      let data;
      if (extSessionId || (id && id.startsWith("ext_session_"))) {
        // Session is already loaded via fetchSet. Use the current state.
        data = set;
      } else {
        // Route to the correct API endpoint based on auth status
        // - /start      → requires valid JWT, enforces daily limits, creates server session
        // - /start-guest → no auth required, only works for unlimited sets (daily_limit === 0)
        const endpoint = isAuthenticated
          ? `/flashcards/${id}/start`
          : `/flashcards/${id}/start-guest`;
        const response = await axiosInstance.post(endpoint);
        data = response.data;
        setSet(data);
        setSessionId(data.session_id);
      }

      if (!data.cards || data.cards.length === 0) {
        setErrorModal({
          show: true,
          message: "Bá»™ tháº» nĂ y hiá»‡n chÆ°a cĂ³ dá»¯ liá»‡u tháº» nĂ o Ä‘á»ƒ luyá»‡n táº­p.",
          navigateBack: true,
        });
        setLoading(false);
        return;
      }
      setStreak(0);
      setSoundStreak(0);
      setScore(0);
      setUserResults([]);
      setShowReview(false);

      // If user has mastered all cards, show the mastered modal (unless they chose to continue)
      if (data.all_mastered && !forceContinue) {
        setShowMasteredModal(true);
        setLoading(false);
        return;
      }

      if (data.is_dynamic) {
        setFastCards([]);
        setGameState("playing");
        initCard(0, data.cards);
        return;
      }

      // Filter eligible cards for Fast Card warm-up phase (new or user proficiency <= -50)
      const eligibleFast = (data.cards || []).filter((c) => {
        const attempts = c.user_attempts !== undefined ? c.user_attempts : 0;
        const proficiency =
          c.user_proficiency !== undefined ? c.user_proficiency : 0;
        return attempts === 0 || proficiency <= -50;
      });

      if (eligibleFast.length > 0) {
        setFastCards(eligibleFast);
        setCurrentFastCardIdx(0);
        setFastCardTimeLeft(5);
        setCanSkipFastCard(false);
        setSkipCountdown(3);
        setGameState("fastcard");
      } else {
        setGameState("playing");
        initCard(0, data.cards);
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;

      if (status === 401) {
        // Token expired or missing — redirect to login
        navigate(`/login?redirect=/flashcards/play/${id}`);
        return;
      }

      setErrorModal({
        show: true,
        message:
          detail ||
          "Không thể bắt đầu thử thách. Vui lòng tải lại hoặc thử lại sau.",
        navigateBack: status === 403 && !isAuthenticated,
      });
    } finally {
      setLoading(false);
    }
  };

  const initCard = (idx, cardsOverride = null) => {
    const cards = cardsOverride || set?.cards || [];
    const card = cards[idx];
    if (!card) return;
    setTimeLeft(card.timer || 15);
    setCurrentCardIdx(idx);
    setIsCorrect(null);
    setShowHint(false);
    setDynamicHint("");
    setAttemptsLeft(3);

    // Pick a random enabled task
    const enabledTasks = [];
    if (card.tasks.choice?.enabled) enabledTasks.push("choice");
    if (card.tasks.fill?.enabled) enabledTasks.push("fill");
    if (card.tasks.complete?.enabled) enabledTasks.push("complete");

    const pickedTask =
      enabledTasks[Math.floor(Math.random() * enabledTasks.length)];
    setActiveTaskType(pickedTask);

    // Decide if this card is presented in Audio Mode
    const randomAudio = Math.random() < 0.4;
    const isAudio = audioModeEnabled && hasSpeechSupport && (pickedTask === "choice" || pickedTask === "fill") && !card.is_dynamic;
    setIsAudioMode(isAudio ? randomAudio : false);
    setWordRevealed(false);

    // Initial state for choice tasks
    if (pickedTask === "choice") {
      const wrongCount = card.tasks.choice.options.filter(
        (o) => !o.is_correct,
      ).length;
      setAttemptsLeft(wrongCount || 1);
      setCorrectSelected([]);
      setWrongSelected([]);
      setUserAnswer(card.tasks.choice.multiple ? [] : null);
    } else if (pickedTask === "fill") {
      setUserAnswer("");
      setAttemptsLeft(3); // Default 3 tries for typing
    } else if (pickedTask === "complete") {
      const patterns = card.tasks.complete?.patterns || [];
      const pIdx = patterns.length > 0 ? Math.floor(Math.random() * patterns.length) : 0;
      setActivePatternIdx(pIdx);
      const pattern = patterns[pIdx];
      // Total boxes = sum of lengths of all blanks
      const totalBlankChars = pattern
        ? (pattern.blanks || []).reduce((acc, b) => acc + (b?.length || 0), 0)
        : 0;
      setUserAnswer(new Array(totalBlankChars).fill(""));
      setAttemptsLeft(3);
    }
  };

  const handleNextFastCard = () => {
    if (currentFastCardIdx < fastCards.length - 1) {
      setCurrentFastCardIdx((prev) => prev + 1);
      setFastCardTimeLeft(5);
      setCanSkipFastCard(false);
      setSkipCountdown(3);
    } else {
      // Fast cards finished! Start main gameplay
      setGameState("playing");
      initCard(0, set.cards);
    }
  };

  const handleSkipAllFastCards = () => {
    setGameState("playing");
    initCard(0, set.cards);
  };

  const performCheck = (answer, isTimeout = false) => {
    const card = set.cards[currentCardIdx];
    let correct = false;

    // Validation logic based on activeTaskType
    if (activeTaskType === "choice") {
      const correctOpts = card.tasks.choice.options
        .filter((o) => o.is_correct)
        .map((o) => o.text);
      if (card.tasks.choice.multiple) {
        correct =
          (answer || []).length === correctOpts.length &&
          (answer || []).every((u) => correctOpts.includes(u));
      } else {
        const singleAns = Array.isArray(answer) ? answer[0] : answer;
        correct = singleAns === correctOpts[0];
      }
    } else if (activeTaskType === "fill") {
      const answerStr = Array.isArray(answer) ? answer.join("") : answer || "";
      correct = card.tasks.fill.answers.some(
        (a) => a.toLowerCase().trim() === answerStr.toLowerCase().trim(),
      );
    } else if (activeTaskType === "complete") {
      const pattern = card.tasks.complete.patterns[activePatternIdx];
      const correctStr = pattern.blanks.join("");
      const answerStr = Array.isArray(answer) ? answer.join("") : answer || "";
      correct =
        correctStr.toLowerCase().trim() === answerStr.toLowerCase().trim();
    }

    // On timeout: choice & complete auto-fail; fill evaluates whatever was typed
    if (isTimeout && activeTaskType !== "fill") correct = false;

    // Save result with rich context
    const resultObj = {
      card,
      isCorrect: correct,
      userAnswer: Array.isArray(answer)
        ? activeTaskType === "choice"
          ? answer.join(", ")
          : answer.join("")
        : answer || "",
      targetAnswer:
        activeTaskType === "choice"
          ? card.tasks.choice.options
            .filter((o) => o.is_correct)
            .map((o) => o.text)
            .join(", ")
          : activeTaskType === "fill"
            ? card.tasks.fill.answers.join(" | ")
            : card.tasks.complete.patterns[activePatternIdx].blanks.join(""),
      taskType: activeTaskType,
      displayPattern:
        activeTaskType === "complete"
          ? card.tasks.complete.patterns[activePatternIdx].display_text
          : null,
      word: card.word,
      meaning: card.meaning,
    };
    setUserResults((prev) => [...prev, resultObj]);

    if (!isAuthenticated) {
      setTimeout(() => {
        addLocalResult(card.word, card.meaning || "", activeTaskType, correct);
      }, 0);
    }

    // 1. Background save immediately
    const payload = {
      word: card.word,
      task_type: activeTaskType,
      is_correct: correct,
      meaning: card.meaning || "",
      session_id: sessionId,
    };
    axiosInstance
      .post("/flashcards/submit-answer", payload)
      .then(({ data }) => {
        // Update result object with fresh server proficiency
        setUserResults((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx < 0) return prev;
          const newResults = [...prev];
          newResults[lastIdx] = {
            ...newResults[lastIdx],
            current_proficiency: data.proficiency,
            is_first_encounter: data.is_first_encounter,
            is_first_fill_correct: data.is_first_fill_correct,
          };
          return newResults;
        });

        if (data.is_first_encounter) {
          setNewWordsInSession((prev) => {
            if (
              prev.some((w) => w.word.toLowerCase() === card.word.toLowerCase())
            )
              return prev;
            return [...prev, { word: card.word, meaning: card.meaning }];
          });

          // Show "Unlocked" toast immediately
          addAchievementToast({
            type: "unlocked",
            word: card.word,
            meaning: card.meaning,
          });

          if (correct) {
            // Delay the achievement toast slightly so it doesn't overlap perfectly or just show both
            setTimeout(() => {
              addAchievementToast({
                type: "first_encounter",
                word: card.word,
                meaning: card.meaning,
              });
            }, 800);
          }
        }

        if (data.is_first_fill_correct) {
          addAchievementToast({
            type: "first_fill",
            word: card.word,
            meaning: card.meaning,
          });
        }

        if (data?.newly_mastered) {
          addAchievementToast({
            type: "mastered",
            word: card.word,
            meaning: card.meaning,
          });
        }
      })
      .catch(() => {
        // 2. Fallback to localStorage if offline or network error
        try {
          const queue = JSON.parse(
            localStorage.getItem("flashcard_sync_queue") || "[]",
          );
          queue.push(payload);
          localStorage.setItem("flashcard_sync_queue", JSON.stringify(queue));
        } catch (e) {
          console.error("Failed to save to local storage queue", e);
        }
      });

    setIsCorrect(correct);
    if (correct) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      const nextSoundStreak = soundStreak + 1;
      setSoundStreak(nextSoundStreak);
      playCorrectSound(nextSoundStreak, set.settings?.sound_config);
      speakWord(card.word);
      setScore((prev) => prev + card.points);
      confetti({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#4f46e5", "#10b981", "#fbbf24"],
      });
    } else {
      setStreak(0);
      const nextSoundStreak = Math.max(0, soundStreak - 2);
      setSoundStreak(nextSoundStreak);
      playWrongSound(set.settings?.sound_config);
    }

    setGameState("feedback");
  };

  const handleTextCheck = (answerStr) => {
    const card = set.cards[currentCardIdx];
    let correct = false;

    if (activeTaskType === "fill") {
      correct = card.tasks.fill.answers.some(
        (a) => a.toLowerCase().trim() === answerStr.toLowerCase().trim(),
      );
    } else {
      const pattern = card.tasks.complete.patterns[activePatternIdx];
      const correctStr = pattern.blanks.join("");
      correct =
        correctStr.toLowerCase().trim() === answerStr.toLowerCase().trim();
    }

    if (correct) {
      performCheck(answerStr);
    } else {
      // Clear and let retry if attempts left
      setAttemptsLeft((prev) => {
        if (prev <= 1) {
          performCheck(answerStr, false); // Fail
          return 0;
        }
        // Visual feedback for wrong
        setIsCorrect(false);
        setTimeout(() => {
          setIsCorrect(null);
          if (activeTaskType === "fill") {
            setUserAnswer("");
            document.getElementById("fill-input")?.focus();
          } else {
            const pattern = card.tasks.complete.patterns[activePatternIdx];
            const totalChars = (pattern.blanks || []).reduce(
              (acc, b) => acc + (b?.length || 0),
              0,
            );
            setUserAnswer(new Array(totalChars).fill(""));
            document.getElementById("complete-input-0")?.focus();
          }
        }, 800);

        return prev - 1;
      });
    }
  };

  // Fast Card Timer Countdown
  useEffect(() => {
    let timer;
    if (gameState === "fastcard" && fastCardTimeLeft > 0) {
      timer = setInterval(() => {
        setFastCardTimeLeft((prev) => {
          if (prev <= 1) {
            handleNextFastCard();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, fastCardTimeLeft, currentFastCardIdx, fastCards]);

  // Fast Card Keyboard skip (Any Key)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState === "fastcard" && canSkipFastCard) {
        if (["Space", " ", "Enter"].includes(e.key)) {
          e.preventDefault();
        }
        handleNextFastCard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, currentFastCardIdx, fastCards, canSkipFastCard]);

  // Fast Card Skip Countdown
  useEffect(() => {
    if (gameState === "fastcard") {
      const interval = setInterval(() => {
        setSkipCountdown((prev) => {
          if (prev <= 1) {
            setCanSkipFastCard(true);
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [gameState, currentFastCardIdx]);

  // Sequential Unlocked Word Toasts on Finish - REMOVED, now happens per card
  // Speak fast card word when it appears
  useEffect(() => {
    if (gameState === "fastcard" && fastCards[currentFastCardIdx]) {
      speakWord(fastCards[currentFastCardIdx].word);
    }
  }, [gameState, currentFastCardIdx, fastCards]);

  const location = useLocation();
  const extSessionId = location.state?.extensionSessionId;

  const fetchSet = async () => {
    try {
      if (extSessionId) {
        // Load the session directly from the extension-session API
        const { data } = await axiosInstance.get(`/flashcards/extension-session/${extSessionId}`);
        setSet(data);
        setSessionId(extSessionId);
        setUsage({
          can_play: true,
          remaining_attempts: 99,
          daily_limit: 0,
          reset_at: null,
          event_status: "active"
        });
        setLoading(false);
        return;
      }

      if (id && id.startsWith("ext_session_")) {
        // Skip fetching normal set since it is a session ID and it will be handled by the direct session loader in useEffect
        return;
      }

      const [setRes, usageRes] = await Promise.all([
        axiosInstance.get(`/flashcards/${id}`),
        axiosInstance.get(`/flashcards/${id}/usage`),
      ]);
      setSet(setRes.data);
      setUsage(usageRes.data);
      if (setRes.data.all_mastered) {
        setShowMasteredModal(true);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setErrorModal({
        show: true,
        message:
          "Không thể tải thông tin thử thách hoặc dữ liệu lượt chơi của bộ flashcard này.",
        navigateBack: true,
      });
    }
  };

  useEffect(() => {
    if (!extSessionId && id && id.startsWith("ext_session_")) {
      // It's an extension session URL but location.state was lost/empty.
      // We will treat the URL ID as the session ID.
      // This is a robust fallback when reloading the page.
      const urlSessionId = id;
      const fetchSessionDirect = async () => {
        try {
          const { data } = await axiosInstance.get(`/flashcards/extension-session/${urlSessionId}`);
          setSet(data);
          setSessionId(urlSessionId);
          setUsage({
            can_play: true,
            remaining_attempts: 99,
            daily_limit: 0,
            reset_at: null,
            event_status: "active"
          });
          setLoading(false);
        } catch (err) {
          console.error(err);
          setErrorModal({
            show: true,
            message: "Phiên học của extension không tồn tại hoặc đã hết hạn.",
            navigateBack: true,
          });
        }
      };
      fetchSessionDirect();
      return;
    }

    const timer = setTimeout(() => {
      fetchSet();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, extSessionId]);

  // Prefetch TTS Voices on mount to eliminate async getVoices loading delay on mobile devices
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      // Trigger voice retrieval instantly to warm up the TTS engine list
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        handleVoicesChanged,
      );
      return () => {
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          handleVoicesChanged,
        );
      };
    }
  }, []);

  useEffect(() => {
    if (!usage?.reset_at) return;

    const timer = setInterval(() => {
      const now = new Date();
      const reset = new Date(usage.reset_at);
      const diff = reset - now;

      if (diff <= 0) {
        setCountdown("Resetting...");
        fetchSet();
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours}h ${mins}m ${secs}s`);
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usage?.reset_at]);

  // Auto-check for text tasks
  useEffect(() => {
    if (gameState !== "playing") return;

    if (activeTaskType === "complete") {
      if (userAnswer.every((val) => val.length > 0)) {
        const timer = setTimeout(() => {
          handleTextCheck(userAnswer.join(""));
        }, 0);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAnswer, activeTaskType, gameState]);

  const handleCheckAnswer = (isTimeout = false) => {
    if (gameState !== "playing") return;
    const currentAnswer = isTimeout ? userAnswerRef.current : userAnswer;

    if (
      !isTimeout &&
      (activeTaskType === "fill" || activeTaskType === "complete")
    ) {
      const answerStr =
        activeTaskType === "fill"
          ? currentAnswer
          : (currentAnswer || []).join("");
      handleTextCheck(answerStr);
    } else {
      performCheck(currentAnswer, isTimeout);
    }
  };

  useEffect(() => {
    let timer;
    if (
      gameState === "playing" &&
      timeLeft > 0 &&
      !showExitModal &&
      !errorModal.show
    ) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleCheckAnswer(true); // Auto-check on timeout
            return 0;
          }
          const next = prev - 1;

          // Progressive Hint Logic
          const card = set.cards[currentCardIdx];
          const maxTime = card.timer || 15;
          if (
            next <= maxTime / 2 &&
            (activeTaskType === "fill" || activeTaskType === "complete")
          ) {
            const word = card.word || "";
            const halfTime = maxTime / 2;
            const progress = halfTime - next;

            if (progress < 2) {
              setDynamicHint(`Bắt đầu bằng: ${word[0]?.toUpperCase()}`);
            } else if (progress < 4) {
              setDynamicHint(`Gồm ${word.length} chữ cái`);
            } else {
              // Reveal more characters as time runs out
              const charsToReveal = Math.min(
                word.length,
                Math.floor((progress - 4) / 1.5) + 1,
              );
              setDynamicHint(`Gợi ý: ${word.substring(0, charsToReveal)}...`);
            }
          }

          // Play dynamic tick beat if streak >= 5 to build high-energy tension!
          if (streak >= 5) {
            const currentCard = set.cards[currentCardIdx];
            playTickSound(
              next,
              currentCard?.timer || 15,
              set.settings?.sound_config,
            );
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gameState,
    timeLeft,
    streak,
    currentCardIdx,
    set,
    showExitModal,
    errorModal.show,
  ]);

  const handleNext = () => {
    if (currentCardIdx < (set?.cards?.length || 0) - 1) {
      setGameState("playing");
      initCard(currentCardIdx + 1);
    } else {
      setGameState("finished");

      // Submit session completed to backend securely
      axiosInstance
        .post("/flashcards/session-completed", {
          set_id: id,
          session_id: sessionId,
        })
        .then(({ data }) => {
          setSessionXpGained(data.xp_gained || 0);
          setNewXpTotal(data.new_xp || 0);
          setUpdatedStreak(data.streak_days || 0);

          if (data.bonuses?.is_first_complete) {
            setTimeout(() => {
              addAchievementToast({
                type: "bonus",
                title: "Thử thách đầu tiên",
                xp: data.bonuses.first_complete_xp,
                bonusType: "init",
              });
            }, 1000);
          }
          if (data.bonuses?.is_mastery_complete) {
            setTimeout(() => {
              addAchievementToast({
                type: "bonus",
                title: "Tuyệt đỉnh thông thạo",
                xp: data.bonuses.mastery_complete_xp,
                bonusType: "mastery",
              });
            }, 2500);
          }
        })
        .catch((err) => {
          console.error("Failed to post session completion:", err);
        });

      const isPerfect =
        userResults.length > 0 && userResults.every((res) => res.isCorrect);
      if (streak >= 5 || soundStreak >= 5) {
        playFinisherSound(set.settings?.sound_config);
      }

      // Attempt to sync any offline/failed results at the end of the session
      try {
        const syncQueue = JSON.parse(
          localStorage.getItem("flashcard_sync_queue") || "[]",
        );
        if (syncQueue.length > 0) {
          Promise.allSettled(
            syncQueue.map((payload) =>
              axiosInstance.post("/flashcards/submit-answer", payload),
            ),
          ).then((promiseResults) => {
            const failedQueue = syncQueue.filter(
              (_, idx) => promiseResults[idx].status === "rejected",
            );
            if (failedQueue.length === 0) {
              localStorage.removeItem("flashcard_sync_queue");
            } else {
              localStorage.setItem(
                "flashcard_sync_queue",
                JSON.stringify(failedQueue),
              );
            }
          });
        }
      } catch (e) {
        console.error("Sync queue error", e);
      }

      if (isPerfect) {
        // Glorious multi-burst perfect score confetti!
        const duration = 3.5 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = {
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          zIndex: 100,
        };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function () {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          });
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          });
        }, 250);
      } else {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
        });
      }
    }
  };

  // Auto-advance logic
  useEffect(() => {
    let timer;
    if (gameState === "feedback") {
      // Move fast (800ms) if correct, wait longer (2.5s) if wrong for review
      const delay = isCorrect ? 800 : 2500;
      timer = setTimeout(() => {
        handleNext();
      }, delay);
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isCorrect]);

  const handleChoiceToggle = (optText) => {
    if (gameState !== "playing") return;
    const card = set.cards[currentCardIdx];
    const option = card.tasks.choice.options.find((o) => o.text === optText);

    if (option.is_correct) {
      if (!correctSelected.includes(optText)) {
        const newCorrect = [...correctSelected, optText];
        setCorrectSelected(newCorrect);

        const totalCorrect = card.tasks.choice.options.filter(
          (o) => o.is_correct,
        ).length;
        if (newCorrect.length === totalCorrect) {
          performCheck(newCorrect);
        }
      }
    } else {
      if (!wrongSelected.includes(optText)) {
        const newWrong = [...wrongSelected, optText];
        setWrongSelected(newWrong);

        if (attemptsLeft <= 1) {
          setAttemptsLeft(0);
          performCheck(newWrong, false); // Fail
        } else {
          setAttemptsLeft((prev) => prev - 1);
        }
      }
    }
  };

  if (loading)
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-bold animate-pulse">
          Đang chuẩn bị...
        </p>
      </div>
    );

  if (!isAuthenticated && usage?.require_login) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-[3rem] p-12 shadow-2xl shadow-indigo-500/10 text-center border border-slate-200 overflow-hidden">
          <div className="w-24 h-24 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-500 mx-auto mb-8 shadow-xl shadow-amber-100 rotate-3">
            <Zap className="w-12 h-12 fill-current animate-pulse" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 mb-4">
            Yêu cầu đăng nhập
          </h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            Bộ Flashcard này có giới hạn lượt chơi hàng ngày. Vui lòng đăng nhập
            để tham gia thử thách này!
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => navigate("/flashcards")}
              className="flex-1 py-5 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-black rounded-[1.5rem] transition-all active:scale-95"
            >
              Thoát
            </button>
            <button
              onClick={() => navigate(`/login?redirect=/flashcards/play/${id}`)}
              className="flex-1 py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[1.5rem] transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === "fastcard") {
    const currentFastCard = fastCards[currentFastCardIdx];
    return (
      <div
        onClick={() => canSkipFastCard && handleNextFastCard()}
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden select-none cursor-pointer"
      >
        {/* Dynamic Glowing Background Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl animate-pulse" />

        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-2xl w-full space-y-8 z-10 animate-in fade-in zoom-in-95 duration-500"
        >
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1 md:py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-600 text-[10px] md:text-xs font-black uppercase tracking-widest animate-pulse">
              <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5 text-indigo-500" />
              Fast Card: Khởi Động
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-slate-800 leading-tight">
              Ôn Tập Nhanh Từ Vựng
            </h2>
            <p className="text-xs md:text-base text-slate-500 font-bold max-w-xs md:max-w-md mx-auto">
              Ghi nhớ nhanh từ vựng mới hoặc các từ bạn từng trả lời sai để làm
              bàn đạp bứt phá điểm số!
            </p>
          </div>

          {/* Main Flashcard Card */}
          <div
            onClick={() => canSkipFastCard && handleNextFastCard()}
            className="bg-white rounded-[3rem] p-10 md:p-16 border border-slate-200 shadow-2xl shadow-indigo-500/5 transition-all duration-300 relative group flex flex-col items-center justify-center text-center space-y-8 min-h-[350px] hover:border-indigo-300 hover:shadow-indigo-500/10"
          >
            {/* Word Index Indicator */}
            <div className="absolute top-8 left-8 text-xs font-black text-slate-400 uppercase tracking-widest">
              Từ {currentFastCardIdx + 1} / {fastCards.length}
            </div>

            {/* Timer circle/pill */}
            <div className="absolute top-8 right-8 flex items-center gap-1.5 px-3.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[11px] font-black text-indigo-600 uppercase tracking-widest">
              <Clock className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              {fastCardTimeLeft}s
            </div>

            {/* Word Content */}
            <div className="space-y-4 w-full">
              <h1 className="text-4xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 tracking-tight leading-none group-hover:scale-105 transition-transform duration-500">
                {currentFastCard?.word}
              </h1>

              <div className="h-px bg-slate-100 max-w-[100px] md:max-w-[150px] mx-auto my-4 md:my-6" />

              <p className="text-xl md:text-3xl font-bold text-slate-600">
                {currentFastCard?.meaning}
              </p>
            </div>

            {/* Touch Instruction */}
            <div className="text-[10px] font-black text-indigo-500/80 uppercase tracking-widest animate-pulse pt-4">
              {canSkipFastCard
                ? "Chạm hoặc nhấn phím bất kì để tiếp tục"
                : `Vui lòng đợi ${skipCountdown} giây...`}
            </div>
          </div>

          {/* Progress Bar & Actions */}
          <div className="space-y-4">
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 transition-all duration-1000 ease-linear"
                style={{ width: `${(fastCardTimeLeft / 5) * 100}%` }}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between text-slate-400 text-xs font-bold px-2">
              <span className="order-2 sm:order-1">
                Tự động chuyển sau {fastCardTimeLeft}s
              </span>
              <div className="order-1 sm:order-2 flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto">
                <button
                  onClick={handleSkipAllFastCards}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors bg-transparent border-none font-black uppercase tracking-wider cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" /> Bỏ qua tất cả
                </button>
                <button
                  onClick={() => canSkipFastCard && handleNextFastCard()}
                  disabled={!canSkipFastCard}
                  className={`flex items-center gap-1 transition-colors bg-transparent border-none font-black uppercase tracking-wider ${canSkipFastCard
                      ? "text-indigo-600 hover:text-indigo-700 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                    }`}
                >
                  {canSkipFastCard ? (
                    <>
                      Bỏ qua <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>Bỏ qua ({skipCountdown}s)</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === "start")
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-[3rem] p-12 shadow-2xl shadow-indigo-500/10 text-center border border-slate-200 overflow-hidden relative">
          {/* Back button */}
          <button
            onClick={() => navigate("/flashcards")}
            className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors font-bold text-sm"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Quay lại
          </button>

          <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-indigo-200 rotate-3">
            <Brain className="w-12 h-12" />
          </div>
          <h2 className="text-4xl font-black text-slate-800 mb-4">
            {set.title}
          </h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            {set.description || "Sẵn sàng kiểm tra kiến thức của bạn!"}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Thẻ mỗi phiên
              </div>
              <div className="text-2xl font-black text-slate-800">
                {set.settings?.total_cards || set?.cards?.length || 0}
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Lượt hôm nay
              </div>
              <div
                className={`text-2xl font-black ${usage?.can_play ? "text-slate-800" : "text-rose-500"} flex items-center justify-center gap-1`}
              >
                {usage ? (
                  usage.daily_limit === 0 ||
                    usage.remaining_attempts > 10000 ? (
                    <span className="text-3xl leading-none">∞</span>
                  ) : (
                    `${usage.daily_limit - usage.remaining_attempts}/${usage.daily_limit}`
                  )
                ) : (
                  "--"
                )}
              </div>
            </div>
          </div>

          {/* Special Event status highlights */}
          {usage?.event_status === "upcoming" && (
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-200 mb-6 text-center animate-pulse">
              <span className="text-[10px] font-black uppercase tracking-widest bg-amber-200/50 text-amber-800 px-3 py-1 rounded-full border border-amber-300">
                SỰ KIỆN SẮP DIỄN RA
              </span>
              <p className="text-sm font-bold text-slate-600 mt-3 mb-0">
                Sự kiện này mở cửa bắt đầu từ:
                <span className="block text-indigo-600 font-black mt-1">
                  {new Date(usage.event_start_at).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </span>
              </p>
            </div>
          )}

          {usage?.event_status === "ended" && (
            <div className="bg-rose-50 p-6 rounded-3xl border border-rose-200 mb-6 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest bg-rose-200/50 text-rose-800 px-3 py-1 rounded-full border border-rose-300">
                SỰ KIỆN ĐÃ KẾT THÚC
              </span>
              <p className="text-sm font-bold text-slate-600 mt-3 mb-0">
                Sự kiện đặc biệt này đã khép lại vào lúc:
                <span className="block text-rose-700 font-black mt-1">
                  {new Date(usage.event_end_at).toLocaleString("vi-VN", {
                    timeZone: "Asia/Ho_Chi_Minh",
                  })}
                </span>
              </p>
            </div>
          )}

          {usage?.event_status === "active" && (
            <div className="bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-600 text-white p-6 rounded-3xl mb-6 shadow-lg relative overflow-hidden text-center group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full blur-xl -mr-6 -mt-6" />
              <span className="text-[9px] font-black uppercase tracking-widest bg-white/20 text-white px-3 py-1 rounded-full border border-white/10">
                SỰ KIỆN ĐANG DIỄN RA
              </span>
              <p className="text-xs font-black mt-3 mb-0 opacity-90">
                Hoàn thành phiên để tích luỹ XP giá trị! Kết thúc vào:{" "}
                {new Date(usage.event_end_at).toLocaleDateString("vi-VN")}
              </p>
            </div>
          )}

          <div className="space-y-6">
            <button
              onClick={startChallenge}
              disabled={
                !usage?.can_play ||
                usage?.event_status === "upcoming" ||
                usage?.event_status === "ended"
              }
              className={`w-full py-5 font-black rounded-[1.5rem] transition-all flex items-center justify-center gap-3 ${usage?.can_play &&
                  usage?.event_status !== "upcoming" &&
                  usage?.event_status !== "ended"
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 active:scale-95"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
            >
              {usage?.event_status === "upcoming" ? (
                <>
                  <Clock className="w-6 h-6 animate-pulse" />
                  CHƯA MỞ
                </>
              ) : usage?.event_status === "ended" ? (
                <>
                  <X className="w-6 h-6" />
                  ĐÃ KẾT THÚC
                </>
              ) : usage?.can_play ? (
                <>
                  <Zap className="w-6 h-6 fill-current" />
                  BẮT ĐẦU
                </>
              ) : (
                <>
                  <Clock className="w-6 h-6" />
                  ĐÃ HẾT LƯỢT
                </>
              )}
            </button>

            {!usage?.can_play && usage && !usage.event_status && (
              <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 animate-pulse">
                <p className="text-rose-600 font-black text-sm mb-1 uppercase tracking-widest">
                  Làm mới sau
                </p>
                <p className="text-3xl font-black text-rose-700 tabular-nums">
                  {countdown}
                </p>
              </div>
            )}

            {usage?.can_play &&
              usage?.daily_limit > 0 &&
              usage?.remaining_attempts <= 10000 && (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Làm mới lúc {usage.reset_time || "7:00"} sáng mỗi ngày (Giờ
                  VN)
                </p>
              )}
          </div>
        </div>
      </div>
    );

  if (gameState === "finished")
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center p-6 py-12">
        {/* Summary Card */}
        <div className="max-w-2xl w-full bg-white rounded-[2.5rem] md:rounded-[3rem] p-6 md:p-12 shadow-2xl shadow-indigo-500/10 text-center border border-slate-200 mb-8 md:mb-12 overflow-hidden">
          <div className="w-16 h-16 md:w-24 md:h-24 bg-amber-400 rounded-full flex items-center justify-center text-white mx-auto mb-4 md:mb-8 shadow-xl shadow-amber-100">
            <Trophy className="w-8 h-8 md:w-12 md:h-12" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-slate-800 mb-2">
            Hoàn thành!
          </h2>
          <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest mb-6 md:mb-10">
            Bạn đã vượt qua thử thách này
          </p>

          <div className="bg-indigo-600 rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-10 mb-6 md:mb-10 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="text-[10px] md:text-sm font-black uppercase tracking-[0.2em] mb-1 md:mb-2 opacity-70">
                Tổng điểm
              </div>
              <div className="text-5xl md:text-7xl font-black mb-1 md:mb-2 tabular-nums">
                {score}
              </div>
              <div className="flex items-center justify-center gap-1.5 md:gap-2 text-indigo-200 font-bold text-xs md:text-base">
                <Star className="w-3 h-3 md:w-4 md:h-4 fill-current" />
                Thành tích xuất sắc!
              </div>
            </div>
            <Sparkles className="absolute top-4 right-4 w-8 h-8 md:w-12 md:h-12 text-white/10" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 md:w-40 md:h-40 bg-white/10 rounded-full blur-3xl" />
          </div>

          {/* Gamified Session Rewards */}
          {(sessionXpGained !== null || updatedStreak !== null) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-gradient-to-tr from-indigo-500 to-indigo-700 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden flex flex-col items-center justify-center">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-lg" />
                <Trophy className="w-6 h-6 text-amber-300 mb-1.5" />
                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-200">
                  KINH NGHIỆM
                </span>
                <h4 className="text-2xl font-black mt-1 m-0">
                  +{sessionXpGained || 0} XP
                </h4>
                {newXpTotal !== null && (
                  <span className="text-[10px] text-indigo-200 font-bold mt-1">
                    Tổng: {newXpTotal} XP
                  </span>
                )}
              </div>
              <div className="bg-gradient-to-tr from-orange-500 to-amber-500 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden flex flex-col items-center justify-center">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full blur-lg" />
                <Flame className="w-6 h-6 text-white fill-white mb-1.5 animate-bounce" />
                <span className="text-[9px] font-black uppercase tracking-wider text-orange-100">
                  CHUỖI LIÊN TỤC
                </span>
                <h4 className="text-2xl font-black mt-1 m-0">
                  {updatedStreak || 0} ngày
                </h4>
                <span className="text-[10px] text-orange-100 font-bold mt-1">
                  Giữ lửa học tập!
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 md:gap-4">
            <button
              onClick={() => navigate("/flashcards")}
              className="flex-1 py-3 md:py-4 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-black rounded-xl md:rounded-2xl transition-all text-sm md:text-base"
            >
              DANH SÁCH
            </button>
            <button
              onClick={() => {
                setScore(0);
                setUserResults([]);
                setSessionXpGained(null);
                setNewXpTotal(null);
                setUpdatedStreak(null);
                startChallenge();
              }}
              className="flex-1 py-3 md:py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl md:rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 text-sm md:text-base"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
              CHƠI LẠI
            </button>
          </div>
        </div>

        {/* Automatic Session Review Section */}
        <div className="max-w-2xl w-full space-y-6">
          <div className="flex items-center gap-3 mb-6 px-4">
            <History className="w-6 h-6 text-indigo-600" />
            <h3 className="text-2xl font-black text-slate-800">
              Xem lại kết quả
            </h3>
          </div>

          <div className="space-y-4">
            {(() => {
              // Group results by word to show per-word stats
              const wordStats = userResults.reduce((acc, res) => {
                const w = res.word;
                if (!acc[w]) {
                  acc[w] = {
                    word: w,
                    meaning: res.meaning,
                    correct: 0,
                    wrong: 0,
                    proficiency: res.current_proficiency,
                    results: [],
                  };
                }
                if (res.isCorrect) acc[w].correct++;
                else acc[w].wrong++;
                acc[w].proficiency = res.current_proficiency; // Latest proficiency
                acc[w].results.push(res);
                return acc;
              }, {});

              const statsArray = Object.values(wordStats);

              if (statsArray.length === 0) {
                return (
                  <div className="text-center py-10 text-slate-400 font-bold italic">
                    Không có kết quả nào được ghi lại trong phiên này.
                  </div>
                );
              }

              return statsArray.map((stat, idx) => (
                <div
                  key={idx}
                  className={`p-6 rounded-3xl border-2 bg-white shadow-sm transition-all hover:scale-[1.01] ${stat.wrong === 0 ? "border-emerald-100" : stat.correct === 0 ? "border-rose-100" : "border-amber-100"}`}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                          Từ vựng
                        </span>
                        <Volume2
                          className="w-3.5 h-3.5 cursor-pointer text-indigo-600 hover:scale-110 active:scale-95 transition-all"
                          onClick={() => speakWord(stat.word)}
                        />
                      </div>
                      <h4 className="text-xl font-black text-slate-800 leading-tight">
                        {stat.word}
                      </h4>
                      <p className="text-sm font-bold text-slate-500">
                        {stat.meaning}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex flex-col items-center px-3 py-1 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-[8px] font-black text-emerald-600 uppercase">
                          Đúng
                        </span>
                        <span className="text-sm font-black text-emerald-700">
                          {stat.correct}
                        </span>
                      </div>
                      <div className="flex flex-col items-center px-3 py-1 bg-rose-50 rounded-xl border border-rose-100">
                        <span className="text-[8px] font-black text-rose-600 uppercase">
                          Sai
                        </span>
                        <span className="text-sm font-black text-rose-700">
                          {stat.wrong}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Độ thông thạo
                      </span>
                      <span className="text-xs font-black text-indigo-600">
                        {stat.proficiency}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all duration-1000"
                        style={{
                          width: `${Math.max(0, Math.min(100, ((stat.proficiency + 10) / 30) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    );

  const card = set?.cards?.[currentCardIdx];

  if (!card && (gameState === "playing" || gameState === "feedback")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-rose-100 rounded-3xl flex items-center justify-center text-rose-500 mx-auto mb-6">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">
            Không tìm thấy thẻ
          </h2>
          <p className="text-slate-500 font-medium mb-8">
            Dữ liệu thẻ vựng không hợp lệ hoặc bộ thẻ đang trống.
          </p>
          <button
            onClick={() => navigate("/flashcards")}
            className="px-8 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg hover:bg-indigo-700 transition-all font-sans"
          >
            QUAY LẠI
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-h-screen overflow-hidden bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 italic-none">
      {/* Screen Border Flashing Overlay for high streaks (x5+) - Blended & Soft Vignette */}
      {gameState === "playing" &&
        streak >= 5 &&
        (() => {
          const initialTimer = card?.timer || 15;
          const ratio = timeLeft / initialTimer; // 1.0 down to 0.0
          // Dynamic pulse duration: at 100% time: 1.4s, at 50% time: 0.7s, at 10% time: 0.2s (faster and faster!)
          const pulseDuration = Math.max(0.18, ratio * 1.4);
          // Vignette blur and spread depth: bleeds extremely deep and soft into the screen!
          const blurDepth = Math.round(90 + (1 - ratio) * 110); // 90px to 200px blur!
          const spreadDepth = Math.round(25 + (1 - ratio) * 35); // 25px to 60px spread!
          // Dynamic color transition from Indigo to hazard Red
          const redVal = Math.round(99 + (1 - ratio) * 140);
          const greenVal = Math.round(102 - (1 - ratio) * 50);
          const blueVal = Math.round(241 - (1 - ratio) * 190);

          return (
            <>
              <style>{`
              @keyframes dynamicBorderPulse {
                0% { opacity: 0.15; }
                100% { opacity: 0.95; }
              }
              @keyframes heartbeat {
                0% { transform: scale(1); }
                50% { transform: scale(1.15); }
                100% { transform: scale(1); }
              }
            `}</style>
              <div
                className="fixed inset-0 pointer-events-none z-50 transition-all duration-300"
                style={{
                  boxShadow: `inset 0 0 ${blurDepth}px ${spreadDepth}px rgba(${redVal}, ${greenVal}, ${blueVal}, 0.45)`,
                  animation: `dynamicBorderPulse ${pulseDuration}s infinite alternate ease-in-out`,
                }}
              />
            </>
          );
        })()}
      {/* HUD Header */}
      <div className="bg-white px-4 md:px-8 py-3 md:py-5 border-b border-slate-200 flex items-center justify-between z-10 transition-all">
        <div className="flex items-center gap-4 md:gap-10">
          <button
            onClick={() => setShowExitModal(true)}
            className="text-slate-300 hover:text-slate-600 transition-colors"
          >
            <X className="w-6 h-6 md:w-8 md:h-8" />
          </button>
          <div className="flex flex-col">
            <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Tiến trình
            </span>
            <div className="flex items-center gap-1 md:gap-2">
              <span className="text-sm md:text-lg font-black text-slate-800">
                {currentCardIdx + 1}
              </span>
              <span className="text-slate-300 font-bold">/</span>
              <span className="text-slate-300 md:text-slate-400 font-bold text-xs md:text-base">
                {set?.cards?.length || 0}
              </span>
            </div>
          </div>
          <div className="w-24 md:w-48 h-1.5 md:h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
            <div
              className="h-full bg-indigo-600 transition-all duration-500"
              style={{
                width: `${((currentCardIdx + 1) / Math.max(1, set?.cards?.length || 0)) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          {hasSpeechSupport && (
            <button
              onClick={toggleAudioMode}
              className={`p-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                audioModeEnabled
                  ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
                  : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
              }`}
              title={audioModeEnabled ? "Tắt chế độ Audio (Listening)" : "Bật chế độ Audio (Listening)"}
            >
              {audioModeEnabled ? (
                <Volume2 className="w-4 h-4 animate-pulse" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
              <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">
                {audioModeEnabled ? "Audio: ON" : "Audio: OFF"}
              </span>
            </button>
          )}

          {streak > 0 && (
            <div
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1 md:py-2 rounded-xl md:rounded-2xl shadow-lg transition-all duration-300 scale-100 animate-in zoom-in-95 ${streak >= 5
                  ? "bg-gradient-to-r from-indigo-500 via-purple-500 to-rose-500 text-white shadow-purple-500/30 animate-pulse border border-white/20"
                  : "bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-rose-500/20 animate-bounce duration-[1500ms]"
                }`}
            >
              <Zap
                className={`${streak >= 5 ? "w-3 h-3 md:w-5 md:h-5 animate-spin" : "w-3 h-3 md:w-5 md:h-5 animate-pulse"} fill-current text-white`}
              />
              <div className="flex flex-col">
                <span className="text-[6px] md:text-[8px] font-black uppercase tracking-[0.15em] leading-none">
                  {streak >= 5 ? "GODLIKE" : "STREAK"}
                </span>
                <span className="text-[10px] md:text-sm font-black leading-none mt-0.5 tabular-nums">
                  {streak}x
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col items-end">
            <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Điểm
            </span>
            <div className="flex items-center gap-1 text-indigo-600">
              <Trophy className="w-3.5 h-3.5 md:w-5 md:h-5 fill-current" />
              <span className="text-sm md:text-xl font-black tabular-nums">
                {score}
              </span>
            </div>
          </div>
          <div
            className={`flex flex-col items-center w-14 md:w-20 py-0.5 md:py-1 rounded-xl md:rounded-2xl border-2 transition-colors ${timeLeft < 5 ? "bg-rose-50 border-rose-200 text-rose-500" : "bg-slate-50 border-slate-100 text-slate-700"}`}
          >
            <Clock
              className={`w-3.5 h-3.5 md:w-5 md:h-5 ${timeLeft < 5 ? "animate-[heartbeat_0.6s_infinite] text-rose-600" : ""}`}
            />

            <span className="text-xs md:text-lg font-black tabular-nums">
              {timeLeft}s
            </span>
          </div>
        </div>
      </div>

      {/* Main Arena */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center py-4 md:py-12 px-4 md:px-6 relative">
        <div className="max-w-3xl w-full flex flex-col h-full">
          {/* Card Frame */}
          <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] p-5 md:p-12 shadow-2xl shadow-indigo-500/5 border border-slate-200 relative animate-in fade-in zoom-in-95 duration-500 mb-4 md:mb-8 overflow-hidden flex flex-col">
            {/* Difficulty Badge — Absolute on Desktop, Relative on Mobile */}
            <div className="md:absolute top-8 right-8 flex items-center justify-center md:justify-start gap-2 mb-4 md:mb-0 w-fit mx-auto md:mx-0">
              {isAudioMode && (
                <div className="flex items-center gap-1 px-3 py-1 bg-purple-50 text-purple-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-purple-100 animate-in zoom-in-95">
                  <Volume2 className="w-3 h-3 animate-pulse" />
                  AUDIO MODE
                </div>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 md:bg-slate-50/50 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 md:border-slate-100/50">
                <AlertCircle className="w-3.5 h-3.5" />
                {card?.difficulty || "Medium"}
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6 md:space-y-12">
              <div className="text-center space-y-2 md:space-y-4">
                <p className="text-indigo-600 font-black text-[10px] md:text-sm uppercase tracking-[0.3em] opacity-60">
                  Challenge #{currentCardIdx + 1}
                </p>
                <h3 className="text-2xl md:text-4xl font-black text-slate-800 leading-tight">
                  {isAudioMode && !wordRevealed && gameState !== "feedback" ? (
                    <span className="flex items-center justify-center gap-2 text-indigo-600">
                      <Volume2 className="w-6 h-6 animate-pulse" />
                      {activeTaskType === "choice" ? "Nghe từ và chọn nghĩa đúng" : "Nghe từ và điền từ tiếng Anh"}
                    </span>
                  ) : card?.question &&
                    card.question.trim() !== "" &&
                    card.question.toLowerCase().trim() !==
                    (card?.word || "").toLowerCase().trim() &&
                    card.question.toLowerCase().trim() !==
                    (card?.meaning || "").toLowerCase().trim()
                    ? card.question
                    : activeTaskType === "choice"
                      ? `Nghĩa của từ "${card?.word || "..."}" là gì?`
                      : `Dịch sang ${(card?.word || "").match(/^[a-zA-Z\s]+$/) ? "tiếng Anh" : "tiếng Việt"}: "${card?.meaning || "..."}"`}
                </h3>

                {isAudioMode && (
                  <p className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-1.5 w-fit mx-auto animate-in fade-in">
                    Ý nghĩa từ cần tìm: <span className="font-bold text-slate-700">{card?.meaning}</span>
                  </p>
                )}

                {/* Hint của câu nếu có */}
                {card?.hint && (
                  <div className="flex justify-center pt-2">
                    {showHint ? (
                      <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-sm">
                        <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="text-sm font-bold text-slate-700 leading-tight">
                          {card.hint}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="group flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 rounded-xl transition-all duration-300"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                        <span className="text-[10px] font-black text-slate-400 group-hover:text-indigo-600 uppercase tracking-widest">
                          Cần gợi ý
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {isAudioMode && gameState === "playing" && (
                  <div className="flex justify-center gap-3 pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speakWord(card?.word);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-indigo-600 font-bold transition-all shadow-sm active:scale-95 text-xs md:text-sm"
                    >
                      <Volume2 className="w-4 h-4 animate-pulse" />
                      Nghe lại
                    </button>

                    {!wordRevealed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setWordRevealed(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-bold transition-all shadow-sm active:scale-95 text-xs md:text-sm"
                      >
                        👁 Xem từ ẩn
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Interaction Layer */}
              <div className="space-y-6 relative">
                {/* Choice Interaction */}
                {activeTaskType === "choice" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Progress
                        </span>
                        <span className="text-sm font-black text-indigo-600">
                          {correctSelected.length} /{" "}
                          {
                            card.tasks.choice.options.filter(
                              (o) => o.is_correct,
                            ).length
                          }
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Attempts Left
                        </span>
                        <span
                          className={`text-sm font-black ${attemptsLeft === 1 ? "text-rose-500 animate-pulse" : "text-slate-600"}`}
                        >
                          {attemptsLeft}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {card.tasks.choice.options.map((opt, i) => {
                        const isWrong = wrongSelected.includes(opt.text);
                        const isCorrectFound = correctSelected.includes(
                          opt.text,
                        );

                        return (
                          <button
                            key={i}
                            disabled={
                              gameState === "feedback" ||
                              isWrong ||
                              isCorrectFound
                            }
                            onClick={() => handleChoiceToggle(opt.text)}
                            className={`group p-6 rounded-[1.5rem] border-2 transition-all text-left relative active:scale-98 ${isCorrectFound
                                ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                                : isWrong
                                  ? "bg-rose-50 border-rose-200 text-rose-300 cursor-not-allowed"
                                  : "bg-white border-slate-200 hover:border-indigo-300 text-slate-600"
                              }`}
                          >
                            <span className="text-lg font-bold">
                              {opt.text}
                            </span>
                            {isCorrectFound && (
                              <CheckCircle2 className="absolute top-4 right-4 w-5 h-5 text-emerald-500" />
                            )}
                            {isWrong && (
                              <X className="absolute top-4 right-4 w-5 h-5 text-rose-300" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Fill-in Interaction - Standard Style */}
                {activeTaskType === "fill" && (
                  <div
                    key={`${currentCardIdx}-fill`}
                    className="relative flex flex-col items-center gap-4 md:gap-6"
                  >
                    <div className="w-full flex items-center justify-between mb-2">
                      {/* Dynamic Hint on the left */}
                      <div className="flex items-center gap-2">
                        {dynamicHint && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100 animate-in fade-in slide-in-from-left-2 transition-all">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                              {dynamicHint}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tries counter on the right */}
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-50/50 rounded-full border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          SỐ LẦN THỬ
                        </span>
                        <span className="text-sm font-black text-slate-600">
                          {attemptsLeft}
                        </span>
                      </div>
                    </div>

                    <input
                      autoFocus
                      disabled={gameState === "feedback"}
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      placeholder={isAudioMode ? "Nhập từ bạn vừa nghe..." : "Dịch tại đây..."}
                      className={`w-full p-4 md:p-8 bg-slate-50 rounded-2xl md:rounded-[2rem] text-xl md:text-4xl font-black text-center outline-none border-2 transition-all ${gameState === "feedback"
                          ? isCorrect
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-rose-500 bg-rose-50 text-rose-700"
                          : isCorrect === false
                            ? "border-rose-500 bg-rose-50 animate-shake"
                            : "border-transparent focus:border-indigo-600 focus:bg-white text-slate-800"
                        }`}
                      value={userAnswer || ""}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleCheckAnswer()
                      }
                    />
                  </div>
                )}

                {/* Completion Interaction - OTP Style */}
                {activeTaskType === "complete" && (
                  <div
                    key={`${currentCardIdx}-complete`}
                    className="relative flex flex-col items-center gap-4 md:gap-6"
                  >
                    <div className="w-full flex items-center justify-between mb-2">
                      {/* Dynamic Hint on the left */}
                      <div className="flex items-center gap-2">
                        {dynamicHint && (
                          <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-100 animate-in fade-in slide-in-from-left-2 transition-all">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                              {dynamicHint}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Tries counter on the right */}
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-50/50 rounded-full border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          SỐ LẦN THỬ
                        </span>
                        <span className="text-sm font-black text-slate-600">
                          {attemptsLeft}
                        </span>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto pb-2 -mx-2 px-2">
                      <div className="flex flex-nowrap items-center justify-start md:justify-center gap-x-2 md:gap-x-3 text-2xl md:text-3xl font-black tracking-normal text-slate-300 min-w-max mx-auto">
                        {(() => {
                          const pattern =
                            card.tasks.complete?.patterns?.[activePatternIdx];
                          if (!pattern?.display_text) return null;

                          // Split on spaces so each "word" is a non-breaking unit
                          const wordSegments = pattern.display_text.split(" ");
                          const globalTotalBlanks = (pattern.display_text.match(/_/g) || []).length;
                          let globalBlankIdx = 0; // running index across ALL blanks
                          let charBoxIdx = 0;     // running index of input boxes

                          return wordSegments.map((segment, segIdx) => {
                            // Each segment may contain 0 or more "_" markers
                            const segParts = segment.split("_");
                            const segBlanksCount = segParts.length - 1;
                            // Capture blankIdx at start of this segment
                            const segStartBlankIdx = globalBlankIdx;
                            globalBlankIdx += segBlanksCount;

                            return (
                              <div key={segIdx} className="flex items-center flex-nowrap shrink-0">
                                {segParts.map((part, i) => (
                                  <div key={i} className="flex items-center flex-nowrap">
                                    {Array.from(part).map((char, charIdx) => (
                                      <div
                                        key={charIdx}
                                        className="px-0 min-w-0 h-10 md:w-12 md:h-14 flex items-center justify-center md:bg-white md:border-4 md:border-slate-100 md:rounded-2xl md:shadow-sm text-xl md:text-2xl font-black text-slate-800 border-b-2 border-transparent md:border-b-0 mx-[0.5px] md:mx-0.5 shrink-0"
                                      >
                                        {char}
                                      </div>
                                    ))}

                                    {i < segParts.length - 1 && (() => {
                                      // Determine which data blank(s) this "_" maps to
                                      const blankDataIdx = segStartBlankIdx + i;
                                      const blanksToRender =
                                        globalTotalBlanks === 1 && pattern.blanks.length > 1
                                          ? pattern.blanks          // single marker = all blanks grouped
                                          : [pattern.blanks[blankDataIdx] || ""];

                                      return (
                                        <div key={`blanks-${segIdx}-${i}`} className="flex gap-0.5 md:gap-1 shrink-0">
                                          {blanksToRender.flatMap((blk, bIdxInGroup) =>
                                            Array.from({ length: blk.length || 1 }).map((_, subIdx) => {
                                              const currentIdx = charBoxIdx;
                                              charBoxIdx++;
                                              return (
                                                <input
                                                  key={`${bIdxInGroup}-${subIdx}`}
                                                  id={`complete-input-${currentIdx}`}
                                                  autoFocus={currentIdx === 0}
                                                  disabled={gameState === "feedback"}
                                                  type="text"
                                                  maxLength={1}
                                                  spellCheck={false}
                                                  autoComplete="off"
                                                  autoCorrect="off"
                                                  autoCapitalize="off"
                                                  value={userAnswer[currentIdx] || ""}
                                                  onChange={(e) => {
                                                    const val = e.target.value.slice(-1);
                                                    const newAns = [...userAnswer];
                                                    newAns[currentIdx] = val;
                                                    setUserAnswer(newAns);
                                                    if (val && currentIdx < userAnswer.length - 1) {
                                                      document.getElementById(`complete-input-${currentIdx + 1}`)?.focus();
                                                    }
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === "Backspace" && !userAnswer[currentIdx] && currentIdx > 0) {
                                                      document.getElementById(`complete-input-${currentIdx - 1}`)?.focus();
                                                    }
                                                  }}
                                                  className={`w-[1.1ch] md:w-12 h-10 md:h-14 bg-transparent md:bg-slate-50 border-b-2 md:border-4 md:rounded-2xl mx-[0.5px] md:mx-0.5 text-xl md:text-2xl font-black text-center outline-none transition-all shrink-0 ${gameState === "feedback"
                                                      ? isCorrect
                                                        ? "border-emerald-500 md:bg-emerald-50 text-emerald-700"
                                                        : "border-rose-500 md:bg-rose-50 text-rose-700"
                                                      : isCorrect === false
                                                        ? "border-rose-500 md:bg-rose-50 animate-shake"
                                                        : "border-slate-200 md:border-slate-100 focus:border-indigo-600 md:focus:bg-white text-slate-800"
                                                    }`}
                                                  placeholder=""
                                                />
                                              );
                                            })
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ))}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* FINISHED STATE */}
                {gameState === "finished" &&
                  (() => {
                    const isPerfectScore =
                      userResults.length > 0 &&
                      userResults.every((res) => res.isCorrect);
                    return (
                      <div className="text-center py-10 space-y-8 animate-in fade-in zoom-in-95 duration-500">
                        {!showReview ? (
                          <>
                            {isPerfectScore ? (
                              <>
                                <div className="flex justify-center relative">
                                  <div className="absolute inset-0 bg-amber-400/10 rounded-full blur-3xl animate-pulse" />
                                  <div className="w-36 h-36 bg-gradient-to-tr from-amber-400 via-yellow-400 to-amber-500 text-white rounded-[2.5rem] flex items-center justify-center shadow-3xl shadow-amber-400/30 border-4 border-amber-300 animate-bounce duration-[2000ms] relative z-10">
                                    <Crown className="w-20 h-20 fill-current text-amber-950" />
                                    <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-yellow-300 animate-spin duration-[6s]" />
                                    <Star className="absolute -bottom-1 -left-2 w-6 h-6 text-yellow-300 animate-pulse" />
                                  </div>
                                </div>
                                <div className="relative z-10 space-y-3">
                                  <h2 className="text-5xl font-black text-amber-500 uppercase tracking-tight flex items-center justify-center gap-2">
                                    <Sparkles className="w-9 h-9 fill-current text-amber-400 animate-pulse" />
                                    PERFECT VICTORY
                                    <Sparkles className="w-9 h-9 fill-current text-amber-400 animate-pulse" />
                                  </h2>
                                  <p className="text-xl text-slate-600 font-bold max-w-lg mx-auto leading-relaxed">
                                    A truly flawless performance! You answered{" "}
                                    <span className="text-amber-500 font-black">
                                      100% correctly
                                    </span>
                                    , earned{" "}
                                    <span className="text-indigo-600 font-black">
                                      {score} points
                                    </span>
                                    , and completed the arena without a single
                                    mistake! You are an absolute Language
                                    Legend! 👑
                                  </p>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex justify-center">
                                  <div className="w-32 h-32 bg-emerald-500 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-emerald-200 rotate-6">
                                    <Trophy className="w-16 h-16" />
                                  </div>
                                </div>
                                <div>
                                  <h2 className="text-5xl font-black text-slate-800 mb-4">
                                    You Nailed It!
                                  </h2>
                                  <p className="text-xl text-slate-500 font-medium max-w-md mx-auto">
                                    {"Challenge complete. You've earned "}{" "}
                                    <span className="text-indigo-600 font-black">
                                      {score} points
                                    </span>
                                    .
                                  </p>
                                </div>
                              </>
                            )}
                            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                              <button
                                onClick={() => navigate("/flashcards")}
                                className="px-10 py-5 bg-slate-900 text-white font-black rounded-2xl shadow-2xl shadow-slate-200 hover:bg-black transition-all"
                              >
                                BACK TO LIST
                              </button>
                              <button
                                onClick={() => setShowReview(true)}
                                className="px-10 py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                              >
                                <History className="w-5 h-5" /> XEM ĐÁP ÁN
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-6 text-left max-w-2xl mx-auto pb-12">
                            <div className="flex items-center justify-between sticky top-0 bg-white py-4 z-10 border-b border-slate-100">
                              <h3 className="text-2xl font-black text-slate-800">
                                Session Review
                              </h3>
                              <button
                                onClick={() => setShowReview(false)}
                                className="text-indigo-600 font-bold hover:underline"
                              >
                                Summary View
                              </button>
                            </div>
                            <div className="space-y-4">
                              {userResults.map((res, idx) => (
                                <div
                                  key={idx}
                                  className={`p-6 rounded-3xl border-2 ${res.isCorrect ? "border-emerald-50 bg-emerald-50/20" : "border-rose-50 bg-rose-50/20"} transition-all hover:scale-[1.01]`}
                                >
                                  <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex-1">
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Question
                                      </span>
                                      <h4 className="text-lg font-bold text-slate-800 leading-tight mt-1">
                                        {res.card.question}
                                      </h4>
                                    </div>
                                    <div
                                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${res.isCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
                                    >
                                      {res.isCorrect ? (
                                        <Check className="w-5 h-5" />
                                      ) : (
                                        <X className="w-5 h-5" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100/50">
                                    <div>
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Your Answer
                                      </span>
                                      <p
                                        className={`text-base font-black mt-0.5 ${res.isCorrect ? "text-emerald-600" : "text-rose-600"}`}
                                      >
                                        {res.userAnswer || (
                                          <span className="italic opacity-50">
                                            Timed out
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Correct Answer
                                      </span>
                                      <p className="text-base font-black text-slate-800 mt-0.5">
                                        {res.targetAnswer}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-4 flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-black uppercase">
                                      {res.taskType}
                                    </span>
                                    <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                                      Word: {res.card.word}
                                      <Volume2
                                        className="w-3.5 h-3.5 cursor-pointer text-indigo-500 hover:scale-110 active:scale-95 transition-all"
                                        onClick={() => speakWord(res.card.word)}
                                      />
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => navigate("/flashcards")}
                              className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl mt-8 hover:bg-black transition-all"
                            >
                              FINISH REVIEW
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
              </div>

            </div>

            {/* Progress Decorations */}
            <div className="absolute -bottom-2 -left-2 w-24 h-24 bg-indigo-50 rounded-full blur-3xl opacity-50" />
            <div className="absolute -top-2 -right-2 w-32 h-32 bg-amber-50 rounded-full blur-3xl opacity-50" />
          </div>

          {/* Action Footer */}
          <div className="mt-8 flex items-center justify-between gap-6 relative z-10">
            <button
              onClick={() => setShowHint(true)}
              disabled={gameState === "feedback" || !card.hint}
              className={`flex items-center gap-2 px-6 py-3 font-bold rounded-2xl transition-all ${showHint || gameState === "feedback" ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-white bg-transparent"}`}
            >
              <HelpCircle className="w-5 h-5" />
              {showHint ? card.hint || "Không có gợi ý" : "Cần gợi ý?"}
            </button>

            {gameState === "playing" ? (
              <button
                onClick={() => handleCheckAnswer()}
                className="px-10 py-4 bg-slate-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-slate-900/10 flex items-center gap-3 transition-all active:scale-95"
              >
                KIỂM TRA
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-200 flex items-center gap-3 transition-all active:scale-95 animate-bounce-horizontal"
              >
                {(currentCardIdx < (set?.cards?.length || 0) - 1)
                  ? "TIẾP THEO"
                  : "KẾT THÚC"}
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating Feedback Card — compact, always within viewport */}
      {gameState === "feedback" && (
        <div className="fixed bottom-4 md:bottom-auto md:top-20 right-3 md:right-6 left-3 md:left-auto md:w-[360px] z-[70] animate-in slide-in-from-bottom-8 md:slide-in-from-right-8 fade-in zoom-in-95 duration-400">
          <div
            className={`bg-white/96 backdrop-blur-xl rounded-2xl shadow-2xl border-2 transition-all flex flex-col relative overflow-hidden max-h-[88vh] overflow-y-auto ${isCorrect ? "border-emerald-200" : "border-rose-200"}`}
          >
            {/* Header */}
            <div className={`flex items-center gap-3 px-5 py-4 ${isCorrect ? "bg-emerald-50/80" : "bg-rose-50/80"}`}>
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md ${isCorrect ? "bg-emerald-500" : "bg-rose-500"}`}
              >
                {isCorrect ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-base font-black leading-none ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                  {isCorrect ? "Tuyệt vời! 🎉" : "Chưa chính xác"}
                </h4>
                <p className={`text-[9px] font-black uppercase tracking-widest mt-0.5 opacity-60 ${isCorrect ? "text-emerald-700" : "text-rose-700"}`}>
                  {isCorrect ? "+ ĐIỂM KINH NGHIỆM" : "HÃY GHI NHỚ LẦN SAU"}
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              {/* Word row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">TỪ VỰNG</span>
                  <h2 className="text-2xl font-black text-slate-800 leading-tight truncate">{card.word}</h2>
                </div>
                <button
                  onClick={() => speakWord(card.word)}
                  className="shrink-0 p-2 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-indigo-500 transition-colors"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>

              {/* Meaning */}
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Ý NGHĨA</span>
                <p className="text-sm font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 leading-snug">
                  {card.meaning}
                </p>
              </div>

              {/* Correct answer (only on wrong) */}
              {!isCorrect && (
                <div className="px-3 py-2.5 bg-rose-50 rounded-xl border border-rose-100">
                  <span className="text-[9px] font-black uppercase tracking-widest text-rose-500 block mb-0.5">ĐÁP ÁN ĐÚNG</span>
                  <p className="text-base font-black text-rose-700 break-words leading-snug">
                    {userResults[userResults.length - 1]?.targetAnswer ||
                      (() => {
                        if (activeTaskType === "choice")
                          return card.tasks.choice?.options?.find((o) => o.is_correct)?.text;
                        if (activeTaskType === "fill")
                          return card.tasks.fill?.answers?.[0];
                        if (activeTaskType === "complete")
                          return card.tasks.complete?.patterns?.[activePatternIdx]?.blanks?.join("");
                      })()}
                  </p>
                </div>
              )}

              {/* Feedback note */}
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                <Brain className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 font-medium leading-snug">
                  {isCorrect
                    ? card.feedback_correct || "Bạn đang làm rất tốt! Tiếp tục nhé."
                    : card.feedback_incorrect || "Sai lầm là mẹ thành công!"}
                </p>
              </div>
            </div>

            {/* Footer button */}
            <div className="px-5 pb-4">
              <button
                onClick={handleNext}
                className={`w-full py-3.5 rounded-xl font-black uppercase tracking-wide text-sm transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md ${isCorrect
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200"
                    : "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200"
                  }`}
              >
                {currentCardIdx < set.cards.length - 1 ? "Từ Tiếp Theo" : "Hoàn thành"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Subtle glow */}
            <div
              className={`absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-[80px] opacity-20 pointer-events-none ${isCorrect ? "bg-emerald-400" : "bg-rose-400"}`}
            />
          </div>
        </div>
      )}

      {/* HUD Backdrop */}
      <div className="fixed inset-0 bg-slate-50 -z-10" />

      {/* Premium Exit Confirmation Modal */}
      {showExitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 mx-auto mb-6 shadow-lg shadow-rose-100/50 rotate-3">
              <AlertCircle className="w-10 h-10 animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">
              Thoát khỏi thử thách?
            </h3>
            <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed">
              Tiến trình làm bài hiện tại sẽ bị mất và không được ghi nhận. Bạn
              có chắc chắn muốn thoát không?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowExitModal(false)}
                className="flex-1 py-4 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-black rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-wider"
              >
                Tiếp tục học
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  navigate("/flashcards");
                }}
                className="flex-1 py-4 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl transition-all shadow-lg shadow-rose-100 active:scale-95 text-xs uppercase tracking-wider"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All-Mastered Celebration Modal */}
      {showMasteredModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl border border-amber-100 text-center animate-in zoom-in-95 duration-300">
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-amber-200/50 rotate-3"
              style={{
                background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              }}
            >
              <Crown className="w-12 h-12 text-white drop-shadow" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-[0.65rem] font-black uppercase tracking-widest mb-4">
              <Sparkles className="w-3 h-3" />
              Tinh thông hoàn toàn
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">
              Bạn đã thông thạo bộ thẻ này!
            </h3>
            <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed">
              Bạn đã học thuộc tất cả các từ trong bộ flashcard này. Bạn có muốn
              ôn lại lần nữa để củng cố thêm không?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowMasteredModal(false);
                  navigate("/flashcards");
                }}
                className="flex-1 py-4 border-2 border-slate-200 hover:border-slate-300 text-slate-600 font-black rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-wider"
              >
                Quay lại
              </button>
              <button
                onClick={() => {
                  setShowMasteredModal(false);
                  startChallenge(true);
                }}
                className="flex-1 py-4 text-white font-black rounded-2xl transition-all shadow-lg active:scale-95 text-xs uppercase tracking-wider"
                style={{
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                }}
              >
                Ôn lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Error Alert Modal */}
      {errorModal.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-500 mx-auto mb-6 shadow-lg shadow-amber-100/50 -rotate-3">
              <Zap className="w-10 h-10 fill-current animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">
              Thông báo hệ thống
            </h3>
            <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed">
              {errorModal.message}
            </p>
            <button
              onClick={() => {
                const back = errorModal.navigateBack;
                setErrorModal({
                  show: false,
                  message: "",
                  navigateBack: false,
                });
                if (back) navigate("/flashcards");
              }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-100 active:scale-95 text-xs uppercase tracking-wider"
            >
              {errorModal.navigateBack ? "Quay lại danh sách" : "Đã hiểu"}
            </button>
          </div>
        </div>
      )}

      {/* ACHIEVEMENT TOASTS STACK */}
      <div
        className="fixed z-[60] pointer-events-none 
        top-1 left-0 right-0 px-4 
        grid grid-cols-1 items-center /* Mobile: Grid for overlap/non-stack */
        md:flex md:flex-col md:gap-2 md:items-end md:top-24 md:right-6 md:left-auto md:w-auto md:max-w-sm /* Desktop: Flex for stack */
      "
      >
        {achievementToasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto col-start-1 row-start-1 bg-white/95 backdrop-blur-xl border-2 shadow-2xl flex items-center gap-3 md:gap-4 animate-in slide-in-from-top-4 md:slide-in-from-right-10 duration-500 overflow-hidden
              ${toast.type === "mastered"
                ? "border-emerald-100"
                : toast.type === "first_encounter"
                  ? "border-indigo-100"
                  : toast.type === "first_fill"
                    ? "border-purple-100"
                    : toast.type === "unlocked"
                      ? "border-emerald-100"
                      : "border-amber-100"
              }
              rounded-2xl md:rounded-3xl p-3 md:p-5 w-full max-w-[320px] md:max-w-sm
            `}
          >
            {/* Icon Section */}
            <div
              className={`shrink-0 flex items-center justify-center shadow-lg
              ${toast.type === "mastered"
                  ? "w-10 h-10 md:w-12 md:h-12 bg-emerald-50 text-emerald-500 rounded-xl md:rounded-2xl animate-bounce"
                  : toast.type === "first_encounter"
                    ? "w-10 h-10 md:w-12 md:h-12 bg-indigo-50 text-indigo-500 rounded-xl md:rounded-2xl"
                    : toast.type === "first_fill"
                      ? "w-10 h-10 md:w-12 md:h-12 bg-purple-50 text-purple-500 rounded-xl md:rounded-2xl"
                      : toast.type === "unlocked"
                        ? "w-10 h-10 md:w-12 md:h-12 bg-emerald-50 text-emerald-500 rounded-xl md:rounded-2xl animate-pulse"
                        : `w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl ${toast.bonusType === "mastery" ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"}`
                }
            `}
            >
              {toast.type === "bonus" ? (
                toast.bonusType === "mastery" ? (
                  <Crown className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                ) : (
                  <Trophy className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                )
              ) : toast.type === "mastered" ? (
                <Award className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              ) : toast.type === "first_fill" ? (
                <Award className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              ) : (
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              )}
            </div>

            {/* Content Section */}
            <div className="flex-1 min-w-0">
              <span
                className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest block mb-0.5
                ${toast.type === "mastered"
                    ? "text-emerald-600"
                    : toast.type === "first_encounter"
                      ? "text-indigo-600"
                      : toast.type === "first_fill"
                        ? "text-purple-600"
                        : toast.type === "unlocked"
                          ? "text-emerald-600 animate-pulse"
                          : "text-amber-600"
                  }
              `}
              >
                {toast.type === "mastered"
                  ? "ĐÃ THÔNG THẠO!"
                  : toast.type === "unlocked"
                    ? "MỞ KHÓA TỪ MỚI!"
                    : toast.type === "bonus"
                      ? "PHẦN THƯỞNG XP!"
                      : "THÀNH TỰU!"}
              </span>

              <h4 className="text-sm md:text-base font-black text-slate-800 truncate leading-none mb-1">
                {toast.title || toast.word || "Achievement Unlocked"}
              </h4>

              <p
                className={`font-bold truncate leading-tight
                ${toast.type === "bonus" ? "text-xs md:text-sm text-indigo-600" : "text-[10px] md:text-xs text-slate-500"}
              `}
              >
                {toast.type === "bonus"
                  ? `+${toast.xp} XP`
                  : toast.type === "unlocked"
                    ? toast.meaning
                    : toast.type === "mastered"
                      ? toast.meaning
                      : toast.type === "first_encounter"
                        ? `Từ vựng: ${toast.word}`
                        : `Đã viết đúng: ${toast.word}`}
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() =>
                setAchievementToasts((prev) =>
                  prev.filter((t) => t.id !== toast.id),
                )
              }
              className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors bg-transparent border-none shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Anonymous Play Word Limit Reached Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6 z-50 animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mx-auto mb-6 shadow-lg shadow-indigo-100/50 rotate-3">
              <Brain className="w-10 h-10 animate-pulse" />
            </div>
            <h3 className="text-2xl font-black text-slate-800 mb-3">
              Đạt giới hạn nháp
            </h3>
            <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed">
              Bạn đã ôn tập nháp 100 từ ở chế độ khách. Vui lòng đăng nhập để
              lưu trữ thông tin học tập lâu dài và mở khóa không giới hạn từ
              vựng, hoặc xóa nháp để tiếp tục!
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowLimitModal(false);
                  navigate(`/login?redirect=/flashcards/play/${id}`);
                }}
                className="w-full py-4.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-100 active:scale-95 text-xs uppercase tracking-widest cursor-pointer"
              >
                Đăng nhập ngay
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("anonymous_played_words");
                  } catch (e) {
                    console.error(e);
                  }
                  setShowLimitModal(false);
                }}
                className="w-full py-4 border-2 border-slate-200 hover:border-rose-100 hover:text-rose-600 text-slate-600 font-black rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-widest bg-white cursor-pointer"
              >
                Xóa lịch sử nháp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
