/**
 * Agenda um callback para execução no próximo animation frame, coalescendo múltiplas chamadas
 * com a mesma chave em uma única execução. Usado para evitar reflows em burst quando vários
 * ticks SSE disparam o mesmo render em < 16ms.
 *
 * Fallback para `setTimeout(0)` em ambientes sem `requestAnimationFrame` (SSR, testes Node).
 */

const rafImpl =
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : /** @param {FrameRequestCallback} cb */ (cb) => setTimeout(() => cb(Date.now()), 0);

/** @type {Map<string, number>} */
const pendingByKey = new Map();

/**
 * @param {string} key rótulo estável do render alvo (ex.: "deep-analysis").
 * @param {() => void} callback função idempotente a executar no próximo frame.
 */
export function scheduleRender(key, callback) {
  if (pendingByKey.has(key)) {
    return;
  }

  const handle = rafImpl(() => {
    pendingByKey.delete(key);
    try {
      callback();
    } catch (error) {
      if (typeof console !== "undefined" && typeof console.error === "function") {
        console.error(`[scheduleRender:${key}] erro durante render`, error);
      }
    }
  });

  pendingByKey.set(key, /** @type {number} */ (handle));
}

/** Útil para testes e para forçar flush determinístico em cenários de shutdown. */
export function flushPendingRenders() {
  pendingByKey.clear();
}

/** @returns {string[]} rótulos de renders agendados e ainda não executados. */
export function getPendingRenderKeys() {
  return [...pendingByKey.keys()];
}
