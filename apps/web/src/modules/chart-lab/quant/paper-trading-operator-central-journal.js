/**
 * Cliente do Journal Centralizado de Operator Dispatch (ADR-107).
 *
 * Funcoes puras (sem DOM) que consomem o endpoint backend
 * `GET /v1/paper-trading/operator/journal` (ADR-105 + ADR-106), expondo:
 *
 *  1) Sanitizacao + serializacao de filtros (`from`, `to`, `action`,
 *     `asset`, `limit`) em querystring valida.
 *  2) Submissao HTTP autenticada com header
 *     `x-paper-trading-operator-token` e parsing do envelope
 *     `{ ok, data: { total, opened, skipped, errors, entries, enabled } }`.
 *  3) Resumo derivado para a UI (`successRate`, `errorRate`) que NAO
 *     depende de DOM, facilitando testes via `node --test`.
 *
 * Seguranca: o token nunca eh logado nem entra no bundle (operador cola
 * em runtime). Em caso de 401/403 retornamos `{ ok: false, error }` com
 * codigo claro para a UI exibir banner sem vazar detalhes do backend.
 */

import {
  PAPER_TRADING_OPERATOR_HEADER,
  PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH,
} from "./paper-trading-operator-client.js";

export const PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT = "/v1/paper-trading/operator/journal";
export const PAPER_TRADING_OPERATOR_CENTRAL_JOURNAL_DEFAULT_LIMIT = 50;
export const PAPER_TRADING_OPERATOR_CENTRAL_JOURNAL_MAX_LIMIT = 500;

