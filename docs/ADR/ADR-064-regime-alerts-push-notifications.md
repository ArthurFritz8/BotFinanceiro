# ADR-064 — Push notifications de alertas critical novos (Wave 24)

## Status

Aceito — 2026-04-20

## Contexto

A Wave 23 (ADR-063) introduziu persistencia + escalada de alertas critical
de regime. O operador, porem, so descobre alertas quando abre a UI de
backtesting. Para degradacoes severas (critical novo), queremos
**notificacao push proativa** reusando a infra Web Push ja existente
(ADR-054) sem custo adicional.

## Decisao

Adicionamos parametro opcional `notifier?: RegimeAlertNotifier` ao
`BacktestingService`. A interface `RegimeAlertNotifier` e estreita
(`isEnabled()` + `broadcast(payload)`) para evitar acoplar com o modulo
notifications inteiro — o `NotificationService` real satisfaz
estruturalmente.

`computeRegimeAlerts` agora, ao processar um critical (incluindo
escalado por recorrencia):

1. Conta criticals JA persistidos para o mesmo bucket dentro de
   `notificationCooldownMs` (default 1h, env
   `BACKTESTING_REGIME_ALERTS_NOTIFY_COOLDOWN_MS`).
2. Persiste o alerta atual (timeline auditavel).
3. Se a contagem prev ia foi 0 → dispara `notifier.broadcast(...)`
   fire-and-forget.

O payload usa `tag` deterministico
`regime-alert:${asset}:${strategy}` para coalescing nativo do navegador
(notificacoes mais novas substituem antigas do mesmo bucket). URL
`#/backtesting` leva o operador direto ao painel.

Failure-soft: erros do canal de notificacao sao silenciados via
`.catch(() => {})` — alerta principal nunca falha por problema de push.

## Consequencias

Positivas:

- Operador notificado proativamente em degradacoes severas, sem precisar
  abrir a UI.
- Cooldown evita spam (1h padrao impede mais de uma push por bucket por
  hora).
- Reuso completo da infra ADR-054 (subscriptions, VAPID, sender, store).
- Failure-soft preserva a robustez do alerta principal.

Limitadas / aceitas:

- `tag` por bucket significa que push novo substitui visualmente o
  anterior — operador que nao verificou a notificacao perde o detalhe da
  primeira. Aceitavel pois o histori co persistido cobre auditoria.
- Sem dedupe exato por id de alerta — cooldown por janela e suficiente
  para v1.

## Alternativas rejeitadas

- **Notificar TODOS os criticals (sem cooldown)**: gera spam em buckets
  oscilando perto do threshold.
- **Notificar tambem warnings escalados**: ja sao tratados como critical
  no fluxo da Wave 23 (escalation eleva a severidade), entao ja entram
  automaticamente no broadcast.

## Validacao

- 293/293 testes node:test pass (3 novos: broadcast quando critical novo,
  cooldown bloqueia repeticao, notifier desabilitado nao dispara).
- `npm run lint` exit 0.
