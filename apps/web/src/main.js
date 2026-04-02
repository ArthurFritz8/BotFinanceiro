import "./styles.css";

const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messagesContainer = document.querySelector("#messages");
const statusPill = document.querySelector("#connection-status");
const quickPromptsContainer = document.querySelector("#quick-prompts");
const activeModelElement = document.querySelector("#active-model");
const recentHistoryElement = document.querySelector("#recent-history");
const clearLocalHistoryButton = document.querySelector("#clear-local-history");
const chartControlsForm = document.querySelector("#chart-controls");
const chartAssetSelect = document.querySelector("#chart-asset");
const chartRangeSelect = document.querySelector("#chart-range");
const chartRefreshButton = document.querySelector("#chart-refresh-button");
const chartStatusElement = document.querySelector("#chart-status");
const chartCanvas = document.querySelector("#chart-canvas");
const chartMetricsElement = document.querySelector("#chart-metrics");
const chartAnalyzeButton = document.querySelector("#chart-analyze-button");

const CHAT_HISTORY_STORAGE_KEY = "botfinanceiro.copilot.history.v1";
const CHAT_SESSION_STORAGE_KEY = "botfinanceiro.copilot.session.v1";
const MAX_STORED_MESSAGES = 60;
const MAX_RECENT_HISTORY_ITEMS = 8;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const CHART_RANGE_LABELS = {
  "1y": "1 ano",
  "24h": "24h",
  "30d": "30 dias",
  "7d": "7 dias",
  "90d": "90 dias",
};

const messages = [];
let isSending = false;
let chatSessionId = getOrCreateSessionId();
let currentChartSnapshot = null;

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

function formatPrice(value, currency = "usd") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  const maximumFractionDigits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;

  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits,
  })} ${String(currency).toUpperCase()}`;
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/d";
  }

  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(2)}%`;
}

function formatTrendLabel(trend) {
  if (trend === "bullish") {
    return "Viés de alta";
  }

  if (trend === "bearish") {
    return "Viés de baixa";
  }

  return "Viés lateral";
}

function setChartStatus(message, mode = "") {
  if (!chartStatusElement) {
    return;
  }

  chartStatusElement.textContent = message;

  if (mode) {
    chartStatusElement.setAttribute("data-mode", mode);
  } else {
    chartStatusElement.removeAttribute("data-mode");
  }
}

