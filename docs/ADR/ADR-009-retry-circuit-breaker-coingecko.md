# ADR 009 - Retry e circuit breaker no provider CoinGecko

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Reduzir falhas transitórias e evitar tempestade de requisições em indisponibilidade da CoinGecko, mantendo comportamento resiliente em ambiente free tier.

## Contexto

O adapter de cotação spot realizava chamada única ao provider. Em cenários de timeout, 429 ou 5xx, havia risco de falha recorrente e pressão desnecessária sobre o provedor externo.

## Solucao

1. Implementado retry com backoff exponencial e jitter configurável por ambiente.
2. Implementado circuit breaker com limiar de falhas e janela de cooldown.
3. Chamadas bloqueadas por circuito aberto retornam erro controlado `COINGECKO_CIRCUIT_OPEN`.
4. Erros passaram a carregar sinalização de retryable para decisão consistente de nova tentativa.
5. Variáveis de ambiente adicionadas para ajuste fino sem alteração de código.

## Prevencao

1. Toda integração externa crítica deve aplicar timeout, retry e circuit breaker.
2. Ajustes de limiar e cooldown devem ser testados em staging antes de produção.
3. Monitorar aumento de `COINGECKO_CIRCUIT_OPEN` para detectar degradação do provider.
4. Em evento prolongado, operar com cache stale e modo economia do scheduler.

## Impacto

1. Menor sensibilidade a falhas transitórias de rede/provider.
2. Menor risco de burst em tentativas consecutivas durante incidentes.
3. Melhor previsibilidade de consumo de cota sob instabilidade externa.