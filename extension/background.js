importScripts("config.js");
const API_URL = CONFIG.API_URL;
const MAX_CACHE_ENTRIES = 50;

let openViews = 0;
let accessToken = null;
let refreshToken = null;
let displayName = null;
let avatarUrl = null;
const translationCache = new Map();
const inFlightRequests = new Map();

let isRefreshing = false;
let refreshPromise = null;
let extensionSettings = null;

// Domain blacklist storage: {permanent: [], session: []}
let domainBlacklist = {
  permanent: [],
  session: [],
};

// Initialize domain blacklist from storage
async function initDomainBlacklist() {
  try {
    const result = await chrome.storage.local.get("domain_blacklist_permanent");
    if (result.domain_blacklist_permanent) {
      domainBlacklist.permanent = result.domain_blacklist_permanent;
    }
    // Session blacklist is cleared on extension reload (not persisted)
    domainBlacklist.session = [];
  } catch (error) {
    console.error("Error initializing domain blacklist:", error);
  }
}

// Check if domain is blacklisted
function isDomainBlacklisted(domain) {
  if (!domain) return false;
  const normalizedDomain = domain.toLowerCase();
  return (
    domainBlacklist.permanent.includes(normalizedDomain) ||
    domainBlacklist.session.includes(normalizedDomain)
  );
}

// Add domain to blacklist
async function addToBlacklist(domain, type = "session") {
  if (!domain) return;
  const normalizedDomain = domain.toLowerCase();

  if (type === "permanent") {
    if (!domainBlacklist.permanent.includes(normalizedDomain)) {
      domainBlacklist.permanent.push(normalizedDomain);
      await chrome.storage.local.set({
        domain_blacklist_permanent: domainBlacklist.permanent,
      });
    }
  } else {
    // session
    if (!domainBlacklist.session.includes(normalizedDomain)) {
      domainBlacklist.session.push(normalizedDomain);
    }
  }

  // Broadcast blacklist update to all components
  chrome.runtime
    .sendMessage({
      action: "blacklist_updated",
      blacklist: domainBlacklist,
    })
    .catch(() => { });
}

// Remove domain from blacklist
async function removeFromBlacklist(domain, type = "permanent") {
  if (!domain) return;
  const normalizedDomain = domain.toLowerCase();

  if (type === "permanent") {
    const index = domainBlacklist.permanent.indexOf(normalizedDomain);
    if (index > -1) {
      domainBlacklist.permanent.splice(index, 1);
      chrome.storage.local.set({
        domain_blacklist_permanent: domainBlacklist.permanent,
      });
    }
  } else {
    // session
    const index = domainBlacklist.session.indexOf(normalizedDomain);
    if (index > -1) {
      domainBlacklist.session.splice(index, 1);
    }
  }

  // Broadcast blacklist update
  chrome.runtime
    .sendMessage({
      action: "blacklist_updated",
      blacklist: domainBlacklist,
    })
    .catch(() => { });
}

// Get current blacklist
function getDomainBlacklist() {
  return JSON.parse(JSON.stringify(domainBlacklist));
}

async function logoutLocal() {
  accessToken = null;
  refreshToken = null;
  displayName = null;
  avatarUrl = null;
  extensionSettings = null;
  chrome.storage.local.remove([
    "access_token",
    "refresh_token",
    "display_name",
    "avatar_url",
    "extension_settings",
  ]);
  chrome.runtime
    .sendMessage({
      action: "auth_state_changed",
      loggedIn: false,
      displayName: null,
      avatarUrl: null,
    })
    .catch(() => { });
}

async function refreshExtensionToken() {
  if (!refreshToken) return false;
  if (isRefreshing) return refreshPromise;

  isRefreshing = true;
  refreshPromise = new Promise(async (resolve) => {
    try {
      const authEndpoint = CONFIG.API_BASE_URL
        ? `${CONFIG.API_BASE_URL}/auth/refresh`
        : `${CONFIG.API_URL.replace("/translate", "")}/auth/refresh`;
      const resp = await fetch(authEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: "include",
      });
      const data = await resp.json();
      if (resp.ok && data.access_token) {
        accessToken = data.access_token;
        if (data.refresh_token) refreshToken = data.refresh_token;

        const storageUpdates = {
          access_token: accessToken,
          refresh_token: refreshToken,
        };
        chrome.storage.local.set(storageUpdates);

        chrome.runtime
          .sendMessage({
            action: "auth_state_changed",
            loggedIn: true,
            displayName,
            avatarUrl,
          })
          .catch(() => { });

        resolve(true);
      } else {
        await logoutLocal();
        resolve(false);
      }
    } catch (e) {
      await logoutLocal();
      resolve(false);
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  });
  return refreshPromise;
}

