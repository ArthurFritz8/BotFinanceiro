# ADR-044 — Cache bypass `?fresh=true` no CTA "ANALISAR MERCADO" + peer-review HFT

## Objetivo

Garantir que o clique manual no CTA `#chart-analyze-market-button` (ADR-043)
puxe **dados realmente novos** do provider (Binance/Bybit/Coinbase/Kraken/OKX)
em vez de devolver o último snapshot quente do cache em memória, **sem**
abrir mão do circuit breaker, do failover entre brokers, da observabilidade
e da resiliência dos endpoints automáticos.

## Contexto

Auditoria externa (Gemini) acusou três defeitos críticos no Chart Lab:

1. "Gráficos de algumas corretoras (ex.: Bybit) não carregam."
2. "Delay inaceitável na renderização" — proposta: substituir REST por
   WebSocket cliente direto às exchanges.
3. "Botão ANALISAR MERCADO é placebo" — alegação de que o CTA atinge cache
   em vez dos motores SMC + Kinetic Exhaustion.

Peer-review como Engenheiro de Dados Sênior / Arquiteto HFT, validando
acusação por acusação contra o código:

### VETO 1 — Bybit funciona e tem failover provado
- Adapter em
  [`apps/api/src/modules/crypto/infrastructure/multi-exchange-market-data-adapter.ts`](../../apps/api/src/modules/crypto/infrastructure/multi-exchange-market-data-adapter.ts)
  trata Bybit como cidadão de primeira classe (igual a Binance, Coinbase,
  Kraken, OKX).
- Failover provado em
  [`apps/api/src/modules/crypto/interface/crypto-routes.test.ts`](../../apps/api/src/modules/crypto/interface/crypto-routes.test.ts#L610)
  ("Binance 503 → Bybit success"). O sistema **degrada** quando uma exchange
  cai, não congela.

### VETO 2 — WebSocket-cliente-para-exchange é anti-pattern para este sistema
A proposta romperia simultaneamente:
- **Circuit breaker per-broker** (ADR-009/010/011): perde proteção contra
  exchange instável.
- **Failover orquestrado** (ADR-005, ADR-038): sem servidor no meio, o cliente
  não sabe pular para outro broker.
- **Cache compartilhado** (8s fresh / 20s stale, ADR-004): cada cliente
  abriria N conexões → custo CPU/banda explode linearmente com usuários.
- **Telemetria, rate-limit e LGPD**: chave de API exposta no browser ou
  necessidade de mTLS por usuário; impossível de auditar.

A latência real de **um único polling REST coalescido em RAF** (ADR-041) já
está abaixo de 1 frame de 60Hz. O "delay inaceitável" inexistente.

### VETO 3 — SMC + Kinetic Exhaustion SÃO invocados
- SMC institucional resolvido em
  [`apps/api/src/modules/crypto/application/crypto-chart-service.ts`](../../apps/api/src/modules/crypto/application/crypto-chart-service.ts#L1050)
  via `resolveInstitutionalZone()` (ADR-040), embutido em todo payload de
  `live-chart` e `strategy-chart`.
- Kinetic Exhaustion em
  [`apps/api/src/modules/binary_options/application/binary-options-service.ts`](../../apps/api/src/modules/binary_options/application/binary-options-service.ts#L625)
  via `computeKineticExhaustionSnapshot()`, alimentando o snapshot de binárias
  consumido pelo Intelligence Desk.

O CTA chama `syncIntelligenceDeskForCurrentContext()` →  `loadChart()` →
endpoint live-chart, que entrega o motor completo. **Não é placebo.**

## Lacuna real encontrada

O endpoint `/v1/crypto/live-chart` é **cache-first** (8s fresh / 20s stale).
Antes desta ADR, o CTA manual podia receber o mesmo snapshot que o último
polling automático devolveu há &lt; 8s — perdendo o sentido de "Analisar
**agora**". Isso não é um placebo no sentido de não chamar os motores, mas é
uma falha de UX para quem clicou "agora me dê o último valor".

## Solução

### Backend — opt-in via query param
- Schema Zod em
  [`crypto-controller.ts`](../../apps/api/src/modules/crypto/interface/crypto-controller.ts)
  aceita `fresh=true|false|1|0|<boolean>` (union transformado em booleano)
  tanto em `live-chart` quanto em `strategy-chart`.
- Service `getLiveChart({ ..., bypassCache: true })` em
  [`crypto-chart-service.ts`](../../apps/api/src/modules/crypto/application/crypto-chart-service.ts):
  pula a leitura do cache e chama direto `refreshLiveChart()`. Se o refresh
  falhar e existir cópia stale, devolve a stale com `cache.stale = true`
  (degradação consciente). Se nem stale houver, propaga o erro original.

### Frontend — flag de escopo modular
- `let pendingFreshFetchScope = false;` declarado em
  [`apps/web/src/main.js`](../../apps/web/src/main.js).
- `requestCryptoChartEndpoint(...)` adiciona `params.set("fresh", "true")`
  quando a flag está ativa **ou** quando `options.fresh === true`.
- `runManualMarketAnalysis()` ativa a flag antes de
  `syncIntelligenceDeskForCurrentContext`, incrementa
  `manualMarketAnalysisCounter.increment("fresh-fetch")` e desativa em
  `finally`.
- **Por que escopo modular?** Evita prop-drilling em 5 camadas
  (`runManualMarketAnalysis` → `syncIntelligenceDeskForCurrentContext` →
  `loadChart` → `requestCryptoChart` → `requestCryptoChartCore`
  → `requestCryptoChartEndpoint` + autoBroker resolver + failover). Blast
  radius mínimo, sem alterar assinaturas de funções compartilhadas.

## Cobertura de testes

- `apps/api/src/modules/crypto/interface/crypto-routes.test.ts` — caso novo
  "GET /v1/crypto/live-chart?fresh=true bypassa cache fresco e refaz refresh
  no provider" (3 chamadas: warmup, cached, fresh; assert 2 hits no provider).
- `apps/web/tests/smoke.test.mjs` — caso novo "CTA Analisar Mercado dispara
  fetch fresh bypassando cache do live-chart" (regex sobre `params.set("fresh",
  "true")`, `pendingFreshFetchScope`, `manualMarketAnalysisCounter
  .increment("fresh-fetch")`).
- 19 web tests pass · 213 api tests pass · lint OK · typecheck OK.

## Trade-offs

- ➕ Honra intenção do clique manual sem servir snapshot vencido.
- ➕ Mantém 100% da resiliência: circuit breaker, failover, stale fallback,
  observabilidade.
- ➕ Default permanece cache-first → polling automático e SSE não geram
  carga extra.
- ➖ Cliente malicioso pode martelar `?fresh=true`. Mitigação atual: rate-limit
  global por IP (ADR-001). Se virar problema, adicionar limit dedicado ao
  parâmetro `fresh`.

## Telemetria

- Counter `"fresh-fetch"` em `manualMarketAnalysisCounter` (exposto em
  `window.__botfinanceiroDebug.manualMarketAnalysisSnapshot()`).
- Resposta backend continua expondo `cache.state` (`refreshed` / `stale` /
  `fresh` / `miss`) para correlação no painel de operação.
