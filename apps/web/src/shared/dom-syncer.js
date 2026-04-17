/**
 * DomSyncer minimalista: atualiza o `textContent` / atributos de elementos já presentes
 * no DOM em vez de reescrever `innerHTML` inteiro. Preserva foco, seleção e scroll, e
 * reduz reflows a O(Δ) em vez de O(n).
 *
 * Uso: o autor do markup declara placeholders com `data-sync-field="chave"` dentro de um
 * container; o syncer itera os campos e escreve o valor correspondente do objeto.
 *
 * Exemplo:
 *   <div id="signal">
 *     <strong data-sync-field="title">—</strong>
 *     <span data-sync-field="entry">—</span>
 *   </div>
 *   syncFields(container, { title: "Long setup", entry: "R$ 180,45" });
 *
 * Para o caso hot-path (render a cada tick SSE), isto elimina o custo de parse de HTML
 * e recriação de nós filhos, resolvendo perda de foco e leaks em listeners delegados.
 */

/**
 * @typedef {string | number | null | undefined} SyncValue
 */

/**
 * Aplica um mapa de valores aos elementos `[data-sync-field]` descendentes de `container`.
 * Campos ausentes no mapa são ignorados (não zeram o conteúdo anterior).
 *
 * @param {Element | null | undefined} container
 * @param {Record<string, SyncValue>} values
 * @param {{ attribute?: string }} [options] `attribute`: usar outro data-attr (default "sync-field").
 */
export function syncFields(container, values, options = {}) {
  if (!(container instanceof Element)) {
    return;
  }

  const attribute = options.attribute ?? "sync-field";
  const selector = `[data-${attribute}]`;
  const targets = container.querySelectorAll(selector);

  for (const target of targets) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const key = target.dataset[toCamelCase(attribute)];
    if (!key) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      continue;
    }

    const value = values[key];
    const nextText = value == null ? "" : String(value);

    if (target.textContent !== nextText) {
      target.textContent = nextText;
    }
  }
}

/**
 * Aplica um `data-tone` (ou outro atributo) ao container, sem tocar `innerHTML`.
 *
 * @param {Element | null | undefined} container
 * @param {string} attribute
 * @param {string | null | undefined} value
 */
export function syncAttribute(container, attribute, value) {
  if (!(container instanceof Element)) {
    return;
  }

  if (value == null || value === "") {
    container.removeAttribute(attribute);
    return;
  }

  if (container.getAttribute(attribute) !== value) {
    container.setAttribute(attribute, value);
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
