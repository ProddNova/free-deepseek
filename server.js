const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

// Reasonable limits to avoid oversized requests.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 8000;

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
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
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model, messages: trimmed })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || "";
      } catch (_) {
        // ignore parse errors
      }

      if (response.status === 401) {
        return res
          .status(502)
          .json({ error: "Chiave API OpenRouter non valida o mancante." });
      }
      if (response.status === 429) {
        return res.status(429).json({
          error: "Limite di richieste raggiunto. Riprova tra poco."
        });
      }
      return res.status(502).json({
        error: detail
          ? `Errore da OpenRouter: ${detail}`
          : `Errore da OpenRouter (codice ${response.status}).`
      });
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;

    if (!message) {
      return res
        .status(502)
        .json({ error: "Risposta non valida dal modello." });
    }

    return res.json({ message });
  } catch (err) {
    // Do not log the API key; log only a generic message.
    console.error("Errore nella chiamata a OpenRouter:", err.message);
    return res
      .status(502)
      .json({ error: "Impossibile contattare OpenRouter. Riprova più tardi." });
  }
});

app.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
