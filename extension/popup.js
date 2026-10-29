const popupParams = new URLSearchParams(window.location.search);
const isPinnedView =
  popupParams.get("view") === "sidepanel" ||
  popupParams.get("pinned") === "true";
const VIETNAMESE_REGEX = CONFIG.VIETNAMESE_REGEX;
const port = isPinnedView
  ? chrome.runtime.connect({ name: "popup_connection" })
  : null;

const STORAGE_KEYS = {
  enabled: "isEnabled",
  mode: "extensionMode",
  sharedInput: "sharedInputText",
  savedInput: "savedInput",
  savedData: "savedData",
  savedMode: "savedMode",
  pendingData: "pendingData",
  zoom: "appZoom",
  viewMode: "viewModeState",
  sharedState: "sharedViewState",
  disabledPos: "disabledPosTypes",
  translationOptions: "translation_options",
};

const TEXT = {
  inputViEn: "NHẬP TIẾNG VIỆT",
  inputEnVi: "NHẬP TIẾNG ANH",
  resultViEn: "KẾT QUẢ TIẾNG ANH",
  resultEnVi: "PHÂN TÍCH TIẾNG ANH",
  errorEnVi: "Bạn đang ở chế độ Anh-Việt. Hãy nhập tiếng Anh.",
  errorViEn: "Bạn đang ở chế độ Việt-Anh. Hãy nhập tiếng Việt.",
  errorServer:
    "Không thể kết nối đến máy chủ. Hãy kiểm tra kết nối mạng hoặc thử lại sau.",
  errorOfflineViEn:
    "Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối mạng và thử lại.",
  errorOfflineEnVi:
    "Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối mạng và thử lại.",
  copyViEn: "SAO CHÉP",
  copyEnVi: "SAO CHÉP",
  copiedViEn: "ĐÃ CHÉP!",
  copiedEnVi: "ĐÃ CHÉP!",
};