function clearChartCanvas() {
  if (!(chartCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = chartCanvas.getContext("2d");

  if (!context) {
    return;
  }

  context.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
}

function drawChart(snapshot) {
  if (!(chartCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = chartCanvas.getContext("2d");

  if (!context) {
    return;
  }

  const points = Array.isArray(snapshot?.points) ? snapshot.points : [];

  if (points.length < 2) {
    clearChartCanvas();
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = chartCanvas.clientWidth || chartCanvas.width;
  const cssHeight = chartCanvas.clientHeight || chartCanvas.height;
  chartCanvas.width = Math.max(300, Math.floor(cssWidth * dpr));
  chartCanvas.height = Math.max(180, Math.floor(cssHeight * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = cssWidth;
  const height = cssHeight;
  context.clearRect(0, 0, width, height);

  const padding = {
    bottom: 22,
    left: 12,
    right: 12,
    top: 12,
  };
  const chartWidth = Math.max(1, width - padding.left - padding.right);
  const chartHeight = Math.max(1, height - padding.top - padding.bottom);
  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const chartPoints = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1)) * chartWidth;
    const normalizedPrice = (point.price - minPrice) / priceRange;
    const y = padding.top + (1 - normalizedPrice) * chartHeight;

    return {
      x,
      y,
    };
  });

  context.strokeStyle = "rgba(14, 143, 126, 0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top + chartHeight / 2);
  context.lineTo(width - padding.right, padding.top + chartHeight / 2);
  context.stroke();

  const areaGradient = context.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
  areaGradient.addColorStop(0, "rgba(14, 143, 126, 0.25)");
  areaGradient.addColorStop(1, "rgba(14, 143, 126, 0.01)");

  context.fillStyle = areaGradient;
  context.beginPath();
  context.moveTo(chartPoints[0]?.x ?? padding.left, padding.top + chartHeight);

  for (const point of chartPoints) {
    context.lineTo(point.x, point.y);
  }

  context.lineTo(chartPoints[chartPoints.length - 1]?.x ?? padding.left, padding.top + chartHeight);
  context.closePath();
  context.fill();

  context.strokeStyle = "#0e8f7e";
  context.lineWidth = 2;
  context.beginPath();

  chartPoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
      return;
    }

    context.lineTo(point.x, point.y);
  });

  context.stroke();

  const lastPoint = chartPoints[chartPoints.length - 1];

  if (lastPoint) {
    context.fillStyle = "#18334f";
    context.beginPath();
    context.arc(lastPoint.x, lastPoint.y, 3.3, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "#607180";
  context.font = "12px Sora";
  context.textAlign = "left";
  context.fillText(formatPrice(minPrice, snapshot.currency), padding.left, height - 6);
  context.textAlign = "right";
  context.fillText(formatPrice(maxPrice, snapshot.currency), width - padding.right, height - 6);
}

function renderChartMetrics(snapshot) {
  if (!chartMetricsElement) {
    return;
  }

  const insights = snapshot?.insights;

  if (!insights) {
    chartMetricsElement.innerHTML = "";
    return;
  }

  const metrics = [
    {
      label: "Preço",
      value: formatPrice(insights.currentPrice, snapshot.currency),
    },
    {
      label: "Trend",
      value: formatTrendLabel(insights.trend),
    },
    {
      label: "Variação",
      value: formatPercent(insights.changePercent),
    },
    {
      label: "Volatilidade",
      value: formatPercent(insights.volatilityPercent),
    },
    {
      label: "Suporte",
      value: formatPrice(insights.supportLevel, snapshot.currency),
    },
    {
      label: "Resistência",
      value: formatPrice(insights.resistanceLevel, snapshot.currency),
    },
  ];

  chartMetricsElement.innerHTML = "";

  for (const metric of metrics) {
    const metricElement = document.createElement("article");
    metricElement.className = "chart-metric";

    const labelElement = document.createElement("div");
    labelElement.className = "chart-metric-label";
    labelElement.textContent = metric.label;

    const valueElement = document.createElement("div");
    valueElement.className = "chart-metric-value";
    valueElement.textContent = metric.value;

    metricElement.append(labelElement, valueElement);
    chartMetricsElement.append(metricElement);
  }
}

async function requestCryptoChart(assetId, range) {
  const response = await fetch(
    buildApiUrl(`/v1/crypto/chart?assetId=${encodeURIComponent(assetId)}&currency=usd&range=${encodeURIComponent(range)}`),
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
    const errorMessage = payload?.error?.message;
    throw new Error(typeof errorMessage === "string" ? errorMessage : "Nao foi possivel carregar o grafico");
  }

  return payload?.data ?? null;
}

async function loadChart(options = {}) {
  if (!chartAssetSelect || !chartRangeSelect) {
    return;
  }

  const assetId = options.assetId ?? chartAssetSelect.value;
  const range = options.range ?? chartRangeSelect.value;

  if (chartRefreshButton instanceof HTMLButtonElement) {
    chartRefreshButton.disabled = true;
    chartRefreshButton.textContent = "Atualizando...";
  }

  setChartStatus("Atualizando dados de grafico...", "loading");

  try {
    const snapshot = await requestCryptoChart(assetId, range);

    if (!snapshot || !Array.isArray(snapshot.points)) {
      throw new Error("Resposta de grafico invalida");
    }

    currentChartSnapshot = snapshot;
    drawChart(snapshot);
    renderChartMetrics(snapshot);

    const cacheLabel = snapshot.cache?.state ? `cache ${snapshot.cache.state}` : "cache n/d";
    const rangeLabel = CHART_RANGE_LABELS[snapshot.range] ?? snapshot.range;
    setChartStatus(`Grafico ${assetId.toUpperCase()} (${rangeLabel}) carregado • ${cacheLabel}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar grafico";
    setChartStatus(message, "error");
    clearChartCanvas();
    renderChartMetrics(null);
    currentChartSnapshot = null;
  } finally {
    if (chartRefreshButton instanceof HTMLButtonElement) {
      chartRefreshButton.disabled = false;
      chartRefreshButton.textContent = "Atualizar grafico";
    }
  }
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

function setupChartLab() {
  if (!chartControlsForm || !chartAssetSelect || !chartRangeSelect) {
    return;
  }

  chartControlsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadChart();
  });

  chartAssetSelect.addEventListener("change", () => {
    void loadChart();
  });

  chartRangeSelect.addEventListener("change", () => {
    void loadChart();
  });

  if (chartAnalyzeButton) {
    chartAnalyzeButton.addEventListener("click", () => {
      if (!chatInput || !chartAssetSelect || !chartRangeSelect) {
        return;
      }

      const assetId = chartAssetSelect.value;
      const range = chartRangeSelect.value;
      const rangeLabel = CHART_RANGE_LABELS[range] ?? range;
      const trend = currentChartSnapshot?.insights?.trend
        ? formatTrendLabel(currentChartSnapshot.insights.trend).toLowerCase()
        : "viés indefinido";

      chatInput.value = `Analise tecnicamente o grafico de ${assetId} em ${rangeLabel}, com tendencia, momentum, volatilidade, suporte e resistencia. Contexto atual: ${trend}.`;
      chatInput.focus();

      if (chatForm && !isSending) {
        chatForm.requestSubmit();
      }
    });
  }

  void loadChart();
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
    "Pronto para ajudar. Peça um resumo de mercado, riscos de curto prazo, panorama macro ou analise tecnica de grafico.",
    {
      meta: {
        model: "google/gemini-2.0-flash-001",
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
setupChartLab();
void initializeChatHistory();