# ADR-120 - Onda 2 frontend: card institucional perp (derivatives + CVD + orderbook)

- Status: Aceito
- Data: 2026-04-28
- Personas ativas: Arquiteto Staff CTO + Lead Quant Hedge Fund, Frontend Engineer + Especialista em UX/UI, Arquiteto Socratico.

## Contexto / Observacao

A Onda 2 backend (ADR-119) expos tres endpoints REST cache-first com feeds institucionais (`/v1/crypto/derivatives`, `/v1/crypto/cvd`, `/v1/crypto/orderbook-depth`). O Intelligence Desk no frontend ainda nao tinha como exibi-los. Tambem e oportunidade de validar a infraestrutura introduzida na Onda 1 (ADR-118): `sharedCoalescer` e `registerAssetContextResetHandler`, que ate agora nao tinham consumidor real.

Restricoes:
- main.js ja tem 20k+ linhas (God Object). Nao adicionar mais 200 linhas la dentro - criar modulo isolado.
- Operador pode trocar para simbolo externo (EURUSD/indices/commodities) onde o pipeline cripto nao se aplica. Persona "Arquiteto de UI/UX": **NAO** alarmar com banner de erro nesse caso; degradar silenciosamente com mensagem neutra.
- Persona Frontend Engineer: nada de delay artificial, nada de `alert()`. Tom semantico via `data-tone` no CSS. Suporte a `prefers-reduced-motion`.

## Decisao

### 1. Modulo isolado (`apps/web/src/modules/intelligence-desk/institutional-derivatives-card.js`)

Modulo auto-contido com superficie publica minima:
- `mountInstitutionalDerivativesCard(rootElement)` - renderiza markup inicial, cacheia refs DOM.
- `updateInstitutionalDerivativesCard(assetId)` - dispara fetch paralelo dos 3 endpoints com `Promise.allSettled`; aplica latest-wins (token monotonico) para descartar respostas obsoletas se outro update for disparado antes.
- `clearInstitutionalDerivativesCard()` - reseta state, invalida tokens em voo.

Reuso da Onda 1:
- **`sharedCoalescer`**: cada path REST e coalescido por chave; cliques rapidos no mesmo ativo nao bombardeiam o backend.
- **`registerAssetContextResetHandler`**: o card limpa-se sozinho ao trocar de ativo - sem precisar main.js conhecer o callback. Validacao real do registry global introduzido na Onda 1.

### 2. Logica de tone semantico

Reading inversa institucional aplicada ao CSS:
- **Funding**: `extreme_long`/`long_pressure` -> tone `bear` (longs sobreestendidos sao combustivel para liquidacao); `extreme_short`/`short_pressure` -> tone `bull` (shorts em panico = squeeze potencial).
- **Imbalance** (orderbook): threshold ±0.15 (15% de diferenca de liquidez agregada) -> bull/bear; abaixo disso = neutro.
- **CVD**: sinal estrito (positivo = bull, negativo = bear).

Cada celula recebe `data-tone="bull|bear|neutral"` - CSS muda border-color/background sutilmente. Sem animacoes pesadas; transicoes desligadas em `prefers-reduced-motion`.

### 3. Hooks em main.js (minimos)

Apenas 2 pontos de integracao em main.js:
- **Boot**: `bootstrapInstitutionalDerivativesCard()` IIFE chama `mountInstitutionalDerivativesCard()` se elemento existir + registra `clearInstitutionalDerivativesCard` como reset handler.
- **Sync**: ao final de `syncIntelligenceDeskForCurrentContext()`, dispara `updateInstitutionalDerivativesCard(currentAssetId)` em try/catch defensivo.

Total: ~30 linhas em main.js. Toda a logica de fetch/render/state esta no modulo isolado.

### 4. Degradacao para simbolos externos

`Promise.allSettled` + categorizacao por status code:
- 3 endpoints OK -> footer verde "feeds institucionais sincronizados".
- Todos falharam com 4xx (simbolo nao mapeado) -> footer neutro "sem perpetuos mapeados".
- Todos falharam com 5xx -> footer warn "tentando degradar com cache stale" (cache stale e responsabilidade do backend Onda 2).
- Parcial (1 ou 2 OK) -> footer warn "X/3 feeds institucionais entregues".

Operador nunca ve banner vermelho ou alert - alinhado com a persona Frontend Engineer.

## Plano de validacao (DoD)

- [x] `apps/web/tests/institutional-derivatives-card.test.mjs` (7 testes) cobrindo helpers puros: `formatBps`, `formatNumberCompact`, `formatPrice`, `fundingTone`, `imbalanceTone`, `cvdTone`, `humanInterpretation`.
- [x] `node --test tests/*.test.mjs` em apps/web: 154 testes passando (7 novos + 147 da Onda 1 + base).
- [x] CSS com `prefers-reduced-motion` neutralizando transicoes.
- [x] HTML com `aria-label` e `aria-live="polite"`.
- [x] Modulo nao quebra se elemento HTML estiver ausente (defensivo).

## Consequencias

- O Intelligence Desk agora exibe fluxo institucional perp como camada visivel - alinhando o frontend a paridade com o backend Onda 2.
- O registry global de reset handlers (Onda 1) tem agora seu primeiro consumidor real, validando a arquitetura.
- O `sharedCoalescer` (Onda 1) tambem ganha primeiro consumidor real fora de testes unitarios.
- Onda 3 podera adicionar:
  - Heatmap canvas L2 consumindo `/v1/crypto/orderbook-depth?levels=100`.
  - Bayesian Calibrator integrando `cvd` + `funding` como features.
  - Macro pill no header bloqueando execution gate ±30min de FOMC/CPI/NFP (calendar via `institutional-macro-service` ja existente em `apps/api/src/modules/forex/`).
- main.js permanece em 22k+ linhas - quebra do God Object continua na Onda 3, mas o padrao de modulo isolado + hooks de 2-3 linhas em main.js demonstra caminho viavel.
