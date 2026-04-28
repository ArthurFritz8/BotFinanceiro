// ADR-121 — Onda 3: Macro execution gate pill.
//
// Modulo isolado que poll'a /v1/macro/upcoming-events e expoe state global
// `getMacroGateState()` consumivel por execution-gate em integracao futura.
//
// Comportamento:
// - mount: renderiza pill no elemento root, esconde-se quando alertLevel=green
//   E nao ha evento iminente (mesa profissional nao precisa de ruido visual
//   quando nao ha risco macro).
// - polling 60s (cooldown HTTP via sharedCoalescer evita stampede).
// - latest-wins: token monotonico descarta respostas obsoletas.
// - getMacroGateState() pode ser usado por outras integracoes (ex.: execution-gate
//   bloqueia novas entradas quando blockDirectionalRisk=true).

import { sharedCoalescer } from "../../shared/coalesce.js";

const POLL_INTERVAL_MS = 60_000;
const ENDPOINT_PATH = "/v1/macro/upcoming-events";

let rootElement = null;
let elements = null;
let pollTimer = null;
let activeRequestToken = 0;
let lastState = null;
let stateListeners = new Set();

function createMarkup(rootEl) {
  if (!rootEl.querySelector('[data-field="detail"]')) {
    // ADR-126: a11y. role=status + aria-live=polite no detail anuncia mudanca
    // de evento iminente (ex.: countdown caindo de 1h30 para "agora") sem
    // interromper o leitor.
    rootEl.innerHTML = `
      <span class="macro-gate-pill__dot" aria-hidden="true"></span>
      <span class="macro-gate-pill__label">Macro</span>
      <span class="macro-gate-pill__detail" data-field="detail" role="status" aria-live="polite" aria-atomic="true">aguardando</span>
    `;
  }
  if (!rootEl.hasAttribute("role")) rootEl.setAttribute("role", "region");
  if (!rootEl.hasAttribute("aria-label")) {
    rootEl.setAttribute("aria-label", "Pill de gate macro: proximo evento de alto impacto");
  }
}

function cacheElements() {
  if (!rootElement) return;
  elements = {
    detail: rootElement.querySelector('[data-field="detail"]'),
  };
}

function formatCountdown(minutesToEvent) {
  if (typeof minutesToEvent !== "number" || !Number.isFinite(minutesToEvent)) return "—";
  if (minutesToEvent < 0) return "agora";
  if (minutesToEvent < 60) return `${Math.round(minutesToEvent)}min`;
  const hours = Math.floor(minutesToEvent / 60);
  const minutes = Math.round(minutesToEvent - hours * 60);
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes}m`;
}

function notifyListeners(state) {
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch (listenerError) {
      // eslint-disable-next-line no-console
      console.warn("macro-gate-pill listener falhou", listenerError);
    }
  }
}

function applyState(state) {
  lastState = state;
  if (typeof globalThis !== "undefined") {
    globalThis.__BOT_MACRO_GATE_STATE__ = state;
  }
  notifyListeners(state);

  if (!rootElement || !elements) return;

  if (!state || !state.nextEvent) {
    rootElement.classList.add("is-hidden");
    rootElement.setAttribute("aria-hidden", "true");
    return;
  }

  rootElement.dataset.alertLevel = state.alertLevel ?? "green";
  rootElement.dataset.blocking = state.blockDirectionalRisk ? "true" : "false";

  const next = state.nextEvent;
  const countdown = formatCountdown(next.minutesToEvent);
  const impactLabel = next.impact === "high" ? "alto" : "medio";
  elements.detail.textContent = `${next.name} · ${countdown} · ${impactLabel}`;
  rootElement.title = state.blockDirectionalRisk
    ? `${next.name} em ${countdown} - desk em risco macro elevado, evite novas direcoes.`
    : `${next.name} em ${countdown} (impacto ${impactLabel})`;

  // Esconde pill em estado verde com evento muito distante (>24h) para nao poluir o desk.
  const isLowSignalGreen =
    state.alertLevel === "green"
    && typeof next.minutesToEvent === "number"
    && next.minutesToEvent > 24 * 60;
  if (isLowSignalGreen) {
    rootElement.classList.add("is-hidden");
    rootElement.setAttribute("aria-hidden", "true");
  } else {
    rootElement.classList.remove("is-hidden");
    rootElement.setAttribute("aria-hidden", "false");
  }
}

async function fetchMacroState() {
  const token = ++activeRequestToken;
  try {
    const data = await sharedCoalescer.run("macro-gate-pill", async () => {
      const response = await fetch(ENDPOINT_PATH, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const body = await response.json();
      return body && typeof body === "object" && body.data ? body.data : body;
    });

    if (token !== activeRequestToken) return;
    applyState(data);
  } catch (error) {
    // Em falha, nao limpa state anterior (preserva ultima leitura conhecida).
    if (token !== activeRequestToken) return;
    if (!lastState) {
      // Se nunca tivemos state, mostra placeholder neutro.
      applyState({
        alertLevel: "green",
        blockDirectionalRisk: false,
        events: [],
        nextEvent: null,
        source: "fallback",
        minutesToNextHighImpact: null,
      });
    }
  }
}

function startPolling() {
  if (pollTimer !== null) return;
  void fetchMacroState();
  pollTimer = setInterval(() => {
    void fetchMacroState();
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function mountMacroGatePill(root) {
  if (!(root instanceof HTMLElement)) return;
  rootElement = root;
  rootElement.classList.add("macro-gate-pill");
  createMarkup(rootElement);
  cacheElements();
  startPolling();
}

export function unmountMacroGatePill() {
  stopPolling();
  rootElement = null;
  elements = null;
  activeRequestToken += 1;
}

export function getMacroGateState() {
  return lastState;
}

export function subscribeMacroGateState(listener) {
  if (typeof listener !== "function") return () => {};
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

// Exposto para testes.
export const _testables = {
  formatCountdown,
  applyState,
  _resetState() {
    rootElement = null;
    elements = null;
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    activeRequestToken = 0;
    lastState = null;
    stateListeners = new Set();
  },
};
