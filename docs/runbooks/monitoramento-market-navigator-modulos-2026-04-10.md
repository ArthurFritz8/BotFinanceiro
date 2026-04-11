# Runbook - Monitoramento dos Modulos do Market Navigator (2026-04-10)

## Escopo

Operacao e diagnostico consolidado dos modulos de dados que alimentam o Market Navigator.

## Endpoint interno

1. `GET /internal/health/market-navigator/modules`
- header obrigatorio: `x-internal-token`
- query opcional: `refresh=true` para forcar probe sem usar cache interno curto

## Modulos cobertos

1. `b3`
2. `commodities`
3. `crypto`
4. `defi`
5. `equities`
6. `etfs`
7. `fixed-income`
8. `forex`
9. `futures`
10. `macro-rates`
11. `wall-street`

## Campos relevantes por modulo

1. `status`: `ok`, `warning`, `critical`
2. `latencyMs`: latencia da coleta
3. `provider`: provedor principal reportado
4. `fromCache`: indica uso de cache do modulo
5. `successCount`, `failureCount`, `failureRatePercent`
6. `errorCode`, `errorMessage` (quando houver)

## Sumario global

1. `summary.status`: severidade consolidada do painel
2. `summary.okModules`, `summary.warningModules`, `summary.criticalModules`
3. `summary.totalSuccessCount`, `summary.totalFailureCount`
4. `summary.avgFailureRatePercent`, `summary.maxFailureRatePercent`
5. `summary.staleModules`

## Politica de cache do endpoint

1. Cache interno de 15 segundos para reduzir custo de probes repetidos
2. Use `refresh=true` em investigacao de incidente para forcar leitura nova

## Sinais operacionais

1. `summary.criticalModules > 0`: incidente ativo por modulo
2. `summary.warningModules` crescente: risco de degradacao ampla
3. `summary.staleModules` alto por periodo prolongado: dependencia externa instavel
4. `errorCode` repetido no mesmo modulo: candidato a playbook especifico

## Comandos de validacao

1. Typecheck API:

```bash
npm run typecheck -w @botfinanceiro/api
```

2. Teste focado de rotas de system:

```bash
node --import tsx --test apps/api/src/modules/system/interface/system-routes.test.ts
```

3. Suite completa API:

```bash
npm run test -w @botfinanceiro/api
```

4. Consulta endpoint (forcando refresh):

```bash
curl "http://localhost:3000/internal/health/market-navigator/modules?refresh=true" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```