const VALID_ACTIONS = new Set(["opened", "skipped", "error"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function trimOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidIsoString(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

/**
 * Sanitiza filtros vindos da UI. Valores invalidos viram `null` e nao
 * sao enviados ao backend (evita 400 desnecessario). `limit` eh saturado
 * em `[1, 500]`.
 */
export function sanitizeCentralJournalFilters(input = {}) {
  const action = typeof input.action === "string" ? input.action.trim().toLowerCase() : "";
  const asset = trimOrNull(input.asset);
  const fromRaw = trimOrNull(input.from);
  const toRaw = trimOrNull(input.to);

  const limitCandidate = isFiniteNumber(input.limit)
    ? input.limit
    : typeof input.limit === "string" && input.limit.trim().length > 0
      ? Number.parseInt(input.limit, 10)
      : null;
  const limit = isFiniteNumber(limitCandidate) && limitCandidate > 0
    ? Math.min(Math.trunc(limitCandidate), PAPER_TRADING_OPERATOR_CENTRAL_JOURNAL_MAX_LIMIT)
    : null;

  return {
    action: VALID_ACTIONS.has(action) ? action : null,
    asset: asset ? asset.toLowerCase().slice(0, 40) : null,
    from: isValidIsoString(fromRaw) ? fromRaw : null,
    limit,
    to: isValidIsoString(toRaw) ? toRaw : null,
  };
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string") return "";
  return baseUrl.trim().replace(/\/$/, "");
}

/**
 * Constroi a URL completa com querystring estavel (ordem alfabetica)
 * para facilitar caching/debug.
 */
export function buildCentralJournalUrl(baseUrl, filters = {}) {
  const sanitized = sanitizeCentralJournalFilters(filters);
  const params = new URLSearchParams();
  if (sanitized.action) params.set("action", sanitized.action);
  if (sanitized.asset) params.set("asset", sanitized.asset);
  if (sanitized.from) params.set("from", sanitized.from);
  if (sanitized.limit !== null) params.set("limit", String(sanitized.limit));
  if (sanitized.to) params.set("to", sanitized.to);
  const qs = params.toString();
  const path = `${PAPER_TRADING_OPERATOR_JOURNAL_ENDPOINT}${qs ? `?${qs}` : ""}`;
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function sanitizeEntry(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const id = typeof candidate.id === "string" ? candidate.id : null;
  const occurredAtMs = isFiniteNumber(candidate.occurredAtMs) ? candidate.occurredAtMs : null;
  const asset = typeof candidate.asset === "string" ? candidate.asset.toLowerCase() : "";
  const side = candidate.side === "short" ? "short" : candidate.side === "long" ? "long" : "";
  const tier = ["high", "medium", "low"].includes(candidate.tier) ? candidate.tier : "low";
  const action = VALID_ACTIONS.has(candidate.action) ? candidate.action : null;
  const confluenceScore = isFiniteNumber(candidate.confluenceScore) ? candidate.confluenceScore : null;
  const reason = typeof candidate.reason === "string" ? candidate.reason : null;
  if (!id || occurredAtMs === null || !asset || !side || !action) return null;
  return { action, asset, confluenceScore, id, occurredAtMs, reason, side, tier };
}

function sanitizeSnapshot(payload) {
  const base = {
    enabled: false,
    entries: [],
    errors: 0,
    opened: 0,
    skipped: 0,
    total: 0,
  };
  if (!payload || typeof payload !== "object") return base;
  const entries = Array.isArray(payload.entries)
    ? payload.entries.map(sanitizeEntry).filter((entry) => entry !== null)
    : [];
  return {
    enabled: payload.enabled === true,
    entries,
    errors: isFiniteNumber(payload.errors) ? payload.errors : 0,
    opened: isFiniteNumber(payload.opened) ? payload.opened : 0,
    skipped: isFiniteNumber(payload.skipped) ? payload.skipped : 0,
    total: isFiniteNumber(payload.total) ? payload.total : entries.length,
  };
}

/**
 * Calcula taxas de sucesso/erro inteiras [0, 100] sobre o snapshot
 * filtrado retornado pelo backend. Retorna `null` quando `total === 0`
 * para nao induzir leitura de 0% como falha.
 */
export function summarizeCentralJournalSnapshot(snapshot) {
  const safe = sanitizeSnapshot(snapshot);
  if (safe.total === 0) {
    return { ...safe, errorRate: null, successRate: null };
  }
  return {
    ...safe,
    errorRate: Math.round((safe.errors / safe.total) * 100),
    successRate: Math.round((safe.opened / safe.total) * 100),
  };
}

/**
 * Submete o GET autenticado. Retorna sempre objeto com `ok` booleano —
 * jamais lanca, para o chamador ter trace facil. `data` ja vem
 * sanitizado via `sanitizeSnapshot` para a UI consumir sem segundo guard.
 */
export async function fetchCentralOperatorJournal({
  baseUrl = "",
  fetchImpl,
  filters = {},
  token,
} = {}) {
  const fetcher = fetchImpl ?? (typeof fetch === "function" ? fetch : null);

  if (typeof fetcher !== "function") {
    return { error: { code: "FETCH_UNAVAILABLE", message: "fetch indisponivel" }, ok: false };
  }

  const sanitizedToken = typeof token === "string" ? token.trim() : "";
  if (sanitizedToken.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
    return {
      error: { code: "OPERATOR_TOKEN_TOO_SHORT", message: "token operador ausente ou curto" },
      ok: false,
    };
  }

  const url = buildCentralJournalUrl(baseUrl, filters);

  try {
    const response = await fetcher(url, {
      headers: { [PAPER_TRADING_OPERATOR_HEADER]: sanitizedToken },
      method: "GET",
    });

    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

    if (!response.ok) {
      const errorBody = parsed && typeof parsed === "object" ? parsed.error ?? null : null;
      return {
        error: {
          code: errorBody?.code ?? `HTTP_${response.status}`,
          message: errorBody?.message ?? `Falha HTTP ${response.status}`,
        },
        ok: false,
        status: response.status,
      };
    }

    const dataField = parsed && typeof parsed === "object" ? parsed.data ?? parsed : null;
    return {
      data: sanitizeSnapshot(dataField),
      ok: true,
      status: response.status,
    };
  } catch (error) {
    return {
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "erro de rede desconhecido",
      },
      ok: false,
    };
  }
}
