# ADR 021 - Testes de integracao da rota interna JSON agregada

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Cobrir fim a fim o contrato HTTP da rota interna de agregacao JSON do historico operacional.

## Contexto

A rota CSV agregada ja possui teste de integracao. Faltava cobertura equivalente para a rota JSON agregada:
GET /internal/health/operational/history/aggregate

## Solucao

1. Adicionados testes de integracao com Fastify inject para a rota JSON agregada.
2. Coberturas implementadas:
- 401 sem token interno
- 200 com token interno valido
- contrato `status=success`
- estrutura esperada de agregacao (`granularity`, `bucketLimit`, `totalStored`, `totalBuckets`, `buckets`)
- validacao de metricas consolidadas do bucket

## Prevencao

1. Mudancas no contrato da rota JSON agora exigem ajuste explicito dos testes.
2. Reduz risco de regressao silenciosa em autenticacao interna e payload agregado.
3. Cobertura passa automaticamente pelo gate de CI.

## Impacto

1. Contrato de observabilidade interno mais confiavel.
2. Maior seguranca para evolucao de filtros e granularidade.
3. Padrao de teste de integracao alinhado entre rotas JSON e CSV.