// Setup token refresh on extension startup (every 55 minutes)
async function setupTokenRefreshOnStartup() {
  if (accessToken && refreshToken) {
    try {
      // Check if token is older than 50 minutes
      const tokenMetadata = await chrome.storage.local.get("token_stored_at");
      const storedAt = tokenMetadata.token_stored_at || Date.now();
      const ageMinutes = (Date.now() - storedAt) / 1000 / 60;

      if (ageMinutes > 50) {
        const refreshed = await refreshExtensionToken();
        if (refreshed) {
          chrome.storage.local.set({ token_stored_at: Date.now() });
        } else {
          await logoutLocal();
        }
      }
    } catch (error) {
      console.error("Error in token refresh on startup:", error);
    }
  }

  // Setup recurring token refresh alarm (every 55 minutes)
  try {
    chrome.alarms.create("refreshTokenAlarm", { periodInMinutes: 55 });
  } catch (error) {
    console.error("Error creating token refresh alarm:", error);
  }
}

// Handle token refresh alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshTokenAlarm") {
    if (accessToken && refreshToken) {
      refreshExtensionToken().catch((error) => {
        console.error("Error refreshing token on alarm:", error);
      });
    }
  }
});

// Wrapper function for authenticated requests with auto-retry on 401/403
async function makeAuthenticatedRequest(url, options = {}, isRetry = false) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized
  if (response.status === 401 && !isRetry) {
    if (refreshToken) {
      const refreshed = await refreshExtensionToken();
      if (refreshed) {
        return makeAuthenticatedRequest(url, options, true);
      }
    }
    await logoutLocal();
    throw new Error("Authentication failed: Unauthorized");
  }

  // Handle 403 Forbidden - also try refresh
  if (response.status === 403 && !isRetry) {
    if (refreshToken) {
      const refreshed = await refreshExtensionToken();
      if (refreshed) {
        return makeAuthenticatedRequest(url, options, true);
      }
    }
    await logoutLocal();
    throw new Error("Access forbidden: Unauthorized");
  }

  return response;
}

// Initialize token, user info and cache from storage
chrome.storage.local.get(
  [
    "access_token",
    "display_name",
    "avatar_url",
    "translation_cache",
    "token_stored_at",
    "extension_settings",
  ],
  (result) => {
    accessToken = result.access_token || null;
    displayName = result.display_name || null;
    avatarUrl = result.avatar_url || null;
    extensionSettings = result.extension_settings || null;
    previousSettingsJSON = extensionSettings ? JSON.stringify(extensionSettings) : null;

    if (Array.isArray(result.translation_cache)) {
      try {
        for (const entry of result.translation_cache) {
          if (Array.isArray(entry) && entry.length === 2) {
            const [key, value] = entry;
            translationCache.set(key, value);
          }
        }
      } catch (e) {
        console.error("Error loading translation cache:", e);
      }
    }

    if (accessToken && !displayName) {
      fetchUserInfo(accessToken);
    }
    if (accessToken) {
      setupTokenRefreshOnStartup();
      setupSettingsPolling();
    }

    // Initialize domain blacklist on startup
    initDomainBlacklist();
  },
);

