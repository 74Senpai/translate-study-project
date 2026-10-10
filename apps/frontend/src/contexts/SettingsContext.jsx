import { createContext, useContext, useState, useEffect } from "react";

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("app_settings");
      return saved
        ? JSON.parse(saved)
        : {
            voiceId: null,
            voiceSpeed: 1,
            voicePitch: 1,
          };
    } catch {
      return {
        voiceId: null,
        voiceSpeed: 1,
        voicePitch: 1,
      };
    }
  });

  const [localProficiency, setLocalProficiency] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("app_local_proficiency") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("app_settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(
      "app_local_proficiency",
      JSON.stringify(localProficiency),
    );
  }, [localProficiency]);

  const updateSettings = (newSettings) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const addLocalResult = (word, meaning, taskType, isCorrect) => {
    const w = word.toLowerCase().trim();
    setLocalProficiency((prev) => {
      const current = prev[w] || {
        word: w,
        meaning: meaning || "",
        proficiency: 0,
        attempts: 0,
        correct_choice: 0,
        correct_fill: 0,
        correct_complete: 0,
        incorrect_choice: 0,
        incorrect_fill: 0,
        incorrect_complete: 0,
        consecutive_correct: 0,
        consecutive_wrong: 0,
        consecutive_has_fill: false,
        last_attempt_at: new Date().toISOString(),
      };

      const updated = {
        ...current,
        attempts: current.attempts + 1,
        last_attempt_at: new Date().toISOString(),
      };

      const task = taskType.toLowerCase();
      const MASTERY_THRESHOLD = 20;
      const PROFICIENCY_FLOOR = -10;

      if (isCorrect) {
        updated.consecutive_wrong = 0;
        updated.consecutive_correct = (current.consecutive_correct || 0) + 1;

        if (task.includes("fill")) {
          updated.consecutive_has_fill = true;
          updated.correct_fill++;
          updated.proficiency += 5;
        } else if (task.includes("complete")) {
          updated.correct_complete++;
          updated.proficiency += 3;
        } else {
          updated.correct_choice++;
          updated.proficiency += 2;
        }

        // Streak Mastery Condition: 3 consecutive correct AND at least 1 was a FILL
        if (updated.consecutive_correct >= 3 && updated.consecutive_has_fill && updated.proficiency < MASTERY_THRESHOLD) {
          updated.proficiency = MASTERY_THRESHOLD;
        }
      } else {
        updated.consecutive_correct = 0;
        updated.consecutive_has_fill = false;
        updated.consecutive_wrong = (current.consecutive_wrong || 0) + 1;

        // If proficiency >= 20, reset to 19 first
        if (updated.proficiency >= MASTERY_THRESHOLD) {
          updated.proficiency = MASTERY_THRESHOLD - 1;
        }

        // Dynamic penalty based on consecutive wrong count
        let penalty = 2;
        if (updated.consecutive_wrong === 1) {
          penalty = 3;
        } else if (updated.consecutive_wrong === 2) {
          penalty = 2;
        } else if (updated.proficiency < 0) {
          penalty = 1;
        }

        updated.proficiency -= penalty
        updated.proficiency = Math.max(PROFICIENCY_FLOOR, updated.proficiency);

        if (task.includes("fill")) updated.incorrect_fill++;
        else if (task.includes("complete")) updated.incorrect_complete++;
        else updated.incorrect_choice++;
      }

      updated.mastered = updated.proficiency >= MASTERY_THRESHOLD;

      return { ...prev, [w]: updated };
    });
  };

  const syncLocalData = async (axiosInstance) => {
    const items = Object.values(localProficiency);
    if (items.length === 0) return;

    try {
      await axiosInstance.post("/flashcards/sync-progress", { items });
      setLocalProficiency({});
      localStorage.removeItem("app_local_proficiency");
      return items.length;
    } catch (e) {
      console.error("Failed to sync local data:", e);
      throw e;
    }
  };

  const removeLocalWord = (word) => {
    const updatedProf = { ...localProficiency };
    delete updatedProf[word.toLowerCase().trim()];
    setLocalProficiency(updatedProf);
  };

  const clearLocalWords = () => {
    setLocalProficiency({});
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        localProficiency,
        addLocalResult,
        syncLocalData,
        removeLocalWord,
        clearLocalWords,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
