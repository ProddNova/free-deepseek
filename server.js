const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Su OpenRouter l'UNICO slug valido è "deepseek/deepseek-v4-flash" (senza
// suffisso). La variante ":free" NON esiste: il modello non ha endpoint
// gratuiti, quindi OpenRouter risponde 401. Anche ":code" non è un suffisso
// reale: "funziona" solo perché OpenRouter lo ignora e ripiega sul modello
// base. Usiamo quindi sempre lo slug canonico.
const CANONICAL_FLASH = "deepseek/deepseek-v4-flash";

// Riporta allo slug canonico qualsiasi variante rotta di V4 Flash (":free",
// ":code" o altri suffissi). Così, anche se un client ha ancora un vecchio
// valore salvato in localStorage, il server non inoltra mai un modello che
// OpenRouter rifiuta. Gli altri modelli restano invariati.
function normalizeModel(model) {
  if (typeof model !== "string") return CANONICAL_FLASH;
  const trimmed = model.trim();
  if (!trimmed) return CANONICAL_FLASH;
  if (/^deepseek\/deepseek-v4-flash(:.*)?$/i.test(trimmed)) {
    return CANONICAL_FLASH;
  }
  return trimmed;
}

const DEFAULT_MODEL = normalizeModel(process.env.OPENROUTER_MODEL || CANONICAL_FLASH);

// Reasonable limits to avoid oversized requests.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_MODEL_LENGTH = 100;

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return `${value.length} caratteri`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} caratteri)`;
}

function getEnvDebugInfo() {
  const rawApiKey = process.env.OPENROUTER_API_KEY || "";
  const cleanedApiKey = readOpenRouterApiKey();
  return {
    nodeEnv: process.env.NODE_ENV || null,
    render: {
      detected: Boolean(process.env.RENDER),
      serviceName: process.env.RENDER_SERVICE_NAME || null,
      serviceType: process.env.RENDER_SERVICE_TYPE || null,
      externalUrl: process.env.RENDER_EXTERNAL_URL || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null
    },
    openRouterApiKey: {
      present: Boolean(rawApiKey),
      cleanedPresent: Boolean(cleanedApiKey),
      rawLength: rawApiKey.length,
      cleanedLength: cleanedApiKey.length,
      masked: maskSecret(cleanedApiKey),
      // Le chiavi OpenRouter iniziano con "sk-or-": se manca, la chiave è
      // quasi sicuramente sbagliata o troncata (causa tipica del 401).
      looksLikeKey: /^sk-or-/i.test(cleanedApiKey),
      hasBearerPrefix: /^\s*Bearer\s+/i.test(rawApiKey),
      hasWrappingQuotes: /^\s*['"].*['"]\s*$/.test(rawApiKey)
    },
    openRouterModel: {
      present: Boolean(process.env.OPENROUTER_MODEL),
      value: DEFAULT_MODEL
    }
  };
}

function readOpenRouterApiKey() {
  const raw = process.env.OPENROUTER_API_KEY || "";
  return raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Sceglie il modello: quello richiesto dal client (se valido) oppure il default.
function resolveModel(requested) {
  if (typeof requested !== "string") return DEFAULT_MODEL;
  const model = requested.trim();
  if (!model) return DEFAULT_MODEL;
  if (model.length > MAX_MODEL_LENGTH) return DEFAULT_MODEL;
  // Slug OpenRouter: lettere, numeri, / . - _ e i due punti della variante.
  if (!/^[a-zA-Z0-9/_.:-]+$/.test(model)) return DEFAULT_MODEL;
  // Anche i modelli richiesti dal client passano dalla normalizzazione, così
  // un vecchio ":free"/":code" salvato sul telefono viene corretto qui.
  return normalizeModel(model);
}

app.get("/api/debug/env", (_req, res) => {
  res.json(getEnvDebugInfo());
});

app.post("/api/chat", async (req, res) => {
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: "Server non configurato: manca OPENROUTER_API_KEY."
    });
  }

  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Nessun messaggio fornito." });
  }

  // Validate and sanitize each message.
  const cleaned = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const role = msg.role;
    const content = typeof msg.content === "string" ? msg.content.trim() : "";

    if (role !== "user" && role !== "assistant" && role !== "system") continue;
    if (!content) continue;
    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        error: `Messaggio troppo lungo (max ${MAX_MESSAGE_LENGTH} caratteri).`
      });
    }
    cleaned.push({ role, content });
  }

  if (cleaned.length === 0) {
    return res.status(400).json({ error: "Il messaggio non può essere vuoto." });
  }

  // Keep only the last MAX_MESSAGES messages.
  const trimmed = cleaned.slice(-MAX_MESSAGES);
  const model = resolveModel(req.body?.model);
  const started = Date.now();

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.get("origin") || `${req.protocol}://${req.get("host")}`,
        "X-Title": "DeepSeek Chat"
      },
      body: JSON.stringify({ model, messages: trimmed })
    });

    const elapsedMs = Date.now() - started;

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || "";
      } catch (_) {
        // ignore parse errors
      }

      const base = { model, status: response.status, elapsedMs };

      if (response.status === 401) {
        // Non diamo per scontato che sia la chiave: mostriamo il motivo reale
        // di OpenRouter, poi un promemoria su come impostare la chiave.
        const hint =
          "Se persiste, controlla OPENROUTER_API_KEY su Render: incolla solo la chiave (deve iniziare con sk-or-...), senza Bearer, virgolette o spazi.";
        return res.status(502).json({
          ...base,
          error: detail ? `OpenRouter 401: ${detail}. ${hint}` : `OpenRouter 401. ${hint}`
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          ...base,
          error: "Limite di richieste raggiunto. Riprova tra poco."
        });
      }
      return res.status(502).json({
        ...base,
        error: detail
          ? `Errore da OpenRouter: ${detail}`
          : `Errore da OpenRouter (codice ${response.status}).`
      });
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;

    if (!message) {
      return res.status(502).json({
        model,
        elapsedMs,
        error: "Risposta non valida dal modello."
      });
    }

    return res.json({
      message,
      model: data?.model || model,
      elapsedMs,
      usage: data?.usage || null
    });
  } catch (err) {
    // Do not log the API key; log only a generic message.
    console.error("Errore nella chiamata a OpenRouter:", err.message);
    return res.status(502).json({
      model,
      error: "Impossibile contattare OpenRouter. Riprova più tardi."
    });
  }
});

app.listen(PORT, () => {
  const envDebug = getEnvDebugInfo();
  console.log(`Server in ascolto sulla porta ${PORT}`);
  console.log("Debug variabili ambiente:", {
    renderDetected: envDebug.render.detected,
    renderServiceName: envDebug.render.serviceName,
    openRouterApiKeyPresent: envDebug.openRouterApiKey.present,
    openRouterApiKeyCleanedPresent: envDebug.openRouterApiKey.cleanedPresent,
    openRouterApiKeyLength: envDebug.openRouterApiKey.cleanedLength,
    openRouterModel: envDebug.openRouterModel.value
  });
});
