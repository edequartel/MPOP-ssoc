// file: elevenlabs-howler.js
/* global Howl, JSZip */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    authSection: $("authSection"),
    authLoggedOut: $("authLoggedOut"),
    authLoggedIn: $("authLoggedIn"),
    protectedContent: $("protectedContent"),
    email: $("email"),
    password: $("password"),
    btnSignIn: $("btnSignIn"),
    btnSignOut: $("btnSignOut"),
    btnTogglePassword: $("btnTogglePassword"),
    authMsg: $("authMsg"),
    userEmail: $("userEmail"),
    btnToggleStatusPanel: $("btnToggleStatusPanel"),
    statusPanel: $("statusPanel"),
    voiceId: $("voiceId"),
    text: $("text"),
    modelId: $("modelId"),
    outputFormat: $("outputFormat"),
    mergeGapMs: $("mergeGapMs"),
    chkRememberVoice: $("chkRememberVoice"),
    chkRememberModel: $("chkRememberModel"),
    chkTryMSE: $("chkTryMSE"),
    btnVoiceInfo: $("btnVoiceInfo"),
    btnPlay: $("btnPlay"),
    btnStop: $("btnStop"),
    btnClear: $("btnClear"),
    btnClearText: $("clearTextBtn"), // <-- added
    btnDownload: $("btnDownload"),
    btnProduceMergedJwt: $("btnProduceMergedJwt"),
    btnPlayMerged: $("btnPlayMerged"),
    btnDownloadMergedFile: $("btnDownloadMergedFile"),
    btnDownloadSplitFiles: $("btnDownloadSplitFiles"),
    btnDownloadSplitZip: $("btnDownloadSplitZip"),
    btnRefreshCredits: $("btnRefreshCredits"),
    creditSummary: $("creditSummary"),
    creditUsed: $("creditUsed"),
    creditRemaining: $("creditRemaining"),
    creditLimit: $("creditLimit"),
    creditTier: $("creditTier"),
    creditMeta: $("creditMeta"),
    status: $("status"),
    log: $("log"),
  };

  let currentHowl = null;
  let currentObjectUrl = null;
  let currentAbort = null;
  let lastAudioBlob = null;
  let lastAudioFilename = null;
  let mergedAudio = null;
  let mergedAudioVersion = "";
  let sb = null;
  let sbConfig = null;
  let savedVoiceIdPref = "";
  let preparedMergedSources = [];
  const voiceLinkById = new Map();
  const FIXED_OUTPUT_FORMAT = "mp3_44100_128";
  const BRAILLE_AUDIO_BASE_URL = "https://www.tastenbraille.com/braillestudio";
  const MIXED_MERGE_OUTPUT_DIR = "/sounds/nl/out/";
  const MIXED_MERGE_OUTPUT_FILENAME = "merged.mp3";
  const MIXED_MERGE_PARTS_PATH = "sounds/nl/instruction/_parts";
  const SPEECH_BASE_PATH = "/sounds/nl/speech/";
  const GENERAL_BASE_PATH = "/sounds/general/";
  const DOWNLOAD_MERGED_API_URL = "https://www.tastenbraille.com/api/download_merged.php";
  const STORAGE = Object.freeze({
    rememberVoice: "elevenlabs.remember.voiceId",
    rememberModel: "elevenlabs.remember.modelId",
    voiceId: "elevenlabs.voiceId",
    voiceName: "elevenlabs.voiceName",
    modelId: "elevenlabs.modelId",
    mergeGapMs: "mixedmerge.gapMs",
  });

  function msg(el, text, ok = true) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("error", !ok && !!text);
    el.classList.toggle("success", ok && !!text);
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  function storageDel(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  async function initSupabaseClient() {
    const CONFIG_URL_LOCAL = "../supabase-config.js";
    const OWN_SERVER_BASE_URL = "https://www.tastenbraille.com/MPOP";
    const LOCAL_SUPABASE_CONFIG = Object.freeze({
      url: "https://zrcdyzcfsdlmqqwdhctk.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyY2R5emNmc2RsbXFxd2RoY3RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxOTgyNzUsImV4cCI6MjA4Mzc3NDI3NX0.voT1eh_FbBkrv7ZMN7B8VRRbrab7tyx3eV6JuXy4ySs"
    });
    const CONFIG_URLS_REMOTE = [
      `${OWN_SERVER_BASE_URL}/supabase-config.js`,
      "https://www.tastenbraille.com/braillestudio/api/supabase-config",
    ];
    let cfg = LOCAL_SUPABASE_CONFIG;
    try {
      const mod = await import(CONFIG_URL_LOCAL);
      cfg = mod?.supabaseConfig || mod?.default || LOCAL_SUPABASE_CONFIG;
    } catch {
      cfg = LOCAL_SUPABASE_CONFIG;
    }
    if (!cfg?.url || !cfg?.anonKey) {
      let lastError = null;
      for (const url of CONFIG_URLS_REMOTE) {
        try {
          const res = await fetch(url);
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Failed to load supabase-config from ${url} (${res.status}). ${body}`.trim());
          }
          const json = await res.json();
          if (json?.url && json?.anonKey) {
            cfg = json;
            break;
          }
          throw new Error(`Supabase config missing url/anonKey from ${url}.`);
        } catch (e) {
          lastError = e;
        }
      }
      if (!cfg?.url || !cfg?.anonKey) {
        throw lastError || new Error("Supabase config missing url/anonKey.");
      }
    }
    sbConfig = cfg;
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    return createClient(cfg.url, cfg.anonKey);
  }

  function setAuthUiVisible(loggedIn, session = null) {
    if (els.authLoggedOut) els.authLoggedOut.hidden = !!loggedIn;
    if (els.authLoggedIn) els.authLoggedIn.hidden = !loggedIn;
    if (els.protectedContent) els.protectedContent.hidden = !loggedIn;
    if (els.userEmail) els.userEmail.textContent = session?.user?.email || "";
  }

  function setSignedOutState() {
    setAuthUiVisible(false);
    if (hasCreditsUi()) {
      setCreditsFields();
      setCreditsSummary("Login vereist", "Log eerst in om ElevenLabs-credits en audiofuncties te gebruiken.");
    }
    if (els.voiceId) {
      els.voiceId.innerHTML = "<option value=\"\">Log eerst in</option>";
    }
  }

  async function refreshAuthUI(passedSession = null) {
    if (!sb) sb = await initSupabaseClient();
    let session = passedSession;
    if (!session) {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      session = data?.session ?? null;
    }

    const loggedIn = !!session?.user;
    setAuthUiVisible(loggedIn, session);

    if (!loggedIn) {
      setSignedOutState();
      return null;
    }

    msg(els.authMsg, "");
    await loadVoicesFromSupabase();
    await loadElevenLabsCredits();
    return session;
  }

  async function signIn() {
    try {
      if (!sb) sb = await initSupabaseClient();
      msg(els.authMsg, "");
      const email = (els.email?.value || "").trim();
      const password = els.password?.value || "";
      if (!email || !password) {
        throw new Error("Vul e-mail en wachtwoord in.");
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      msg(els.authMsg, "Ingelogd.");
      await refreshAuthUI(data?.session ?? null);
      log(`Signed in as ${data?.session?.user?.email || email}.`);
    } catch (e) {
      msg(els.authMsg, e?.message || String(e), false);
      log(`Sign-in failed: ${e?.message || e}`);
    }
  }

  async function signOut() {
    try {
      if (!sb) sb = await initSupabaseClient();
      msg(els.authMsg, "");
      await sb.auth.signOut();
      setSignedOutState();
      log("Signed out.");
    } catch (e) {
      msg(els.authMsg, e?.message || String(e), false);
      log(`Sign-out failed: ${e?.message || e}`);
    }
  }

  function wirePasswordToggle() {
    const input = els.password;
    const btn = els.btnTogglePassword;
    if (!input || !btn) return;
    const eye = btn.querySelector(".icon-eye");
    const eyeOff = btn.querySelector(".icon-eye-off");
    const setVisible = (visible) => {
      input.type = visible ? "text" : "password";
      btn.setAttribute("aria-pressed", visible ? "true" : "false");
      btn.setAttribute("aria-label", visible ? "Verberg wachtwoord" : "Toon wachtwoord");
      if (eye) eye.classList.toggle("hidden", visible);
      if (eyeOff) eyeOff.classList.toggle("hidden", !visible);
    };
    setVisible(false);
    btn.addEventListener("click", () => setVisible(input.type === "password"));
  }

  function getSupabaseFunctionUrl(functionName) {
    const ownServerBaseUrl = "https://www.tastenbraille.com/MPOP";
    const routes = {
      "elevenlabs-subscription": "elevenlabs_subscription.php",
      "merge-proxy": "merge_proxy.php",
      "tts-proxy": "tts_proxy.php",
      "upload-mp3-proxy": "upload_mp3_proxy.php",
    };
    const route = routes[functionName];
    if (!route) throw new Error(`Unknown server function: ${functionName}`);
    return `${ownServerBaseUrl}/api/${route}`;
  }

  async function getFreshSupabaseAccessToken(forceRefresh = false) {
    if (!sb) sb = await initSupabaseClient();
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;

    let session = sessionData?.session ?? null;
    const expiresAt = Number(session?.expires_at || 0);
    const now = Math.floor(Date.now() / 1000);
    const shouldRefresh = forceRefresh || !session || (expiresAt > 0 && expiresAt - now < 30);

    if (shouldRefresh) {
      const { data: refreshed, error: refreshError } = await sb.auth.refreshSession();
      if (refreshError) throw refreshError;
      session = refreshed?.session ?? session;
    }

    const token = (session?.access_token || "").trim();
    if (!token) throw new Error("No active Supabase session. Sign in first.");
    return token;
  }

  async function fetchWithJwtRetry(functionName, init) {
    let jwt = await getFreshSupabaseAccessToken(false);
    let res = await fetch(getSupabaseFunctionUrl(functionName), {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (res.status === 401) {
      jwt = await getFreshSupabaseAccessToken(true);
      res = await fetch(getSupabaseFunctionUrl(functionName), {
        ...init,
        headers: {
          ...(init?.headers || {}),
          Authorization: `Bearer ${jwt}`,
        },
      });
    }

    return res;
  }

  function setVoiceOptions(rows) {
    if (!els.voiceId) return;
    voiceLinkById.clear();
    els.voiceId.innerHTML = "";
    if (!rows.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No voices found";
      els.voiceId.appendChild(option);
      refreshVoiceInfoButton();
      return;
    }
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = (row.voice_id || "").trim();
      const labelName = (row.name || row.voice_id || "").trim();
      const labelLanguage = (row.language || "").trim();
      option.textContent = `${labelName}${labelLanguage ? ` - ${labelLanguage}` : ""}`;
      if (!option.value || !option.textContent) continue;
       voiceLinkById.set(option.value, (row.voice_link || "").trim());
      els.voiceId.appendChild(option);
    }
    refreshVoiceInfoButton();
  }

  function applySavedVoiceSelection() {
    if (!els.voiceId) return;
    const options = Array.from(els.voiceId.options);
    if (!options.length) return;
    if (savedVoiceIdPref && options.some((opt) => opt.value === savedVoiceIdPref)) {
      els.voiceId.value = savedVoiceIdPref;
    } else {
      els.voiceId.selectedIndex = 0;
    }
    refreshVoiceInfoButton();
  }

  function getSelectedVoiceLink() {
    const voiceId = (els.voiceId?.value || "").trim();
    if (!voiceId) return "";
    return (voiceLinkById.get(voiceId) || "").trim();
  }

  function refreshVoiceInfoButton() {
    if (!els.btnVoiceInfo) return;
    const link = getSelectedVoiceLink();
    els.btnVoiceInfo.disabled = !link;
    els.btnVoiceInfo.title = link || "No info link for selected voice";
  }

  function onVoiceInfoClick() {
    const link = getSelectedVoiceLink();
    if (!link) return;
    window.open(link, "_blank", "noreferrer");
  }

  async function loadVoicesFromSupabase() {
    if (!els.voiceId) return;
    els.voiceId.innerHTML = "<option value=\"\">Loading voices...</option>";
    try {
      if (!sb) sb = await initSupabaseClient();
      const { data, error } = await sb
        .from("voices")
        .select("name, language, voice_id, voice_link")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data || []).filter((r) => (r?.voice_id || "").trim());
      setVoiceOptions(rows);
      applySavedVoiceSelection();
      persistVoiceId();
      log(`Loaded ${rows.length} voices from Supabase.`);
    } catch (e) {
      els.voiceId.innerHTML = "<option value=\"\">Could not load voices</option>";
      refreshVoiceInfoButton();
      const msgParts = [
        e?.message || String(e || "Unknown error"),
        e?.code ? `code=${e.code}` : "",
        e?.hint ? `hint=${e.hint}` : "",
        e?.details ? `details=${e.details}` : "",
      ].filter(Boolean);
      log(`ERROR loading voices: ${msgParts.join(" | ")}`);
    }
  }

  function isRememberVoiceEnabled() {
    if (!els.chkRememberVoice) return false;
    return !!els.chkRememberVoice.checked;
  }

  function isRememberModelEnabled() {
    if (!els.chkRememberModel) return false;
    return !!els.chkRememberModel.checked;
  }

  function persistRememberFlags() {
    if (els.chkRememberVoice) storageSet(STORAGE.rememberVoice, isRememberVoiceEnabled() ? "1" : "0");
    if (els.chkRememberModel) storageSet(STORAGE.rememberModel, isRememberModelEnabled() ? "1" : "0");
  }

  function persistVoiceId(valueRaw) {
    if (!els.voiceId) return;
    const value = (valueRaw ?? els.voiceId.value ?? "").trim();
    const selectedName = (els.voiceId?.selectedOptions?.[0]?.textContent || "").trim();

    if (!isRememberVoiceEnabled()) {
      storageDel(STORAGE.voiceId);
      storageDel(STORAGE.voiceName);
      return;
    }

    if (!value) {
      storageDel(STORAGE.voiceId);
      storageDel(STORAGE.voiceName);
      return;
    }
    storageSet(STORAGE.voiceId, value);
    if (selectedName) storageSet(STORAGE.voiceName, selectedName);
    else storageDel(STORAGE.voiceName);
  }

  function persistModelId(valueRaw) {
    if (!els.modelId) return;
    const value = (valueRaw ?? els.modelId.value ?? "").trim();

    if (!isRememberModelEnabled()) {
      storageDel(STORAGE.modelId);
      return;
    }

    if (!value) storageDel(STORAGE.modelId);
    else storageSet(STORAGE.modelId, value);
  }

  function persistMergeGapMs(valueRaw) {
    if (!els.mergeGapMs) return;
    const raw = (valueRaw ?? els.mergeGapMs.value ?? "").trim();
    const n = Number.parseInt(raw, 10);
    const gap = Number.isFinite(n) ? Math.min(5000, Math.max(0, n)) : 500;
    els.mergeGapMs.value = String(gap);
    storageSet(STORAGE.mergeGapMs, String(gap));
  }

  function loadPrefs() {
    const rememberVoice = storageGet(STORAGE.rememberVoice);
    const rememberModel = storageGet(STORAGE.rememberModel);

    if (els.chkRememberVoice) {
      els.chkRememberVoice.checked = rememberVoice == null ? true : rememberVoice === "1";
    }
    if (els.chkRememberModel) {
      els.chkRememberModel.checked = rememberModel == null ? true : rememberModel === "1";
    }

    if (isRememberVoiceEnabled()) {
      savedVoiceIdPref = (storageGet(STORAGE.voiceId) || "").trim();
    }

    if (isRememberModelEnabled()) {
      const savedModelId = storageGet(STORAGE.modelId);
      if (savedModelId && els.modelId) els.modelId.value = savedModelId;
    }

    const savedMergeGapMs = storageGet(STORAGE.mergeGapMs);
    if (els.mergeGapMs) {
      els.mergeGapMs.value = (savedMergeGapMs || "500").trim() || "500";
      persistMergeGapMs(els.mergeGapMs.value);
    }
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
  }

  function setStatusPanelVisible(visible) {
    if (!els.statusPanel) return;
    els.statusPanel.hidden = !visible;
    if (els.btnToggleStatusPanel) {
      els.btnToggleStatusPanel.textContent = visible ? "Hide status" : "Show status";
      els.btnToggleStatusPanel.setAttribute("aria-pressed", visible ? "true" : "false");
    }
  }

  function hasCreditsUi() {
    return !!(els.creditSummary || els.creditUsed || els.creditRemaining || els.creditLimit || els.creditTier || els.creditMeta);
  }

  function setCreditsSummary(summary, meta = "") {
    if (els.creditSummary) els.creditSummary.textContent = summary;
    if (els.creditMeta) els.creditMeta.textContent = meta;
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return new Intl.NumberFormat("nl-NL").format(n);
  }

  function formatUnixDate(unixSeconds) {
    const n = Number(unixSeconds);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(n * 1000));
    } catch {
      return "";
    }
  }

  function setCreditsFields({ used = "-", remaining = "-", limit = "-", tier = "-" } = {}) {
    if (els.creditUsed) els.creditUsed.textContent = used;
    if (els.creditRemaining) els.creditRemaining.textContent = remaining;
    if (els.creditLimit) els.creditLimit.textContent = limit;
    if (els.creditTier) els.creditTier.textContent = tier;
  }

  async function fetchElevenLabsSubscription() {
    const res = await fetchWithJwtRetry("elevenlabs-subscription", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    const bodyText = await res.text().catch(() => "");
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch {}

    if (!res.ok) {
      const detail = body?.error || body?.details || bodyText || res.statusText;
      throw new Error(`elevenlabs-subscription failed (${res.status}). ${String(detail).trim()}`);
    }

    return body || {};
  }

  async function loadElevenLabsCredits() {
    if (!hasCreditsUi()) return;

    if (els.btnRefreshCredits) els.btnRefreshCredits.disabled = true;
    setCreditsSummary("Credits laden...", "Bezig met ophalen via beveiligde server-call.");

    try {
      const body = await fetchElevenLabsSubscription();
      const used = Number(body?.character_count || 0);
      const limit = Number(body?.character_limit || 0);
      const remaining = Math.max(0, limit - used);
      const tier = String(body?.tier || body?.status || "-").trim() || "-";
      const resetAt = formatUnixDate(body?.next_character_count_reset_unix);

      setCreditsFields({
        used: formatNumber(used),
        remaining: formatNumber(remaining),
        limit: formatNumber(limit),
        tier,
      });
      setCreditsSummary(
        `${formatNumber(remaining)} credits beschikbaar`,
        resetAt ? `Reset op ${resetAt}.` : "Actuele stand opgehaald via beveiligde server-call."
      );
      log(`ElevenLabs credits loaded: used=${used}, remaining=${remaining}, limit=${limit}, tier=${tier}.`);
    } catch (e) {
      setCreditsFields();
      setCreditsSummary("Credits niet beschikbaar", e?.message || String(e));
      log(`ERROR loading ElevenLabs credits: ${e?.message || e}`);
    } finally {
      if (els.btnRefreshCredits) els.btnRefreshCredits.disabled = false;
    }
  }

  function safeFilenamePart(s) {
    return String(s || "")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function setLastAudio(blob, { voiceId, modelId } = {}) {
    lastAudioBlob = blob || null;
    if (!lastAudioBlob) {
      lastAudioFilename = null;
      if (els.btnDownload) els.btnDownload.disabled = true;
      return;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const voicePart = safeFilenamePart(voiceId) || "voice";
    const modelPart = safeFilenamePart(modelId) || "model";
    lastAudioFilename = `elevenlabs-${voicePart}-${modelPart}-${ts}.mp3`;
    if (els.btnDownload) els.btnDownload.disabled = false;
  }

  function clearLastAudio() {
    setLastAudio(null);
  }

  function log(msg) {
    if (!els.log) return;
    const ts = new Date().toISOString().slice(11, 19);
    els.log.textContent += `[${ts}] ${msg}\n`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function cleanupAudio({ abortFetch = true } = {}) {
    try {
      if (abortFetch && currentAbort) currentAbort.abort();
    } catch {}
    if (abortFetch) currentAbort = null;

    try {
      if (currentHowl) {
        currentHowl.stop();
        currentHowl.unload();
      }
    } catch {}
    currentHowl = null;

    if (currentObjectUrl) {
      try { URL.revokeObjectURL(currentObjectUrl); } catch {}
      currentObjectUrl = null;
    }
  }

  function buildAudioUrl(path) {
    const p = String(path || "").trim();
    if (!p) return "";
    if (/^https?:\/\//i.test(p)) return p;
    return `${BRAILLE_AUDIO_BASE_URL}${p.startsWith("/") ? p : `/${p}`}`;
  }

  // IMPORTANT:
  // - eleven_v3 rejects legacy "stability" values like 0.6 and expects ttd_stability in {0.0, 0.5, 1.0}.
  // - For non-v3 models, stability/similarity_boost are fine.
  function buildBody(text, modelIdRaw) {
    const modelId = (modelIdRaw || "").trim();

    // Minimal baseline
    const body = { text };

    if (modelId) body.model_id = modelId;

    // Voice settings per model
    if (modelId === "eleven_v3") {
      // Allowed: 0.0, 0.5, 1.0
      body.voice_settings = {
        ttd_stability: 0.5, // Natural
      };
      // Note: do NOT send "stability" or "similarity_boost" here for v3.
    } else {
      body.voice_settings = {
        stability: 0.6,
        similarity_boost: 0.8,
      };
    }

    return body;
  }

  async function synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text, modelId, outputFormat }) {
    const body = buildBody(text, modelId);
    const payload = {
      text,
      voiceId,
      modelId: typeof body.model_id === "string" ? body.model_id : "",
      outputFormat,
      voice_settings: body.voice_settings,
    };

    const res = await fetchWithJwtRetry("tts-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`TTS proxy failed (${res.status}). ${errText}`.trim());
    }

    return res.blob();
  }

  async function fetchSpeechTokenMp3Blob(token) {
    const normalized = String(token || "").replace(/\.mp3$/i, "").trim();
    if (!normalized) throw new Error("Speech token is empty.");
    const relPath = `${SPEECH_BASE_PATH}${normalized}.mp3`;
    const res = await fetch(buildAudioUrl(relPath), { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Speech token fetch failed (${res.status}) for ${relPath}. ${body}`.trim());
    }
    return res.blob();
  }

  function parseMixedTextSegments(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) throw new Error("Text is empty.");

    const segments = [];
    const re = /<([^>]+)>|\{([^}]+)\}/g;
    let cursor = 0;
    let match;

    while ((match = re.exec(raw)) !== null) {
      const textBefore = raw.slice(cursor, match.index).replace(/\s+/g, " ").trim();
      if (textBefore) segments.push({ type: "tts", value: textBefore });

      const isSpeechToken = typeof match[1] === "string" && match[1] !== "";
      const tokenType = isSpeechToken ? "speech" : "general";
      const tokenRaw = (match[1] || match[2] || "").replace(/\s+/g, " ").trim();
      if (tokenRaw) {
        const tokenParts = tokenRaw.split(",").map((s) => s.trim()).filter(Boolean);
        for (const token of tokenParts) segments.push({ type: tokenType, value: token });
      }
      cursor = re.lastIndex;
    }

    const textAfter = raw.slice(cursor).replace(/\s+/g, " ").trim();
    if (textAfter) segments.push({ type: "tts", value: textAfter });

    if (!segments.length) {
      throw new Error("No valid segments found. Use text and optionally <speech-token> or {general-token} tags.");
    }
    return segments;
  }

  function getMergeGapMs() {
    const raw = (els.mergeGapMs?.value || storageGet(STORAGE.mergeGapMs) || "500").trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 500;
    return Math.min(5000, Math.max(0, n));
  }

  function parseHashSeparatedGroups(rawInput) {
    const raw = String(rawInput || "");
    const groups = raw
      .split("#")
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!groups.length) {
      throw new Error("No # segments found. Separate each download with #.");
    }
    return groups;
  }

  async function uploadBlobToStoryEndpoint(blob, { path, audiofile }) {
    const form = new FormData();
    form.append("path", path);
    form.append("audiofile", audiofile);
    form.append("file", blob, audiofile);

    const res = await fetchWithJwtRetry("upload-mp3-proxy", {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
      body: form,
    });

    const body = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`MP3 upload failed (${res.status}). ${body}`.trim());
    try { return JSON.parse(body); } catch { return { ok: true, raw: body }; }
  }

  function isProbablyIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  async function saveAudioBlobToFiles(blob, filename) {
    // Best UX on iOS: Share Sheet -> "Save to Files"
    try {
      const file = new File([blob], filename, { type: blob.type || "audio/mpeg" });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: "Audio file",
        });
        return { method: "share" };
      }
    } catch {
      // continue to fallback
    }

    // Fallback: classic download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "elevenlabs.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 0);

    return { method: "anchor" };
  }

  function downloadBlobViaAnchor(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "elevenlabs.mp3";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 0);
  }

  function buildSplitFilename(index, rawText) {
    const textPart = safeFilenamePart(rawText).slice(0, 40) || "part";
    return `elevenlabs-part-${String(index).padStart(3, "0")}-${textPart}.mp3`;
  }

  async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchAudioBlobViaProxy(url) {
    const res = await fetchWithJwtRetry("audio-download-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Audio download proxy failed (${res.status}). ${body}`.trim());
    }

    return res.blob();
  }

  async function mergeSourcesToBlob(sources, outputFilename) {
    const mergeRes = await fetchWithJwtRetry("merge-proxy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        outputDir: MIXED_MERGE_OUTPUT_DIR,
        sources,
        outputFilename,
        gapMs: getMergeGapMs(),
        debug: true,
        tryCopyFirst: false,
      }),
    });

    const mergeBodyText = await mergeRes.text().catch(() => "");
    let mergeBody = null;
    try { mergeBody = mergeBodyText ? JSON.parse(mergeBodyText) : null; } catch {}
    if (!mergeRes.ok || mergeBody?.ok === false) {
      throw new Error(`Mixed merge failed (${mergeRes.status}). ${mergeBodyText}`.trim());
    }

    const outputUrlRaw = mergeBody?.outputUrl || mergeBody?.url || `${MIXED_MERGE_OUTPUT_DIR}${outputFilename}`;
    const outputUrl = buildAudioUrl(outputUrlRaw);

    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        log(`Split merged fetch attempt ${attempt}: ${outputUrl}`);
        const proxiedUrl = `${outputUrl}${outputUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
        return await fetchAudioBlobViaProxy(proxiedUrl);
      } catch (e) {
        lastError = e;
        if (attempt < 5) {
          await sleep(500 * attempt);
        }
      }
    }

    throw lastError || new Error("Merged audio fetch failed.");
  }

  async function buildBlobForMixedGroup(groupText, { voiceId, modelId, outputFormat, stem }) {
    const segments = parseMixedTextSegments(groupText);
    if (segments.length === 1) {
      const seg = segments[0];
      if (seg.type === "speech") {
        log(`Split group uses speech token: ${seg.value}`);
        return { kind: "blob", value: await fetchSpeechTokenMp3Blob(seg.value) };
      }
      if (seg.type === "general") {
        log(`Split group uses general token: ${seg.value}`);
        const normalized = String(seg.value || "").replace(/\.mp3$/i, "").trim();
        const relPath = `${GENERAL_BASE_PATH}${normalized}.mp3`;
        const res = await fetch(buildAudioUrl(relPath), { cache: "no-store" });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`General token fetch failed (${res.status}) for ${relPath}. ${body}`.trim());
        }
        return { kind: "blob", value: await res.blob() };
      }
      return {
        kind: "blob",
        value: await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat }),
      };
    }

    const sources = [];
    let partNo = 1;
    for (const seg of segments) {
      if (seg.type === "speech") {
        const normalized = seg.value.replace(/\.mp3$/i, "");
        log(`Split merge source [speech]: ${normalized}`);
        sources.push(`${SPEECH_BASE_PATH}${normalized}.mp3`);
        continue;
      }
      if (seg.type === "general") {
        const normalized = seg.value.replace(/\.mp3$/i, "");
        log(`Split merge source [general]: ${normalized}`);
        sources.push(`${GENERAL_BASE_PATH}${normalized}.mp3`);
        continue;
      }
      log(`Split merge source [tts]: ${seg.value}`);
      const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat });
      const partFilename = `${stem}-part-${String(partNo).padStart(3, "0")}.mp3`;
      log(`Split upload part -> ${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
      await uploadBlobToStoryEndpoint(blob, {
        path: MIXED_MERGE_PARTS_PATH,
        audiofile: partFilename,
      });
      sources.push(`/${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
      partNo += 1;
    }

    log(`Split merge call with ${sources.length} sources -> ${stem}.mp3`);
    return { kind: "blob", value: await mergeSourcesToBlob(sources, `${stem}.mp3`) };
  }

  function setDownloadSplitFilesButtonBusy(busy, label = "Download # MP3s") {
    if (!els.btnDownloadSplitFiles) return;
    els.btnDownloadSplitFiles.disabled = !!busy;
    els.btnDownloadSplitFiles.textContent = busy ? label : "Download # MP3s";
  }

  function setDownloadSplitZipButtonBusy(busy, label = "Download # ZIP") {
    if (!els.btnDownloadSplitZip) return;
    els.btnDownloadSplitZip.disabled = !!busy;
    els.btnDownloadSplitZip.textContent = busy ? label : "Download # ZIP";
  }

  async function buildSplitDownloads({ voiceId, text, modelId, outputFormat }) {
    const groups = parseHashSeparatedGroups(text);
    log(`Preparing ${groups.length} split download${groups.length === 1 ? "" : "s"} from # separators.`);

    const readyDownloads = [];
    let completed = 0;
    let index = 1;
    for (const groupText of groups) {
      try {
        const stem = `split-${Date.now()}-${String(index).padStart(3, "0")}`;
        const filename = buildSplitFilename(index, groupText);
        const result = await buildBlobForMixedGroup(groupText, { voiceId, modelId, outputFormat, stem });
        readyDownloads.push({ filename, blob: result.value, index });
        log(`Split bestand klaar [deel ${index}]: ${filename}`);
        completed += 1;
      } catch (e) {
        log(`Split download failed [deel ${index}] "${groupText}": ${e?.message || e}`);
      }
      index += 1;
    }

    if (!completed) {
      throw new Error("No split downloads succeeded.");
    }
    return { groups, readyDownloads, completed };
  }

  async function onDownloadSplitFiles() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);

    if (!voiceId || !text) {
      log("Missing required fields for split download: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }

    setDownloadSplitFilesButtonBusy(true, "Downloading...");
    try {
      setStatus("Preparing split downloads…");
      const { groups, readyDownloads, completed } = await buildSplitDownloads({ voiceId, text, modelId, outputFormat });
      for (const item of readyDownloads) {
        downloadBlobViaAnchor(item.blob, item.filename);
        log(`Download started [deel ${item.index}]: ${item.filename}`);
        await sleep(750);
      }
      log(`Split download klaar: ${completed}/${groups.length} bestanden gestart.`);
      setStatus("Idle");
    } catch (e) {
      log(`Split download failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setDownloadSplitFilesButtonBusy(false);
    }
  }

  async function onDownloadSplitZip() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);

    if (!voiceId || !text) {
      log("Missing required fields for split ZIP: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }
    if (typeof JSZip === "undefined") {
      log("Split ZIP failed: JSZip not loaded.");
      setStatus("Error");
      return;
    }

    setDownloadSplitZipButtonBusy(true, "Building ZIP...");
    try {
      setStatus("Preparing ZIP…");
      const { groups, readyDownloads, completed } = await buildSplitDownloads({ voiceId, text, modelId, outputFormat });
      const zip = new JSZip();
      for (const item of readyDownloads) {
        zip.file(item.filename, item.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFilename = `elevenlabs-split-${String(groups.length).padStart(3, "0")}-files.zip`;
      downloadBlobViaAnchor(zipBlob, zipFilename);
      log(`ZIP download started: ${zipFilename} (${completed}/${groups.length} bestanden).`);
      setStatus("Idle");
    } catch (e) {
      log(`Split ZIP failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setDownloadSplitZipButtonBusy(false);
    }
  }

  async function onPlay() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;

    persistRememberFlags();
    persistVoiceId(voiceId);
    persistModelId(modelId);
    clearLastAudio();

    if (!voiceId || !text) {
      log("Missing required fields: Voice ID and Text are required.");
      setStatus("Missing input");
      return;
    }

    // Stop anything currently playing and abort any current fetch
    cleanupAudio({ abortFetch: true });

    // Create controller for this play
    currentAbort = new AbortController();

    els.btnPlay && (els.btnPlay.disabled = true);
    els.btnStop && (els.btnStop.disabled = false);

    try {
      log("Using secured TTS proxy for playback.");
      setStatus("Downloading…");
      const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text, modelId, outputFormat });
      setLastAudio(blob, { voiceId, modelId });
      const url = URL.createObjectURL(blob);
      currentObjectUrl = url;
      await new Promise((resolve, reject) => {
        setStatus("Playing…");
        currentHowl = new Howl({
          src: [url],
          html5: true,
          format: ["mp3"],
          onplay: () => log("Howler: play"),
          onend: () => {
            log("Howler: end");
            setStatus("Idle");
            resolve();
          },
          onloaderror: (_id, err) => reject(new Error(`Howler load error: ${err}`)),
          onplayerror: (_id, err) => reject(new Error(`Howler play error: ${err}`)),
        });
        currentHowl.play();
      });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/aborted/i.test(msg) || (e?.name && String(e.name).toLowerCase().includes("abort"))) {
        log("Fetch aborted (likely Stop pressed).");
        setStatus("Idle");
      } else {
        log(`ERROR: ${msg}`);
        setStatus("Error");
      }
    } finally {
      els.btnPlay && (els.btnPlay.disabled = false);
      els.btnStop && (els.btnStop.disabled = false);
      if (els.status && (els.status.textContent === "Downloading…" || els.status.textContent === "Streaming…")) {
        setStatus("Idle");
      }
    }
  }

  function onStop() {
    log("Stop pressed.");
    cleanupAudio({ abortFetch: true });
    stopMergedPlayback();
    setStatus("Idle");
    els.btnPlay && (els.btnPlay.disabled = false);
    els.btnStop && (els.btnStop.disabled = true);
  }

  function onClear() {
    if (els.log) els.log.textContent = "";
    stopMergedPlayback();
    log("Log cleared.");
  }

  function onClearText() {
    if (!els.text) return;
    els.text.value = "";
    els.text.focus();
    log("Text cleared.");
  }

  async function onDownload() {
    if (!lastAudioBlob) {
      log("No audio available to download yet.");
      return;
    }

    const filename = lastAudioFilename || "elevenlabs.mp3";

    try {
      setStatus("Preparing download…");

      const { method } = await saveAudioBlobToFiles(lastAudioBlob, filename);

      if (method === "share") {
        log(`Opened Share Sheet for: ${filename} (use "Save to Files").`);
        setStatus("Idle");
        return;
      }

      // Anchor fallback
      if (isProbablyIOS()) {
        log(`Download link triggered for: ${filename}. If iOS does not save it automatically, use the Share button in the opened audio view to "Save to Files".`);
      } else {
        log(`Download started: ${filename}`);
      }

      setStatus("Idle");
    } catch (e) {
      log(`Download failed: ${e?.message || e}`);
      setStatus("Error");
    }
  }

  function setProduceMergedJwtButtonBusy(busy, label = "Produce") {
    if (!els.btnProduceMergedJwt) return;
    els.btnProduceMergedJwt.disabled = !!busy;
    els.btnProduceMergedJwt.textContent = busy ? label : "Produce";
    if (els.btnPlayMerged) els.btnPlayMerged.disabled = !!busy;
    if (els.btnDownloadMergedFile) els.btnDownloadMergedFile.disabled = !!busy;
  }

  function getMergedAudioUrl() {
    const base = buildAudioUrl(`${MIXED_MERGE_OUTPUT_DIR}${MIXED_MERGE_OUTPUT_FILENAME}`);
    if (!mergedAudioVersion) return base;
    return `${base}${base.includes("?") ? "&" : "?"}v=${encodeURIComponent(mergedAudioVersion)}`;
  }

  function setMergedPlayButtonText(isPlaying) {
    if (!els.btnPlayMerged) return;
    els.btnPlayMerged.textContent = isPlaying ? "Pause" : "Play";
  }

  function stopMergedPlayback() {
    if (!mergedAudio) return;
    try { mergedAudio.pause(); } catch {}
    try { mergedAudio.currentTime = 0; } catch {}
    setMergedPlayButtonText(false);
  }

  function ensureMergedAudio() {
    if (mergedAudio) return mergedAudio;
    mergedAudio = new Audio();
    mergedAudio.preload = "none";
    mergedAudio.addEventListener("ended", () => setMergedPlayButtonText(false));
    return mergedAudio;
  }

  function onPlayMerged() {
    const player = ensureMergedAudio();
    const nextUrl = getMergedAudioUrl();
    const currentNoHash = (player.src || "").split("#")[0];
    if (!currentNoHash || currentNoHash !== nextUrl) {
      player.src = nextUrl;
    }
    if (!player.paused) {
      player.pause();
      setMergedPlayButtonText(false);
      return;
    }
    player.play()
      .then(() => setMergedPlayButtonText(true))
      .catch((e) => {
        log(`Play merged failed: ${e?.message || e}`);
        setStatus("Error");
        setMergedPlayButtonText(false);
      });
  }

  async function onDownloadMergedFile() {
    try {
      setStatus("Downloading merged…");
      const url = `${DOWNLOAD_MERGED_API_URL}?t=${Date.now()}`;
      window.location.assign(url);
      log(`Download requested via API: ${url}`);
      setStatus("Idle");
    } catch (e) {
      log(`Download merged failed: ${e?.message || e}`);
      setStatus("Error");
    }
  }

  async function onMakePartsMergedJwt() {
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = "eleven_v3";
    const outputFormat = FIXED_OUTPUT_FORMAT;
    if (!voiceId || !text) {
      log("Missing required fields for JWT parts: Voice, Text.");
      setStatus("Missing input");
      return;
    }

    setProduceMergedJwtButtonBusy(true, "JWT-delen...");
    try {
      setStatus("Preparing JWT parts…");
      const segments = parseMixedTextSegments(text);
      const sources = [];
      const stem = `merged-${Date.now()}`;
      let partNo = 1;
      for (const seg of segments) {
        if (seg.type === "speech") {
          const normalized = seg.value.replace(/\.mp3$/i, "");
          sources.push(`${SPEECH_BASE_PATH}${normalized}.mp3`);
          continue;
        }
        if (seg.type === "general") {
          const normalized = seg.value.replace(/\.mp3$/i, "");
          sources.push(`${GENERAL_BASE_PATH}${normalized}.mp3`);
          continue;
        }
        const blob = await synthesizeTextToMp3BlobViaTtsProxy({ voiceId, text: seg.value, modelId, outputFormat });
        const partFilename = `${stem}-part-${String(partNo).padStart(3, "0")}.mp3`;
        await uploadBlobToStoryEndpoint(blob, {
          path: MIXED_MERGE_PARTS_PATH,
          audiofile: partFilename,
        });
        sources.push(`/${MIXED_MERGE_PARTS_PATH}/${partFilename}`);
        partNo += 1;
      }

      preparedMergedSources = sources;
      log(`JWT parts ready: ${sources.length} source${sources.length === 1 ? "" : "s"}.`);
      setStatus("Idle");
    } catch (e) {
      log(`Maak delen JWT failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  async function onMergeMergedJwt() {
    if (!preparedMergedSources.length) {
      log("No prepared sources yet. Click 'Maak delen JWT' first.");
      setStatus("Missing input");
      return;
    }

    setProduceMergedJwtButtonBusy(true, "Merging...");
    try {
      setStatus("Merging via JWT…");
      const mergeRes = await fetchWithJwtRetry("merge-proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          outputDir: MIXED_MERGE_OUTPUT_DIR,
          sources: preparedMergedSources,
          outputFilename: MIXED_MERGE_OUTPUT_FILENAME,
          gapMs: getMergeGapMs(),
          debug: true,
          tryCopyFirst: false,
        }),
      });

      const mergeBodyText = await mergeRes.text().catch(() => "");
      let mergeBody = null;
      try { mergeBody = mergeBodyText ? JSON.parse(mergeBodyText) : null; } catch {}
      if (!mergeRes.ok || mergeBody?.ok === false) {
        throw new Error(`Mixed merge failed (${mergeRes.status}). ${mergeBodyText}`.trim());
      }

      const outputUrl = mergeBody?.outputUrl || mergeBody?.url || buildAudioUrl(`${MIXED_MERGE_OUTPUT_DIR}${MIXED_MERGE_OUTPUT_FILENAME}`);
      mergedAudioVersion = String(Date.now());
      stopMergedPlayback();
      log(`Merged file produced: ${outputUrl}`);
      setStatus("Idle");
    } catch (e) {
      log(`Merge JWT failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  async function onProduceMergedJwt() {
    setProduceMergedJwtButtonBusy(true, "Producing...");
    try {
      await onMakePartsMergedJwt();
      if (!preparedMergedSources.length) {
        throw new Error("No prepared sources after parts step.");
      }
      await onMergeMergedJwt();
    } catch (e) {
      log(`Produce failed: ${e?.message || e}`);
      setStatus("Error");
    } finally {
      setProduceMergedJwtButtonBusy(false);
    }
  }

  // Wire up
  els.btnPlay?.addEventListener("click", onPlay);
  els.btnStop?.addEventListener("click", onStop);
  els.btnClear?.addEventListener("click", onClear);
  els.btnClearText?.addEventListener("click", onClearText); // <-- added
  els.btnDownload?.addEventListener("click", onDownload);
  els.btnProduceMergedJwt?.addEventListener("click", onProduceMergedJwt);
  els.btnPlayMerged?.addEventListener("click", onPlayMerged);
  els.btnDownloadMergedFile?.addEventListener("click", onDownloadMergedFile);
  els.btnDownloadSplitFiles?.addEventListener("click", onDownloadSplitFiles);
  els.btnDownloadSplitZip?.addEventListener("click", onDownloadSplitZip);
  els.btnRefreshCredits?.addEventListener("click", () => { void loadElevenLabsCredits(); });
  els.btnVoiceInfo?.addEventListener("click", onVoiceInfoClick);
  els.btnToggleStatusPanel?.addEventListener("click", () => {
    const isHidden = !!els.statusPanel?.hidden;
    setStatusPanelVisible(isHidden);
  });
  els.btnSignIn?.addEventListener("click", () => { void signIn(); });
  els.btnSignOut?.addEventListener("click", () => { void signOut(); });
  els.email?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void signIn();
  });
  els.password?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void signIn();
  });
  els.voiceId?.addEventListener("change", () => {
    persistVoiceId();
    refreshVoiceInfoButton();
  });
  els.modelId?.addEventListener("change", () => persistModelId());
  els.mergeGapMs?.addEventListener("change", () => persistMergeGapMs());

  els.chkRememberVoice?.addEventListener("change", () => {
    persistRememberFlags();
    persistVoiceId();
  });
  els.chkRememberModel?.addEventListener("change", () => {
    persistRememberFlags();
    persistModelId();
  });

  // Init
  if (els.btnStop) els.btnStop.disabled = true;
  if (els.btnDownload) els.btnDownload.disabled = true;

  loadPrefs();
  wirePasswordToggle();
  setSignedOutState();
  setStatusPanelVisible(false);

  void (async () => {
    try {
      if (!sb) sb = await initSupabaseClient();
      sb.auth.onAuthStateChange((_event, session) => {
        void refreshAuthUI(session ?? null);
      });
      await refreshAuthUI();
    } catch (e) {
      const err = e?.message || String(e);
      msg(els.authMsg, err, false);
      log(`Auth init failed: ${err}`);
      setSignedOutState();
    }
  })();

  setStatus("Idle");
  log("Ready.");
})();
