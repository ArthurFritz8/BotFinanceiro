# ADR-050: Rate-limit publico nas rotas externas (OWASP A05 hardening)

- Status: Aceito
- Data: 2026-04-21
- Wave: 10

## Contexto

As rotas publicas (`/v1/crypto/*`, `/v1/equities/*`, etc.) estavam expostas
sem qualquer limite de requisicoes por IP. Apenas as rotas `/internal/*` ja
contavam com defesa em camadas via ADR-007 (token `x-internal-token`) e ADR-008
(whitelist opcional de IPs).

Em uma operacao single-node este vetor (OWASP A05 - Security Misconfiguration
e A04 - Insecure Design) permite:

- Esgotamento de cota CoinGecko/Yahoo via flood externo.
- Saturacao de CPU/loop de eventos por scraping abusivo.
- Negacao de servico de baixo custo (uma maquina basta).

Rate-limit baseado em Redis ainda nao faz parte do MVP single-node, mas o gap
basico precisa ser fechado imediatamente sem nova dependencia externa.

## Decisao

Implementar **rate-limit em memoria por IP** como `onRequest` plugin Fastify,
em janela fixa configuravel (default 240 req/min):

1. **Escopo**: apenas rotas publicas. O hook **pula** explicitamente:
   - Requests `OPTIONS` (pre-flight CORS).
   - Prefixos `/internal/*` e `/v1/internal/*` (ja gated por ADR-007/008).
2. **Bucket**: `Map<ip, { count, resetAtMs }>`. Reset on-demand quando a
   janela expira (sem timer per-bucket).
3. **Headers padrao** em **toda** resposta publica:
   - `X-RateLimit-Limit`
   - `X-RateLimit-Remaining`
   - `X-RateLimit-Reset` (epoch seconds)
4. **Resposta 429** quando excedido:
   - Header `Retry-After` (segundos).
   - Body `{ error: "too_many_requests", message, retryAfterSec }`.
   - Log estruturado `public_rate_limit_exceeded` com `ip`, `method`, `url`.
5. **Garbage collection** via `setInterval(5*60*1000).unref()`, removendo
   buckets cujo `resetAtMs` ja passou. `onClose` cancela o timer.
6. **Failure-open via flag**: `PUBLIC_RATE_LIMIT_ENABLED=false` desativa
   completamente (log `public_rate_limit_disabled`). Util em troubleshooting.

## Configuracao

Vars do `apps/api/src/shared/config/env.ts` (validadas com Zod):

| Var                              | Default | Range            |
| -------------------------------- | ------- | ---------------- |
| `PUBLIC_RATE_LIMIT_ENABLED`      | `true`  | boolean          |
| `PUBLIC_RATE_LIMIT_MAX_REQUESTS` | `240`   | 10..10000        |
| `PUBLIC_RATE_LIMIT_WINDOW_MS`    | `60000` | 1000..600000 ms  |

240 req/min cobre folgadamente uso humano (4 req/s) e dashboards normais,
mas detem floods triviais (>4x burst sustentado).

## Localizacao do codigo

- Plugin: `apps/api/src/main/plugins/public-rate-limit-plugin.ts`
- Wiring: `apps/api/src/main/app.ts` (apos `setErrorHandler`, antes do hook
  `onResponse` de metricas).
- Testes: `apps/api/src/main/plugins/public-rate-limit-plugin.test.ts`
  (4 casos: excede + headers, skip `/internal/*`, skip `OPTIONS`, no-op
  quando desabilitado).

## Consequencias

### Positivas

- Fecha gap OWASP A05/A04 sem nova dependencia.
- Headers padrao permitem clientes adaptarem backoff.
- Failure-open via flag preserva operabilidade em incidente.
- GC `unref()` nao impede shutdown limpo do processo.

### Negativas / limitacoes

- **Single-node only**: estado em memoria nao compartilha entre instancias.
  Em multi-node, o limite efetivo seria `MAX * N`. Aceitavel enquanto MVP
  roda uma instancia.
- Identificacao por `request.ip`: clientes atras de NAT compartilham bucket.
  Aceitavel como primeira camada (defesa em profundidade depois).
- Janela fixa sofre o "burst de borda" classico (2x no troco da janela).
  Aceitavel para MVP; sliding window/token bucket distribuido ficam para
  evolucao futura junto com Redis.

## Evolucao futura

- Backend Redis (`@fastify/rate-limit` com `redis` store) quando passar a
  multi-node.
- Tiers diferenciados por rota (ex: `/v1/crypto/chart` mais barato que
  `/v1/copilot/chat`).
- Whitelist de IPs internos confiaveis (parceiros, monitoramento) com bucket
  separado ou bypass.

## Referencias

- ADR-007: autenticacao das rotas internas.
- ADR-008: whitelist opcional de IPs internos.
- ADR-001: politica de degradacao de rate-limit (provider side).
- OWASP Top 10 2021: A04 Insecure Design, A05 Security Misconfiguration.
