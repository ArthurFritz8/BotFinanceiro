# ADR-049 — Persistencia do Ghost Tracker + Badge de Confluencia + Tooltips de Auditabilidade

- **Status:** Aceito
- **Data:** 2026
- **Contexto:** Wave 9 — hardening operacional do Intelligence Desk 360.

## Contexto

Wave 8 entregou o resumo institucional com KPI "Assertividade real" (ADR-048),
mas com 2 limitacoes descobertas em uso: (a) refresh da aba zerava a auditoria
Ghost Tracker (estado apenas em memoria); (b) o usuario precisava varrer os 5
itens do checklist para decidir se havia confluencia, sem uma sinalizacao
"dashboard-level". Alem disso, KPIs nao expunham a base de calculo, forcando
confianca cega.

## Decisao

Tres adicoes complementares, zero regressao:

### 1. Persistencia do Ghost Tracker (localStorage v1)

- Chave unica versionada `botfinanceiro:ghost-tracker:v1` consolidando ambos
  estados (`binary` + `spot`).
- Hidratacao no boot via `hydrateGhostTrackerStatesFromStorage()` com
  schema-guard (`sanitizePersistedGhostTrackerState`) que rejeita campos
  invalidos e cai no factory default silenciosamente.
- Persistencia debounced (~180ms) via `schedulePersistGhostTrackerStates()`
  chamada ao final de `updateBinaryOptionsGhostTracker` e
  `updateSpotMarginGhostTracker` — zero dispersao em settlers/registers
  individuais.
- Failure-tolerant: modo privado, quota excedida, ou `window.localStorage`
  ausente fazem fallback silencioso para memoria.

### 2. Badge de confluencia (score/5 derivado do checklist)

- Renderizado no topo do `#institutional-summary`, antes do grid de KPIs.
- Score = `checks.reduce((acc, c) => acc + (c.ok ? 1 : 0), 0)` reusando o
  mesmo array ja computado para o checklist — zero compute paralelo.
- `data-tone="bull"` (>=4), `"neutral"` (>=2), `"bear"` (<2).
- 5 dots visuais preenchidos por `data-ok="true"` ecoando os checks
  individuais (sweep, FVG, trend-alinhado, fear&greed, volatilidade).

### 3. Tooltips de auditabilidade em cada KPI

- Atributo `title=` com metricas brutas: wins/losses/pushes/abertos,
  estrutura+zona, momentum/neutral/thresholds, exit strategy + prop mode.
- Cursor `help` no CSS para sinalizacao visual.
- Principio HFT: qualquer KPI resumido deve ser auditavel em 1 hover.

## Vetos aplicados

1. **Nao duplicar calculo** — badge reusa `checks[]` do checklist; qualquer
   tentativa de criar novo engine de confluencia seria ruido.
2. **Nao persistir cross-session keys** — `sessionKey` eh restaurado mas o
   `updateGhost*` ja reseta o state inteiro quando muda (linha 7930/8150),
   preservando isolamento por sessao/ativo.
3. **Nao versionar localStorage sem schema-guard** — a chave inclui `:v1`
   para drift futuro; mudancas de shape => bump para `:v2` + deprecate v1.

## Consequencias

- (+) Win rate sobrevive a refresh: auditoria longitudinal real.
- (+) "Posso confiar nesse sinal?" respondido em <1s com badge 0-5.
- (+) Metricas brutas auditaveis sem abrir devtools.
- (+) Higiene: `.gitignore` cobre artefatos de debug (`out*.txt`,
  `test_*_output.txt`, `tests*.tap`) que polulam o workspace.
- (−) Acoplamento ao `localStorage` — mitigado pelo fallback silencioso.

## Referencias

- ADR-047, ADR-048.
- `apps/web/src/main.js`, `apps/web/src/styles.css`, `apps/web/index.html`,
  `apps/web/tests/smoke.test.mjs`, `.gitignore`.
