/**
 * Utilities compartilhados entre runtimes (Node/backend e browser/frontend).
 *
 * Critérios de inclusão:
 * - Pura (sem side effects de import).
 * - Sem dependências de plataforma (nada de `fs`, nada de `window`).
 * - Determinística e testável.
 */

export { safeJsonParse } from "./safe-json-parse.js";
export { createCounter } from "./counter.js";
