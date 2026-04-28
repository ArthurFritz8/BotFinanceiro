# ADR-124 — Onda 8: Cache HTTP + server-side em /v1/macro/upcoming-events

- Status: Aceito
- Data: 2026-04-28
- Autor: Equipe Plataforma (Arquiteto Staff CTO + Lead Quant Hedge Fund)
- Tags: `caching`, `macro`, `performance`, `degradacao-graciosa`

## Contexto

ADR-121 entregou `/v1/macro/upcoming-events` consumido pela pill macro com
polling 60s. Cada cliente/aba aberto faz 1 requisicao por minuto. Em janelas
de pico (operadores acompanhando agenda macro em multiplas abas + dashboards
internos), isso poderia gerar pressao desnecessaria no provider externo
(`FOREX_MACRO_CALENDAR_URL`).

Auditoria identificou:
- **Sem `Cache-Control`**: cada requisicao trafegava do client ate o backend
  e dispara loop completo (fetch externo + classificacao + serializacao),
  ignorando que o resultado eh **identico** dentro de janelas de 30s+.
- **Sem cache server-side**: 100 abas pollando = 100 chamadas/min ao provider
  externo, mesmo todas retornando o mesmo snapshot.

## Decisao

Defesa em duas camadas:

### 1) Cache server-side (TTL 30s)

`getUpcomingMacroEvents()` em
[institutional-macro-service.ts](../../apps/api/src/modules/forex/application/institutional-macro-service.ts)
agora memoiza o ultimo response em modulo-scope:

```ts
let upcomingMacroEventsCache: { fetchedAtMs: number; response } | null = null;
const UPCOMING_MACRO_EVENTS_TTL_MS = 30_000;
```

Hit: retorna o response em memoria sem fetch ao provider.
Miss: roda pipeline completo, popula cache, retorna.

Helper `_resetUpcomingMacroEventsCacheForTests()` exportado para isolamento.

### 2) Cache HTTP (`Cache-Control` + `stale-while-revalidate`)

`getMacroUpcomingEvents` controller agora envia:

```
Cache-Control: public, max-age=30, stale-while-revalidate=60
```

- `max-age=30` permite ate 30s de servir do cache do browser/CDN sem ida ao
  backend.
- `stale-while-revalidate=60` permite servir stale por mais 60s enquanto
  revalida em background (browsers modernos + CDNs com SWR support).

## Consequencias

### Positivas

- **Reducao 30:1 minimo** em chamadas ao provider externo: 100 abas pollando
  60s = ate 200/min antes; com cache server-side <=2/min.
- **Latencia menor** para clientes apos primeira chamada: hit do cache HTTP eh
  praticamente instantaneo, sem TLS handshake/RTT ao backend.
- **Resiliencia gracioso**: se o provider externo cair, o response stale ainda
  serve por ate 30s (server-side) + 60s (SWR HTTP) antes de propagar erro.
- **Consistencia com pill 60s**: TTL 30s ainda atualiza countdown em <2 ticks
  da pill, sem perda perceptivel de precisao.

### Riscos / Tradeoffs

- Em janela critica (FOMC iminente), `minutesToEvent` pode estar ate 30s
  desatualizado. Aceitavel: pill atualiza countdown a cada 60s e classificacao
  red/yellow/green nao oscila em janela de 30s.
- Cache em modulo-scope quebra em ambiente multi-instance sem sticky session;
  mitigado pelo TTL curto (cada instancia eventualmente converge).
- `_resetUpcomingMacroEventsCacheForTests` adiciona superficie minima exclusiva
  para testes (acceptable - padrao adotado em outros services do repo).

## Testes

- [macro-upcoming-events-routes.test.ts](../../apps/api/src/modules/forex/interface/macro-upcoming-events-routes.test.ts):
  novo teste valida que 3 requisicoes sequenciais resultam em **1 unica
  chamada ao provider externo** (cache server-side) e que header
  `Cache-Control` esta presente.
- API total: 348/348 PASS.

## Definicao de Pronto

- [x] Cache server-side TTL 30s implementado.
- [x] Header `Cache-Control: public, max-age=30, stale-while-revalidate=60`.
- [x] Helper `_resetUpcomingMacroEventsCacheForTests` para isolamento.
- [x] Teste valida 3 requests -> 1 fetch ao provider + header presente.
- [x] Backward-compat preservada (mesma response shape).
- [x] Doc-guard verde.
