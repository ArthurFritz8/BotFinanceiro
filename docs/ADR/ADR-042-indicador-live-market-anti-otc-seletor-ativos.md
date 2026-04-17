# ADR-042 — Indicador LIVE MARKET + Filtro Anti-OTC no seletor de ativos do chart

## Objetivo

Aproximar a experiência do desk de trading da `BotFinanceiro` ao padrão competitivo
visto em produtos como o Vortex Trade, entregando dois ganhos cirúrgicos sem
reescrever o seletor existente:

1. Filtrar de forma defensiva quaisquer ativos OTC ou sintéticos antes de popular
   `#chart-asset` na UI web.
2. Expor um indicador visual `LIVE MARKET` (com pulse animado) refletindo o
   estado real do `EventSource` que alimenta o chart (`live`, `reconnecting`,
   `offline`).

## Contexto

- Recebemos sugestão de IA externa propondo: (a) seletor estilo
  `command palette` substituindo o `<select id="chart-asset">`,
  (b) auto-subscribe SSE ao trocar ativo, (c) remoção do botão
  `#chart-analyze-button` em favor de fluxo "snapshot único", e
  (d) filtro anti-OTC + indicador de LIVE.
- Auditoria de [`apps/web/src/main.js`](../../apps/web/src/main.js) revelou:
  - **Auto-subscribe ao trocar ativo já existe** (`chartAssetSelect.addEventListener("change", ...)`
    chama `loadChart()` + `configureChartAutoRefresh()` que reabre o EventSource).
    Reimplementar seria redundância pura.
  - O **botão `#chart-analyze-button` NÃO faz fetch HTTP de análise estática**:
    o handler popula `chatInput.value` com prompt contextualizado (assetId, range,
    modo, tendência) e dá `focus()` no copilot. É um acelerador conversacional,
    não um snapshot HTTP. Removê-lo degradaria UX.
  - Substituir o `<select>` por command palette afetaria 11 callsites de
    `chartAssetSelect`, em um arquivo de mais de 16k linhas. Trabalho
    desproporcional a esta entrega cirúrgica.
  - Não existe nenhum indicador visual sinalizando "stream live ativo" — o usuário
    precisa inferir pelo timestamp ou status textual.
  - Watchlist hoje (`TERMINAL_WATCHLIST`) é cripto e não contém OTC, mas a
    ausência de guard explícito impediria detecção precoce de regressão se
    forex/B3 forem adicionados com símbolos contaminados (`EURUSD-OTC`, etc.).

## Solução

### Concordâncias com a sugestão externa
- ✅ Anti-OTC: implementado via helper compartilhado `apps/web/src/shared/asset-filters.js`
  (`filterOutOtc(assets)` aplicado no momento de derivar `TERMINAL_WATCHLIST`
  a partir de `TERMINAL_WATCHLIST_RAW`). Telemetria via
  `getAssetFilterSnapshot()` exposta em `window.__botfinanceiroDebug`.
- ✅ Indicador LIVE: helper `apps/web/src/shared/live-status-indicator.js`
  (`setLiveStatus(element, status, options)`) com 3 estados, `aria-live="polite"`,
  pulse via Tailwind/CSS keyframes, suporte a `prefers-reduced-motion`.

### Vetos com fundamentação técnica
- ❌ **Remoção do botão Analisar:** mantido. Ele não é um snapshot estático e
  alimenta o pipeline conversacional do copilot, que é o coração do produto.
- ❌ **Auto-subscribe ao trocar ativo (re-implementação):** já presente em
  `chartAssetSelect.addEventListener("change", ...)`. Sem nova ação.
- ❌ **Substituir `<select>` por command palette:** difere para roadmap futuro;
  exige reescrita de 11 callsites e teste de regressão extenso. ADR específico
  será aberto se o produto priorizar.

### Aprimoramentos proativos
- `asset-filters` aceita extensões (`isSyntheticAsset`) preparando terreno para
  filtros adicionais (synthetic, weekend, derivatives off-hours).
- `live-status-indicator` tem API pura por elemento, reusável em qualquer SSE
  futuro (binary, futures, intelligence-sync).
- Telemetria de transições do indicador (`getLiveStatusSnapshot()`) permite
  cálculo posterior de SLO de uptime do SSE.

### Wire dos estados do indicador
- `eventSource.addEventListener("snapshot", ...)` (binary + crypto) →
  `updateChartLiveStatus(LIVE_STATUS.LIVE)`.
- `eventSource.onerror` → `stopChartLiveStream({ transitioning: true })` →
  `updateChartLiveStatus(LIVE_STATUS.RECONNECTING)`.
- `stopChartLiveStream()` (sem flag) → `updateChartLiveStatus(LIVE_STATUS.OFFLINE)`.

## Prevenção

- Smoke tests em `apps/web/tests/smoke.test.mjs` cobrem:
  - Imports `asset-filters` e `live-status-indicator` em `main.js`.
  - Substituição de `TERMINAL_WATCHLIST = filterOutOtc(TERMINAL_WATCHLIST_RAW)`.
  - Wire de `LIVE_STATUS.LIVE`, `LIVE_STATUS.OFFLINE` e `transitioning:true`.
  - Markup `#chart-live-status` em `index.html` com `aria-live="polite"`.
  - CSS com 3 estados + `@keyframes live-status-pulse` + `prefers-reduced-motion`.
  - Internals dos 2 novos helpers (assinaturas, padrões regex).
- Helpers exportam contadores via `createCounter` (ADR-040), permitindo
  diagnóstico em produção sem novos endpoints.
- Botão Analisar permanece sem alteração comportamental, evitando regressão
  no fluxo do copilot.
