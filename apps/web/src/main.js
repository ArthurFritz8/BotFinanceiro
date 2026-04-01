const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messagesContainer = document.querySelector("#messages");
const statusPill = document.querySelector("#connection-status");
const quickPromptsContainer = document.querySelector("#quick-prompts");
const activeModelElement = document.querySelector("#active-model");
const recentHistoryElement = document.querySelector("#recent-history");
const clearLocalHistoryButton = document.querySelector("#clear-local-history");

const CHAT_HISTORY_STORAGE_KEY = "botfinanceiro.copilot.history.v1";
const CHAT_SESSION_STORAGE_KEY = "botfinanceiro.copilot.session.v1";
const MAX_STORED_MESSAGES = 60;
const MAX_RECENT_HISTORY_ITEMS = 8;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");

const messages = [];
let isSending = false;
let chatSessionId = getOrCreateSessionId();

function buildApiUrl(path) {
  return API_BASE_URL.length > 0 ? `${API_BASE_URL}${path}` : path;
}

function createSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionId() {
  try {
    const storedValue = localStorage.getItem(CHAT_SESSION_STORAGE_KEY)?.trim();

    if (storedValue && SESSION_ID_PATTERN.test(storedValue)) {
      return storedValue;
    }
  } catch {
    // Ignore storage errors and create an ephemeral session id.
  }

  const generatedSessionId = createSessionId();

  try {
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, generatedSessionId);
  } catch {
    // Ignore storage errors and keep session id in memory.
  }

  return generatedSessionId;
}

function rotateSessionId() {
  chatSessionId = createSessionId();

  try {
    localStorage.setItem(CHAT_SESSION_STORAGE_KEY, chatSessionId);
  } catch {
    // Ignore storage errors and keep session id in memory.
  }
}

function normalizeStoredMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" || value.role === "user" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!role || !content) {
    return null;
  }

  const normalized = {
    content,
    error: value.error === true,
    role,
  };

  if (value.meta && typeof value.meta === "object") {
    normalized.meta = {
      model: typeof value.meta.model === "string" ? value.meta.model : undefined,
      time: typeof value.meta.time === "string" ? value.meta.time : undefined,
      totalTokens:
        typeof value.meta.totalTokens === "number" ? value.meta.totalTokens : undefined,
    };
  }

  return normalized;
}

function saveMessagesToLocalStorage() {
  try {
    const compactMessages = messages.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(compactMessages));
  } catch {
    // Ignore storage errors to keep chat interaction working.
  }
}

function loadMessagesFromLocalStorage() {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeStoredMessage(item))
      .filter((item) => item !== null)
      .slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

function normalizeRemoteHistoryMessage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const role = value.role === "assistant" || value.role === "user" ? value.role : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!role || !content) {
    return null;
  }

  const timestamp = typeof value.timestamp === "string" ? value.timestamp : "";
  const parsedTimestamp = timestamp ? new Date(timestamp) : null;
  const time = parsedTimestamp && !Number.isNaN(parsedTimestamp.getTime())
    ? parsedTimestamp.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
    : undefined;

  const meta = {
    model: typeof value.model === "string" ? value.model : undefined,
    time,
    totalTokens: typeof value.totalTokens === "number" ? value.totalTokens : undefined,
  };

  const normalized = {
    content,
    error: false,
    role,
  };

  if (meta.model || meta.time || meta.totalTokens !== undefined) {
    normalized.meta = meta;
  }

  return normalized;
}

function replaceMessages(nextMessages) {
  messages.splice(0, messages.length, ...nextMessages);
  saveMessagesToLocalStorage();
  renderMessages();
  renderRecentHistory();
}

function renderRecentHistory() {
  if (!recentHistoryElement) {
    return;
  }

  recentHistoryElement.innerHTML = "";

  const recentMessages = [...messages].reverse().slice(0, MAX_RECENT_HISTORY_ITEMS);

  if (recentMessages.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "Sem conversas recentes.";
    recentHistoryElement.append(emptyItem);
    return;
  }

  for (const message of recentMessages) {
    const item = document.createElement("li");
    const roleLabel = message.role === "user" ? "Voce" : "Copiloto";
    const preview = message.content.length > 90
      ? `${message.content.slice(0, 90)}...`
      : message.content;
    const timeLabel = message.meta?.time ? ` (${message.meta.time})` : "";

    item.textContent = `${roleLabel}${timeLabel}: ${preview}`;
    recentHistoryElement.append(item);
  }
}

function setStatus(mode, label) {
  if (!statusPill) {
    return;
  }

  if (!mode) {
    statusPill.removeAttribute("data-mode");
  } else {
    statusPill.setAttribute("data-mode", mode);
  }

  statusPill.textContent = label;
}

function formatMeta(meta) {
  if (!meta) {
    return "";
  }

  const chunks = [];

  if (meta.model) {
    chunks.push(`Modelo: ${meta.model}`);
  }

  if (meta.totalTokens !== undefined) {
    chunks.push(`Tokens: ${meta.totalTokens}`);
  }

  if (meta.time) {
    chunks.push(`Hora: ${meta.time}`);
  }

  return chunks.join(" • ");
}