document.addEventListener("DOMContentLoaded", () => {
  let currentRevision = 0;
  let debounceTimer = null;
  let isComposing = false;
  let lastData = null;
  let lastRenderedSignature = "";
  let lastRequestKey = "";

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
      request.action === "selection_changed" &&
      typeof request.text === "string"
    ) {
      chrome.storage.local.set({ [STORAGE_KEYS.sharedInput]: request.text });
      sendResponse({ received: true });
      return true;
    }

    if (request.action === "auth_state_changed") {
      updateAuthUi(request.loggedIn, request.displayName, request.avatarUrl);
      sendResponse({ received: true });
      return true;
    }

    return false;
  });

  let currentZoom = 1;
  let viewMode = "full";
  let currentFontSize = "1.2rem";
  let isInitialLoad = true;
  let lastSharedStateAt = 0;
  let disabledPosTypes = new Set();
  let quickTranslationSucceeded = false;

  // Translation feature options
  const DEFAULT_OPTIONS = {
    analysis: true,
    vocab: true,
    typo: true,
    quick_translate: true,
  };
  let translationOptions = { ...DEFAULT_OPTIONS };
  let isUserLoggedIn = false;

  const toggleSwitch = document.getElementById("toggle-translate");
  const modeViEn = document.getElementById("mode-vi-en");
  const modeEnVi = document.getElementById("mode-en-vi");
  const inputLabel = document.getElementById("input-label");
  const resultLabel = document.getElementById("result-label");
  const inputText = document.getElementById("input-text");
  const clearBtn = document.getElementById("clear-btn");
  const loadingLine = document.getElementById("loading-line");
  const resultSection = document.getElementById("result-section");
  const analysisContainer = document.getElementById("analysis-container");
  const posLegend = document.getElementById("pos-legend");
  const interactiveSentence = document.getElementById("interactive-sentence");
  const translatedText = document.getElementById("translated-text");
  const errorMessage = document.getElementById("error-message");
  const zoomInBtn = document.getElementById("zoom-in");
  const zoomOutBtn = document.getElementById("zoom-out");
  const pinBtn = document.getElementById("pin-btn");
  const viewModeSelect = document.getElementById("view-mode-select");
  const loginBtn = document.getElementById("login-btn");
  const userInfo = document.getElementById("user-info");
  const usernameSpan = document.getElementById("username");
  const avatarBtn = document.getElementById("avatar-btn");
  const userDropdown = document.getElementById("user-dropdown");
  const settingsBtn = document.getElementById("settings-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const profileBtn = document.getElementById("profile-btn");
  const savedWordsBtn = document.getElementById("saved-words-btn");
  const copyBtn = document.getElementById("copy-btn");
  const promoBanner = document.getElementById("promo-banner");

  // Options panel elements
  const optionsToggleBtn = document.getElementById("options-toggle-btn");
  const optionsPanel = document.getElementById("options-panel");
  const optionsCloseBtn = document.getElementById("options-close-btn");
  const optAnalysis = document.getElementById("opt-analysis");
  const optVocab = document.getElementById("opt-vocab");
  const optTypo = document.getElementById("opt-typo");
  const optQuickTranslate = document.getElementById("opt-quick-translate");
  const vocabAuthBadge = document.getElementById("vocab-auth-badge");
  const rowOptVocab = document.getElementById("row-opt-vocab");

  let mode = "en-vi";

  const posColors = {
    Noun: "#3b82f6",
    Verb: "#ef4444",
    Adjective: "#10b981",
    Pronoun: "#a855f7",
    Adverb: "#f97316",
    Article: "#f59e0b",
    Preposition: "#ec4899",
    Punctuation: "#9ca3af",
  };

  const mapSpacyPos = (spacyPos) => {
    const mapping = {
      NOUN: "Noun",
      PROPN: "Noun",
      VERB: "Verb",
      AUX: "Verb",
      ADJ: "Adjective",
      PRON: "Pronoun",
      ADV: "Adverb",
      DET: "Article",
      ADP: "Preposition",
      PUNCT: "Punctuation",
    };

    return mapping[spacyPos] || "Noun";
  };

  function normalizeText(text) {
    return (text || "").trim();
  }

  function buildRequestKey(text, nextMode = mode) {
    return `${nextMode}::${normalizeText(text)}`;
  }

  function buildDataSignature(data) {
    if (!data) return "";

    return JSON.stringify({
      original_text: data.original_text || "",
      translated_text: data.translated_text || "",
      english_analysis: data.english_analysis || "",
      pos_tags: (data.pos_tags || []).map((item) =>
        [item.text, item.pos, item.tag, item.meaning].join("|"),
      ),
    });
  }

  function dataMatchesInput(data, text) {
    return normalizeText(data && data.original_text) === normalizeText(text);
  }

  function persistState() {
    chrome.storage.local.set({
      [STORAGE_KEYS.savedInput]: inputText.value,
      [STORAGE_KEYS.savedData]: lastData,
      [STORAGE_KEYS.savedMode]: mode,
    });
  }

  function syncSharedInput(text) {
    chrome.storage.local.set({ [STORAGE_KEYS.sharedInput]: text });
  }
  function broadcastSharedState(nextText = inputText.value, nextMode = mode) {
    const payload = {
      text: nextText,
      mode: nextMode,
      updatedAt: Date.now(),
    };

    lastSharedStateAt = payload.updatedAt;
    chrome.storage.local.set({
      [STORAGE_KEYS.mode]: nextMode,
      [STORAGE_KEYS.savedMode]: nextMode,
      [STORAGE_KEYS.sharedInput]: nextText,
      [STORAGE_KEYS.sharedState]: payload,
    });
  }

  function setModeUi(nextMode) {
    mode = nextMode;

    if (mode === "vi-en") {
      modeViEn.classList.add("active");
      modeEnVi.classList.remove("active");
      inputLabel.textContent = TEXT.inputViEn;
      resultLabel.textContent = TEXT.resultViEn;
      copyBtn.textContent = TEXT.copyViEn;
      return;
    }

    modeEnVi.classList.add("active");
    modeViEn.classList.remove("active");
    inputLabel.textContent = TEXT.inputEnVi;
    resultLabel.textContent = TEXT.resultEnVi;
    copyBtn.textContent = TEXT.copyEnVi;
  }

  function applyMode(nextMode, options = {}) {
    const { persist = true, retranslate = false } = options;

    if (nextMode !== "vi-en" && nextMode !== "en-vi") return;

    setModeUi(nextMode);

    if (persist) {
      chrome.storage.local.set({
        [STORAGE_KEYS.mode]: mode,
        [STORAGE_KEYS.savedMode]: mode,
      });
    }

    persistState();

    if (retranslate && normalizeText(inputText.value)) {
      inputText.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function showError(message) {
    loadingLine.classList.remove("show");
    resultSection.classList.remove("loading-translation");
    resultSection.classList.remove("loading-analysis");
    resultSection.classList.remove("loading-full");
    errorMessage.textContent = message;
    errorMessage.style.display = "block";

    resultSection.classList.remove("visible");
    setTimeout(() => {
      if (!resultSection.classList.contains("visible")) {
        resultSection.style.display = "none";
        loadingLine.style.display = "none";
      }
    }, 500);
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.style.display = "none";
  }

  function showSoftWarning(message) {
    // Non-blocking warning - keeps existing result visible
    errorMessage.textContent = "⚠️ " + message;
    errorMessage.style.display = "block";
    errorMessage.style.color = "var(--text-light)";
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (errorMessage.textContent.includes(message)) {
        errorMessage.style.display = "none";
        errorMessage.style.color = "";
      }
    }, 5000);
  }

  function applyViewMode() {
    if (viewMode === "compact") {
      analysisContainer.style.display = "none";
    } else {
      analysisContainer.style.display = "block";
    }

    autoResizeTextarea();
  }

  function autoResizeTextarea() {
    const textLength = inputText.value.length;

    if (isInitialLoad) {
      if (textLength > 150) currentFontSize = "0.9rem";
      else if (textLength > 60) currentFontSize = "1rem";
      else currentFontSize = "1.2rem";
    } else {
      if (currentFontSize === "1.2rem" && textLength > 65) {
        currentFontSize = "1rem";
      } else if (currentFontSize === "1rem" && textLength < 50) {
        currentFontSize = "1.2rem";
      } else if (currentFontSize === "1rem" && textLength > 160) {
        currentFontSize = "0.9rem";
      } else if (currentFontSize === "0.9rem" && textLength < 140) {
        currentFontSize = "1rem";
      }
    }

    inputText.style.setProperty("--dynamic-font-size", currentFontSize);

    // Optimized resize: only change if necessary, preventing scroll jumpiness
    const scrollTop =
      document.body.scrollTop || document.documentElement.scrollTop;
    inputText.style.height = "auto";
    const newHeight = Math.max(80, inputText.scrollHeight + 5);
    inputText.style.height = `${newHeight}px`;
    document.body.scrollTop = scrollTop;
    document.documentElement.scrollTop = scrollTop;
  }

  function adjustTooltipPosition(tokenEl, tooltipEl) {
    tooltipEl.style.left = "50%";
    tooltipEl.style.transform = "translateX(-50%) translateY(0)";

    const container = interactiveSentence;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const tokenRect = tokenEl.getBoundingClientRect();

    const tokenCenter = tokenRect.left + tokenRect.width / 2;
    const containerLeft = containerRect.left;
    const containerRight = containerRect.right;

    // Measure the actual width of the tooltip element dynamically to handle content length, fonts, and zooms
    const tooltipWidth = tooltipEl.getBoundingClientRect().width || 200;
    const halfWidth = tooltipWidth / 2;

    const leftDiff = tokenCenter - containerLeft;
    const rightDiff = containerRight - tokenCenter;

    if (leftDiff < halfWidth) {
      const shift = halfWidth - leftDiff + 8;
      tooltipEl.style.left = `calc(50% + ${shift}px)`;
    } else if (rightDiff < halfWidth) {
      const shift = halfWidth - rightDiff + 8;
      tooltipEl.style.left = `calc(50% - ${shift}px)`;
    }
  }

  function renderResult(data) {
    lastData = data;
    lastRenderedSignature = buildDataSignature(data);
    lastRequestKey = buildRequestKey(data.original_text || "", mode);

    persistState();
    resultSection.style.display = "block";
    setTimeout(() => resultSection.classList.add("visible"), 10);
    clearError();
    loadingLine.style.display = "none";
    applyViewMode();
    autoResizeTextarea();

    translatedText.textContent = data.translated_text || "";
    posLegend.innerHTML = "";
    interactiveSentence.innerHTML = "";

    if (!data.pos_tags || data.pos_tags.length === 0) {
      return;
    }

    const uniquePos = [
      ...new Set(
        data.pos_tags
          .map((item) => mapSpacyPos(item.pos))
          .filter((pos) => pos !== "Punctuation"),
      ),
    ];

    uniquePos.forEach((pos) => {
      const pill = document.createElement("div");
      const isDisabled = disabledPosTypes.has(pos);
      pill.className = `pos-pill ${isDisabled ? "disabled" : ""}`;
      pill.textContent = pos;
      pill.style.backgroundColor = posColors[pos] || "#ccc";

      pill.addEventListener("click", (e) => {
        if (disabledPosTypes.has(pos)) {
          disabledPosTypes.delete(pos);
        } else {
          disabledPosTypes.add(pos);
        }
        chrome.storage.local.set({
          [STORAGE_KEYS.disabledPos]: Array.from(disabledPosTypes),
        });
        renderResult(data);
      });

      posLegend.appendChild(pill);
    });

    data.pos_tags.forEach((item) => {
      const textTrimmed = item.text.trim();
      const isPunct = item.pos === "PUNCT" || /^[\W_]+$/.test(textTrimmed);

      if (isPunct) {
        const punctSpan = document.createElement("span");
        punctSpan.textContent = `${item.text} `;
        punctSpan.style.color = "var(--text-light)";
        interactiveSentence.appendChild(punctSpan);
        return;
      }

      const posType = mapSpacyPos(item.pos);
      const isColorDisabled = disabledPosTypes.has(posType);
      const color = isColorDisabled
        ? "inherit"
        : posColors[posType] || "inherit";

      const wordWrap = document.createElement("span");
      const wordToken = document.createElement("span");

      wordWrap.className = "word-wrapper";
      wordToken.className = "word-token";
      wordToken.textContent = `${item.text} `;
      wordToken.style.color = color;

      if (!isColorDisabled) {
        // Click word to open user's website
        wordToken.addEventListener("click", () => {
          window.open(
            `${CONFIG.APP_URL}?pos=${posType.toLowerCase()}`,
            "_blank",
            "noopener,noreferrer",
          );
        });

        // Show meaning in an accessible tooltip
        const tooltip = document.createElement("div");
        tooltip.className = "word-detail-tooltip";
        tooltip.setAttribute("role", "tooltip");
        tooltip.id = `tooltip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        tooltip.textContent = item.meaning;

        wordToken.setAttribute("tabindex", "0");
        wordToken.setAttribute("role", "button");
        wordToken.setAttribute("aria-describedby", tooltip.id);

        // Toggle tooltip on click/tap
        wordToken.addEventListener("click", (e) => {
          e.stopPropagation();
          const isVisible = tooltip.classList.contains("visible");
          // Close all other open tooltips
          interactiveSentence
            .querySelectorAll(".word-detail-tooltip.visible")
            .forEach((t) => t.classList.remove("visible"));
          if (!isVisible) {
            adjustTooltipPosition(wordToken, tooltip);
            tooltip.classList.add("visible");
          }
        });

        // Adjust position on hover/focus to prevent overflow cut-off
        wordToken.addEventListener("mouseenter", () => {
          adjustTooltipPosition(wordToken, tooltip);
        });

        // Show on focus for keyboard users
        wordToken.addEventListener("focus", () => {
          adjustTooltipPosition(wordToken, tooltip);
          tooltip.classList.add("visible");
        });
        wordToken.addEventListener("blur", () =>
          tooltip.classList.remove("visible"),
        );

        wordWrap.appendChild(tooltip);

        // "+" save word button — appears on hover when user is logged in
        const saveBtn = document.createElement("button");
        saveBtn.className = "save-word-btn";
        saveBtn.title = "Lưu từ này";
        saveBtn.textContent = "+";
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          saveWordToServer(
            {
              word: item.text,
              meaning_vi: item.meaning || "",
              phonetic: item.phonetic || "",
              example_en: "",
              example_vi: "",
            },
            saveBtn,
          );
        });
        wordWrap.appendChild(saveBtn);
      }

      wordWrap.appendChild(wordToken);
      interactiveSentence.appendChild(wordWrap);
    });
  }

  function renderResultIfChanged(data) {
    const signature = buildDataSignature(data);

    if (!signature) return false;
    if (signature === lastRenderedSignature) {
      loadingLine.style.display = "none";
      clearError();
      return false;
    }

    // Prevent overwriting full data (with POS tags) with simple data (without POS tags) for same input
    const currentHasPos =
      lastData && lastData.pos_tags && lastData.pos_tags.length > 0;
    const incomingHasPos = data.pos_tags && data.pos_tags.length > 0;
    if (
      currentHasPos &&
      !incomingHasPos &&
      dataMatchesInput(lastData, inputText.value)
    ) {
      return false;
    }

    renderResult(data);
    return true;
  }

  function maybeRestoreCachedResult(data) {
    if (!data) return false;
    if (!dataMatchesInput(data, inputText.value)) return false;

    // Only restore if it's "full" data (has POS tags)
    // or if the text is very short (likely no POS tags anyway)
    const hasPos = data.pos_tags && data.pos_tags.length > 0;
    if (!hasPos && inputText.value.length > 5) return false;

    renderResultIfChanged(data);
    return true;
  }

  function requestTranslation(text, modeSnapshot, revision) {
    const requestKey = buildRequestKey(text, modeSnapshot);
    quickTranslationSucceeded = false;

    loadingLine.style.display = "block";

    // Only show translation loading state if we don't already have the matching translation text
    const hasMatchingTranslation =
      lastData && dataMatchesInput(lastData, text) && lastData.translated_text;
    if (!hasMatchingTranslation) {
      resultSection.classList.add("loading-translation");
    }
    resultSection.classList.add("loading-analysis");

    const needsFull = translationOptions.vocab !== false || translationOptions.analysis !== false;

    if (!needsFull) {
      // Chỉ cần dịch đơn giản (không cần vocab/analysis)
      chrome.runtime.sendMessage(
        {
          action: "translate",
          text,
          mode: modeSnapshot,
          quickOnly: true,
          options: translationOptions,
        },
        (response) => {
          if (revision !== currentRevision) return;
          if (requestKey !== buildRequestKey(inputText.value, mode)) return;

          loadingLine.classList.remove("show");
          resultSection.classList.remove("loading-translation");
          resultSection.classList.remove("loading-analysis");
          setTimeout(() => {
            if (!loadingLine.classList.contains("show"))
              loadingLine.style.display = "none";
          }, 500);

          if (response?.success && response.data) {
            lastRequestKey = requestKey;
            clearError();
            renderResultIfChanged(response.data);
          } else {
            showError(response?.error || TEXT.errorServer);
          }
        },
      );
      return;
    }

    // REQUEST QUICK (song song với full để tốc độ hiển thị tốt hơn)
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text,
        mode: modeSnapshot,
        full: false,
        quickOnly: true,
        options: { ...translationOptions, analysis: false, vocab: false },
      },
      (response) => {
        if (revision !== currentRevision) return;
        if (requestKey !== buildRequestKey(inputText.value, mode)) return;

        if (response?.success && response.data) {
          lastRequestKey = requestKey;
          quickTranslationSucceeded = true;
          clearError();
          renderResultIfChanged(response.data);
          // Translation returned! Remove loading-translation so copy button shows up immediately.
          resultSection.classList.remove("loading-translation");
        }
      },
    );

    // REQUEST FULL — dùng API thông minh để không bỏ sót từ mới
    chrome.runtime.sendMessage(
      {
        action: "translate",
        text,
        mode: modeSnapshot,
        full: true,
        options: translationOptions,
      },
      (fullResponse) => {
        if (revision !== currentRevision) return;
        if (requestKey !== buildRequestKey(inputText.value, mode)) return;

        loadingLine.classList.remove("show");
        resultSection.classList.remove("loading-translation");
        resultSection.classList.remove("loading-analysis");
        resultSection.classList.remove("loading-full");
        setTimeout(() => {
          if (!loadingLine.classList.contains("show"))
            loadingLine.style.display = "none";
        }, 500);

        if (fullResponse?.success && fullResponse.data) {
          renderResultIfChanged(fullResponse.data);
        } else {
          showError(fullResponse?.error || TEXT.errorServer);
        }
      },
    );
  }

  function runTranslationPipeline() {
    clearTimeout(debounceTimer);
    const revision = ++currentRevision;

    autoResizeTextarea();
    persistState();
    clearError();

    const text = normalizeText(inputText.value);
    const modeSnapshot = mode;

    if (!text) {
      loadingLine.style.display = "none";
      resultSection.style.display = "none";
      resultSection.classList.remove("loading-translation");
      resultSection.classList.remove("loading-analysis");
      resultSection.classList.remove("loading-full");
      lastData = null;
      lastRenderedSignature = "";
      lastRequestKey = "";
      persistState();
      return;
    }

    if (!navigator.onLine) {
      showError(
        mode === "vi-en" ? TEXT.errorOfflineViEn : TEXT.errorOfflineEnVi,
      );
      return;
    }

    const hasVietnamese = VIETNAMESE_REGEX.test(text);

    if (modeSnapshot === "en-vi" && hasVietnamese) {
      resultSection.classList.remove("loading-translation");
      resultSection.classList.remove("loading-analysis");
      resultSection.classList.remove("loading-full");
      showError(TEXT.errorEnVi);
      return;
    }

    debounceTimer = setTimeout(() => {
      if (revision !== currentRevision || !chrome.runtime?.id) return;
      if (text !== normalizeText(inputText.value) || modeSnapshot !== mode)
        return;

      // Hiển thị trạng thái loading sau khi người dùng ngừng gõ
      loadingLine.style.display = "block";
      setTimeout(() => loadingLine.classList.add("show"), 10);

      const hasFullData =
        lastData && lastData.pos_tags && lastData.pos_tags.length > 0;
      if (!hasFullData) {
        const hasMatchingTranslation =
          lastData &&
          dataMatchesInput(lastData, text) &&
          lastData.translated_text;
        if (!hasMatchingTranslation) {
          resultSection.classList.add("loading-translation");
        }
        resultSection.classList.add("loading-analysis");
        resultSection.style.display = "block";
      }

      // Sync to other windows only after debounce
      syncSharedInput(inputText.value);

      chrome.runtime.sendMessage(
        { action: "detect", text: text.substring(0, 100) },
        (response) => {
          if (revision !== currentRevision) return;
          if (text !== normalizeText(inputText.value) || modeSnapshot !== mode)
            return;

          let shouldBlock = false;

          if (response && response.languages && response.languages.length > 0) {
            const detectedLang = response.languages[0].language;
            const isReliable = response.isReliable;

            // Actually use language detection to validate mode
            if (
              modeSnapshot === "en-vi" &&
              detectedLang === "vi" &&
              isReliable
            ) {
              shouldBlock = true;
            } else if (
              modeSnapshot === "vi-en" &&
              detectedLang === "en" &&
              isReliable
            ) {
              shouldBlock = true;
            }
          }

          if (shouldBlock) {
            showError(
              modeSnapshot === "en-vi" ? TEXT.errorEnVi : TEXT.errorViEn,
            );
            return;
          }

          if (
            lastData &&
            dataMatchesInput(lastData, text) &&
            lastRequestKey === buildRequestKey(text, modeSnapshot)
          ) {
            // If we have data but no POS tags, we might want to upgrade to "full" translation
            // unless the text is too short to have POS analysis
            const hasPos = lastData.pos_tags && lastData.pos_tags.length > 0;
            if (hasPos || text.length < 3) {
              loadingLine.style.display = "none";
              clearError();
              resultSection.style.display = "block";
              return;
            }
          }

          clearError();
          loadingLine.style.display = "block";
          requestTranslation(text, modeSnapshot, revision);
        },
      );
    }, 300);
  }

  function swapModeAndTranslate(nextMode) {
    if (mode === nextMode) return;

    currentRevision++;
    clearTimeout(debounceTimer);

    const canSwapData =
      lastData &&
      dataMatchesInput(lastData, inputText.value) &&
      lastData.translated_text;

    if (canSwapData) {
      const oldOriginal = lastData.original_text;
      const oldTranslated = lastData.translated_text;

      // Show swapped data immediately for instant feedback
      const swappedData = {
        ...lastData,
        original_text: oldTranslated,
        translated_text: oldOriginal,
      };

      setModeUi(nextMode);
      inputText.value = oldTranslated;
      autoResizeTextarea();

      renderResult(swappedData);
      persistState();
      broadcastSharedState(oldTranslated, nextMode);

      // Always re-translate: mode change means the API returns different results
      runTranslationPipeline();
      return;
    }

    setModeUi(nextMode);
    persistState();
    broadcastSharedState(inputText.value, nextMode);
    inputText.dispatchEvent(new Event("input", { bubbles: true }));
  }

  if (toggleSwitch) {
    chrome.storage.local.get([STORAGE_KEYS.enabled], (result) => {
      toggleSwitch.checked =
        result[STORAGE_KEYS.enabled] !== undefined
          ? result[STORAGE_KEYS.enabled]
          : true;
    });

    toggleSwitch.addEventListener("change", () => {
      chrome.storage.local.set({
        [STORAGE_KEYS.enabled]: toggleSwitch.checked,
      });
      // Also sync quick_translate option
      updateOptionCheckbox("quick_translate", toggleSwitch.checked);
    });
  }

  // ── Translation Options Panel ──────────────────────────────────────────────

  function syncOptionUi() {
    if (optAnalysis) optAnalysis.checked = translationOptions.analysis !== false;
    if (optVocab) {
      if (!isUserLoggedIn) {
        optVocab.checked = false;
        optVocab.disabled = true;
      } else {
        optVocab.disabled = false;
        optVocab.checked = translationOptions.vocab !== false;
      }
    }
    if (optTypo) optTypo.checked = translationOptions.typo !== false;
    if (optQuickTranslate) optQuickTranslate.checked = translationOptions.quick_translate !== false;

    // Reflect quick_translate state on the main bôi đen toggle
    if (toggleSwitch && optQuickTranslate) {
      toggleSwitch.checked = translationOptions.quick_translate !== false;
    }

    if (vocabAuthBadge) {
      if (isUserLoggedIn) {
        vocabAuthBadge.textContent = "✓ Đã kết nối";
        vocabAuthBadge.classList.add("logged-in");
        if (rowOptVocab) rowOptVocab.classList.remove("disabled-auth");
      } else {
        vocabAuthBadge.textContent = "🔒 Cần đăng nhập";
        vocabAuthBadge.classList.remove("logged-in");
        if (rowOptVocab) rowOptVocab.classList.add("disabled-auth");
      }
    }

    // Show AI badge on toggle button when vocab or analysis is on
    const needsFull = (isUserLoggedIn && translationOptions.vocab !== false) || translationOptions.analysis !== false;
    if (optionsToggleBtn) {
      optionsToggleBtn.title = needsFull
        ? "Tùy chọn dịch — đang dùng API thông minh (vocab + phân tích bật)"
        : "Tùy chọn dịch — đang dùng API nhanh";
    }
  }

  function updateOptionCheckbox(key, value) {
    if (key === "vocab" && !isUserLoggedIn && value) {
      showError("Tính năng lưu từ vựng cá nhân yêu cầu đăng nhập tài khoản!");
      if (optVocab) optVocab.checked = false;
      return;
    }
    translationOptions[key] = value;
    chrome.storage.local.set({ [STORAGE_KEYS.translationOptions]: translationOptions });
    chrome.runtime.sendMessage({
      action: "set_translation_options",
      options: translationOptions,
    });
    syncOptionUi();
  }

  // Load saved options from storage
  chrome.storage.local.get([STORAGE_KEYS.translationOptions], (result) => {
    if (result[STORAGE_KEYS.translationOptions]) {
      translationOptions = { ...DEFAULT_OPTIONS, ...result[STORAGE_KEYS.translationOptions] };
    }
    syncOptionUi();
  });

  // Toggle panel open/close
  if (optionsToggleBtn && optionsPanel) {
    optionsToggleBtn.addEventListener("click", () => {
      const isOpen = optionsPanel.style.display !== "none";
      optionsPanel.style.display = isOpen ? "none" : "block";
      optionsToggleBtn.classList.toggle("active", !isOpen);
    });
  }

  if (optionsCloseBtn && optionsPanel) {
    optionsCloseBtn.addEventListener("click", () => {
      optionsPanel.style.display = "none";
      if (optionsToggleBtn) optionsToggleBtn.classList.remove("active");
    });
  }

  // Wire each option checkbox
  if (optAnalysis) {
    optAnalysis.addEventListener("change", () => {
      updateOptionCheckbox("analysis", optAnalysis.checked);
    });
  }
  if (optVocab) {
    optVocab.addEventListener("change", () => {
      updateOptionCheckbox("vocab", optVocab.checked);
    });
  }
  if (vocabAuthBadge) {
    vocabAuthBadge.addEventListener("click", () => {
      if (!isUserLoggedIn && loginBtn) {
        loginBtn.click();
      }
    });
  }
  if (optTypo) {
    optTypo.addEventListener("change", () => {
      updateOptionCheckbox("typo", optTypo.checked);
    });
  }
  if (optQuickTranslate) {
    optQuickTranslate.addEventListener("change", () => {
      updateOptionCheckbox("quick_translate", optQuickTranslate.checked);
      // Mirror to the main isEnabled toggle in content scripts via storage
      chrome.storage.local.set({ [STORAGE_KEYS.enabled]: optQuickTranslate.checked });
      if (toggleSwitch) toggleSwitch.checked = optQuickTranslate.checked;
    });
  }

  function applyZoom(zoom) {
    document.documentElement.style.setProperty("--content-zoom", zoom);
    // Chờ trình duyệt cập nhật layout trước khi tính toán lại chiều cao
    setTimeout(() => autoResizeTextarea(), 50);
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      if (currentZoom < 1.5)
        currentZoom = Math.round((currentZoom + 0.1) * 10) / 10;
      applyZoom(currentZoom);
      chrome.storage.local.set({ [STORAGE_KEYS.zoom]: currentZoom });
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      if (currentZoom > 0.8)
        currentZoom = Math.round((currentZoom - 0.1) * 10) / 10;
      applyZoom(currentZoom);
      chrome.storage.local.set({ [STORAGE_KEYS.zoom]: currentZoom });
    });
  }

  if (pinBtn) {
    if (isPinnedView) {
      pinBtn.style.display = "none";
      document.body.classList.add("pinned-mode");
    }

    pinBtn.addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (chrome.sidePanel && chrome.sidePanel.open && tab) {
        chrome.sidePanel.open({ tabId: tab.id });
        window.close();
        return;
      }

      chrome.windows.create({
        url: chrome.runtime.getURL("popup.html?pinned=true"),
        type: "popup",
        width: 440,
        height: 650,
      });
      window.close();
    });
  }

  // Auth UI Logic
  function updateAuthUi(loggedIn, name = null, avatar = null) {
    if (loggedIn) {
      if (loginBtn) loginBtn.style.display = "none";
      if (userInfo) userInfo.style.display = "flex";
      if (usernameSpan) usernameSpan.textContent = name || "Đã đăng nhập";

      // Update avatar circle
      if (avatarBtn) {
        if (avatar) {
          avatarBtn.style.backgroundImage = `url(${avatar})`;
          avatarBtn.style.backgroundSize = "cover";
          avatarBtn.style.backgroundPosition = "center";
          avatarBtn.textContent = "";
        } else {
          const firstLetter = (name || "U")[0].toUpperCase();
          avatarBtn.textContent = firstLetter;
          avatarBtn.style.backgroundImage = "none";
        }
      }

      if (promoBanner) promoBanner.style.display = "none";
    } else {
      if (loginBtn) loginBtn.style.display = "block";
      if (userInfo) userInfo.style.display = "none";
      if (promoBanner) promoBanner.style.display = "block";
    }
    if (userDropdown) userDropdown.classList.remove("visible");

    isUserLoggedIn = !!loggedIn;
    syncOptionUi();
  }

  // Initial auth check
  chrome.runtime.sendMessage({ action: "get_auth_state" }, (response) => {
    updateAuthUi(
      response?.loggedIn,
      response?.displayName,
      response?.avatarUrl,
    );
  });

  // ── API helpers ────────────────────────────────────────────────────────────

  async function saveWordToServer(wordData, btnEl) {
    chrome.storage.local.get(["access_token"], async (result) => {
      const token = result.access_token;
      if (!token) return;
      try {
        btnEl.textContent = "…";
        btnEl.disabled = true;
        const resp = await fetch(`${CONFIG.API_BASE_URL}/user/words`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(wordData),
        });
        if (resp.ok) {
          btnEl.textContent = "✓";
          btnEl.classList.add("saved");
        } else {
          btnEl.textContent = "+";
          btnEl.disabled = false;
        }
      } catch {
        btnEl.textContent = "+";
        btnEl.disabled = false;
      }
    });
  }


  // ── User menu logic ─────────────────────────────────────────────────────────

  if (avatarBtn) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle("visible");
    });
  }

  // Close dropdown on outside click
  document.addEventListener("click", () => {
    if (userDropdown) userDropdown.classList.remove("visible");
  });

  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      window.open(CONFIG.APP_URL + "profile", "_blank");
    });
  }

  if (savedWordsBtn) {
    savedWordsBtn.addEventListener("click", () => {
      window.open(CONFIG.APP_URL + "saved-words", "_blank");
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      window.open(CONFIG.APP_URL + "settings", "_blank");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "logout" }, (response) => {
        if (response?.success) {
          updateAuthUi(false);
        }
      });
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      // Step 1: Try to reuse existing extension credentials before opening auth flow.
      // This handles the case where the extension already has a valid (or refreshable) token.
      chrome.runtime.sendMessage({ action: "verify_auth" }, (authCheck) => {
        if (authCheck?.loggedIn) {
          // Extension credentials are still valid — just update the UI.
          updateAuthUi(true, authCheck.displayName, authCheck.avatarUrl);
          return;
        }

        // Step 2: Delegate login to background script to prevent popup closure from destroying the auth flow
        chrome.runtime.sendMessage({ action: "login" }, (loginResult) => {
          if (chrome.runtime.lastError || !loginResult) {
            // Fallback: identity API failed or wasn't available
            window.open(
              `${CONFIG.APP_URL}extension-login?redirect_uri=${encodeURIComponent(CONFIG.APP_URL)}&source=extension`,
              "_blank",
            );
            return;
          }

          if (loginResult.success) {
            updateAuthUi(true, loginResult.displayName, loginResult.avatarUrl);
          } else {
            if (loginResult.error === "identity_not_available") {
              window.open(
                `${CONFIG.APP_URL}extension-login?redirect_uri=${encodeURIComponent(CONFIG.APP_URL)}&source=extension`,
                "_blank",
              );
            } else {
              alert("Đã xảy ra lỗi khi xác thực. Vui lòng thử lại.");
            }
          }
        });
      });
    });
  }

  if (viewModeSelect) {
    viewModeSelect.addEventListener("change", (event) => {
      viewMode = event.target.value;
      chrome.storage.local.set({ [STORAGE_KEYS.viewMode]: viewMode });
      applyViewMode();
    });
  }

  modeViEn.addEventListener("click", () => swapModeAndTranslate("vi-en"));
  modeEnVi.addEventListener("click", () => swapModeAndTranslate("en-vi"));

  clearBtn.addEventListener("click", () => {
    clearTimeout(debounceTimer);
    currentRevision++;
    inputText.value = "";
    autoResizeTextarea();
    resultSection.classList.remove("visible");
    loadingLine.classList.remove("show");
    setTimeout(() => {
      if (!resultSection.classList.contains("visible")) {
        resultSection.style.display = "none";
        loadingLine.style.display = "none";
      }
    }, 500);
    clearError();
    lastData = null;
    lastRenderedSignature = "";
    lastRequestKey = "";
    persistState();
    syncSharedInput("");
  });

  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!lastData || !lastData.translated_text) return;

      const textToCopy = lastData.translated_text.trim();
      if (!textToCopy) return;

      navigator.clipboard
        .writeText(textToCopy)
        .then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent =
            mode === "vi-en" ? TEXT.copiedViEn : TEXT.copiedEnVi;
          copyBtn.style.color = "var(--success-color)";

          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.color = "";
          }, 2000);
        })
        .catch((err) => {
          console.error("Lỗi sao chép clipboard:", err);

          // Fallback to legacy execCommand copy
          try {
            const tempTextarea = document.createElement("textarea");
            tempTextarea.value = textToCopy;
            // Prevent scrolling to bottom when appending
            tempTextarea.style.position = "fixed";
            tempTextarea.style.opacity = "0";
            document.body.appendChild(tempTextarea);
            tempTextarea.select();
            const successful = document.execCommand("copy");
            document.body.removeChild(tempTextarea);

            if (successful) {
              const originalText = copyBtn.textContent;
              copyBtn.textContent =
                mode === "vi-en" ? TEXT.copiedViEn : TEXT.copiedEnVi;
              copyBtn.style.color = "var(--success-color)";

              setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.color = "";
              }, 2000);
              return;
            }
          } catch (fallbackErr) {
            console.error("Fallback copy failed:", fallbackErr);
          }

          // If fallback also fails, show error text on button
          const originalText = copyBtn.textContent;
          copyBtn.textContent = "LỖI!";
          copyBtn.style.color = "var(--danger-color)";
          setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.color = "";
          }, 2000);
        });
    });
  }

  // Dismiss all open word-detail tooltips when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".word-wrapper")) {
      document
        .querySelectorAll(".word-detail-tooltip.visible")
        .forEach((t) => t.classList.remove("visible"));
    }
  });

  inputText.addEventListener("input", runTranslationPipeline);
  inputText.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  inputText.addEventListener("compositionend", () => {
    isComposing = false;
    // Ensure sync happens after composition
    runTranslationPipeline();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "local") return;

    if (changes[STORAGE_KEYS.enabled] && toggleSwitch) {
      toggleSwitch.checked = changes[STORAGE_KEYS.enabled].newValue !== false;
    }

    // Handle pendingData from content script "?" button when popup is already open
    if (
      changes[STORAGE_KEYS.pendingData] &&
      changes[STORAGE_KEYS.pendingData].newValue
    ) {
      const pendingData = changes[STORAGE_KEYS.pendingData].newValue;
      inputText.value = pendingData.original_text || "";
      autoResizeTextarea();
      syncSharedInput(inputText.value);
      renderResultIfChanged(pendingData);
      chrome.storage.local.remove(STORAGE_KEYS.pendingData);
      // Trigger full translation for POS colors if needed
      const hasPos = pendingData.pos_tags && pendingData.pos_tags.length > 0;
      if (!hasPos) {
        runTranslationPipeline();
      }
      return;
    }

    if (changes[STORAGE_KEYS.sharedState]) {
      const nextState = changes[STORAGE_KEYS.sharedState].newValue;
      if (
        nextState &&
        nextState.updatedAt &&
        nextState.updatedAt !== lastSharedStateAt
      ) {
        lastSharedStateAt = nextState.updatedAt;
        setModeUi(nextState.mode || mode);

        const nextText = nextState.text || "";
        if (nextText !== inputText.value && !isComposing) {
          inputText.value = nextText;
          autoResizeTextarea();
        }

        chrome.storage.local.get([STORAGE_KEYS.savedData], (result) => {
          const savedData = result[STORAGE_KEYS.savedData];
          if (savedData && dataMatchesInput(savedData, inputText.value)) {
            renderResultIfChanged(savedData);
          } else {
            inputText.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
      }
      return;
    }

    if (changes[STORAGE_KEYS.mode]) {
      const nextMode = changes[STORAGE_KEYS.mode].newValue;
      if (nextMode && nextMode !== mode) {
        applyMode(nextMode, { persist: false, retranslate: false });
      }
    }

    if (changes[STORAGE_KEYS.sharedInput]) {
      const nextText = changes[STORAGE_KEYS.sharedInput].newValue || "";
      if (nextText !== inputText.value && !isComposing) {
        inputText.value = nextText;
        autoResizeTextarea();
        persistState();
        inputText.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    if (changes[STORAGE_KEYS.zoom] && changes[STORAGE_KEYS.zoom].newValue) {
      currentZoom = changes[STORAGE_KEYS.zoom].newValue;
      applyZoom(currentZoom);
    }

    if (
      changes[STORAGE_KEYS.viewMode] &&
      changes[STORAGE_KEYS.viewMode].newValue
    ) {
      viewMode = changes[STORAGE_KEYS.viewMode].newValue;
      if (viewModeSelect) viewModeSelect.value = viewMode;
      applyViewMode();
    }
  });

  chrome.storage.local.get(
    [
      STORAGE_KEYS.pendingData,
      STORAGE_KEYS.sharedInput,
      STORAGE_KEYS.savedInput,
      STORAGE_KEYS.savedData,
      STORAGE_KEYS.savedMode,
      STORAGE_KEYS.mode,
      STORAGE_KEYS.zoom,
      STORAGE_KEYS.viewMode,
      STORAGE_KEYS.sharedState,
      STORAGE_KEYS.disabledPos,
      STORAGE_KEYS.translationOptions,
    ],
    (result) => {
      if (result[STORAGE_KEYS.zoom]) {
        currentZoom = result[STORAGE_KEYS.zoom];
        applyZoom(currentZoom);
      }

      if (result[STORAGE_KEYS.viewMode]) {
        viewMode = result[STORAGE_KEYS.viewMode];
        if (viewModeSelect) viewModeSelect.value = viewMode;
      }

      if (result[STORAGE_KEYS.disabledPos]) {
        disabledPosTypes = new Set(result[STORAGE_KEYS.disabledPos]);
      }

      applyMode(
        result[STORAGE_KEYS.mode] || result[STORAGE_KEYS.savedMode] || "vi-en",
        { persist: false, retranslate: false },
      );

      const pendingData = result[STORAGE_KEYS.pendingData];
      const sharedInput =
        typeof result[STORAGE_KEYS.sharedInput] === "string"
          ? result[STORAGE_KEYS.sharedInput]
          : "";
      const savedInput =
        typeof result[STORAGE_KEYS.savedInput] === "string"
          ? result[STORAGE_KEYS.savedInput]
          : "";
      const savedData = result[STORAGE_KEYS.savedData] || null;
      const sharedState = result[STORAGE_KEYS.sharedState] || null;
      if (sharedState && sharedState.updatedAt) {
        lastSharedStateAt = sharedState.updatedAt;
      }

      if (pendingData) {
        inputText.value = pendingData.original_text || "";
        autoResizeTextarea();
        syncSharedInput(inputText.value);
        renderResultIfChanged(pendingData);
        // Clean up pending data after use
        chrome.storage.local.remove(STORAGE_KEYS.pendingData);
        // Trigger full translation for POS colors
        runTranslationPipeline();
      } else if (sharedInput) {
        inputText.value = sharedInput;
        autoResizeTextarea();
        if (!maybeRestoreCachedResult(savedData)) {
          inputText.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (savedInput) {
        inputText.value = savedInput;
        autoResizeTextarea();
        if (!maybeRestoreCachedResult(savedData) && normalizeText(savedInput)) {
          inputText.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (savedData) {
        inputText.value = savedData.original_text || "";
        autoResizeTextarea();
        renderResultIfChanged(savedData);
        if (!savedData.pos_tags || savedData.pos_tags.length === 0) {
          runTranslationPipeline();
        }
      }

      applyViewMode();

      setTimeout(() => {
        isInitialLoad = false;
        inputText.classList.remove("no-transition");
      }, 100);
    },
  );

  // ── Flashcard Section ──
  const flashcardSection = document.getElementById("flashcard-section");
  const flashcardDoNowBtn = document.getElementById("flashcard-do-now-btn");

  // Helper: hiển thị thông báo lỗi trong popup thay vì alert()
  function showFlashcardError(msg) {
    const existing = document.getElementById("flashcard-inline-error");
    if (existing) existing.remove();
    if (!flashcardSection) return;
    const err = document.createElement("div");
    err.id = "flashcard-inline-error";
    err.style.cssText =
      "margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);" +
      "border-radius:8px;font-size:12px;color:#ef4444;line-height:1.4;";
    err.textContent = msg;
    flashcardSection.appendChild(err);
    // Tự xóa sau 5 giây
    setTimeout(() => err.remove(), 5000);
  }

  if (flashcardDoNowBtn) {
    flashcardDoNowBtn.addEventListener("click", async () => {
      flashcardDoNowBtn.disabled = true;
      flashcardDoNowBtn.textContent = "Đang tải...";

      // Lấy tab hiện tại
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];

        // Thử gửi message đến content script (chỉ hoạt động nếu trang đã cài đặt)
        const tryInPagePlayer = () => {
          if (!currentTab) return Promise.resolve(false);
          return new Promise((resolve) => {
            try {
              chrome.tabs.sendMessage(
                currentTab.id,
                { action: "show_flashcard_invite_trigger", force: true },
                (response) => {
                  if (chrome.runtime.lastError) {
                    // Content script không có mặt trên trang này
                    resolve(false);
                    return;
                  }
                  // Content script phản hồi → player đã được mở trong trang
                  resolve(true);
                },
              );
            } catch (e) {
              resolve(false);
            }
          });
        };

        // Fallback: mở flashcard ở tab mới qua session API
        const openInNewTab = () => {
          chrome.runtime.sendMessage(
            { action: "start_extension_session" },
            (response) => {
              flashcardDoNowBtn.disabled = false;
              flashcardDoNowBtn.textContent = "Làm Ngay";

              if (chrome.runtime.lastError || !response) {
                showFlashcardError("Không thể kết nối. Vui lòng thử lại.");
                return;
              }

              if (response.error) {
                // Lỗi từ server: thường là thiếu từ vựng
                const msg = response.error.toLowerCase().includes("từ")
                  ? "Chưa đủ từ vựng để tạo phiên học. Hãy dịch thêm nhiều từ hơn nhé!"
                  : "Không thể tạo phiên học. Vui lòng thử lại.";
                showFlashcardError(msg);
                return;
              }

              // response.session_id là UUID của phiên học,
              // response.id là set_id của bộ thẻ
              const sid = response.session_id;
              if (sid) {
                const flashcardUrl = `https://deeptranslate.org/extension/flashcard?session_id=${sid}`;
                chrome.tabs.create({ url: flashcardUrl });
              } else {
                showFlashcardError("Không thể bắt đầu flashcard. Vui lòng thử lại.");
              }
            },
          );
        };

        tryInPagePlayer().then((handledInPage) => {
          if (handledInPage) {
            // In-page player đã được kích hoạt → chỉ cần đóng popup
            flashcardDoNowBtn.disabled = false;
            flashcardDoNowBtn.textContent = "Làm Ngay";
            window.close();
          } else {
            // Trang không có content script → mở tab mới
            openInNewTab();
          }
        });
      });
    });
  }

  // ── Notification Section ──
  const notificationPanel = document.getElementById("notification-panel");
  const notificationCloseBtn = document.getElementById(
    "notification-close-btn",
  );
  const notificationSnooze1hBtn = document.getElementById(
    "notification-snooze-1h",
  );
  const notificationSnooze3hBtn = document.getElementById(
    "notification-snooze-3h",
  );
  const notificationDisableSiteBtn = document.getElementById(
    "notification-disable-site-btn",
  );
  const notificationContent = document.getElementById("notification-content");

  // Check if notification should be shown
  async function checkAndShowNotification() {
    const result = await chrome.storage.local.get([
      "flashcard_dismissed_at",
      "flashcard_snooze_until",
    ]);

    const now = Date.now();
    const dismissedAt = result.flashcard_dismissed_at || 0;
    const snoozeUntil = result.flashcard_snooze_until || 0;

    // Don't show if dismissed permanently
    if (dismissedAt && now - dismissedAt < 24 * 60 * 60 * 1000) {
      return;
    }

    // Don't show if snoozed
    if (snoozeUntil && now < snoozeUntil) {
      return;
    }

    // Show notification (in real scenario, this would check server for pending flashcards)
    if (flashcardSection) {
      flashcardSection.style.display = "block";
    }
    if (notificationPanel) {
      notificationPanel.style.display = "block";
      if (notificationContent) {
        notificationContent.textContent =
          "Bạn có flashcard mới! Hãy luyện tập để nâng cao vốn từ.";
      }
    }
  }

  if (notificationCloseBtn) {
    notificationCloseBtn.addEventListener("click", () => {
      if (notificationPanel) {
        notificationPanel.style.display = "none";
      }
      chrome.storage.local.set({
        flashcard_dismissed_at: Date.now(),
      });
    });
  }

  if (notificationSnooze1hBtn) {
    notificationSnooze1hBtn.addEventListener("click", () => {
      if (notificationPanel) {
        notificationPanel.style.display = "none";
      }
      chrome.storage.local.set({
        flashcard_snooze_until: Date.now() + 60 * 60 * 1000, // 1 hour
      });
    });
  }

  if (notificationSnooze3hBtn) {
    notificationSnooze3hBtn.addEventListener("click", () => {
      if (notificationPanel) {
        notificationPanel.style.display = "none";
      }
      chrome.storage.local.set({
        flashcard_snooze_until: Date.now() + 3 * 60 * 60 * 1000, // 3 hours
      });
    });
  }

  if (notificationDisableSiteBtn) {
    notificationDisableSiteBtn.addEventListener("click", async () => {
      // Get current tab URL to determine domain
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url);
          const domain = url.hostname;
          // Add to session blacklist (will be cleared on extension reload)
          const result = await chrome.storage.local.get(
            "domain_blacklist_session",
          );
          const sessionBlacklist = result.domain_blacklist_session || [];
          if (!sessionBlacklist.includes(domain)) {
            sessionBlacklist.push(domain);
            chrome.storage.local.set({
              domain_blacklist_session: sessionBlacklist,
            });
          }
        } catch (error) {
          console.error("Error parsing current URL:", error);
        }
      }
      if (notificationPanel) {
        notificationPanel.style.display = "none";
      }
    });
  }

  // Check notification on load and when settings change
  checkAndShowNotification();
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "settings_changed") {
      checkAndShowNotification();
      sendResponse({ received: true });
      return true;
    }
  });

  // Nút "Làm ngay" Flashcard — logic đã được hợp nhất vào block phía trên (flashcardDoNowBtn)

  // 2. Các nút Snooze (Tạm ẩn 1h, 3h)
  const snoozeButtons = document.querySelectorAll(".snooze-btn[data-hours]");
  snoozeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const hours = parseInt(btn.getAttribute("data-hours"));
      const snoozeUntil = Date.now() + hours * 60 * 60 * 1000;

      // Lưu thời điểm kết thúc cooldown vào storage (background.js sẽ check cái này)
      chrome.storage.local.set(
        { flashcard_last_completed: snoozeUntil },
        () => {
          alert(`Đã tạm ẩn thông báo nhắc học trong ${hours} giờ.`);
          window.close();
        },
      );
    });
  });

  // 3. Nút Tắt tại trang này (Blacklist domain)
  const disableSiteBtn = document.getElementById("notification-disable-site-btn");
  if (disableSiteBtn) {
    disableSiteBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const url = new URL(tabs[0].url);
          const domain = url.hostname.replace("www.", "");

          // Gửi message tới background để add vào blacklist
          chrome.runtime.sendMessage(
            {
              action: "add_domain_blacklist",
              domain: domain,
              type: "permanent",
            },
            (response) => {
              if (response.success) {
                alert(`DeepTranslate đã được tắt tại: ${domain}`);
                window.close();
              }
            },
          );
        }
      });
    });
  }
});
