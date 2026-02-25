// file: elevenlabs-howler.js
/* global Howl */

(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    apiKey: $("apiKey"),
    voiceId: $("voiceId"),
    text: $("text"),
    modelId: $("modelId"),
    outputFormat: $("outputFormat"),
    chkRememberVoice: $("chkRememberVoice"),
    chkRememberKey: $("chkRememberKey"),
    chkRememberModel: $("chkRememberModel"),
    chkTryMSE: $("chkTryMSE"),
    btnPlay: $("btnPlay"),
    btnStop: $("btnStop"),
    btnClear: $("btnClear"),
    btnClearText: $("clearTextBtn"), // <-- added
    btnDownload: $("btnDownload"),
    status: $("status"),
    log: $("log"),
  };

  let currentHowl = null;
  let currentObjectUrl = null;
  let currentAbort = null;
  let lastAudioBlob = null;
  let lastAudioFilename = null;

  const STORAGE = Object.freeze({
    rememberVoice: "elevenlabs.remember.voiceId",
    rememberKey: "elevenlabs.remember.apiKey",
    rememberModel: "elevenlabs.remember.modelId",
    voiceId: "elevenlabs.voiceId",
    apiKey: "elevenlabs.apiKey",
    modelId: "elevenlabs.modelId",
  });

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch {}
  }
  function storageDel(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function isRememberVoiceEnabled() {
    if (!els.chkRememberVoice) return false;
    return !!els.chkRememberVoice.checked;
  }

  function isRememberKeyEnabled() {
    if (!els.chkRememberKey) return false;
    return !!els.chkRememberKey.checked;
  }

  function isRememberModelEnabled() {
    if (!els.chkRememberModel) return false;
    return !!els.chkRememberModel.checked;
  }

  function persistRememberFlags() {
    if (els.chkRememberVoice) storageSet(STORAGE.rememberVoice, isRememberVoiceEnabled() ? "1" : "0");
    if (els.chkRememberKey) storageSet(STORAGE.rememberKey, isRememberKeyEnabled() ? "1" : "0");
    if (els.chkRememberModel) storageSet(STORAGE.rememberModel, isRememberModelEnabled() ? "1" : "0");
  }

  function persistVoiceId(valueRaw) {
    if (!els.voiceId) return;
    const value = (valueRaw ?? els.voiceId.value ?? "").trim();

    if (!isRememberVoiceEnabled()) {
      storageDel(STORAGE.voiceId);
      return;
    }

    if (!value) storageDel(STORAGE.voiceId);
    else storageSet(STORAGE.voiceId, value);
  }

  function persistApiKey(valueRaw) {
    if (!els.apiKey) return;
    const value = (valueRaw ?? els.apiKey.value ?? "").trim();

    if (!isRememberKeyEnabled()) {
      storageDel(STORAGE.apiKey);
      return;
    }

    if (!value) storageDel(STORAGE.apiKey);
    else storageSet(STORAGE.apiKey, value);
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

  function loadPrefs() {
    const rememberVoice = storageGet(STORAGE.rememberVoice);
    const rememberKey = storageGet(STORAGE.rememberKey);
    const rememberModel = storageGet(STORAGE.rememberModel);

    if (els.chkRememberVoice) {
      els.chkRememberVoice.checked = rememberVoice == null ? true : rememberVoice === "1";
    }
    if (els.chkRememberKey) {
      els.chkRememberKey.checked = rememberKey === "1";
    }
    if (els.chkRememberModel) {
      els.chkRememberModel.checked = rememberModel == null ? true : rememberModel === "1";
    }

    if (isRememberVoiceEnabled()) {
      const savedVoiceId = storageGet(STORAGE.voiceId);
      if (savedVoiceId && els.voiceId) els.voiceId.value = savedVoiceId;
    }

    if (isRememberKeyEnabled()) {
      const savedApiKey = storageGet(STORAGE.apiKey);
      if (savedApiKey && els.apiKey) els.apiKey.value = savedApiKey;
    }

    if (isRememberModelEnabled()) {
      const savedModelId = storageGet(STORAGE.modelId);
      if (savedModelId && els.modelId) els.modelId.value = savedModelId;
    }
  }

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg;
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

  function browserCanUseMSE() {
    try {
      return ("MediaSource" in window) && MediaSource.isTypeSupported("audio/mpeg");
    } catch {
      return false;
    }
  }

  function getEndpoint(voiceId, outputFormat) {
    const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;
    if (!outputFormat) return base;
    const url = new URL(base);
    url.searchParams.set("output_format", outputFormat);
    return url.toString();
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

  async function fetchStream({ apiKey, voiceId, text, modelId, outputFormat, signal }) {
    const endpoint = getEndpoint(voiceId, outputFormat);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify(buildBody(text, modelId)),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${errText ? ` -- ${errText}` : ""}`);
    }

    if (!res.body) {
      throw new Error("Streaming not supported by this browser (Response.body missing).");
    }

    return res;
  }

  async function playViaBlobBuffering(params) {
    log("Fallback: buffering full MP3 into a Blob…");
    setStatus("Downloading…");

    const res = await fetchStream(params);
    const arrayBuffer = await res.arrayBuffer();

    const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
    setLastAudio(blob, { voiceId: params.voiceId, modelId: params.modelId });
    const url = URL.createObjectURL(blob);
    currentObjectUrl = url;

    return new Promise((resolve, reject) => {
      setStatus("Playing…");
      log("Starting playback (Howler) from buffered Blob URL.");

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
  }

  async function playViaMediaSource(params) {
    if (!("MediaSource" in window)) {
      throw new Error("MediaSource not available in this browser.");
    }

    const mime = "audio/mpeg";
    if (!MediaSource.isTypeSupported(mime)) {
      throw new Error(`MediaSource does not support: ${mime}`);
    }

    log("Attempting true streaming via MediaSource…");
    setStatus("Streaming…");

    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    currentObjectUrl = url;

    const howl = new Howl({
      src: [url],
      html5: true,
      format: ["mp3"],
      onplay: () => log("Howler: play (MediaSource)"),
      onend: () => {
        log("Howler: end");
        setStatus("Idle");
      },
      onloaderror: (_id, err) => log(`Howler load error (MediaSource): ${err}`),
      onplayerror: (_id, err) => log(`Howler play error (MediaSource): ${err}`),
    });

    currentHowl = howl;

    await new Promise((resolve, reject) => {
      ms.addEventListener("sourceopen", resolve, { once: true });
      ms.addEventListener("error", () => reject(new Error("MediaSource error")), { once: true });
    });

    const sb = ms.addSourceBuffer(mime);

    const res = await fetchStream(params);
    const reader = res.body.getReader();

    let started = false;
    const downloadChunks = [];

    const appendChunk = (chunk) =>
      new Promise((resolve, reject) => {
        const onUpdateEnd = () => {
          sb.removeEventListener("updateend", onUpdateEnd);
          sb.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          sb.removeEventListener("updateend", onUpdateEnd);
          sb.removeEventListener("error", onError);
          reject(new Error("SourceBuffer error while appending"));
        };
        sb.addEventListener("updateend", onUpdateEnd);
        sb.addEventListener("error", onError);
        sb.appendBuffer(chunk);
      });

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        downloadChunks.push(value);
        await appendChunk(value);

        if (!started) {
          started = true;
          log("Starting playback as soon as first chunk appended.");
          setStatus("Playing…");
          howl.play();
        }
      }

      await new Promise((r) => {
        if (!sb.updating) return r();
        sb.addEventListener("updateend", r, { once: true });
      });

      ms.endOfStream();
      log("Stream complete.");
      if (downloadChunks.length) {
        const blob = new Blob(downloadChunks, { type: "audio/mpeg" });
        setLastAudio(blob, { voiceId: params.voiceId, modelId: params.modelId });
      }
    } catch (e) {
      try { ms.endOfStream(); } catch {}
      throw e;
    }
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

  async function onPlay() {
    const apiKey = (els.apiKey?.value || "").trim();
    const voiceId = (els.voiceId?.value || "").trim();
    const text = (els.text?.value || "").trim();
    const modelId = (els.modelId?.value || "").trim();
    const outputFormat = (els.outputFormat?.value || "").trim();

    persistRememberFlags();
    persistApiKey(apiKey);
    persistVoiceId(voiceId);
    persistModelId(modelId);
    clearLastAudio();

    if (!apiKey || !voiceId || !text) {
      log("Missing required fields: API key, Voice ID, and Text are required.");
      setStatus("Missing input");
      return;
    }

    // Stop anything currently playing and abort any current fetch
    cleanupAudio({ abortFetch: true });

    // Create controller for this play
    currentAbort = new AbortController();

    els.btnPlay && (els.btnPlay.disabled = true);
    els.btnStop && (els.btnStop.disabled = false);

    const baseParams = {
      apiKey,
      voiceId,
      text,
      modelId,
      outputFormat,
      signal: currentAbort.signal,
    };

    const tryMSE = !!(els.chkTryMSE?.checked && browserCanUseMSE());

    try {
      if (tryMSE) {
        try {
          await playViaMediaSource(baseParams);
          return;
        } catch (e) {
          log(`MediaSource streaming failed; falling back. Reason: ${e.message}`);

          // IMPORTANT: do not abort here. But after a failed fetch, some browsers treat the signal as "bad".
          // Create a fresh AbortController for fallback to avoid: "signal is aborted without reason"
          cleanupAudio({ abortFetch: false });

          currentAbort = new AbortController();
          baseParams.signal = currentAbort.signal;
        }
      } else {
        if (els.chkTryMSE?.checked && !browserCanUseMSE()) {
          log("MediaSource not available/unsupported here; using fallback directly.");
        }
      }

      await playViaBlobBuffering(baseParams);
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
    setStatus("Idle");
    els.btnPlay && (els.btnPlay.disabled = false);
    els.btnStop && (els.btnStop.disabled = true);
  }

  function onClear() {
    if (els.log) els.log.textContent = "";
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

  // Wire up
  els.btnPlay?.addEventListener("click", onPlay);
  els.btnStop?.addEventListener("click", onStop);
  els.btnClear?.addEventListener("click", onClear);
  els.btnClearText?.addEventListener("click", onClearText); // <-- added
  els.btnDownload?.addEventListener("click", onDownload);
  els.apiKey?.addEventListener("change", () => persistApiKey());
  els.voiceId?.addEventListener("change", () => persistVoiceId());
  els.modelId?.addEventListener("change", () => persistModelId());

  els.chkRememberKey?.addEventListener("change", () => {
    persistRememberFlags();
    persistApiKey();
  });
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

  // If MSE isn't possible, auto-uncheck
  if (els.chkTryMSE && !browserCanUseMSE()) {
    els.chkTryMSE.checked = false;
  }

  setStatus("Idle");
  log("Ready.");
})();