# ADR 039 - ProviderChain generica com circuit breaker e telemetria

- Data: 2026-04-17
- Status: Aprovado (primitiva pronta, adocao em services programada para ADR posterior)
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Disponibilizar uma primitiva generica de cadeia de providers (primario + fallbacks) que respeite circuit breakers por provider e emita eventos de telemetria padronizados, de forma a padronizar o padrao "tenta A, depois B, depois C" que ja se repete em varios services (crypto spot price, crypto chart, multi-exchange live stream, etc.).

## Contexto

O backend ja conta com as primitivas:

- `CircuitBreaker` em `apps/api/src/shared/resilience/circuit-breaker.ts`.
- `retryWithExponentialBackoff` em `apps/api/src/shared/resilience/retry.ts`.

No entanto, o padrao de "tentar um provider apos o outro registrando erros e respeitando circuitos abertos" estava implementado ad-hoc em cada service, com variantes diferentes de:

- Ordem dos eventos de telemetria (quando contar sucesso, quando contar falha).
- Momento em que o circuit breaker e consultado.
- Formato dos erros acumulados ao esgotar a cadeia.
- Criterio de abort (erros nao-transientes vs transientes).

Consequencia: dificil garantir metricas coerentes e inspecionar fallback entre modulos.

## Solucao

1. Nova primitiva em `apps/api/src/shared/providers/provider-chain.ts`:
- `class ProviderChain<TInput, TValue>`
- `execute(input): { status:"success", providerName, value } | { status:"exhausted", errors:[{providerName,error}] }`

2. `ProviderChainOptions`:
- `providers: Provider<TInput,TValue>[]` (ordem e prioridade).
- `breakerByProvider?: Map<string, CircuitBreaker>` (opcional).
- `shouldAbortChain?: (error) => boolean` (erros nao-transientes interrompem a cadeia imediatamente).
- `telemetry?: { onEvent: (event) => void }`.

3. Eventos de telemetria emitidos:
- `attempt` - antes de chamar `execute` do provider.
- `success` - com `durationMs` quando retorna valor.
- `failure` - com `durationMs` e `error` quando lanca.
- `skipped_open_circuit` - quando o breaker do provider esta `open` e a tentativa e pulada.

4. Integracao com `CircuitBreaker`:
- Antes de cada tentativa, se houver breaker registrado para o `providerName` e `breaker.isOpen()` for verdadeiro, o provider e pulado.
- Sucesso chama `breaker.onSuccess()`; falha chama `breaker.onFailure()`.

5. Cobertura em `apps/api/src/shared/providers/provider-chain.test.ts`:
- Sucesso no primeiro provider curto-circuita a cadeia.
- Fallback ao segundo provider quando o primeiro lanca.
- `exhausted` acumulando erros quando todos falham.
- `skipped_open_circuit` quando o breaker do provider esta aberto.
- `shouldAbortChain` interrompe imediatamente a cadeia para erros nao-transientes.

6. Esta ADR cobre somente a primitiva e sua cobertura unitaria. A adocao pelos services reais (`CryptoSpotPriceService`, `MultiExchangeMarketDataAdapter`, `CoinGeckoMarketChartAdapter`, etc.) sera registrada em ADR dedicada quando ocorrer, para nao misturar "fundacao" com "aplicacao" em uma mesma auditoria.

## Prevencao

1. Novas cadeias de providers devem usar `ProviderChain` em vez de loops `for/try` ad-hoc.
2. Qualquer novo tipo de evento de telemetria deve ser adicionado explicitamente ao union `ProviderChainTelemetryEvent`, com teste correspondente.
3. `breakerByProvider` permanece opcional para permitir adocao gradual, mas services de producao devem sempre registrar um breaker por provider externo para nao descumprir ADR 009 (retry e circuit breaker CoinGecko) e ADR 010 (observabilidade).
4. Documentar em cada service que adotar quais providers sao consultados, em que ordem, e quais sao considerados nao-transientes (via `shouldAbortChain`).