function renderMessages() {
  if (!messagesContainer) {
    return;
  }

  messagesContainer.innerHTML = "";

  for (const message of messages) {
    const messageElement = document.createElement("article");
    messageElement.className = `message message-${message.role}${message.error ? " message-error" : ""}`;

    const roleElement = document.createElement("div");
    roleElement.className = "role";
    roleElement.textContent = message.role === "user" ? "Você" : "Copiloto";

    const contentElement = document.createElement("p");
    contentElement.textContent = message.content;

    messageElement.append(roleElement, contentElement);

    const metaText = formatMeta(message.meta);

    if (metaText.length > 0) {
      const metaElement = document.createElement("div");
      metaElement.className = "meta";
      metaElement.textContent = metaText;
      messageElement.append(metaElement);
    }

    messagesContainer.append(messageElement);
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function pushMessage(role, content, options = {}) {
  messages.push({
    content,
    error: options.error ?? false,
    meta: options.meta,
    role,
  });

  saveMessagesToLocalStorage();
  renderMessages();
  renderRecentHistory();
}

function setSendingState(nextValue) {
  isSending = nextValue;

  if (sendButton) {
    sendButton.disabled = nextValue;
    sendButton.textContent = nextValue ? "Consultando..." : "Enviar ao Copiloto";
  }

  if (chatInput) {
    chatInput.disabled = nextValue;
  }

  setStatus(nextValue ? "loading" : "", nextValue ? "Consultando" : "Pronto");
}

async function requestCopilotCompletion(message) {
  const response = await fetch(buildApiUrl("/v1/copilot/chat"), {
    body: JSON.stringify({
      maxTokens: 350,
      message,
      sessionId: chatSessionId,
      temperature: 0.1,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const apiMessage = payload?.error?.message;
    throw new Error(typeof apiMessage === "string" ? apiMessage : "Falha ao consultar o Copiloto");
  }

  return payload;
}

async function loadMessagesFromBackend() {
  const response = await fetch(
    buildApiUrl(`/v1/copilot/history?sessionId=${encodeURIComponent(chatSessionId)}&limit=${MAX_STORED_MESSAGES}`),
    {
      method: "GET",
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return false;
  }

  const historyMessages = Array.isArray(payload?.data?.messages) ? payload.data.messages : [];
  const normalizedMessages = historyMessages
    .map((item) => normalizeRemoteHistoryMessage(item))
    .filter((item) => item !== null);

  if (normalizedMessages.length === 0) {
    return false;
  }

  replaceMessages(normalizedMessages);

  const assistantWithModel = [...normalizedMessages]
    .reverse()
    .find((item) => item.role === "assistant" && item.meta?.model);

  if (activeModelElement && assistantWithModel?.meta?.model) {
    activeModelElement.textContent = assistantWithModel.meta.model;
  }

  return true;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!chatInput || isSending) {
    return;
  }

  const prompt = chatInput.value.trim();

  if (prompt.length === 0) {
    return;
  }

  pushMessage("user", prompt, {
    meta: {
      time: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  });

  chatInput.value = "";
  setSendingState(true);

  try {
    const payload = await requestCopilotCompletion(prompt);
    const aiData = payload?.data;

    if (!aiData || typeof aiData.answer !== "string") {
      throw new Error("Resposta da IA sem formato esperado");
    }

    if (activeModelElement && typeof aiData.model === "string") {
      activeModelElement.textContent = aiData.model;
    }

    pushMessage("assistant", aiData.answer, {
      meta: {
        model: aiData.model,
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        totalTokens: aiData.usage?.totalTokens,
      },
    });

    setStatus("", "Pronto");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a IA";

    pushMessage("assistant", message, {
      error: true,
      meta: {
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    });

    setStatus("error", "Falha");
  } finally {
    setSendingState(false);
    chatInput?.focus();
  }
}

function setupQuickPrompts() {
  if (!quickPromptsContainer || !chatInput) {
    return;
  }

  quickPromptsContainer.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    const prompt = target.dataset.prompt;

    if (!prompt) {
      return;
    }

    chatInput.value = prompt;
    chatInput.focus();
  });
}

function setupLocalHistoryControls() {
  if (!clearLocalHistoryButton) {
    return;
  }

  clearLocalHistoryButton.addEventListener("click", () => {
    rotateSessionId();
    messages.splice(0, messages.length);
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    renderMessages();
    renderRecentHistory();
    setStatus("", "Nova sessao iniciada");
    chatInput?.focus();
  });
}

async function initializeChatHistory() {
  setStatus("loading", "Sincronizando");

  try {
    const loadedFromBackend = await loadMessagesFromBackend();

    if (loadedFromBackend) {
      setStatus("", "Historico remoto carregado");
      return;
    }
  } catch {
    // Fallback para historico local quando API estiver indisponivel.
  }

  const storedMessages = loadMessagesFromLocalStorage();

  if (storedMessages.length > 0) {
    replaceMessages(storedMessages);
    setStatus("", "Historico local carregado");
    return;
  }

  pushMessage(
    "assistant",
    "Pronto para ajudar. Peça um resumo de mercado, riscos de curto prazo ou um plano de monitoramento para hoje.",
    {
      meta: {
        model: "google/gemini-1.5-flash",
        time: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    },
  );

  setStatus("", "Pronto");
}

if (chatForm) {
  chatForm.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm?.requestSubmit();
    }
  });
}

setupQuickPrompts();
setupLocalHistoryControls();
void initializeChatHistory();