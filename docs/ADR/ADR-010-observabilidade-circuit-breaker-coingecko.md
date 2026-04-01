# ADR 010 - Observabilidade do circuit breaker da CoinGecko

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Disponibilizar o estado do circuit breaker da CoinGecko no endpoint interno de métricas para diagnóstico operacional rápido.

## Contexto

A integração com CoinGecko já possuía retry e circuit breaker, mas o estado do circuito não estava visível no snapshot interno do scheduler.

## Solucao

1. Incluído bloco `providers.coingecko.circuit` no snapshot de métricas do scheduler.
2. O bloco expõe estado atual (`closed`, `open`, `half_open`), contagem de falhas e próxima janela de tentativa.
3. O endpoint interno existente passou a entregar essa informação sem alterar contrato de rota pública.

## Prevencao

1. Alertar operação quando circuito permanecer aberto por janelas consecutivas.
2. Usar o snapshot como fonte de verdade para decisões de modo economia.
3. Repetir padrão para outros provedores externos no futuro.

## Impacto

1. Visibilidade direta de degradação do provider externo.
2. Menor tempo de diagnóstico em incidentes.
3. Melhor governança de custo e estabilidade em ambiente gratuito.