const STORAGE_KEY = "deepseek-chat-history";
const MODEL_KEY = "deepseek-chat-model";
const MAX_HISTORY = 20;
const MAX_LOGS = 100;
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

// Su OpenRouter esiste solo "deepseek/deepseek-v4-flash" (senza suffisso).
// Le vecchie varianti ":free" (nessun endpoint gratuito → 401) e ":code"
// (suffisso inesistente) vengono riportate allo slug canonico. Così un
// telefono con un valore vecchio salvato in localStorage non invia più un
// modello rotto: il valore viene corretto al caricamento della pagina.
function normalizeModel(value) {
  if (typeof value !== "string") return DEFAULT_MODEL;
  const v = value.trim();
  if (!v) return DEFAULT_MODEL;
  if (/^deepseek\/deepseek-v4-flash(:.*)?$/i.test(v)) return DEFAULT_MODEL;
  return v;
}

const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");
const modelLabelEl = document.getElementById("model-label");

const backdropEl = document.getElementById("backdrop");
const settingsSheet = document.getElementById("settings-sheet");
const logsSheet = document.getElementById("logs-sheet");
const openSettingsBtn = document.getElementById("open-settings");
const openLogsBtn = document.getElementById("open-logs");
const modelSelect = document.getElementById("model-select");
const customModelWrap = document.getElementById("custom-model-wrap");
const customModelInput = document.getElementById("custom-model");
const logsBody = document.getElementById("logs-body");
const clearLogsBtn = document.getElementById("clear-logs");
const logBadge = document.getElementById("log-badge");

let history = loadHistory();
let model = loadModel();
let logs = [];
let unseenLogs = 0;

/* ---------------- Storage ---------------- */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (_) {
    // storage full or unavailable: ignore
  }
}

function loadModel() {
  try {
    const stored = localStorage.getItem(MODEL_KEY);
    if (!stored) return DEFAULT_MODEL;
    const normalized = normalizeModel(stored);
    if (normalized !== stored) {
      try {
        localStorage.setItem(MODEL_KEY, normalized);
      } catch (_) {
        /* ignore */
      }
    }
    return normalized;
  } catch (_) {
    return DEFAULT_MODEL;
  }
}

function saveModel(value) {
  // Normalizza anche qui: se l'utente digita ":free"/":code" nel campo
  // personalizzato, viene comunque salvato lo slug canonico.
  model = normalizeModel(value);
  try {
    localStorage.setItem(MODEL_KEY, model);
  } catch (_) {
    /* ignore */
  }
  updateModelLabel();
}

function updateModelLabel() {
  // Mostra una versione corta: parte dopo "/" e dopo l'ultimo "-".
  const short = model.split("/").pop();
  modelLabelEl.textContent = short;
}

/* ---------------- Logs ---------------- */
function log(level, msg, detail) {
  const entry = {
    level,
    msg,
    detail: detail == null ? "" : String(detail),
    time: new Date()
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();

  if (logsSheet.classList.contains("hidden")) {
    unseenLogs += 1;
    logBadge.textContent = unseenLogs > 99 ? "99+" : String(unseenLogs);
    logBadge.classList.remove("hidden");
  } else {
    renderLogs();
  }
}

function renderLogs() {
  logsBody.innerHTML = "";
  if (logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "logs-empty";
    empty.textContent = "Nessun log ancora. Invia un messaggio.";
    logsBody.appendChild(empty);
    return;
  }
  // Più recenti in alto.
  for (const e of [...logs].reverse()) {
    const div = document.createElement("div");
    div.className = `log-entry ${e.level}`;

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = e.time.toLocaleTimeString("it-IT");

    const tag = document.createElement("span");
    tag.className = "log-tag";
    tag.textContent = e.level;

    const text = document.createElement("span");
    text.className = "log-msg";
    text.textContent = e.msg;

    div.appendChild(time);
    div.appendChild(tag);
    div.appendChild(text);

    if (e.detail) {
      const detail = document.createElement("span");
      detail.className = "log-detail";
      detail.textContent = e.detail;
      div.appendChild(detail);
    }
    logsBody.appendChild(div);
  }
  logsBody.scrollTop = 0;
}

async function logEnvDebug() {
  try {
    const res = await fetch("/api/debug/env", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      log("error", "Debug env non disponibile", `HTTP ${res.status}`);
      return;
    }

    const key = data.openRouterApiKey || {};
    let apiKeyState;
    if (!key.cleanedPresent) {
      apiKeyState = "API key mancante";
    } else if (key.looksLikeKey === false) {
      apiKeyState = `API key SOSPETTA (${key.cleanedLength} caratteri, non inizia con sk-or-)`;
    } else {
      apiKeyState = `API key presente (${key.cleanedLength} caratteri)`;
    }
    const renderState = data.render?.detected
      ? `Render rilevato${
          data.render.serviceName ? `: ${data.render.serviceName}` : ""
        }`
      : "Render non rilevato";
    const modelState = data.openRouterModel?.present
      ? `modello env: ${data.openRouterModel.value}`
      : `modello default: ${data.openRouterModel?.value || DEFAULT_MODEL}`;

    log(
      "info",
      "Debug variabili ambiente",
      `${apiKeyState} · ${renderState} · ${modelState}`
    );
  } catch (err) {
    log("error", "Debug env fallito", err.message || "errore di rete");
  }
}

/* ---------------- Rendering chat ---------------- */
function render() {
  messagesEl.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML =
      '<span class="big">💬</span>Ciao! Scrivi qui sotto per iniziare a chattare con DeepSeek.';
    messagesEl.appendChild(empty);
    return;
  }

  for (const msg of history) {
    addBubble(msg.role === "user" ? "user" : "ai", msg.content);
  }
  scrollToBottom();
}

