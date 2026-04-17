/**
 * Parse estrito de JSON com envelope de resultado explícito. Nunca lança e nunca retorna
 * `null` silenciosamente: o consumidor sempre sabe se foi sucesso, se houve erro de parse,
 * ou se o input era inválido (não-string).
 *
 * @template T
 * @param {unknown} input
 * @returns {{ ok: true, value: T } | { ok: false, reason: "not_string" | "parse_error", error?: unknown }}
 */
export function safeJsonParse(input) {
  if (typeof input !== "string") {
    return { ok: false, reason: "not_string" };
  }

  try {
    return { ok: true, value: /** @type {T} */ (JSON.parse(input)) };
  } catch (error) {
    return { ok: false, reason: "parse_error", error };
  }
}
