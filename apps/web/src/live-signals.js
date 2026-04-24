// ADR-078 — Live Signals Screener (Top Opportunities cross-asset)
//
// Modulo isolado para nao inflar main.js (ja com 18k+ linhas). Renderiza o
// painel de sinais de alta confluencia, banner PRO com countdown persistido,
// toggle de som (beep curto via AudioContext) e botao "Auditar Sinal" que
// dispara um callback injetado para abrir o ativo no Chart Lab.
//
// Pontos de extensao:
//   - Substituir startMockFeed() por SSE/WebSocket real quando o backend
//     expor /v1/live-signals/feed.
//   - Trocar o stub do toggle PRO (consumeProCredit) pela integracao com
//     o sistema de creditos.

const STORAGE_KEY = "botfinanceiro:liveSignals:v1";
const DEFAULT_PREFS = Object.freeze({
  soundEnabled: true,
  proUnlockedUntilMs: 0,
  filterTimeframe: "all",
  filterMinScore: 85,
});
const PRO_DURATION_MS = 60 * 60 * 1000; // 1h

function safeStorageGet() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeStorageSet(value) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Ignora quota / modo privado silenciosamente.
  }
}

function sanitizePersisted(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const soundEnabled = typeof raw.soundEnabled === "boolean" ? raw.soundEnabled : DEFAULT_PREFS.soundEnabled;
  const proUnlockedUntilMs = Number.isFinite(raw.proUnlockedUntilMs) && raw.proUnlockedUntilMs > Date.now()
    ? Math.floor(raw.proUnlockedUntilMs)
    : 0;
  const allowedTf = new Set(["all", "5m", "15m", "60m", "240m", "D"]);
  const filterTimeframe = typeof raw.filterTimeframe === "string" && allowedTf.has(raw.filterTimeframe)
    ? raw.filterTimeframe
    : DEFAULT_PREFS.filterTimeframe;
  const minScore = Number.isFinite(raw.filterMinScore)
    ? Math.min(99, Math.max(85, Math.round(raw.filterMinScore)))
    : DEFAULT_PREFS.filterMinScore;
  return { soundEnabled, proUnlockedUntilMs, filterTimeframe, filterMinScore: minScore };
}

function loadPrefs() {
  const raw = safeStorageGet();
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    return sanitizePersisted(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let persistTimer = null;
function schedulePersist(prefs) {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    safeStorageSet(JSON.stringify(prefs));
  }, 180);
}

// --- Audio (beep curto) ---------------------------------------------------
let audioCtx = null;
function ensureAudioCtx() {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function playBeep() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // ignore
  }
}

// --- Mock institucional ----------------------------------------------------
// Em producao: substituir por subscribeLiveSignals() conectado a SSE.
function generateMockSignals(now = Date.now()) {
  const seeds = [
    { symbol: "XAUUSD",       tone: "bull",    tf: "5m",   entry: 4819.85, stop: 4795.65, take: 4867.85, score: 86, status: "ativo" },
    { symbol: "Indice S&P",   tone: "bull",    tf: "5m",   entry: 7189.77, stop: 7099.77, take: 7119.77, score: 76, status: "aguardando" },
    { symbol: "Indice Nasdaq",tone: "bull",    tf: "5m",   entry: 26584.51, stop: 26554.51, take: 26614.51, score: 75, status: "ativo" },
    { symbol: "Indice Dow Jones", tone: "bull", tf: "5m",  entry: 49365.94, stop: 49265.94, take: 49465.94, score: 55, status: "aguardando" },
    { symbol: "EURUSD",       tone: "bear",    tf: "15m",  entry: 1.17848, stop: 1.17965, take: 1.17698, score: 78, status: "ativo" },
    { symbol: "BTCUSDT",      tone: "bull",    tf: "60m",  entry: 67320.5, stop: 66890.0, take: 68100.0, score: 92, status: "tp1" },
    { symbol: "ETHUSDT",      tone: "bear",    tf: "15m",  entry: 3215.40, stop: 3252.10, take: 3148.20, score: 88, status: "ativo" },
  ];
  return seeds.map((s, i) => {
    const rr = Math.abs((s.take - s.entry) / Math.max(Math.abs(s.entry - s.stop), 1e-9));
    const setup = s.tone === "bull"
      ? "Liquidity Sweep + OB Rejection"
      : "FVG Mitigado + LH Confirmation";
    return {
      ...s,
      rr: Number.isFinite(rr) ? rr : 0,
      setup,
      signalId: `ls_${s.symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}_${now - i * 60_000}`,
      snapshotAtMs: now - i * 60_000,
    };
  });
}

