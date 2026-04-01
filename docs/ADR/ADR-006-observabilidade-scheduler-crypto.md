# ADR 006 - Observabilidade do scheduler crypto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Expor visibilidade operacional do scheduler crypto para diagnostico rapido de falhas, consumo de cota e saude dos ciclos hot/warm/cold em ambiente de custo zero.

## Contexto

O scheduler ja executava ciclos de sincronizacao com controles de cota e rate limit, mas sem endpoint de consulta operacional para saber ultima execucao, falhas e saturacao de limites.

## Solucao

1. Incluido snapshot de metricas no job runner com totais acumulados e ultimo ciclo por escopo.
2. Incluido estado de proxima execucao com jitter aplicado por escopo.
3. Incluido resumo de cota diaria consumida/restante e disponibilidade atual de tokens do rate limiter.
4. Exposta rota interna `/internal/scheduler/crypto-metrics` no modulo system usando contrato padrao de resposta.

## Prevencao

1. Toda nova rotina de scheduler deve expor metrica minima de execucao e falhas.
2. Monitorar quando `remaining` da cota diaria estiver abaixo de 20% para acionar modo economia.
3. Evitar inferencias de saude por logs manuais; usar endpoint interno como fonte padrao de observabilidade.
4. Alteracoes de estrutura de metrica devem gerar novo ADR para manter historico de contrato interno.

## Impacto

1. Diagnostico mais rapido de gargalos e regressao de sincronizacao.
2. Melhor previsibilidade de custo no free tier.
3. Base pronta para exportar metricas a ferramentas externas sem alterar o fluxo de jobs.