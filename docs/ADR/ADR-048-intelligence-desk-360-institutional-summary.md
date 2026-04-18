# ADR-048 — Intelligence Desk 360 (Resumo Institucional SMC + HFT)

- **Status:** Aceito
- **Data:** 2025
- **Contexto:** Wave 8 — UI/UX institucional pós-click "ANALISAR MERCADO".

## Contexto

Após expansão do catálogo (ADR-047), usuários relataram dispersão visual entre
cards (signal, context, SMC, WEGD, fear & greed, harmonic, ghost tracker, prop
desk). Proposta externa "Intelligence Desk 360" sugeriu consolidar em topo. O
time de revisão (persona cumulativa **Arquiteto de Dashboards Financeiros + HFT
Peer Review**) aplicou revisão crítica antes de implementar.

## Decisão

Adicionar `#institutional-summary` entre o signal-card e o context-card com:

- **4 KPIs adaptativos** (`#institutional-summary-grid`):
  1. **Viés Estrutural** (SMC) — bull/bear/neutral derivado de
     `context.trend` + `context.zone` + `signal.tone`.
  2. **Força do Motor Cinético** — ADAPTATIVO ao `chartOperationalMode`:
     - binary: `microTiming.momentumStrength` + `neutralProbability`
       (thresholds HOT ≥0,70/≤0,40; WARM ≥0,45/≤0,55).
     - spot: `signal.confidence` (FORTE ≥70; MODERADO ≥50; FRACO <50).
  3. **Win Rate Ghost Tracker** — fail-honest: `resolvedTrades < 5` mostra
     "Aquecendo" + contador "N/5 trades para ativar auditoria" em vez de
     fabricar percentual com amostra insuficiente.
  4. **Risco da Operação** — `propDeskState.riskPercent` limitado a 1% quando
     `propModeEnabled`.
- **Strip de contexto** (`#institutional-context-strip`): zone, range %,
  fear & greed.
- **Checklist HFT+SMC** (`#institutional-checklist`, 5 itens booleanos):
  sweep executado, FVG mitigado, trend↔tone alinhados, fear&greed fora do
  extremo, range operacional saudável (0,5–15%).

## Vetos aplicados à proposta original

1. **Preservar osciladores** — recusamos narrativa "fim de RSI/MACD"; seguem
   válidos em confluência com SMC/WEGD.
2. **Fail-honest em win rate** — sem números fabricados com <5 amostras.
3. **KPI 3 adaptativo ao modo** — binary usa micro-timing; spot usa confidence.
4. **Sem HTML órfão** — qualquer `<section>` adicionado é obrigatoriamente
   ligado via seletores + `renderInstitutionalSummary` + `clearInstitutional
   Summary` + CSS dedicado.

## Acessibilidade

- `@media (prefers-reduced-motion: reduce)` neutraliza transições dos KPIs.
- `data-tone` semântico (`bull` | `bear` | `neutral`) propagado no wrapper e
  em cada KPI para ecoar cores institucionais (verde/vermelho/âmbar).
- Grid responsivo 1→2→4 colunas (640px e 1024px breakpoints).

## Alternativas descartadas

- **Remover cards existentes**: quebraria memória muscular de usuários em
  operação e as rotas de deep-analysis (harmonic, WEGD, micro-timing).
- **Cálculo paralelo**: checklist deriva de strings já normalizadas em
  `analysis.smc.*` via regex — zero duplicação de engines.

## Consequências

- (+) Decisão em <5s pós-click: viés, motor, risco e audit rate em topo.
- (+) Zero regressão: 25/25 testes web, 215/215 api, lint/typecheck limpos.
- (−) +200 linhas CSS; mitigado por reuso de tokens existentes.

## Referências

- ADR-046 (/stats Coinbase), ADR-047 (catálogo 60 ativos).
- `apps/web/index.html`, `apps/web/src/main.js`, `apps/web/src/styles.css`,
  `apps/web/tests/smoke.test.mjs`.
