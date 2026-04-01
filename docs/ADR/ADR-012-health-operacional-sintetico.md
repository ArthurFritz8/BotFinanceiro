# ADR 012 - Health operacional sintetico

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Fornecer um status operacional sintetico (`ok`, `warning`, `critical`) para suporte a monitoramento e tomada de decisao automatizada sem depender de analise manual de metricas brutas.

## Contexto

O endpoint interno ja expunha metricas detalhadas do scheduler e provider, mas nao havia uma avaliacao consolidada de risco operacional considerando cota, estado de circuito e taxa de falha por escopo.

## Solucao

1. Adicionados thresholds de warning/critical por ambiente para cota e taxa de falha por escopo.
2. Implementado calculo de health operacional no modulo system, com razoes detalhadas e severidade.
3. Criado endpoint interno protegido `/internal/health/operational`.
4. Mantido contrato padrao de resposta da API para facilitar consumo no frontend e automacoes.

## Prevencao

1. Thresholds ajustaveis por ambiente evitam hardcode e reduzem risco de alerta excessivo.
2. Toda mudanca em regra de severidade deve atualizar ADR correspondente.
3. Endpoints internos permanecem protegidos por token e whitelist opcional de IP.
4. Diagnostico deve considerar razoes e nao apenas status sintetico para evitar falso positivo.

## Impacto

1. Melhor visibilidade executiva de saude operacional.
2. Menor tempo de resposta em incidentes.
3. Base pronta para integrar alerting externo sem dependencia de parser de logs.
