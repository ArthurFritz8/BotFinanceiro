# ADR-045 — Coinbase 24h via `/stats` + supressão de banner "Stream com oscilacao" em recovery rápido

## Objetivo

Eliminar dois ruídos recorrentes percebidos no Chart Lab:
1. **"24h n/d"** sempre que o provider resolvido é Coinbase, mesmo com sistema saudável.
2. **"Stream com oscilacao: Provedor de mercado indisponivel no momento. Failover automatico ativado."** disparado por blips transitórios que se recuperam imediatamente, gerando alarme falso.

## Contexto

Auditoria observacional do operador relatou repetidas exibições da legenda
"… cache refreshed • refresh 5s • 24h n/d • vol 15.368,79 USD • fallback
operacional ativo …" e do banner de oscilação durante operação normal.

### Causa raiz #1 — Coinbase ticker não retorna `open`

`apps/api/src/integrations/market_data/multi-exchange-market-data-adapter.ts#getCoinbaseTicker`
chamava apenas `https://api.exchange.coinbase.com/products/{pair}/ticker`,
endpoint que devolve `price`, `volume`, `bid`, `ask`, `time` — mas **não**
`open`. Resultado: `openPrice = null` →
`computeChangePercent(lastPrice, null) = null` → frontend renderiza
`"24h n/d"`. **Não era falha de rede, era endpoint errado.**

A API pública Coinbase expõe `open`, `high`, `low`, `last` 24h em
`https://api.exchange.coinbase.com/products/{pair}/stats` (sem custo
adicional, sem auth, mesmo rate-limit do `/ticker`).

### Causa raiz #2 — banner síncrono em qualquer `stream-error`

`apps/web/src/main.js` no listener `stream-error` chamava
`setChartLegendTransient(...)` imediatamente. Apesar do debounce de 8 s para
mensagem repetida, blips de 1-2 s seguidos de snapshot bem-sucedido ainda
exibiam o banner uma vez antes da recuperação. Para o operador, isso é
"oscilação visual constante" mesmo quando o failover SE recuperou e os dados
seguem chegando.

## Solução

### Backend — Coinbase `/stats` paralelo e degradação silenciosa
- `getCoinbaseTicker` agora dispara `/ticker` e `/stats` em paralelo via
  `Promise.all`, com `.catch(() => null)` no `/stats` para nunca bloquear o
  ticker (degradação silenciosa: se `/stats` cair, comportamento volta ao
  anterior — `changePercent24h` fica `null` apenas nesse caso de falha real).
- `openPrice` resolvido com prioridade: `stats.open` → `ticker.open` (legado,
  caso Coinbase venha a expor) → `null`.
- `volume24h` também tenta `stats.volume` antes do `ticker.volume` (mais
  preciso para janela 24h).

### Frontend — defer de 2.5 s + cancel em snapshot
- Constante `CHART_STREAM_ERROR_LEGEND_DEFER_MS = 2500`.
- Variável módulo-scope `chartStreamErrorLegendTimer = null`.
- Listener `stream-error`: agenda `setChartLegendTransient(...)` via
  `setTimeout` (em vez de chamar imediatamente) e guarda o handle.
- Listeners de `snapshot` bem-sucedido (binary e crypto) cancelam o timer
  com `clearTimeout`.
- `stopChartLiveStream()` também limpa o timer para não exibir banner sobre
  stream que já foi encerrada por mudança de contexto.

## Trade-offs

- ➕ Recovery em < 2.5 s passa a ser **silencioso** (sem flash de warn).
- ➕ Outage real (> 2.5 s sem snapshot) ainda exibe o banner, mantendo
  feedback honesto.
- ➕ Coinbase ganha `changePercent24h` real sem custo adicional na latência
  (`/ticker` e `/stats` em paralelo).
- ➖ Chamada extra ao Coinbase por refresh: dobra # requests para esse broker.
  Mitigação: cache 8s fresh / 20s stale (ADR-004) já reduz frequência;
  rate-limit Coinbase exchange é generoso (~10 req/s público).

## Cobertura de testes

- `apps/api/src/modules/crypto/interface/crypto-routes.test.ts` — caso novo
  "GET /v1/crypto/live-chart com exchange=coinbase usa /stats para preencher
  changePercent24h": valida que `/stats` é consultado e que
  `live.changePercent24h` retorna `number` válido.
- `apps/web/tests/smoke.test.mjs` — caso novo "Stream-error de chart live
  difere legenda transient para coalescer com snapshot rapido (recovery
  silencioso)" valida constantes/timer/cancel via regex.
- 214 api tests pass · 20 web tests pass · lint OK.

## Telemetria

- Resposta backend continua expondo `live.changePercent24h` para o frontend
  decidir entre `formatPercent(...)` ou `"24h n/d"`. Após esta ADR, o caminho
  "n/d" só ocorre se Coinbase `/stats` falhar (degradação consciente,
  observável via logs do `requestJson` em `multi-exchange-market-data-adapter.ts`).
- Frontend: ausência de banner em recovery rápido reduz volume de eventos no
  `setChartLegendTransient`. Não foi adicionado counter dedicado — o sinal
  "saudável" é a ausência da mensagem.
