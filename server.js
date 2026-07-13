const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// L'app parla DIRETTAMENTE con l'API ufficiale DeepSeek, che è compatibile con
// lo standard OpenAI (endpoint /chat/completions). La chiave "sk-..." di
// DeepSeek va usata qui, non su OpenRouter (le cui chiavi iniziano con
// "sk-or-..."): usare una chiave DeepSeek su OpenRouter causa un 401.
const DEEPSEEK_BASE_URL = (
  process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
).replace(/\/+$/, "");
const DEEPSEEK_URL = `${DEEPSEEK_BASE_URL}/chat/completions`;

const DEFAULT_MODEL_FALLBACK = "deepseek-v4-flash";

// Normalizza lo slug del modello verso i nomi nativi DeepSeek: toglie il
// prefisso "deepseek/" e i suffissi di variante (":free", ":code", ...), che
// sono convenzioni di OpenRouter e sull'API DeepSeek non esistono. Così un
// vecchio valore salvato sul telefono (es. "deepseek/deepseek-v4-flash:free")
// continua a funzionare invece di rompere la richiesta.
function normalizeModel(model) {
  if (typeof model !== "string") return DEFAULT_MODEL_FALLBACK;
  const m = model
    .trim()
    .replace(/^deepseek\//i, "")
    .replace(/:.*$/, "")
    .trim();
  return m || DEFAULT_MODEL_FALLBACK;
}

const DEFAULT_MODEL = normalizeModel(
  process.env.DEEPSEEK_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL_FALLBACK
);

// Reasonable limits to avoid oversized requests.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_MODEL_LENGTH = 100;

function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return `${value.length} caratteri`;
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} caratteri)`;
}

// Legge la chiave da DEEPSEEK_API_KEY, con fallback a OPENROUTER_API_KEY per
// non rompere i deploy esistenti su Render che usano ancora quel nome.
function readApiKey() {
  const raw =
    process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || "";
  return raw
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function getEnvDebugInfo() {
  const rawApiKey =
    process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY || "";
  const cleanedApiKey = readApiKey();
  return {
    nodeEnv: process.env.NODE_ENV || null,
    render: {
      detected: Boolean(process.env.RENDER),
      serviceName: process.env.RENDER_SERVICE_NAME || null,
      serviceType: process.env.RENDER_SERVICE_TYPE || null,
      externalUrl: process.env.RENDER_EXTERNAL_URL || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null
    },
    apiKey: {
      present: Boolean(rawApiKey),
      cleanedPresent: Boolean(cleanedApiKey),
      rawLength: rawApiKey.length,
      cleanedLength: cleanedApiKey.length,
      masked: maskSecret(cleanedApiKey),
      // Le chiavi DeepSeek iniziano con "sk-". Se inizia con "sk-or-" è una
      // chiave OpenRouter (provider sbagliato per questa API).
      looksLikeKey: /^sk-/i.test(cleanedApiKey),
      looksLikeOpenRouterKey: /^sk-or-/i.test(cleanedApiKey),
      hasBearerPrefix: /^\s*Bearer\s+/i.test(rawApiKey),
      hasWrappingQuotes: /^\s*['"].*['"]\s*$/.test(rawApiKey),
      envVar: process.env.DEEPSEEK_API_KEY
        ? "DEEPSEEK_API_KEY"
        : process.env.OPENROUTER_API_KEY
          ? "OPENROUTER_API_KEY"
          : null
    },
    model: {
      present: Boolean(process.env.DEEPSEEK_MODEL || process.env.OPENROUTER_MODEL),
      value: DEFAULT_MODEL
    },
    baseUrl: DEEPSEEK_BASE_URL
  };
}

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Sceglie il modello: quello richiesto dal client (se valido) oppure il default.
function resolveModel(requested) {
  if (typeof requested !== "string") return DEFAULT_MODEL;
  const model = requested.trim();
  if (!model) return DEFAULT_MODEL;
  if (model.length > MAX_MODEL_LENGTH) return DEFAULT_MODEL;
  // Slug del modello: lettere, numeri, / . - _ e i due punti della variante.
  if (!/^[a-zA-Z0-9/_.:-]+$/.test(model)) return DEFAULT_MODEL;
  // Anche i modelli richiesti dal client passano dalla normalizzazione, così
  // un vecchio slug in stile OpenRouter salvato sul telefono viene corretto.
  return normalizeModel(model);
}

app.get("/api/debug/env", (_req, res) => {
  res.json(getEnvDebugInfo());
});

app.post("/api/chat", async (req, res) => {
  const apiKey = readApiKey();
  if (!apiKey) {
    return res.status(500).json({
      error: "Server non configurato: manca DEEPSEEK_API_KEY."
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
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
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
        // Non diamo per scontato il motivo: mostriamo l'errore reale di
        // DeepSeek, poi un promemoria su come impostare la chiave.
        const hint =
          "Controlla la chiave su Render: incolla solo la chiave DeepSeek (inizia con sk-...), senza Bearer, virgolette o spazi. Le chiavi OpenRouter (sk-or-...) qui NON funzionano.";
        return res.status(502).json({
          ...base,
          error: detail ? `DeepSeek 401: ${detail}. ${hint}` : `DeepSeek 401. ${hint}`
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
          ? `Errore da DeepSeek: ${detail}`
          : `Errore da DeepSeek (codice ${response.status}).`
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
    console.error("Errore nella chiamata a DeepSeek:", err.message);
    return res.status(502).json({
      model,
      error: "Impossibile contattare DeepSeek. Riprova più tardi."
    });
  }
});

app.listen(PORT, () => {
  const envDebug = getEnvDebugInfo();
  console.log(`Server in ascolto sulla porta ${PORT}`);
  console.log("Debug variabili ambiente:", {
    renderDetected: envDebug.render.detected,
    renderServiceName: envDebug.render.serviceName,
    apiKeyPresent: envDebug.apiKey.present,
    apiKeyCleanedPresent: envDebug.apiKey.cleanedPresent,
    apiKeyLength: envDebug.apiKey.cleanedLength,
    apiKeyEnvVar: envDebug.apiKey.envVar,
    model: envDebug.model.value,
    baseUrl: envDebug.baseUrl
  });
});
