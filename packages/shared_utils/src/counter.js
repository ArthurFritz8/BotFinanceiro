/**
 * Contador observável com rótulos (labels), sem dependências externas.
 * Uso típico: telemetria de failure silencioso (parseFail, streamDrop, etc.).
 *
 * @returns {{
 *   increment: (label?: string) => number,
 *   get: (label?: string) => number,
 *   snapshot: () => Record<string, number>,
 *   reset: () => void,
 * }}
 */
export function createCounter() {
  /** @type {Map<string, number>} */
  const totals = new Map();

  return {
    increment(label = "default") {
      const next = (totals.get(label) ?? 0) + 1;
      totals.set(label, next);
      return next;
    },
    get(label = "default") {
      return totals.get(label) ?? 0;
    },
    snapshot() {
      /** @type {Record<string, number>} */
      const snapshot = {};
      for (const [label, count] of totals.entries()) {
        snapshot[label] = count;
      }
      return snapshot;
    },
    reset() {
      totals.clear();
    },
  };
}
