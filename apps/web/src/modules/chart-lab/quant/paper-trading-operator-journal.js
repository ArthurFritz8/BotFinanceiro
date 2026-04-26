/**
 * Journal & Circuit Breaker do Operator Auto-Dispatch (ADR-104).
 *
 * Funcoes puras (sem DOM) que:
 *  1) Mantem um ring buffer local com os ultimos N envios da rota
 *     `/v1/paper-trading/operator/auto-signal`, persistido em
 *     `localStorage` com schema-guard e degradacao silenciosa.
 *  2) Calcula um resumo de auditoria (total/sucessos/falhas/falhas
 *     consecutivas/ultimo evento) consumido pela UI Operator Desk.
 *  3) Decide quando o operador deve ser desarmado automaticamente
 *     (circuit breaker) apos N falhas consecutivas — fail-honest:
 *     prefere desarmar a inundar o backend com erros 4xx/5xx.
 *
 * O modulo nao registra o token nem o payload completo: persiste apenas
 * dados nao sensiveis (asset, side, score, status, codigo de erro) para
 * evitar vazamento de credencial via export/devtools.
 */

export const PAPER_TRADING_OPERATOR_JOURNAL_STORAGE_KEY = "botfinanceiro:paper-trading-operator-journal:v1";
export const PAPER_TRADING_OPERATOR_JOURNAL_LIMIT = 25;
export const PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD = 3;

const VALID_OUTCOMES = new Set(["success", "failure"]);

function defaultJournalState() {
  return { entries: [] };
}

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeEntry(candidate) {
  if (!candidate || typeof candidate !== "object") return null;

  const outcome = typeof candidate.outcome === "string" ? candidate.outcome.toLowerCase() : "";
  if (!VALID_OUTCOMES.has(outcome)) return null;

  const occurredAtMs = toFiniteNumber(candidate.occurredAtMs);
  if (occurredAtMs === null || occurredAtMs <= 0) return null;

  const asset = typeof candidate.asset === "string" ? candidate.asset.trim().toLowerCase().slice(0, 40) : "";
  if (!asset) return null;

  const side = candidate.side === "short" ? "short" : candidate.side === "long" ? "long" : "";
  if (!side) return null;

  const tier = ["high", "medium", "low"].includes(candidate.tier) ? candidate.tier : "low";
  const confluenceScore = toFiniteNumber(candidate.confluenceScore);
  const score = confluenceScore !== null && confluenceScore >= 0 && confluenceScore <= 100 ? confluenceScore : null;

  const status = toFiniteNumber(candidate.status);
  const errorCode = typeof candidate.errorCode === "string" ? candidate.errorCode.slice(0, 80) : null;

  return {
    asset,
    confluenceScore: score,
    errorCode: outcome === "failure" ? (errorCode ?? "UNKNOWN") : null,
    occurredAtMs,
    outcome,
    side,
    status: status !== null ? status : null,
    tier,
  };
}

export function sanitizePersistedOperatorJournal(candidate) {
  if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.entries)) {
    return defaultJournalState();
  }
  const entries = candidate.entries
    .map(sanitizeEntry)
    .filter((entry) => entry !== null)
    .slice(-PAPER_TRADING_OPERATOR_JOURNAL_LIMIT);
  return { entries };
}

function readWindowLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadOperatorJournal(storage) {
  const target = storage ?? readWindowLocalStorage();
  if (!target) return defaultJournalState();
  try {
    const raw = target.getItem(PAPER_TRADING_OPERATOR_JOURNAL_STORAGE_KEY);
    if (!raw) return defaultJournalState();
    return sanitizePersistedOperatorJournal(JSON.parse(raw));
  } catch {
    return defaultJournalState();
  }
}

export function saveOperatorJournal(state, storage) {
  const target = storage ?? readWindowLocalStorage();
  if (!target) return false;
  try {
    target.setItem(PAPER_TRADING_OPERATOR_JOURNAL_STORAGE_KEY, JSON.stringify(sanitizePersistedOperatorJournal(state)));
    return true;
  } catch {
    return false;
  }
}

export function clearOperatorJournal(storage) {
  const target = storage ?? readWindowLocalStorage();
  if (!target) return false;
  try {
    target.removeItem(PAPER_TRADING_OPERATOR_JOURNAL_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cria uma nova entrada do journal a partir do resultado de
 * `submitAutoSignal` + payload. Retorna `null` se o resultado nao tiver
 * forma esperada — protege contra registros corrompidos.
 */
export function createOperatorJournalEntry({ payload, result, occurredAtMs }) {
  if (!payload || typeof payload !== "object" || !result || typeof result !== "object") return null;

  const outcome = result.ok === true ? "success" : "failure";
  const candidate = {
    asset: payload.asset,
    confluenceScore: payload.confluenceScore,
    errorCode: outcome === "failure" ? (result.error?.code ?? "UNKNOWN") : null,
    occurredAtMs: typeof occurredAtMs === "number" && Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now(),
    outcome,
    side: payload.side,
    status: typeof result.status === "number" ? result.status : null,
    tier: payload.tier,
  };

  return sanitizeEntry(candidate);
}

export function appendOperatorJournalEntry(state, entry) {
  const base = sanitizePersistedOperatorJournal(state);
  const sanitized = sanitizeEntry(entry);
  if (!sanitized) return base;
  const entries = [...base.entries, sanitized].slice(-PAPER_TRADING_OPERATOR_JOURNAL_LIMIT);
  return { entries };
}

/**
 * Resume o journal para a UI: contagens, taxa de sucesso, falhas
 * consecutivas (medidas a partir do final), ultimo evento.
 * Tudo derivado em O(N) sobre o ring buffer local.
 */
export function summarizeOperatorJournal(state) {
  const base = sanitizePersistedOperatorJournal(state);
  const total = base.entries.length;
  let successes = 0;
  let failures = 0;
  for (const entry of base.entries) {
    if (entry.outcome === "success") successes += 1;
    else failures += 1;
  }

  let consecutiveFailures = 0;
  for (let i = base.entries.length - 1; i >= 0; i -= 1) {
    if (base.entries[i].outcome === "failure") consecutiveFailures += 1;
    else break;
  }

  const last = total > 0 ? base.entries[total - 1] : null;
  const successRate = total > 0 ? Math.round((successes / total) * 1000) / 10 : null;

  return {
    consecutiveFailures,
    failures,
    last,
    successes,
    successRate,
    total,
  };
}

/**
 * Decide se o circuit breaker deve abrir e desarmar o operador.
 * Abre quando o numero de falhas consecutivas >= threshold. Tambem
 * ignora codigos de erro classificados como "operacionais transitorios"
 * (ex.: NETWORK_ERROR, HTTP_503) para nao desarmar por blip — apenas
 * erros de credencial/contratos contam para o threshold quando
 * `strict=true`. Por padrao todos contam, mantendo seguranca maxima.
 */
export function shouldTripOperatorBreaker(summary, options = {}) {
  if (!summary || typeof summary !== "object") return false;
  const threshold = typeof options.threshold === "number" && Number.isFinite(options.threshold) && options.threshold > 0
    ? Math.floor(options.threshold)
    : PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD;
  return Number(summary.consecutiveFailures ?? 0) >= threshold;
}