async function fetchUserInfo(token) {
  try {
    const authEndpoint = CONFIG.AUTH_ME_URL;
    const response = await makeAuthenticatedRequest(authEndpoint, {
      method: "GET",
    });

    // Prevent race condition: if the user logged in with a new token
    // while this request was in flight, discard the response.
    if (token !== accessToken) {
      return;
    }

    if (response.ok) {
      const data = await response.json();
      displayName = data.display_name;
      avatarUrl = data.avatar_url;
      chrome.storage.local.set({
        display_name: displayName,
        avatar_url: avatarUrl,
      });

      // Notify popup if open
      chrome.runtime
        .sendMessage({
          action: "auth_state_changed",
          loggedIn: true,
          displayName,
          avatarUrl,
        })
        .catch(() => { }); // Ignore error if popup not open
    } else if (response.status === 401) {
      await logoutLocal();
    }
  } catch (error) {
    console.error("Fetch user info error:", error);
  }
}

async function trackWordEncounter(word, url) {
  if (!accessToken || !word) return;
  // Respect settings
  if (
    extensionSettings &&
    extensionSettings.history &&
    !extensionSettings.history.collect_all
  ) {
    return;
  }

  try {
    const authEndpoint = CONFIG.API_BASE_URL
      ? `${CONFIG.API_BASE_URL}/user/stats/track-word`
      : `${CONFIG.API_URL.replace("/translate", "")}/user/stats/track-word`;

    makeAuthenticatedRequest(authEndpoint, {
      method: "POST",
      body: JSON.stringify({
        word: word,
        source_url: url,
        action_type: "translate",
      }),
    }).catch(() => { });
  } catch (e) { }
}

const DEFAULT_TRANSLATION_OPTIONS = {
  analysis: true,
  vocab: true,
  typo: true,
  quick_translate: true,
};

let translationOptions = { ...DEFAULT_TRANSLATION_OPTIONS };

chrome.storage.local.get(["translation_options"], (result) => {
  if (result.translation_options) {
    translationOptions = { ...DEFAULT_TRANSLATION_OPTIONS, ...result.translation_options };
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.translation_options) {
    translationOptions = { ...DEFAULT_TRANSLATION_OPTIONS, ...changes.translation_options.newValue };
  }
});

function buildTranslationKey(text, mode, isFull = false) {
  return `${mode || "default"}:${isFull ? "full" : "simple"}:${text}`;
}

function readCache(cacheKey, isFull = false) {
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  // If requesting simple, a cached full translation can satisfy it
  if (!isFull) {
    const fullKey = cacheKey.replace(":simple:", ":full:");
    if (translationCache.has(fullKey)) {
      return translationCache.get(fullKey);
    }
  }
  return null;
}

let persistTimeout = null;
function persistCacheDebounced() {
  clearTimeout(persistTimeout);
  persistTimeout = setTimeout(() => {
    chrome.storage.local.set({
      translation_cache: Array.from(translationCache.entries()),
    });
  }, 2000);
}

// Force immediate save when the service worker is being suspended
chrome.runtime.onSuspend.addListener(() => {
  clearTimeout(persistTimeout);
  chrome.storage.local.set({
    translation_cache: Array.from(translationCache.entries()),
  });
});

function writeCache(cacheKey, data) {
  if (translationCache.has(cacheKey)) {
    translationCache.delete(cacheKey);
  }

  translationCache.set(cacheKey, data);

  if (translationCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    translationCache.delete(oldestKey);
  }

  // Persist cache with debounce to avoid spamming chrome.storage.local
  persistCacheDebounced();
}

