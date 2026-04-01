# ADR 017 - Agregacao hour/day no historico operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Reduzir volume de dados em analises longas e acelerar diagnostico por tendencia, oferecendo agregacao por hora e por dia no historico operacional.

## Contexto

O historico operacional em JSON/CSV ja suportava filtros temporais, mas retornava snapshots individuais. Em periodos extensos, isso ainda gera muitos registros para avaliar tendencia de degradacao.

## Solucao

1. Implementada agregacao por buckets no service do modulo system.
2. Granularidades suportadas: `hour` e `day`.
3. Novo endpoint interno protegido:
GET /internal/health/operational/history/aggregate
4. Query params:
- `granularity` (`hour` ou `day`)
- `bucketLimit`
- `from`
- `to`
5. Cada bucket retorna:
- intervalo (bucketStart/bucketEnd)
- quantidade de amostras
- contagem de status (ok/warning/critical)
- media de budget restante
- maximo de ciclos consecutivos com circuito aberto
- maximo de taxa de falha entre escopos

## Prevencao

1. Validacao de intervalo `from <= to` no controller.
2. Limite maximo de buckets respeitado para evitar carga excessiva.
3. Endpoint continua protegido por autenticacao interna e whitelist opcional de IP.
4. Mudancas futuras na semantica dos buckets exigem novo ADR.

## Impacto

1. Melhor leitura de tendencia operacional sem infraestrutura adicional.
2. Menor volume de resposta para janelas temporais longas.
3. Base pronta para dashboard de observabilidade com visao temporal consolidada.
