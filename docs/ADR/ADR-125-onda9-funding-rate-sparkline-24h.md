# ADR-125 — Onda 9: Sparkline de funding rate 24h no card institucional

**Status:** aceito
**Data:** 2026-04-28
**Contexto:** Onda 9 do plano "tudo nivel empresarial" (sequencia 1-14).

## Decisao

Adicionar serie historica de funding rate (24h por padrao) ao card institucional
de derivativos com mini-sparkline SVG inline (sem dependencia externa) e summary
estatistico (avg/min/max/latest/trend) calculado server-side.

Backend:
- `BinanceFuturesMarketDataAdapter.getFundingHistory({ symbol, limit })`
  consome `GET /fapi/v1/fundingRate` (Binance USD-M perpetuals) reusando
  `requestJson` + `retryWithExponentialBackoff` + `shouldRetryFuturesRequest`.
- `CryptoDerivativesService.getFundingHistory({ assetId, hours })` aplica
  cache server-side TTL 60s (alinhado com cadencia macro: funding muda apenas
  a cada 8h), filtra entries fora da janela `hours` e deriva `summary` com
  `trend` ∈ {up, down, flat, n/a} a partir de delta primeiro→ultimo > 0.5 bps.
- Endpoint `GET /v1/crypto/funding-history?assetId=&hours=` em
  `crypto-routes.ts` (default `bitcoin`/24h, ranges 8-168h).
- Header HTTP `Cache-Control: public, max-age=60, stale-while-revalidate=120`
  (espelha TTL server-side; cadencia funding 8h da margem ampla).
- Failure-tolerant com fallback `cache.state="stale"` ate 60s apos primeiro
  cache populado, igual ao restante do service de derivativos (ADR-119).

Frontend:
- Helper PURO `renderFundingSparkline(bpsValues, { width, height, stroke })`
  exportado de `institutional-derivatives-card.js`. Retorna string SVG inline
  com `viewBox` adaptativo, `path d="M... L..."` calculado a partir de min/max
  do array de bps. DOM-free e testavel sem jsdom.
- Funding cell expandida com `<div data-field="funding-sparkline">` + hint
  `"24h ↑/↓/→ ±X bps"` derivado de `summary.trend` + `summary.latestRateBps`.
- Fetch `/v1/crypto/funding-history` paralelo aos 3 feeds existentes via
  `Promise.allSettled`; falha NAO entra no `okCount/3` que mede feeds primarios
  (degrada silenciosamente: limpa sparkline e mostra "24h —").
- CSS dedicado: `.institutional-derivatives__sparkline` com altura 22px e
  cor `currentColor` que herda tone do cell (bull/bear/neutral) — bear
  (longs sobreestendidos) deixa traco vermelho, bull (shorts em panico) verde.

## Consequencias

Positivas:
- Operador ve evolucao do funding na mesma celula sem clicar em outra view.
- Trend categorizado (`up`/`down`/`flat`) reduz cognitive load: nao precisa
  ler 4 valores numericos para sentir momentum.
- Cache 60s server-side + Cache-Control 60s alivia provider externo: 100 abas
  pollando 60s antes => 100 fetch/min; agora <= 1 fetch/min ao Binance.
- Helper SVG puro e reusavel (poderemos plotar OI/CVD trend com mesmo helper).

Trade-offs:
- Sparkline com 3-4 pontos (funding 24h = 3 entries de 8h) e visualmente
  pequena. Aceitavel: alternativa seria reagregar artificialmente o que
  distorceria a metrica institucional. Para janelas maiores basta aumentar
  `?hours=` (ate 168h = 21 pontos).
- Adiciona 4o request paralelo no card. Mitigado por cache compartilhado
  (`sharedCoalescer`) + TTL HTTP 60s.

## Validacao

Backend: `crypto-derivatives-routes.test.ts` +1 teste `ADR-125: sparkline
funding history retorna pontos 24h + summary + Cache-Control 60s` (5 PASS
total). Cobertura:
- Filtra entry fora da janela 24h.
- Computa `latestRateBps`/`avgRateBps`/`trend="up"` corretamente.
- Cache hit em 2a chamada (1 fetch ao provider para 2 requests).
- Header HTTP correto.

Frontend: `institutional-derivatives-card.test.mjs` +4 testes para
`renderFundingSparkline` (path SVG, edge cases curto/null/NaN, range=0
achata em linha central) e `fundingTrendLabel` (formatacao seta + bps).
12 testes totais nesse arquivo (159/159 web suite).

Typecheck/lint API: 0 warnings. Doc-guard: OK.
