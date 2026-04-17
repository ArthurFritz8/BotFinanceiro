import { safeJsonParse } from "@botfinanceiro/shared-utils";
import { createCounter } from "@botfinanceiro/shared-utils/counter";

/**
 * Contador de falhas silenciosas de parse SSE, por stream. Exposto para painéis
 * operacionais (Intelligence Sync Ops) e para debugging em produção.
 *
 * Cada slot é `{stream}::{reason}` — p.ex. `watchlist::parse_error`, `chart::not_string`.
 */
const streamParseFailCounter = createCounter();

if (typeof window !== "undefined") {
  // Superfície de debugging em produção sem expor internals.
  /** @type {Record<string, unknown>} */
  const debugBag = (window.__botfinanceiroDebug ??= {});
  debugBag.streamParseFailSnapshot = () => streamParseFailCounter.snapshot();
}

/**
 * Parse defensivo de `event.data` vindo de EventSource, com contabilização de falhas por
 * stream. Substitui o padrão disseminado `try { JSON.parse } catch { payload = null }`
 * que escondia erros operacionais.
 *
 * @template T
 * @param {MessageEvent | { data: unknown }} event
 * @param {string} streamName rótulo do stream (watchlist, chart, binary, ...).
 * @param {{ logger?: (message: string, context?: Record<string, unknown>) => void }} [options]
 * @returns {T | null}
 */
export function parseStreamPayload(event, streamName, options = {}) {
  const result = safeJsonParse(event?.data);

  if (result.ok) {
    return /** @type {T} */ (result.value);
  }

  const slot = `${streamName}::${result.reason}`;
  const occurrences = streamParseFailCounter.increment(slot);

  if (options.logger) {
    options.logger(`[stream:${streamName}] payload drop (${result.reason}) #${occurrences}`, {
      reason: result.reason,
      stream: streamName,
      occurrences,
    });
  } else if (typeof console !== "undefined" && typeof console.warn === "function") {
    // Visibilidade padrão ainda mais importante: zero swallow silencioso.
    console.warn(`[stream:${streamName}] payload drop (${result.reason}) #${occurrences}`);
  }

  return null;
}

/** @returns {Record<string, number>} */
export function getStreamParseFailSnapshot() {
  return streamParseFailCounter.snapshot();
}

export function resetStreamParseFailCounter() {
  streamParseFailCounter.reset();
}