const TF_LABEL = { "5m": "M5", "15m": "M15", "60m": "H1", "240m": "H4", D: "D1" };
const STATUS_LABEL = {
  aguardando: "Aguardando Gatilho",
  ativo: "Trade Ativo",
  tp1: "Alvo 1 Atingido",
  tp2: "Alvo 2 Atingido",
  stop: "Stop Disparado",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch] ?? ch));
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(2);
  if (Math.abs(value) >= 1)    return value.toFixed(4);
  return value.toFixed(5);
}

function formatTimestamp(ms) {
  try {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function scoreTier(score) {
  if (score >= 90) return "elite";
  if (score >= 85) return "strong";
  return "ok";
}

function renderCard(signal) {
  const arrow = signal.tone === "bull" ? "↗" : signal.tone === "bear" ? "↘" : "→";
  const tfLabel = TF_LABEL[signal.tf] ?? signal.tf;
  const statusLabel = STATUS_LABEL[signal.status] ?? signal.status;
  return `
    <article class="live-signals__card" data-tone="${escapeHtml(signal.tone)}"
      title="signalId=${escapeHtml(signal.signalId)} | snapshot=${formatTimestamp(signal.snapshotAtMs)}">
      <div class="live-signals__card-head">
        <span class="live-signals__card-symbol">
          <span class="live-signals__card-arrow" data-tone="${escapeHtml(signal.tone)}">${arrow}</span>
          ${escapeHtml(signal.symbol)}
        </span>
        <span class="live-signals__card-tags">
          <span class="live-signals__card-tf">${escapeHtml(tfLabel)}</span>
          <span class="live-signals__card-status" data-state="${escapeHtml(signal.status)}">● ${escapeHtml(statusLabel)}</span>
        </span>
        <span class="live-signals__card-setup">${escapeHtml(signal.setup)}</span>
      </div>
      <div class="live-signals__card-zone" data-kind="entry">
        <span class="live-signals__card-zone-label">Entrada</span>
        <span class="live-signals__card-zone-value">${formatPrice(signal.entry)}</span>
      </div>
      <div class="live-signals__card-zone" data-kind="stop">
        <span class="live-signals__card-zone-label">Stop</span>
        <span class="live-signals__card-zone-value">${formatPrice(signal.stop)}</span>
      </div>
      <div class="live-signals__card-zone" data-kind="take">
        <span class="live-signals__card-zone-label">Take</span>
        <span class="live-signals__card-zone-value">${formatPrice(signal.take)}</span>
      </div>
      <div class="live-signals__card-meta">
        <span class="live-signals__card-score" data-tier="${scoreTier(signal.score)}">${signal.score}%</span>
        <span class="live-signals__card-rr">R:R 1:${signal.rr.toFixed(1)}</span>
      </div>
      <div class="live-signals__card-actions">
        <button type="button" class="live-signals__audit-btn" data-action="audit" data-signal-id="${escapeHtml(signal.signalId)}" data-symbol="${escapeHtml(signal.symbol)}">
          Auditar Sinal
        </button>
        <span class="live-signals__card-timestamp">${formatTimestamp(signal.snapshotAtMs)}</span>
      </div>
    </article>
  `;
}

function applyFilters(signals, prefs) {
  return signals.filter((s) => {
    if (prefs.filterTimeframe !== "all" && s.tf !== prefs.filterTimeframe) return false;
    if (s.score < prefs.filterMinScore) return false;
    return true;
  });
}

// --- Bootstrap publico -----------------------------------------------------
export function bootstrapLiveSignals({ onAuditSignal } = {}) {
  const stage = document.querySelector("#live-signals-stage");
  if (!(stage instanceof HTMLElement)) return;

  const prefs = loadPrefs();

  const monitorCount = document.querySelector("#live-signals-monitor-count");
  const minScoreLabel = document.querySelector("#live-signals-min-score-label");
  const soundToggle = document.querySelector("#live-signals-sound-toggle");
  const proBanner = document.querySelector("#live-signals-pro-banner");
  const proCountdown = document.querySelector("#live-signals-pro-countdown");
  const proToggle = document.querySelector("#live-signals-pro-toggle");
  const filterTf = document.querySelector("#live-signals-filter-tf");
  const filterScore = document.querySelector("#live-signals-filter-score");
  const filterScoreValue = document.querySelector("#live-signals-filter-score-value");
  const statusPill = document.querySelector("#live-signals-status");
  const feed = document.querySelector("#live-signals-feed");
  const activeCount = document.querySelector("#live-signals-active-count");
  const feedMeta = document.querySelector("#live-signals-feed-meta");

  let lastSignals = [];
  let lastNotifiedIds = new Set();
  let pollTimer = null;

  function syncSoundButton() {
    if (!(soundToggle instanceof HTMLButtonElement)) return;
    soundToggle.setAttribute("aria-pressed", prefs.soundEnabled ? "true" : "false");
    const label = soundToggle.querySelector(".live-signals__sound-label");
    if (label) label.textContent = prefs.soundEnabled ? "Som" : "Mudo";
  }

  function syncProBanner() {
    if (!(proBanner instanceof HTMLElement) || !(proToggle instanceof HTMLButtonElement)) return;
    const remaining = Math.max(0, prefs.proUnlockedUntilMs - Date.now());
    const unlocked = remaining > 0;
    proBanner.dataset.state = unlocked ? "unlocked" : "locked";
    proToggle.setAttribute("aria-checked", unlocked ? "true" : "false");
    const stateLabel = proBanner.querySelector('[data-role="state-label"]');
    const stateHint = proBanner.querySelector('[data-role="state-hint"]');
    if (stateLabel) stateLabel.textContent = unlocked ? "Sinais Desbloqueados" : "Sinais Bloqueados";
    if (stateHint) stateHint.textContent = unlocked ? "enquanto ativo" : "ative para ver score completo";
    if (proCountdown) {
      if (unlocked) {
        const minutes = Math.floor(remaining / 60_000);
        const seconds = Math.floor((remaining % 60_000) / 1000);
        proCountdown.textContent = minutes > 0 ? `${minutes}min` : `${seconds}s`;
      } else {
        proCountdown.textContent = "—";
      }
    }
  }

  function syncFilters() {
    if (filterTf instanceof HTMLSelectElement) filterTf.value = prefs.filterTimeframe;
    if (filterScore instanceof HTMLInputElement) filterScore.value = String(prefs.filterMinScore);
    if (filterScoreValue) filterScoreValue.textContent = String(prefs.filterMinScore);
    if (minScoreLabel) minScoreLabel.textContent = String(prefs.filterMinScore);
  }

  function maybeNotify(signals) {
    if (!prefs.soundEnabled) return;
    const elite = signals.filter((s) => s.score >= 90);
    const newOnes = elite.filter((s) => !lastNotifiedIds.has(s.signalId));
    if (newOnes.length > 0) {
      playBeep();
      newOnes.forEach((s) => lastNotifiedIds.add(s.signalId));
      // Limita memoria
      if (lastNotifiedIds.size > 200) {
        lastNotifiedIds = new Set([...lastNotifiedIds].slice(-100));
      }
    }
  }

  function renderFeed() {
    if (!(feed instanceof HTMLElement)) return;
    const visible = applyFilters(lastSignals, prefs);
    feed.removeAttribute("aria-busy");
    feed.innerHTML = visible.map(renderCard).join("");
    if (activeCount) activeCount.textContent = String(visible.length);
    if (feedMeta) {
      feedMeta.textContent = `${visible.length}/${lastSignals.length} setups visiveis · atualizado ${formatTimestamp(Date.now())}`;
    }
    if (monitorCount) monitorCount.textContent = String(lastSignals.length || "—");
  }

  function setStatus(state, message) {
    if (!(statusPill instanceof HTMLElement)) return;
    statusPill.dataset.state = state;
    statusPill.textContent = message;
  }

  function refreshSignals() {
    try {
      const next = generateMockSignals();
      lastSignals = next;
      maybeNotify(next);
      renderFeed();
      setStatus("live", `Radar ao vivo · ${next.length} ativos`);
    } catch (err) {
      setStatus("error", "Falha ao sincronizar radar");
      // eslint-disable-next-line no-console
      console.warn("[live-signals] refresh failed", err);
    }
  }

  function startPolling() {
    if (pollTimer) return;
    refreshSignals();
    pollTimer = setInterval(refreshSignals, 5000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Eventos
  if (soundToggle instanceof HTMLButtonElement) {
    soundToggle.addEventListener("click", () => {
      prefs.soundEnabled = !prefs.soundEnabled;
      syncSoundButton();
      schedulePersist(prefs);
      if (prefs.soundEnabled) {
        // Iniciar AudioContext apos gesto do usuario (politica de browsers).
        ensureAudioCtx();
      }
    });
  }

  if (proToggle instanceof HTMLButtonElement) {
    proToggle.addEventListener("click", () => {
      const remaining = Math.max(0, prefs.proUnlockedUntilMs - Date.now());
      if (remaining > 0) {
        prefs.proUnlockedUntilMs = 0;
      } else {
        // Extension point: integrar consumo real de credito PRO aqui.
        prefs.proUnlockedUntilMs = Date.now() + PRO_DURATION_MS;
      }
      syncProBanner();
      schedulePersist(prefs);
    });
  }

  if (filterTf instanceof HTMLSelectElement) {
    filterTf.addEventListener("change", () => {
      prefs.filterTimeframe = filterTf.value;
      schedulePersist(prefs);
      renderFeed();
    });
  }

  if (filterScore instanceof HTMLInputElement) {
    filterScore.addEventListener("input", () => {
      const next = Math.min(99, Math.max(85, Number.parseInt(filterScore.value, 10) || 85));
      prefs.filterMinScore = next;
      if (filterScoreValue) filterScoreValue.textContent = String(next);
      if (minScoreLabel) minScoreLabel.textContent = String(next);
      schedulePersist(prefs);
      renderFeed();
    });
  }

  if (feed instanceof HTMLElement) {
    feed.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("[data-action='audit']");
      if (!(btn instanceof HTMLButtonElement)) return;
      const symbol = btn.dataset.symbol ?? "";
      const signalId = btn.dataset.signalId ?? "";
      if (typeof onAuditSignal === "function") {
        try { onAuditSignal({ symbol, signalId }); } catch { /* swallow */ }
      }
    });
  }

  // Countdown PRO tick (1s) — barato, so atualiza texto.
  setInterval(() => syncProBanner(), 1000);

  // Init
  syncSoundButton();
  syncProBanner();
  syncFilters();
  startPolling();

  // Pausa polling se a aba ficar oculta (economia de CPU).
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPolling();
    } else {
      startPolling();
    }
  });
}
