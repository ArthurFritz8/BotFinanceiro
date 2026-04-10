# ADR 035 - Hardening do Market Navigator e stream de futures

- Data: 2026-04-10
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Aumentar desempenho, resiliencia e transparencia operacional no fluxo de cotacoes multi-mercado, com foco em market overview (equities/forex/crypto), futures e experiencia do usuario no Market Navigator.

## Contexto

A plataforma tinha melhorias relevantes em andamento, mas ainda havia lacunas praticas:

1. Sem cache curto em snapshots/overviews mais consultados, elevando custo de chamadas e latencia.
2. Futures dependia de polling REST para ticker, mesmo existindo stream nativo no provedor.
3. Falhas de provedor podiam aparecer como estado vazio no frontend sem mensagem explicita para o usuario.
4. Faltava endpoint interno dedicado para diagnostico do estado do stream de futures.
5. Em buscas de contratos no DexScreener, payload vazio nao tinha semantica de erro operacional clara para retry.

## Solucao

1. Cache in-memory com TTL para market overview:
- equities, forex e crypto agora usam cache com chave deterministica e TTL controlado por ambiente
- novo campo de telemetria funcional `fromCache` nos retornos relevantes
- logs de cache hit/miss para rastreabilidade

2. Hardening de busca DexScreener:
- payload vazio em consulta por contrato passa a gerar `WEB_SEARCH_EMPTY_RESULTS`
- erro marcado como retryable para aproveitar a politica de backoff

3. UX anti-silent-failure no Market Navigator:
- falha parcial/total de provedor agora gera status explicito
- meta e empty state exibem mensagem de reconexao em vez de tela silenciosa
- deteccao usa `failureCount` e itens com `status: error`

4. Migracao de ticker futures para WebSocket:
- adapter Binance Futures passa a consumir `!ticker@arr` com cache local
- reconexao automatica com backoff + jitter
- fallback REST para ticker quando stream estiver indisponivel ou stale
- premium index e open interest permanecem via REST para estabilidade do contrato

5. Observabilidade interna de stream futures:
- novo endpoint interno `GET /internal/health/streams/futures`
- payload inclui conectividade, cache, staleness, URL de stream e tentativas de reconnect
- cobertura de teste de integracao na camada de rotas internas

## Prevencao

1. Cache curto reduz chamadas desnecessarias e minimiza risco de rate limit em picos.
2. Stream + fallback diminui latencia media sem comprometer disponibilidade.
3. Mensagens explicitas no frontend evitam interpretacao errada de "sem dados" como ausencia de mercado.
4. Endpoint interno de stream melhora triagem de incidentes e monitora degradacao de conectividade.
5. Testes de integracao e regressao automatizada reduzem chance de quebra silenciosa.

## Impacto

1. Menor latencia percebida nas visoes de mercado mais usadas.
2. Melhor custo-beneficio operacional em provedores externos gratuitos.
3. Maior confianca do usuario em cenario de falha parcial de fonte.
4. Melhor capacidade de observabilidade para operacao de futures em producao.
5. Entrega alinhada ao padrao de resiliencia e governanca O.C.S.P. do projeto.
