# ADR 037 - Painel interno de saude por modulo do Market Navigator

- Data: 2026-04-10
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Fornecer um unico endpoint interno para monitorar, em formato operacional, a saude de cada modulo que alimenta o Market Navigator (crypto, futures, forex, equities e demais blocos da mesa multi-classe).

## Contexto

Mesmo com metricas internas existentes (streams, live chart, scheduler, historico operacional), faltava uma visao consolidada por modulo de negocio da UI.

Impacto observado:

1. Dificuldade para distinguir rapidamente falha de provedor externo vs degradacao de cache por modulo.
2. Diagnostico mais lento de incidentes em visoes especificas do Market Navigator.
3. Ausencia de indicador global consolidado para acionar resposta operacional.

## Solucao

1. Novo endpoint interno autenticado:
- `GET /internal/health/market-navigator/modules`
- protegido por `x-internal-token`

2. Probing padronizado dos modulos usados no Market Navigator:
- b3
- commodities
- crypto
- defi
- equities
- etfs
- fixed-income
- forex
- futures
- macro-rates
- wall-street

3. Payload consolidado por modulo com:
- status (`ok`, `warning`, `critical`)
- latencia de probe
- provider
- `fromCache`
- `successCount`, `failureCount`, `failureRatePercent`
- erro (`errorCode`, `errorMessage`) quando aplicavel

4. Sumario global com severidade agregada:
- total de modulos por status
- volume total de sucesso/falha
- taxa media e maxima de falha
- total de modulos servindo de cache stale

5. Cache curto do painel interno:
- TTL de 15 segundos para reduzir custo de probes recorrentes mantendo visao quase ao vivo
- parametro `refresh=true` para forcar nova coleta

6. Estabilidade de testes:
- em `NODE_ENV=test`, probe live desabilitado e resposta em modo `stub`, evitando flakiness de rede
- cobertura de rota interna adicionada

## Prevencao

1. Reduz MTTR em incidentes do Market Navigator.
2. Evita diagnostico manual modulo a modulo durante oscilacao externa.
3. Permite monitoracao continua com criterio unico de severidade para mesa multi-classe.
4. Mantem previsibilidade de suite automatizada sem dependencia de provedores externos.

## Impacto

1. Observabilidade enterprise mais proxima da camada de produto (modulos da UI), nao apenas da camada tecnica.
2. Melhor triagem entre falha externa, degradacao de cache e erro interno.
3. Base pronta para dashboard operacional e alertas por modulo.
4. Evolucao alinhada ao padrao O.C.S.P. de governanca arquitetural.
