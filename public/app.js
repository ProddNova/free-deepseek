const STORAGE_KEY = "deepseek-chat-history";
const MAX_HISTORY = 20;

const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const newChatBtn = document.getElementById("new-chat");

let history = loadHistory();

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

function render() {
  messagesEl.innerHTML = "";

  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Inizia la conversazione scrivendo un messaggio.";
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
  inputEl.disabled = loading;
  typingEl.classList.toggle("hidden", !loading);
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}

async function sendMessage(text) {
  history.push({ role: "user", content: text });
  saveHistory();
  render();
  setLoading(true);

  try {
    const payload = { messages: history.slice(-MAX_HISTORY) };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Errore imprevisto. Riprova.");
    }

    history.push({ role: "assistant", content: data.message });
    saveHistory();
    render();
  } catch (err) {
    addBubble("error", err.message || "Errore di rete. Riprova.");
  } finally {
    setLoading(false);
    inputEl.focus();
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoGrow();
  sendMessage(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
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
  inputEl.focus();
});

render();
inputEl.focus();
