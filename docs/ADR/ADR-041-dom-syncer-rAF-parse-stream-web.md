# ADR 041 - Helpers DOM para web: parseStreamPayload, scheduleRender, domSyncer

- Data: 2026-04-17
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Reduzir a pressao de renderizacao e a ocultacao silenciosa de erros no monolito `apps/web/src/main.js` (mais de 15 mil linhas), introduzindo tres helpers compartilhados que padronizam:

1. Parse defensivo do payload de eventos SSE com telemetria de falhas.
2. Coalescencia de renderizacao em `requestAnimationFrame` para paineis pesados (o snapshot da "Analise Profunda" e disparado por varios pipelines simultaneos).
3. Sincronizacao fina do DOM por atributos `data-sync-field` em vez de `innerHTML`.

## Contexto

O auditor identificou no frontend:

1. Quatro ou mais blocos `try { payload = JSON.parse(event.data) } catch { payload = null }` identicos espalhados nos handlers de `watchlist`, `chart` e `binary` (mais variantes `stream-error`). Qualquer falha era silenciosamente engolida, sem telemetria nem diagnostico.
2. `renderDeepAnalysisPanel` invocado a partir de mais de dez callsites no main.js, podendo ser chamado multiplas vezes por tick SSE - cada chamada refaz um HTML pesado com `innerHTML`.
3. Nenhum padrao para syncar campos de um card sem reescrever a arvore inteira.

## Solucao

### Helpers novos

1. `apps/web/src/shared/parse-stream-payload.js`
- `parseStreamPayload(event, streamName, options?)` retorna o valor parseado ou `null`.
- Em caso de falha, incrementa um `createCounter` local com `slot = ${streamName}::${reason}` e chama `options.logger(...)` ou `console.warn`.
- Exporta `getStreamParseFailSnapshot()` e `resetStreamParseFailCounter()`.
- Expoe `window.__botfinanceiroDebug.streamParseFailSnapshot` no boot para inspecao manual.
- Usa `safeJsonParse` e `createCounter` de `@botfinanceiro/shared-utils` (ADR 040).

2. `apps/web/src/shared/schedule-render.js`
- `scheduleRender(key, callback)` coalesce chamadas concorrentes pela mesma `key` em um unico `requestAnimationFrame`.
- Fallback `setTimeout(cb,0)` quando rAF nao esta disponivel (environments de teste).
- Exporta `flushPendingRenders` e `getPendingRenderKeys` para uso em testes.

3. `apps/web/src/shared/dom-syncer.js`
- `syncFields(container, values, options?={attribute:"sync-field"})` itera descendentes com `[data-sync-field]` e atualiza `textContent` apenas quando o valor muda.
- `syncAttribute(container, attribute, value)` seta/remove atributos sem reescrever innerHTML.

### Adocao em main.js

1. Substituicao dos quatro `JSON.parse + try/catch` ad-hoc por chamadas a `parseStreamPayload` com `streamName` descritivo:
- `"watchlist"`, `"watchlist:stream-error"`
- `"chart"`, `"chart:stream-error"`
- `"binary"`, `"binary:stream-error"`

2. Wrapper de coalescencia para a "Analise Profunda":
- `renderDeepAnalysisPanel` agora salva o snapshot em `latestDeepAnalysisSnapshot` e agenda a renderizacao via `scheduleRender("deep-analysis", ...)`.
- A logica original foi renomeada para `renderDeepAnalysisPanelImmediate`, evitando alterar callsites.

### Cobertura

`apps/web/tests/smoke.test.mjs` recebeu quatro novos testes estaticos que validam, por regex:

- Imports de `parseStreamPayload` e `scheduleRender` em `main.js`.
- Presenca de `parseStreamPayload(event, "<stream>")` nos tres handlers SSE.
- Presenca de `scheduleRender("deep-analysis", ...)` e da funcao `renderDeepAnalysisPanelImmediate`.
- Presenca dos arquivos helper e de seus internals (rAF no `schedule-render`, counter no `parse-stream-payload`, exports em `dom-syncer`).

Total: 10 testes passando em `smoke.test.mjs`.

## Prevencao

1. Novas integracoes SSE no frontend devem usar `parseStreamPayload` com `streamName` dedicado. `JSON.parse` nu em handler SSE e tratado como regressao no review.
2. Renderizacoes custosas (snapshot completo de painel, charts) devem passar por `scheduleRender` com uma `key` estavel para evitar thrash.
3. Atualizacoes pontuais (texto de um contador, label de status) devem preferir `syncFields`/`syncAttribute` em vez de `innerHTML` para preservar foco, selecao e listeners.
4. O snapshot de `streamParseFailCounter` e inspecionavel via DevTools (`window.__botfinanceiroDebug.streamParseFailSnapshot()`), o que permite detectar ruido oculto em producao antes de virar incidente.
5. Os helpers foram isolados em `apps/web/src/shared/` e cobertos por smoke test estatico. Alteracoes de assinatura devem ser acompanhadas de atualizacao do smoke.
