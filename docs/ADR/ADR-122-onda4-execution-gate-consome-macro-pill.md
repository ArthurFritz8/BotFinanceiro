# ADR-122 — Onda 4: Macro Execution Gate consumido pelo Execution Gate

- Status: Aceito
- Data: 2026-04-28
- Autor: Equipe Plataforma (Arquiteto Staff CTO + Lead Quant Hedge Fund)
- Tags: `execution-gate`, `macro`, `risk-management`, `intelligence-desk`

## Contexto

ADR-121 (Onda 3) entregou a pill macro com endpoint `/v1/macro/upcoming-events`,
classificacao `red|yellow|green` e `blockDirectionalRisk` boolean. Porem a
informacao era **visual-only**: nada no `execution-gate` (modulo que decide
armar/aguardar/bloquear setups) consumia o estado, ou seja, o operador via a
pill vermelha mas o desk continuava armando setups durante FOMC/CPI/NFP.

## Decisao

`buildExecutionGateSnapshot()` em
[execution-gate.js](../../apps/web/src/modules/chart-lab/quant/execution-gate.js)
agora aceita `input.macroGate` (formato identico ao retorno de
`getMacroGateState()` da pill macro):

1. Quando `macroGate.blockDirectionalRisk === true`:
   - `hardBlocked = true` (forcado independente do score)
   - `status.label = "MACRO BLACKOUT"` (em vez de "BLOQUEADO" generico)
   - `guidance = "Macro blackout: evento de alto impacto iminente bloqueia novas entradas direcionais."`
   - `riskScale = 0`
2. Quando `macroGate` eh fornecido (qualquer estado), um check extra
   `macro-gate` com `blocking=true` e `weight=14` eh adicionado ao checklist,
   exibindo `"<nome> em <Xmin> (red|yellow|green)"`.
3. Quando `input.macroGate` **nao** eh fornecido (omitido/`null`), nada muda
   no gate — preserva backward-compat com testes/callsites existentes.

Integracao em `main.js` no callsite unico
([linha ~13815](../../apps/web/src/main.js)):

```js
const macroGate = getMacroGateState();
const executionGate = buildExecutionGateSnapshot({
  analysis, liquidityHeatmap, macroGate, marketRegime, orderFlow,
});
```

`getMacroGateState()` retorna sempre o ultimo snapshot conhecido (cache local
do polling 60s) — sem custo de fetch adicional por tick do execution gate.

## Consequencias

### Positivas

- Mesa cripto/binarias passa a respeitar **automaticamente** janelas de
  blackout macro: durante FOMC/CPI/NFP o desk fica `BLOQUEADO` mesmo com
  setup tecnico perfeito, replicando higiene de mesas Tier-1.
- Guidance explicita o motivo (`"Macro blackout..."`) — operador entende
  por que o gate esta vermelho sem precisar cruzar pill + checklist.
- Check `macro-gate` no checklist torna o veto **auditavel**: aparece junto
  com signal/regime/flow/liquidity, mantendo padrao de transparencia.
- Zero acoplamento duro: a integracao eh via parametro opcional. Testes
  legados de `buildExecutionGateSnapshot` (sem `macroGate`) continuam verdes.

### Riscos / Tradeoffs

- Polling de 60s da pill macro implica ate 1min de latencia entre evento
  iminente e bloqueio efetivo do gate — aceitavel pois eventos macro sao
  conhecidos com horas de antecedencia.
- `getMacroGateState()` retorna `null` antes do primeiro fetch, ponto onde
  o gate continua operando normal (degradacao tolerada — alternativa seria
  bloquear tudo "preventivamente" o que aborta operacao normal no boot).

## Testes

- `apps/web/tests/chart-lab-quant.test.mjs`:
  - `Execution gate veta entrada direcional quando macro blackout esta ativo (ADR-122)` — PASS
  - `Execution gate ignora macro quando alertLevel green (ADR-122)` — PASS
- Total web: 142/142 PASS (140 anteriores + 2 novos).

## Definicao de Pronto

- [x] `buildExecutionGateSnapshot` aceita `macroGate` opcional.
- [x] Veto duro com label/guidance dedicados quando `blockDirectionalRisk=true`.
- [x] Check `macro-gate` adicionado ao checklist quando macro fornecido.
- [x] Backward-compat preservada (testes legados sem `macroGate` PASS).
- [x] `main.js` consome `getMacroGateState()` no unico callsite.
- [x] 2 novos testes cobrem veto + green-noop.
- [x] Doc-guard verde.
