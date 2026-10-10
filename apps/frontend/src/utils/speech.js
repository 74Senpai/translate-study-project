/**
 * Mobile-aware speech synthesis utility.
 * Handles iOS/Android quirks for reliable TTS playback across all devices.
 *
 * Key issues solved:
 * - iOS: speechSynthesis pauses after screen dims / app backgrounds → call resume() before speak
 * - Android: getVoices() returns [] on first call → async voiceschanged listener
 * - All: voice cache to avoid repeated getVoices() lookups
 */

// ─── Device Detection ───────────────────────────────────────────────────────
const _ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const _isIOS = /iPad|iPhone|iPod/.test(_ua) && !window.MSStream;
const _isAndroid = /Android/.test(_ua);

// ─── Settings Helper ─────────────────────────────────────────────────────────
function getAppSettings() {
  try {
    const saved = localStorage.getItem("app_settings");
    return saved
      ? JSON.parse(saved)
      : { voiceSpeed: 1, voicePitch: 1, voiceId: null };
  } catch {
    return { voiceSpeed: 1, voicePitch: 1, voiceId: null };
  }
}

/**
 * Get available system voices.
 * @returns {SpeechSynthesisVoice[]}
 */
export function getVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

// ─── Voice Cache ─────────────────────────────────────────────────────────────
/** @type {SpeechSynthesisVoice | null} */
let _cachedVoice = null;
let _cachedLang = null;

/**
 * Choose the best available voice for a given language with platform preference.
 * @param {string} lang  BCP-47 language tag, e.g. "en-US"
 * @returns {SpeechSynthesisVoice | null}
 */
function selectBestVoice(lang) {
  // Return cached result if same lang was queried before
  if (_cachedVoice && _cachedLang === lang) return _cachedVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const settings = getAppSettings();
  if (settings.voiceId) {
    const userVoice = voices.find((v) => v.voiceURI === settings.voiceId);
    if (userVoice && (userVoice.lang.startsWith(lang.split("-")[0]) || !lang)) {
      _cachedVoice = userVoice;
      _cachedLang = lang;
      return userVoice;
    }
  }

  const norm = (s) => s.toLowerCase().replace("_", "-");
  const langPrefix = norm(lang).split("-")[0];

  const matching = voices.filter(
    (v) => norm(v.lang) === norm(lang) || norm(v.lang).startsWith(langPrefix),
  );

  let selected = null;

  if (_isIOS) {
    // iOS voices: Siri voices are best, then Samantha, then any en-US
    selected =
      matching.find((v) => v.name.includes("Siri")) ||
      matching.find((v) => v.name.includes("Samantha")) ||
      matching[0] ||
      voices.find((v) => norm(v.lang).startsWith(langPrefix));
  } else if (_isAndroid) {
    // Android: Google voices use neural TTS — strongly prefer them
    selected =
      matching.find((v) => v.name === "Google US English") ||
      matching.find((v) => v.name.toLowerCase().includes("google")) ||
      matching[0] ||
      voices.find((v) => norm(v.lang).startsWith(langPrefix));
  } else {
    // Desktop: prefer premium / network voices
    selected =
      matching.find(
        (v) =>
          v.name.includes("Google US English") ||
          v.name.includes("Samantha") ||
          v.name.includes("Natural") ||
          v.name.includes("Enhanced"),
      ) ||
      matching[0] ||
      voices.find((v) => norm(v.lang).startsWith(langPrefix));
  }

  if (selected) {
    _cachedVoice = selected;
    _cachedLang = lang;
  }
  return selected;
}

/**
 * Speak a word using the Web Speech API with full mobile compatibility.
 *
 * @param {string} word   - The word/phrase to speak
 * @param {string} [lang] - BCP-47 language tag (default "en-US")
 */
export function speakWord(word, lang = "en-US") {
  if (!window.speechSynthesis || !word?.trim()) return;

  try {
    /**
     * iOS Bug: After the app backgrounds, screen dims, or after a long silence,
     * speechSynthesis silently pauses. Calling resume() before cancel()+speak()
     * brings it back to a working state.
     */
    if (_isIOS) {
      window.speechSynthesis.resume();
    }

    window.speechSynthesis.cancel();

    const settings = getAppSettings();
    const utt = new SpeechSynthesisUtterance(word.trim());
    utt.lang = lang;
    utt.rate = settings.voiceSpeed * (_isIOS ? 0.9 : 0.85);
    utt.pitch = settings.voicePitch;
    utt.volume = 1.0;

    const doSpeak = () => {
      const voice = selectBestVoice(lang);
      if (voice) utt.voice = voice;
      window.speechSynthesis.speak(utt);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Voices already cached in browser — speak immediately
      doSpeak();
    } else {
      /**
       * Android & some iOS builds: getVoices() returns [] on the first call.
       * We must wait for "voiceschanged" event. Add a 400ms timeout fallback
       * to avoid permanent silence if the event never fires.
       */
      let spoken = false;

      const onVoicesChanged = () => {
        if (spoken) return;
        spoken = true;
        window.speechSynthesis.removeEventListener(
          "voiceschanged",
          onVoicesChanged,
        );
        // Invalidate cache so we pick up the freshly loaded voices
        _cachedVoice = null;
        _cachedLang = null;
        doSpeak();
      };

      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);

      setTimeout(() => {
        if (!spoken) {
          spoken = true;
          window.speechSynthesis.removeEventListener(
            "voiceschanged",
            onVoicesChanged,
          );
          // Speak without selecting a specific voice as last resort
          window.speechSynthesis.speak(utt);
        }
      }, 400);
    }
  } catch (err) {
    console.warn("speakWord failed:", err);
  }
}
