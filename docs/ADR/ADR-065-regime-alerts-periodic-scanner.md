# ADR-065 — Scanner periodico de regime alerts (Wave 25)

## Status

Aceito — 2026-04-21

## Contexto

A Wave 24 (ADR-064) introduziu push notifications proativas para alertas
`critical` novos de regime, com cooldown anti-spam. Porem, a deteccao
de novos alertas (`computeRegimeAlerts`) so e disparada de forma
implicita em dois caminhos:

1. UI faz `GET /v1/backtesting/regime-alerts` (operador abre a tela).
2. Nova rodada `POST /v1/backtesting/compare` recalcula vitorias e
   inadvertidamente recalcula severities.

Em uso ocioso (operador nao abre UI durante horas), uma degradacao
critical pode ocorrer e a push notification so chegaria quando alguem
finalmente abrisse a tela — anulando o objetivo de proatividade da
Wave 24.

## Decisao

Adicionar **`RegimeAlertsScannerJobRunner`** em `apps/api/src/jobs/`,
seguindo o padrao ja consolidado de `AutoPaperTradingJobRunner`:

- `setInterval(...).unref()` para nao prender o event loop em testes.
- Guardas `started` para start/stop idempotentes.
- `app.addHook("onClose", ...)` para shutdown gracioso.
- `tick()` envolve `service.computeRegimeAlerts()` em `try/catch`
  (failure-soft): erros logam `warn` mas nao quebram o ciclo.

Configuracao via env (defaults seguros):

- `BACKTESTING_REGIME_ALERTS_SCAN_ENABLED` — `boolean`, default `true`.
  Permite desabilitar o scan sem desligar todo `BACKTESTING_ENABLED`.
- `BACKTESTING_REGIME_ALERTS_SCAN_INTERVAL_MS` — `number`,
  min `60_000` (1 min), max `86_400_000` (24h), default `900_000`
  (15 min).

O scanner so e instanciado dentro do bloco `if (env.BACKTESTING_ENABLED)`
existente em `app.ts`, reutilizando a mesma instancia de
`BacktestingService` (com `notifier` + cooldown ja injetados).

## Consequencias

Positivas:

- Push notifications de regime alerts disparam **mesmo em uso ocioso**.
- Cooldown ja existente (ADR-064, default 1h) impede spam mesmo com
  scanner agressivo.
- Padronizacao com `AutoPaperTradingJobRunner` reduz custo cognitivo.
- `unref()` garante que o job nao impede shutdown em testes/CLI.

Riscos / mitigacoes:

- **Custo de CPU em scans frequentes**: `computeRegimeAlerts` itera
  apenas sobre o ultimo run de cada par (asset, strategy) ja em memoria
  via `BacktestEngine`. Default 15min e bound min de 1min limitam
  custo a O(combinacoes_armazenadas) por scan.
- **Loop infinito em caso de bug em `computeRegimeAlerts`**: mitigado
  por `try/catch` com log `warn` — proximo tick continua.

## Alternativas rejeitadas

- **Scan via worker thread**: complexidade desnecessaria; o calculo
  e CPU-bound mas curto e sincrono.
- **Trigger via webhook externo (cron OS)**: aumenta acoplamento
  operacional e nao funciona em ambientes serverless/containers
  sem cron host.
- **Scan apos cada push notification enviada**: nao resolve o problema
  central (sem trigger inicial em uso ocioso).

## Testes

`apps/api/src/jobs/regime-alerts-scanner-job-runner.test.ts`:

1. `tick()` chama `service.computeRegimeAlerts()` (counter cresce).
2. `tick()` e failure-soft (servico que lanca nao propaga erro).

Total apos esta wave: **295 testes passando**, lint `--max-warnings=0`.

## Referencias

- Wave 22 / ADR-062 (deteccao inicial de regime alerts).
- Wave 23 / ADR-063 (historico + escalada por recurrence).
- Wave 24 / ADR-064 (push notifications proativas).
- `apps/api/src/jobs/auto-paper-trading-job-runner.ts` (padrao
  reutilizado).
