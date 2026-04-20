# ADR-063 — Historico anotado de alertas critical com escalada por recorrencia (Wave 23)

## Status

Aceito — 2026-04-20

## Contexto

A Wave 22 (ADR-062) introduziu `computeRegimeAlerts` em modo derivado puro
(re-calculado a cada GET, sem persistencia). Isso permite deteccao
imediata, mas perde duas dimensoes operacionais:

1. **Auditoria temporal**: nao se sabe QUANDO um alerta `critical`
   apareceu pela primeira vez nem se vem se repetindo.
2. **Escalada por recorrencia**: warnings que reaparecem 3, 4, 5 vezes
   na mesma janela de tempo merecem severidade maior — sao sinal de
   degradacao sustentada de regime, nao volatilidade pontual.

## Decisao

Adicionamos `JsonlRegimeAlertsHistoryStore` (mesma forma do
`JsonlBacktestRunStore`): JSONL append-only, load O(N) boot, cap +
compactacao FIFO. Persistimos APENAS `severity = "critical"` para manter
o arquivo focado em sinais acionaveis.

`BacktestingService.computeRegimeAlerts(options)` agora:

- Conta alertas critical anteriores no bucket `(asset, strategy)` dentro
  da `recurrenceWindowMs` (default 7 dias) via
  `alertsHistoryStore.countRecentForBucket(...)`.
- Se `baseSeverity === "warning"` AND
  `recurrenceCount >= recurrenceEscalationCount` (default 3) → eleva
  para `critical` e marca `escalatedByRecurrence = true`.
- Cada alerta retornado carrega `recurrenceCount` e
  `escalatedByRecurrence` para a UI exibir badge informativo.
- Persiste APENAS criticals (incluindo escalated) via
  `persistRegimeAlert(alert, nowMs)`.

Novo metodo publico `listRegimeAlertsHistory(limit?)` + rota
`GET /v1/backtesting/regime-alerts/history?limit=N` (rate-limited). UI
ganhou secao "Timeline de alertas critical" e badges nos alertas
correntes.

## Consequencias

Positivas:

- Auditoria temporal de quando degradacoes severas ocorreram.
- Escalada automatica reduz risco de subestimar warnings repetidos.
- Custo zero (mesmo padrao JSONL ja validado em paper-trading e
  history-store).
- `recurrenceCount = 0` quando nao ha store (graceful degradation).

Limitadas / aceitas:

- Persistencia em CADA computacao de critical pode gerar duplicacao se
  GET /regime-alerts for chamado em rajada (mesmos alertas re-escritos).
  Mitigacao futura possivel via dedupe por id derivado, mas v1 aceita
  redundancia (cap FIFO limita crescimento).
- Warnings nao persistidos — escolha consciente para nao poluir timeline.

## Alternativas rejeitadas

- **Persistir tambem warnings**: aumenta volume sem adicionar
  acionabilidade real (warning isolado e ruido).
- **Calcular recorrencia em memoria sem persistir**: perde auditoria
  cross-restart e impede dashboards historicos.

## Validacao

- 290/290 testes node:test pass (3 novos: persiste apenas critical,
  escala warning -> critical apos 3 recorrencias, lista vazia sem store).
- `npm run lint` exit 0.