// Real-time NDJSON Stream Translation Engine
async function streamTranslation(
  text,
  mode,
  options,
  needsFull,
  cacheKey,
  onChunk,
  onDone,
  onError,
) {
  try {
    const validMode = mode === "en-vi" || mode === "vi-en" ? mode : "vi-en";
    const sourceLang = validMode === "en-vi" ? "en" : "vi";
    const targetLang = validMode === "en-vi" ? "vi" : "en";

    // Only allow personal vocab collection if user is authenticated
    const canSaveVocab = !!accessToken && options.vocab !== false;

    const requestPayload = {
      text: text,
      source: {
        source_lang: sourceLang,
        target_lang: targetLang,
      },
      option: {
        analysis: options.analysis !== false,
        vocab: canSaveVocab,
        typo: options.typo !== false,
      },
    };

    // Use /stream endpoint for full workflow streaming, /simple for ultra-fast simple translation
    const endpoint = needsFull ? `${API_URL}/stream` : `${API_URL}/simple`;

    const response = await makeAuthenticatedRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      let errText = await response.text();
      try {
        const errObj = JSON.parse(errText);
        errText = errObj.detail || errObj.message || errObj.error || errText;
      } catch (_) {}
      onError(errText || `HTTP ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulatedTranslation = "";
    let originalText = text;
    const posTags = [];
    const vocabMap = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep remainder for next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const item = JSON.parse(trimmed);

          if (!needsFull) {
            // SimpleTranslateResponse stream line
            if (item.translated_text) {
              accumulatedTranslation = (accumulatedTranslation ? accumulatedTranslation + " " : "") + item.translated_text;
              onChunk({ chunk: item.translated_text, accumulated: accumulatedTranslation });
            }
            if (item.original_text) originalText = item.original_text;
          } else {
            // TranslateWorkflowResponse stream line
            if (item.type_response === "TRANSLATE" && item.data?.translated_text) {
              accumulatedTranslation = (accumulatedTranslation ? accumulatedTranslation + " " : "") + item.data.translated_text;
              onChunk({ chunk: item.data.translated_text, accumulated: accumulatedTranslation });
              if (item.data.original_text) originalText = item.data.original_text;
            } else if (item.type_response === "VOCAB" && item.data?.vocabularies) {
              for (const v of item.data.vocabularies) {
                const w = (v.word || "").toLowerCase();
                const meaning = v.contextual_meaning || v.concept_definition || "";
                if (w && meaning) vocabMap[w] = meaning;
              }
            } else if (item.type_response === "ANALYSIS" && item.data?.tokens) {
              for (const tok of item.data.tokens) {
                posTags.push({
                  text: tok.text,
                  pos: tok.pos || "NOUN",
                  tag: tok.tag || "",
                  lemma: tok.lemma || "",
                  meaning: vocabMap[tok.text.toLowerCase()] || tok.lemma || "",
                });
              }
            }
          }
        } catch (_) {}
      }
    }

    // Flush any leftover buffer
    if (buffer.trim()) {
      try {
        const item = JSON.parse(buffer.trim());
        if (!needsFull && item.translated_text) {
          accumulatedTranslation = (accumulatedTranslation ? accumulatedTranslation + " " : "") + item.translated_text;
          onChunk({ chunk: item.translated_text, accumulated: accumulatedTranslation });
        } else if (needsFull && item.type_response === "TRANSLATE" && item.data?.translated_text) {
          accumulatedTranslation = (accumulatedTranslation ? accumulatedTranslation + " " : "") + item.data.translated_text;
          onChunk({ chunk: item.data.translated_text, accumulated: accumulatedTranslation });
        }
      } catch (_) {}
    }

    accumulatedTranslation = accumulatedTranslation.trim();
    if (!accumulatedTranslation) {
      onError("Empty translation response");
      return;
    }

    // Link meanings to posTags
    for (const tag of posTags) {
      if (!tag.meaning && vocabMap[tag.text.toLowerCase()]) {
        tag.meaning = vocabMap[tag.text.toLowerCase()];
      }
    }

    const vocabList = Object.entries(vocabMap).map(([word, meaning]) => ({
      word,
      meaning,
    }));

    const resultData = {
      original_text: originalText,
      translated_text: accumulatedTranslation,
      source_lang: sourceLang,
      target_lang: targetLang,
      pos_tags: posTags,
      vocabularies: vocabList,
    };

    if (cacheKey) {
      writeCache(cacheKey, resultData);
    }

    onDone({ data: resultData, translatedText: accumulatedTranslation });
  } catch (error) {
    onError(error && error.message ? error.message : String(error));
  }
}

async function fetchTranslation(
  text,
  cacheKey,
  mode = "vi-en",
  isFull = false,
  isRetry = false,
  options = {},
) {
  return new Promise((resolve) => {
    streamTranslation(
      text,
      mode,
      options,
      isFull,
      cacheKey,
      () => {}, // chunk callback ignored for full batch promise
      (doneResult) => {
        resolve({
          success: true,
          data: doneResult.data,
          translatedText: doneResult.translatedText,
        });
      },
      (errorMsg) => {
        resolve({
          success: false,
          error: errorMsg,
        });
      },
    );
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup_connection") {
    openViews++;
    chrome.storage.local.set({ isPinnedActive: true });

    port.onDisconnect.addListener(() => {
      openViews--;
      if (openViews <= 0) {
        openViews = 0;
        chrome.storage.local.set({ isPinnedActive: false });
      }
    });
    return;
  }

  // Streaming translation port for text selection (bôi đen)
  if (port.name === "translate_stream") {
    port.onMessage.addListener((msg) => {
      if (msg.action === "translate_stream") {
        const text = (msg.text || "").trim();
        const mode = msg.mode || "default";
        const requestId = msg.requestId;
        const effectiveOptions = {
          ...translationOptions,
          ...(msg.options || {}),
        };

        // Personal vocab collection requires login
        if (!accessToken) {
          effectiveOptions.vocab = false;
        }

        if (!text) {
          port.postMessage({ type: "error", error: "Empty text", requestId });
          return;
        }

        const needsFull = effectiveOptions.vocab !== false || effectiveOptions.analysis !== false;
        const cacheKey = buildTranslationKey(text, mode, needsFull);
        const cached = readCache(cacheKey, needsFull);

        if (cached) {
          port.postMessage({
            type: "chunk",
            text: cached.translated_text,
            accumulated: cached.translated_text,
            requestId,
          });
          port.postMessage({
            type: "done",
            data: cached,
            translatedText: cached.translated_text,
            requestId,
          });
          return;
        }

        streamTranslation(
          text,
          mode,
          effectiveOptions,
          needsFull,
          cacheKey,
          (chunkInfo) => {
            try {
              port.postMessage({
                type: "chunk",
                text: chunkInfo.chunk,
                accumulated: chunkInfo.accumulated,
                requestId,
              });
            } catch (_) {}
          },
          (doneResult) => {
            try {
              port.postMessage({
                type: "done",
                data: doneResult.data,
                translatedText: doneResult.translatedText,
                requestId,
              });
            } catch (_) {}
          },
          (errorMsg) => {
            try {
              port.postMessage({
                type: "error",
                error: errorMsg,
                requestId,
              });
            } catch (_) {}
          },
        );
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const text = (request.text || "").trim();
    const mode = request.mode || "default";
    const forceRefresh = request.forceRefresh === true;

    // Merge options: request.options overrides global translationOptions
    const effectiveOptions = {
      ...translationOptions,
      ...(request.options || {}),
    };

    // Determine API mode:
    // 1. Explicit request.quickOnly: use Simple API
    // 2. Explicit request.full: follow request.full
    // 3. Otherwise (e.g. selection / bôi đen from content script):
    //    If vocab OR analysis is enabled -> MUST USE FULL API so vocabulary is collected & analysis generated!
    //    If both vocab AND analysis are disabled -> use Simple API
    let isFull = false;
    if (request.quickOnly) {
      isFull = false;
    } else if (request.full !== undefined) {
      isFull = !!request.full;
    } else {
      isFull = effectiveOptions.vocab !== false || effectiveOptions.analysis !== false;
    }

    const cacheKey = buildTranslationKey(text, mode, isFull);

    if (!text) {
      sendResponse({ success: false, error: "Empty text" });
      return false;
    }

    const cached = readCache(cacheKey, isFull);
    if (!forceRefresh && cached) {
      sendResponse({
        success: true,
        data: cached,
        translatedText: cached.translated_text,
        cached: true,
      });
      return false;
    }

    const existingRequest = inFlightRequests.get(cacheKey);
    if (!forceRefresh && existingRequest) {
      existingRequest.then((data) => {
        sendResponse(data);
        if (data && data.success) {
          trackWordEncounter(text, sender?.tab?.url || sender?.url);
        }
      });
      return true;
    }

    const pendingRequest = fetchTranslation(
      text,
      cacheKey,
      mode,
      isFull,
      false,
      effectiveOptions,
    ).finally(() => {
      inFlightRequests.delete(cacheKey);
    });

    inFlightRequests.set(cacheKey, pendingRequest);
    pendingRequest.then((data) => {
      sendResponse(data);
      if (data && data.success) {
        trackWordEncounter(text, sender?.tab?.url || sender?.url);
      }
    });
    return true;
  }

  if (request.action === "get_translation_options") {
    sendResponse({ options: translationOptions });
    return false;
  }

  if (request.action === "set_translation_options") {
    translationOptions = { ...translationOptions, ...(request.options || {}) };
    chrome.storage.local.set({ translation_options: translationOptions });
    sendResponse({ success: true, options: translationOptions });
    return false;
  }

  if (request.action === "detect") {
    chrome.i18n.detectLanguage(request.text, (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.action === "open_popup" || request.action === "open_side_panel") {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
        }
      });
    } else if (chrome.action && chrome.action.openPopup) {
      chrome.action
        .openPopup()
        .catch((error) => console.log("Open popup error:", error));
    }

    sendResponse({ success: true });
    return true;
  }

  if (request.action === "set_token") {
    // Security check: Verify sender origin to prevent session fixation or hijacking
    if (sender.tab) {
      try {
        const senderUrl = sender.tab.url || sender.url;
        if (!senderUrl) {
          console.warn(
            "Security block: Rejected set_token due to missing sender URL.",
          );
          sendResponse({ success: false, error: "Missing sender URL" });
          return false;
        }
        const url = new URL(senderUrl);
        const hostname = url.hostname;
        const isAllowedDomain =
          hostname === "deeptranslate.org" ||
          hostname.endsWith(".deeptranslate.org");
        if (!isAllowedDomain) {
          console.warn(
            "Security block: Rejected set_token from unauthorized origin:",
            hostname,
          );
          sendResponse({ success: false, error: "Unauthorized sender origin" });
          return false;
        }
      } catch (e) {
        console.error("Security block: Failed to parse sender URL:", e);
        sendResponse({ success: false, error: "Invalid sender URL" });
        return false;
      }
    }

    const oldToken = accessToken;
    accessToken = request.token;
    if (request.refreshToken) {
      refreshToken = request.refreshToken;
    }

    if (accessToken) {
      const storageUpdates = { access_token: accessToken };
      if (refreshToken) storageUpdates.refresh_token = refreshToken;

      if (request.name) {
        displayName = request.name;
        storageUpdates.display_name = displayName;
      }
      if (request.avatarUrl) {
        avatarUrl = request.avatarUrl;
        storageUpdates.avatar_url = avatarUrl;
      }
      chrome.storage.local.set(storageUpdates);

      // If token changed, fetch fresh user info from API
      if (accessToken !== oldToken) {
        fetchUserInfo(accessToken);
      }
    } else {
      logoutLocal();
    }

    // Notify all open parts of the extension about the change
    chrome.runtime
      .sendMessage({
        action: "auth_state_changed",
        loggedIn: !!accessToken,
        displayName,
        avatarUrl,
      })
      .catch(() => { });

    sendResponse({ success: true });
    return true;
  }

  if (request.action === "get_extension_settings") {
    sendResponse(extensionSettings);
    return true;
  }

  if (request.action === "login") {
    (async () => {
      const identity =
        chrome.identity ||
        (typeof browser !== "undefined" ? browser.identity : null);

      if (!identity) {
        sendResponse({ success: false, error: "identity_not_available" });
        return;
      }

      const redirectUri = identity.getRedirectURL("auth");
      const authUrl = `${CONFIG.APP_URL}extension-login?redirect_uri=${encodeURIComponent(redirectUri)}&source=extension`;

      identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        async (redirectUrl) => {
          if (chrome.runtime.lastError || !redirectUrl) {
            const reason =
              chrome.runtime.lastError?.message || "No redirect URL received";
            sendResponse({ success: false, error: reason });
            return;
          }

          let params;
          try {
            const urlObj = new URL(redirectUrl);
            params = new URLSearchParams(urlObj.search);
            if (!params.get("token") && urlObj.hash) {
              params = new URLSearchParams(urlObj.hash.slice(1));
            }
          } catch (_) {
            const queryStart = redirectUrl.indexOf("?");
            const hashStart = redirectUrl.indexOf("#");
            const raw =
              queryStart !== -1
                ? redirectUrl.slice(queryStart + 1).split("#")[0]
                : hashStart !== -1
                  ? redirectUrl.slice(hashStart + 1)
                  : "";
            params = new URLSearchParams(raw);
          }

          const token = params.get("token");
          if (!token) {
            sendResponse({ success: false, error: "No token in redirect URL" });
            return;
          }

          try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/auth/callback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential: token }),
              credentials: "include",
            });

            const data = await response.json();
            const accessTokenVal = data.access_token || data.accessToken;

            if (accessTokenVal) {
              accessToken = accessTokenVal;
              refreshToken = data.refresh_token || data.refreshToken || null;
              displayName = data.user.display_name || data.user.name || null;
              avatarUrl = data.user.avatar_url || data.user.avatar || null;

              const storageUpdates = {
                access_token: accessToken,
                display_name: displayName,
                avatar_url: avatarUrl,
              };
              if (refreshToken) {
                storageUpdates.refresh_token = refreshToken;
              }
              chrome.storage.local.set(storageUpdates, () => {
                chrome.runtime.sendMessage({
                  action: "auth_state_changed",
                  loggedIn: true,
                  displayName,
                  avatarUrl,
                }).catch(() => {});
                
                sendResponse({
                  success: true,
                  displayName,
                  avatarUrl
                });
              });
            } else {
              sendResponse({ success: false, error: "No access token in callback response" });
            }
          } catch (err) {
            console.error("Lỗi xác thực với backend:", err);
            sendResponse({ success: false, error: err.message });
          }
        }
      );
    })();
    return true;
  }

  if (request.action === "get_auth_state") {
    sendResponse({ loggedIn: !!accessToken, displayName, avatarUrl });
    return true;
  }

  // Verify stored token (and refresh if expired) without opening login page.
  // Returns { loggedIn, displayName, avatarUrl } same as get_auth_state.
  if (request.action === "verify_auth") {
    (async () => {
      // Already have a valid in-memory token — verify it quickly.
      if (accessToken) {
        try {
          const resp = await makeAuthenticatedRequest(CONFIG.AUTH_ME_URL, {
            method: "GET",
          });
          if (resp.ok) {
            const data = await resp.json();
            displayName = data.display_name || displayName;
            avatarUrl = data.avatar_url || avatarUrl;
            chrome.storage.local.set({
              display_name: displayName,
              avatar_url: avatarUrl,
            });
            sendResponse({ loggedIn: true, displayName, avatarUrl });
            return;
          }
          // Token expired — try refreshing (handled by makeAuthenticatedRequest)
          if (resp.status === 401) {
            sendResponse({ loggedIn: false, displayName: null, avatarUrl: null });
            return;
          }
        } catch (_) {
          // Network error, fall through
        }
      } else if (refreshToken) {
        // No access token but have refresh token
        const refreshed = await refreshExtensionToken();
        if (refreshed) {
          sendResponse({ loggedIn: true, displayName, avatarUrl });
          return;
        }
      }
      sendResponse({ loggedIn: false, displayName: null, avatarUrl: null });
    })();
    return true; // async response
  }

  if (request.action === "start_extension_session") {
    (async () => {
      try {
        const res = await makeAuthenticatedRequest(
          `${CONFIG.API_BASE_URL}/flashcards/extension-session`,
          {
            method: "POST",
          },
        );
        if (res.ok) {
          const data = await res.json();
          sendResponse(data);
        } else {
          sendResponse({ error: "Failed to build session" });
        }
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "submit_flashcard_answer") {
    (async () => {
      try {
        const res = await makeAuthenticatedRequest(
          `${CONFIG.API_BASE_URL}/flashcards/extension-submit-answer`,
          {
            method: "POST",
            body: JSON.stringify(request.data),
          },
        );
        const data = res.ok ? await res.json() : {};
        sendResponse(data);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "session_completed") {
    (async () => {
      try {
        const res = await makeAuthenticatedRequest(
          `${CONFIG.API_BASE_URL}/flashcards/extension-completed`,
          {
            method: "POST",
            body: JSON.stringify(request.data),
          },
        );
        const data = res.ok ? await res.json() : {};
        // Lưu thời điểm hoàn thành và xóa alarm để tránh trigger popup ngay sau khi học xong
        chrome.alarms.clear("entertainment_popup");
        chrome.storage.local.set({ flashcard_last_completed: Date.now() });
        sendResponse(data);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  if (request.action === "abandon_extension_session") {
    (async () => {
      try {
        // Xóa session trên server mà không tính XP
        await makeAuthenticatedRequest(
          `${CONFIG.API_BASE_URL}/flashcards/extension-abandon`,
          {
            method: "POST",
            body: JSON.stringify(request.data),
          },
        );
      } catch (e) {
        // Fire-and-forget, không cần phản hồi
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (request.action === "logout") {
    // Security check: Verify sender origin (only allow internal components like popup)
    if (sender.tab) {
      console.warn(
        "Security block: Rejected logout request from tab origin:",
        sender.tab.url || sender.url,
      );
      sendResponse({ success: false, error: "Unauthorized sender" });
      return false;
    }

    logoutLocal().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Domain blacklist handlers
  if (request.action === "add_domain_blacklist") {
    const domain = request.domain || "";
    const type = request.type || "session"; // 'session' or 'permanent'
    addToBlacklist(domain, type).then(() => {
      sendResponse({ success: true, blacklist: getDomainBlacklist() });
    });
    return true;
  }

  if (request.action === "remove_domain_blacklist") {
    const domain = request.domain || "";
    const type = request.type || "permanent";
    removeFromBlacklist(domain, type).then(() => {
      sendResponse({ success: true, blacklist: getDomainBlacklist() });
    });
    return true;
  }

  if (request.action === "get_domain_blacklist") {
    sendResponse(getDomainBlacklist());
    return true;
  }

  if (request.action === "is_domain_blacklisted") {
    const domain = request.domain || "";
    sendResponse({
      blacklisted: isDomainBlacklisted(domain),
      domain,
    });
    return true;
  }

  return false;
});

// ── Entertainment Site Tracking (Simple Alarm-based) ─────────────────
if (typeof chrome !== "undefined" && chrome.tabs) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) updateTracking(tabId, changeInfo.url);
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab?.url) updateTracking(activeInfo.tabId, tab.url);
    });
  });
}

async function updateTracking(tabId, url) {
  if (!url || !url.startsWith("http") || !chrome.alarms) return;

  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    const result = await chrome.storage.local.get([
      "extension_settings",
      "access_token",
    ]);
    const settings = result.extension_settings?.flashcard_popup;

    if (!result.access_token || !settings?.enabled) {
      chrome.alarms.clear("entertainment_popup");
      return;
    }

    const isMatch = settings.entertainment_urls?.some(
      (item) => (hostname === item.url || hostname.endsWith("." + item.url)) && item.enabled,
    );

    if (isMatch) {
      const alarm = await chrome.alarms.get("entertainment_popup");
      if (!alarm) {
        // Kiểm tra cooldown: không trigger popup trong vòng 30 phút sau khi vừa học xong
        const cooldownResult = await chrome.storage.local.get("flashcard_last_completed");
        const COOLDOWN_MS = 30 * 60 * 1000; // 30 phút
        if (
          cooldownResult.flashcard_last_completed &&
          Date.now() - cooldownResult.flashcard_last_completed < COOLDOWN_MS
        ) {
          console.log("[DeepTranslate] Cooldown active, skipping alarm creation.");
          return;
        }
        const waitMinutes = settings.timeout || 5;
        chrome.alarms.create("entertainment_popup", {
          delayInMinutes: waitMinutes,
        });
        chrome.storage.local.set({ tracking_tab_id: tabId });
        console.log(
          `[DeepTranslate] Tracking started for ${hostname}. Alarm in ${waitMinutes}m`,
        );
      }
    } else {
      chrome.alarms.clear("entertainment_popup");
    }
  } catch (e) {
    if (chrome.alarms) chrome.alarms.clear("entertainment_popup");
  }
}

if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "entertainment_popup") {
      try {
        const res = await chrome.storage.local.get("tracking_tab_id");
        if (res.tracking_tab_id) {
          chrome.tabs
            .sendMessage(res.tracking_tab_id, {
              action: "show_flashcard_invite_trigger",
            })
            .catch(() => { });
        }
      } catch (err) { }
    }
  });
}