function addBubble(type, text) {
  const div = document.createElement("div");
  div.className = `msg ${type}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  typingEl.classList.toggle("hidden", !loading);
  if (loading) scrollToBottom();
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + "px";
}

/* ---------------- Invio ---------------- */
async function sendMessage(text) {
  history.push({ role: "user", content: text });
  saveHistory();
  render();
  setLoading(true);

  const payload = { messages: history.slice(-MAX_HISTORY), model };
  log("info", `→ Richiesta a ${model}`, `${payload.messages.length} messaggi`);
  const started = performance.now();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - started);

    if (!res.ok) {
      const detail = [
        `HTTP ${res.status}`,
        data.status ? `upstream ${data.status}` : "",
        data.model ? `modello ${data.model}` : "",
        `client ${ms}ms`
      ]
        .filter(Boolean)
        .join(" · ");
      log("error", data.error || "Errore imprevisto.", detail);
      throw new Error(data.error || "Errore imprevisto. Riprova.");
    }

    const serverMs = data.elapsedMs ? `server ${data.elapsedMs}ms · ` : "";
    const tokens = data.usage?.total_tokens
      ? ` · ${data.usage.total_tokens} token`
      : "";
    log("ok", "← Risposta ricevuta", `${serverMs}client ${ms}ms${tokens}`);

    history.push({ role: "assistant", content: data.message });
    saveHistory();
    render();
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    if (!(err instanceof Error) || !err.__logged) {
      // errore di rete non ancora loggato sopra
      if (!err.message || err.message === "Failed to fetch") {
        log("error", "Errore di rete", `nessuna risposta dal server · ${ms}ms`);
      }
    }
    addBubble("error", err.message || "Errore di rete. Riprova.");
  } finally {
    setLoading(false);
  }
}

/* ---------------- Sheet helpers ---------------- */
function openSheet(sheet) {
  backdropEl.classList.remove("hidden");
  sheet.classList.remove("hidden");
  sheet.setAttribute("aria-hidden", "false");
}

function closeSheets() {
  backdropEl.classList.add("hidden");
  [settingsSheet, logsSheet].forEach((s) => {
    s.classList.add("hidden");
    s.setAttribute("aria-hidden", "true");
  });
}

/* ---------------- Event wiring ---------------- */
formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoGrow();
  sendMessage(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

inputEl.addEventListener("input", autoGrow);

newChatBtn.addEventListener("click", () => {
  if (history.length > 0 && !confirm("Cancellare la conversazione corrente?")) {
    return;
  }
  history = [];
  saveHistory();
  render();
});

openSettingsBtn.addEventListener("click", () => openSheet(settingsSheet));

openLogsBtn.addEventListener("click", () => {
  const willOpen = logsSheet.classList.contains("hidden");
  if (!willOpen) {
    logsSheet.classList.add("hidden");
    logsSheet.setAttribute("aria-hidden", "true");
    return;
  }
  unseenLogs = 0;
  logBadge.classList.add("hidden");
  renderLogs();
  logsSheet.classList.remove("hidden");
  logsSheet.setAttribute("aria-hidden", "false");
});

clearLogsBtn.addEventListener("click", () => {
  logs = [];
  renderLogs();
});

backdropEl.addEventListener("click", closeSheets);
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", closeSheets);
});

document.querySelectorAll("[data-log-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    logsSheet.classList.add("hidden");
    logsSheet.setAttribute("aria-hidden", "true");
  });
});

modelSelect.addEventListener("change", () => {
  const val = modelSelect.value;
  if (val === "__custom__") {
    customModelWrap.classList.remove("hidden");
    customModelInput.value = model;
    customModelInput.focus();
    return;
  }
  customModelWrap.classList.add("hidden");
  saveModel(val);
  log("info", "Modello cambiato", val);
});

customModelInput.addEventListener("change", () => {
  const val = customModelInput.value.trim();
  if (val) {
    saveModel(val);
    log("info", "Modello personalizzato impostato", val);
  }
});

/* ---------------- Init ---------------- */
function initSettingsUI() {
  const known = Array.from(modelSelect.options).some(
    (o) => o.value === model
  );
  if (known) {
    modelSelect.value = model;
    customModelWrap.classList.add("hidden");
  } else {
    modelSelect.value = "__custom__";
    customModelWrap.classList.remove("hidden");
    customModelInput.value = model;
  }
}

updateModelLabel();
initSettingsUI();
render();
logEnvDebug();
