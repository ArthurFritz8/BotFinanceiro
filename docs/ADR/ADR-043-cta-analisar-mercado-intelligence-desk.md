# ADR-043 — CTA "ANALISAR MERCADO" como gatilho premium do Intelligence Desk

## Objetivo

Adicionar um Call-to-Action (CTA) explícito e visualmente premium na barra de
controles do Chart Lab que dispare manualmente o pipeline institucional
(`syncIntelligenceDeskForCurrentContext`), sem substituir nem duplicar o botão
existente "Pedir analise tecnica no chat" (`#chart-analyze-button`), que
permanece como atalho conversacional para o copilot.

## Contexto

- Recebemos sugestão externa (Gemini) propondo botão "ANALISAR MERCADO" com:
  (a) gradient premium + spinner de loading, (b) validação se ativo/timeframe
  vazios, (c) **delay artificial de 1 a 1.5s para "gerar expectativa"**,
  (d) acionamento do "Intelligence Desk".
- Auditoria revelou que:
  - Já existe `syncIntelligenceDeskForCurrentContext(options)` em
    [`main.js`](../../apps/web/src/main.js) que orquestra
    `loadChart()` + telemetria (Intelligence Sync Ops) + render do
    `#deep-analysis-panel`.
  - O botão `#chart-analyze-button` ("Pedir analise tecnica no chat")
    NÃO é redundante: ele apenas popula `chatInput.value` com prompt
    contextualizado (ADR-027), funcionando como atalho conversacional.
  - O `<select id="chart-range">` SEMPRE tem um valor selecionado (default
    `7d`), portanto validar timeframe vazio é defensivo demais.

## Solução

### Concordâncias com a sugestão externa
- ✅ Botão dedicado `#chart-analyze-market-button` na barra de controles do
  chart, logo antes de "Atualizar grafico", como CTA principal.
- ✅ Visual premium (gradient cyan/blue/green, sombra, hover lift, transição).
- ✅ Estado de loading com spinner inline + texto
  "PROCESSANDO MOTOR INSTITUCIONAL..." + `aria-busy="true"`.
- ✅ Validação visual amigável (shake CSS) quando faltam dados, com
  `setChartStatus(...)` warn em vez de `alert()`.

### Vetos com fundamentação técnica
- ❌ **Delay artificial de 1-1.5s ("para gerar expectativa"):** anti-pattern
  de UX. Esconde feedback real do backend e adiciona latência fake. Substituído
  por **mínimo perceptível de 220ms** (`MANUAL_ANALYSIS_MIN_LOADING_MS`)
  apenas para evitar flicker quando o sync vem do cache; o tempo real do
  sync é honrado.
- ❌ **Validação de timeframe vazio:** o `<select>` nunca fica vazio.
  Validar só `assetId`, que é a única variável "perigosa" em estado inicial.
- ❌ **`alert()` nativo para erro:** quebra UX premium; substituído por
  `setChartStatus(message, "warn")` + animação shake.

### Aprimoramentos proativos
- ➕ **Atalho de teclado `Alt+I`** (de "Intelligence"), seguindo a convenção
  já existente no projeto (Alt+G/Alt+R), com `aria-keyshortcuts="Alt+I"` no
  botão e guard contra disparo enquanto digitando em input/textarea/contenteditable.
- ➕ **Integração com `live-status-indicator`** (ADR-042): durante o sync
  manual o indicador transita para `RECONNECTING` e volta para `LIVE` quando
  o snapshot chegar — feedback unificado.
- ➕ **Telemetria** via `createCounter` (ADR-040):
  `manualMarketAnalysisCounter` registra `trigger:click`, `trigger:keyboard`,
  `success`, `error`, `invalid`, `blocked`. Exposta em
  `window.__botfinanceiroDebug.manualMarketAnalysisSnapshot()`.
- ➕ **Guard de re-entrância** (`manualMarketAnalysisInFlight`) para evitar
  cliques duplos durante o pipeline em voo.
- ➕ **`prefers-reduced-motion`**: spinner, shake e hover lift desligados
  para usuários com preferência de redução de movimento.
- ➕ **Reuso de pipeline existente** em vez de orquestrar SSE manualmente:
  o handler delega 100% para `syncIntelligenceDeskForCurrentContext`,
  herdando telemetria (Intelligence Sync Ops), debounce, e contrato de
  sucesso/erro já consolidado.

## Prevenção

- Smoke tests em [`apps/web/tests/smoke.test.mjs`](../../apps/web/tests/smoke.test.mjs):
  - Markup do botão + atalho `Alt+I` + spinner element.
  - Coexistência com `#chart-analyze-button` (não-removido).
  - CSS com 3 estados (`loading`, `invalid`, hover) + `prefers-reduced-motion`.
  - Função `runManualMarketAnalysis` chamando
    `syncIntelligenceDeskForCurrentContext` com `reason` parametrizado.
  - `MANUAL_ANALYSIS_MIN_LOADING_MS = 220` (sem delay artificial).
  - Validação de assetId vazio + handler `Alt+I` com guard de input/textarea.
- Helper `setManualAnalysisButtonState(state)` centraliza transições do botão,
  evitando estados inconsistentes (label/aria/dataset).
- Counter de manualMarketAnalysis permite calcular ratio
  `success / (success+error+invalid+blocked)` em produção sem novos endpoints.
