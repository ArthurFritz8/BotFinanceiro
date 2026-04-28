# ADR-123 — Onda 5: Auto-Paper Operator respeita Macro Blackout

- Status: Aceito
- Data: 2026-04-28
- Autor: Equipe Plataforma (Arquiteto Staff CTO + Lead Quant Hedge Fund)
- Tags: `paper-trading`, `auto-paper`, `macro`, `risk-management`

## Contexto

ADR-122 (Onda 4) integrou o macro execution gate ao `buildExecutionGateSnapshot`,
fazendo o gate visual exibir `MACRO BLACKOUT` durante FOMC/CPI/NFP iminentes.
Porem o `paper-trading-operator` (auto-submissao para a rota
`/v1/paper-trading/operator/auto-signal`) ainda dependia somente do
`automationGuard` (Auto Guard ADR-101) e das preferencias persistidas. Em outras
palavras: o gate visual bloqueava, mas o **auto-paper continuava enviando**
ordens durante a janela macro - inconsistencia critica para a mesa.

## Decisao

`canSubmitAutoSignal()` em
[paper-trading-operator-client.js](../../apps/web/src/modules/chart-lab/quant/paper-trading-operator-client.js)
recebe parametro adicional `macroGate` (mesmo formato do `getMacroGateState()`):

- Quando `macroGate.blockDirectionalRisk === true` -> retorna `false`,
  vetando a submissao mesmo com tudo armado.
- Quando `macroGate` eh `null`/`undefined` -> ignorado (backward-compat).
- Quando `macroGate.blockDirectionalRisk` eh `false` -> nao interfere.

Em `main.js` o callsite unico de `maybeDispatchOperatorAutoSignal` agora le
`getMacroGateState()` e propaga para `canSubmitAutoSignal`. Sem custo
adicional - reusa o cache local do polling 60s da pill macro.

## Consequencias

### Positivas

- **Consistencia operacional**: pill vermelha + execution gate `BLOCKED` +
  auto-paper silenciado agora formam uma cadeia unica. Mesa nao envia ordens
  automaticas em janela macro mesmo se o operador esquecer de desarmar.
- **Defesa em profundidade**: ja temos veto visual (ADR-121), veto no
  execution-gate (ADR-122) e agora veto na ultima milha de submissao (ADR-123).
- **Sem novo overhead**: zero fetch adicional - le state em memoria.

### Riscos / Tradeoffs

- Polling de 60s da pill implica ate 1min de latencia entre evento iminente e
  bloqueio efetivo do auto-paper - aceitavel pois eventos macro sao conhecidos
  com horas de antecedencia.
- `macroGate=null` antes do primeiro fetch nao bloqueia (degradacao tolerada -
  alternativa seria bloquear preventivamente, sacrificando operacao normal no
  boot). Como ADR-122 ja exige `macroGate` no execution-gate, em pratica o
  auto-paper so dispara com snapshot disponivel.

## Testes

- `apps/web/tests/paper-trading-operator-client.test.mjs`:
  - `canSubmitAutoSignal veta submissao quando macro blackout esta ativo (ADR-123)` - PASS
  - Cobre 3 casos: red bloqueia, green libera, null preserva backward-compat.
- Total web: 143/143 PASS.

## Definicao de Pronto

- [x] `canSubmitAutoSignal` aceita `macroGate` opcional com veto duro em red.
- [x] `main.js` propaga `getMacroGateState()` para o callsite real.
- [x] Backward-compat preservada (param opcional, ausencia = ignora).
- [x] Teste cobre 3 cenarios (blackout, green, null).
- [x] Doc-guard verde.
