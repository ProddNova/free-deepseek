const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Variante gratuita "code" del modello DeepSeek V4 Flash su OpenRouter.
const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash:code";

// Reasonable limits to avoid oversized requests.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_MODEL_LENGTH = 100;

function readOpenRouterApiKey() {
  const raw = process.env.OPENROUTER_API_KEY || "";
  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^Bearer\s+/i, "")
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
  return model;
}

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
        return res.status(502).json({
          ...base,
          error: "Chiave API OpenRouter rifiutata. Su Render inserisci solo la chiave (es. sk-or-...), senza prefisso Bearer, virgolette o spazi."
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
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
