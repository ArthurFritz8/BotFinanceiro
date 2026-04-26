/**
 * Cliente do Operador de Auto Paper Trading (ADR-103).
 *
 * Encapsula tres responsabilidades isoladas:
 *  1) Persistencia local segura das credenciais do operador (token + flag
 *     de armar) em `localStorage`, com schema-guard e degradacao silenciosa
 *     para memoria quando o storage nao estiver disponivel.
 *  2) Construcao do payload conforme `confluenceSignalSchema` aceito pela
 *     rota `/v1/paper-trading/operator/auto-signal` (ADR-102).
 *  3) Submissao HTTP com header `x-paper-trading-operator-token` e parsing
 *     do envelope `{ ok, data }` ou `{ ok, error }` em resultado tipado.
 *
 * O modulo NAO toca em DOM; toda integracao com a UI (botoes, inputs,
 * banners) acontece em `main.js` consumindo estes helpers puros — o que
 * mantem a logica testavel via `node --test` sem JSDOM.
 *
 * Seguranca: o token nunca eh logado, jamais entra no bundle e fica
 * confinado ao escopo do operador que o digitou. Nao expomos
 * `INTERNAL_API_TOKEN`: a rota usa um token dedicado conforme ADR-102.
 */

export const PAPER_TRADING_OPERATOR_STORAGE_KEY = "botfinanceiro:paper-trading-operator:v1";
export const PAPER_TRADING_OPERATOR_HEADER = "x-paper-trading-operator-token";
export const PAPER_TRADING_OPERATOR_ENDPOINT = "/v1/paper-trading/operator/auto-signal";
export const PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH = 16;

const VALID_SIDES = new Set(["long", "short"]);
const VALID_TIERS = new Set(["high", "medium", "low"]);

function defaultOperatorSettings() {
  return { autoArmed: false, token: "" };
}

/**
 * Sanitiza um candidato cru carregado do storage. Garante shape minimo e
 * descarta campos extras silenciosamente. Token vazio mantem `autoArmed`
 * em `false` por seguranca (nao adianta armar sem credencial).
 */
export function sanitizePersistedOperatorSettings(candidate) {
  const base = defaultOperatorSettings();

  if (!candidate || typeof candidate !== "object") {
    return base;
  }

  const token = typeof candidate.token === "string" ? candidate.token.trim() : "";
  const autoArmed = candidate.autoArmed === true && token.length >= PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH;

  return { autoArmed, token };
}

export function loadOperatorSettings(storage) {
  const target = storage ?? readWindowLocalStorage();

  if (!target) {
    return defaultOperatorSettings();
  }

  try {
    const raw = target.getItem(PAPER_TRADING_OPERATOR_STORAGE_KEY);

    if (!raw) {
      return defaultOperatorSettings();
    }

    return sanitizePersistedOperatorSettings(JSON.parse(raw));
  } catch {
    return defaultOperatorSettings();
  }
}

export function saveOperatorSettings(settings, storage) {
  const target = storage ?? readWindowLocalStorage();

  if (!target) {
    return false;
  }

  try {
    const sanitized = sanitizePersistedOperatorSettings(settings);
    target.setItem(PAPER_TRADING_OPERATOR_STORAGE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}

export function clearOperatorSettings(storage) {
  const target = storage ?? readWindowLocalStorage();

  if (!target) {
    return false;
  }

  try {
    target.removeItem(PAPER_TRADING_OPERATOR_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function readWindowLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Converte o contexto de execucao do Chart Lab em payload estrito do
 * `confluenceSignalSchema`. Retorna `null` quando faltar campo obrigatorio
 * — o chamador trata como "sinal incompleto" e nao envia.
 */
export function buildAutoSignalPayload(input = {}) {
  const asset = typeof input.asset === "string" ? input.asset.trim().toLowerCase() : "";
  const side = typeof input.side === "string" ? input.side.toLowerCase() : "";
  const entryPrice = toFiniteNumber(input.entryPrice);
  const stopPrice = toFiniteNumber(input.stopPrice);
  const targetPrice = toFiniteNumber(input.targetPrice);
  const confluenceScore = toFiniteNumber(input.confluenceScore);
  const tier = typeof input.tier === "string" ? input.tier.toLowerCase() : "";

  if (!asset || asset.length > 40) return null;
  if (!VALID_SIDES.has(side)) return null;
  if (!VALID_TIERS.has(tier)) return null;
  if (entryPrice === null || entryPrice <= 0) return null;
  if (stopPrice === null || stopPrice <= 0) return null;
  if (targetPrice === null || targetPrice <= 0) return null;
  if (confluenceScore === null || confluenceScore < 0 || confluenceScore > 100) return null;

  return {
    asset,
    confluenceScore,
    entryPrice,
    side,
    stopPrice,
    targetPrice,
    tier,
  };
}

/**
 * Decide se o operador pode disparar auto-paper neste ciclo. Combina o
 * Auto Guard (ADR-101) com as preferencias persistidas do operador.
 */
export function canSubmitAutoSignal({ automationGuard, operatorSettings, payload }) {
  if (!operatorSettings || operatorSettings.autoArmed !== true) return false;
  if (!operatorSettings.token || operatorSettings.token.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
    return false;
  }
  if (!automationGuard || automationGuard.canAutoPaper !== true) return false;
  if (!payload) return false;
  return true;
}

function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string") return "";
  return baseUrl.trim().replace(/\/$/, "");
}

/**
 * Submete o payload para a rota operador. Retorna sempre objeto com
 * `ok` booleano; jamais lanca para o chamador ter trace facil.
 */
export async function submitAutoSignal({ baseUrl = "", fetchImpl, payload, token }) {
  const fetcher = fetchImpl ?? (typeof fetch === "function" ? fetch : null);

  if (typeof fetcher !== "function") {
    return { error: { code: "FETCH_UNAVAILABLE", message: "fetch indisponivel" }, ok: false };
  }

  const sanitizedToken = typeof token === "string" ? token.trim() : "";
  if (sanitizedToken.length < PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH) {
    return { error: { code: "OPERATOR_TOKEN_TOO_SHORT", message: "token operador ausente ou curto" }, ok: false };
  }

  if (!payload || typeof payload !== "object") {
    return { error: { code: "OPERATOR_PAYLOAD_INVALID", message: "payload invalido" }, ok: false };
  }

  const url = `${normalizeBaseUrl(baseUrl)}${PAPER_TRADING_OPERATOR_ENDPOINT}`;

  try {
    const response = await fetcher(url, {
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        [PAPER_TRADING_OPERATOR_HEADER]: sanitizedToken,
      },
      method: "POST",
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

    return {
      data: parsed && typeof parsed === "object" ? parsed.data ?? parsed : null,
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
