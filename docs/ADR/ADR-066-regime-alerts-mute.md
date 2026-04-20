# ADR-066 — Mute manual de regime alerts por bucket (Wave 26)

## Status

Aceito — 2026-04-21

## Contexto

A Wave 25 (ADR-065) garantiu que push notifications de alertas critical
disparem mesmo com UI ociosa, atraves do
`RegimeAlertsScannerJobRunner`. O cooldown de 1h (Wave 24 / ADR-064) ja
limita repeticao do mesmo bucket, mas em cenarios de degradacao
sustentada o operador continua recebendo push a cada hora — sem opcao
de silenciar uma combinacao especifica `(asset, strategy)` enquanto
investiga. A unica saida hoje seria desabilitar
`BACKTESTING_REGIME_ALERTS_SCAN_ENABLED` inteiro, perdendo sinal de
todos os outros buckets.

## Decisao

Adicionar mute manual por bucket com:

- **Store**: `JsonlRegimeAlertMutesStore` em
  `apps/api/src/modules/backtesting/infrastructure/`. Append-only JSONL
  com estado em memoria mantido como `Map` LWW por chave
  `${asset}::${strategy}` — append do mesmo bucket sobrescreve. Cap
  configuravel (default 500). Mesmo padrao dos outros stores Jsonl da
  pasta.
- **Domain**: `RegimeAlertMuteEntry` com `mutedUntilMs` (epoch ms),
  `createdAtMs`, `reason?` (max 200 chars).
- **Service**: novos metodos
  `BacktestingService.muteRegimeAlert(rawRequest)`,
  `unmuteRegimeAlert(rawRequest)`, `listRegimeAlertMutes(activeOnly?)`.
  Validacao Zod no boundary com cap de duracao 30 dias e min 1 minuto.
- **Integracao em `computeRegimeAlerts`**: cada `RegimeAlert` ganha
  flags `muted: boolean` e `mutedUntilMs: number | null` derivadas do
  `mutesStore.getActive(asset, strategy, nowMs)`. O alerta segue
  visivel na UI e segue persistido no historico (auditavel). Apenas
  o broadcast Web Push e suprimido — `notifyRegimeAlert` nao e chamado
  quando `alert.muted === true`.
- **Rotas publicas**: `POST /v1/backtesting/regime-alerts/mute`,
  `POST /v1/backtesting/regime-alerts/unmute`,
  `GET /v1/backtesting/regime-alerts/mutes?activeOnly=true|false`. Sob
  rate-limit publico (ADR-050).
- **UI**: nova coluna "Acoes" na tabela de regime alerts com botoes
  pre-configurados 1h / 24h / 7d / 30d para mute, e botao Unmute
  quando ja muted. Badge `🔕` ao lado da severidade indicando push
  silenciado e tooltip com `mutedUntilMs`.
- **Env**: `BACKTESTING_REGIME_ALERTS_MUTES_DATA_FILE` (default
  `apps/api/data/backtesting-regime-alert-mutes.jsonl`),
  `BACKTESTING_REGIME_ALERTS_MUTES_MAX_ENTRIES` (default 500).

## Consequencias

Positivas:

- Operador silencia push de bucket conhecido sem perder visao da UI
  nem suprimir outros sinais.
- Persistencia LWW garante reboot seguro: mute sobrevive a restart.
- Mute expirado e ignorado automaticamente — nao precisa unmute
  explicito ao fim da janela.
- `listRegimeAlertMutes(true)` filtra expirados para a UI; modo
  `false` permite ver historico completo de mutes.

Riscos / mitigacoes:

- **Mute esquecido em bucket que volta a ser saudavel**: tolerancia
  baixa porque alerta so dispara quando ha degradacao real; em
  bucket saudavel nao ha push para suprimir. Cap de 30 dias por
  duracao limita "esquecimentos" longos.
- **Race entre mute e tick concorrente**: scanner e single-threaded
  via `setInterval` no event loop, sem concorrencia real.

## Alternativas rejeitadas

- **Mute global (kill-switch)**: ja existe via
  `BACKTESTING_REGIME_ALERTS_SCAN_ENABLED=false`. Granularidade
  insuficiente.
- **Soft-snooze via cooldown dinamico**: poluiria o conceito de
  cooldown anti-spam (Wave 24) com semantica de mute manual.
- **Acknowledge/dismiss permanente**: alterna o conceito —
  acknowledge é evento, mute é estado. Mute resolve a dor sem
  precisar manter timeline de acknowledges.

## Testes

Adicionados em
`apps/api/src/modules/backtesting/application/backtesting-service.test.ts`
(4 novos):

1. Mute manual suprime broadcast mas alerta segue visivel com flag
   `muted=true`.
2. Unmute reativa broadcast em proxima rodada (com clear de
   `alertsStore` para bypassar cooldown anterior).
3. Mute expirado nao bloqueia broadcast e e filtrado por
   `listRegimeAlertMutes(true)`.
4. `muteRegimeAlert` sem `mutesStore` configurado lanca erro
   informativo.

Total apos esta wave: **299 testes passando** (4 novos), lint
`--max-warnings=0`.

## Referencias

- Wave 22 / ADR-062 (deteccao inicial de regime alerts).
- Wave 23 / ADR-063 (historico + escalada por recurrence).
- Wave 24 / ADR-064 (push notifications proativas).
- Wave 25 / ADR-065 (scanner periodico).
- `apps/api/src/modules/backtesting/infrastructure/jsonl-regime-alerts-history-store.ts`
  (padrao reutilizado).
