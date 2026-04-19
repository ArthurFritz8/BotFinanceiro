# ADR-060 — Backtest comparativo multi-estrategia (Wave 20)

## Status
Aceito · 2026-04-19 (Wave 20, sucessor do ADR-059)

## Contexto
ADRs 057-059 entregaram engine + 3 estrategias (`ema_crossover`, `rsi_mean_reversion`, `smc_confluence`) acessiveis individualmente via `POST /v1/backtesting/run-asset`. Para responder "qual estrategia bate mais nesse mercado?" o usuario precisava:

1. Disparar 3 requests separados.
2. Mentalmente correlacionar resultados (ranges, candle counts e fetched-at podem divergir entre chamadas → comparacao injusta).
3. Construir tabela diff manualmente.

Custos colaterais: 3x latencia de exchange publica, 3x rate-limit consumido, possivel inconsistencia entre snapshots (chart muda entre fetches).

## Decisao
1. **Novo metodo** `BacktestingService.compareForAsset(req)`: aceita `strategies: [{strategy, emaParams?, rsiParams?, smcParams?}, ...]` (1..5), busca chart UMA vez via `MultiExchangeMarketDataAdapter` e itera engine por estrategia.
2. **Refatoracao interna**: extracao do mapping chart → Candle[] em `BacktestingService.fetchCandles(asset, broker, range)` privado, reusado por `runForAsset` e `compareForAsset` (DRY).
3. **Schema novo** `backtestCompareAssetRequestSchema`: cap de 5 estrategias por request (prevenir abuso CPU). `commissionPercent`, `slippagePercent`, `cooldownCandles` aplicados igualmente a TODAS — comparacao justa exige mesmas premissas.
4. **Result shape** `BacktestCompareAssetResult`: `{asset, broker, range, candleCount, firstTMs, lastTMs, results: BacktestRunResult[]}` — ordem preservada do request.
5. **Rota nova** `POST /v1/backtesting/compare-asset` (publica, rate-limited ADR-050). Rota interna nao replicada (fora do escopo da Wave).
6. **UI**: checkbox "Modo comparacao" no painel de backtest. Quando ativo:
   - Submit envia para `compare-asset` com TODAS as 3 estrategias (defaults).
   - Render trocado para tabela com 1 linha por estrategia (Trades, Win Rate, Profit Factor, PnL, Max DD).
   - Vencedor de cada metrica destacado em verde (`backtesting__cell--winner`).

## Invariantes
- Chart e fetched UMA vez por request → comparacao justa, snapshot identico.
- Todas as estrategias compartilham mesmas premissas de custo (commission/slippage/cooldown).
- Cap rigido de 1..5 estrategias por request via Zod schema.
- Resultado preserva ordem do array `strategies` do request (UI confia para indexacao).
- Rota publica ja gated por rate-limit (ADR-050) + Zod validation + cap 5 strategies.
- Backwards compat: `runForAsset`/`run-asset` continuam funcionando identicamente (refatoracao apenas extraiu fetchCandles em metodo privado).

## Alternativas rejeitadas
- **N chamadas paralelas client-side a `/run-asset`**: rejeitado por (a) snapshot inconsistente, (b) 3x rate-limit, (c) responsabilidade de "comparacao" deveria ser server-side para auditabilidade.
- **Worker pool / async em paralelo no servidor**: rejeitado para v1 — engine e CPU-bound puro, paralelo so faria sentido com worker_threads. Para 3-5 estrategias em ate 365 candles a latencia sequencial e <100ms.
- **Endpoint generico `/backtesting/batch` (varios assets)**: rejeitado — fora do escopo. Comparacao multi-asset deve ser Wave futura com agregacao especifica.
- **Retornar so `stats` (sem trades)**: rejeitado para preservar simetria com `runForAsset` (UI/clientes podem querer drill-down).

## Consequencias
- 1 request HTTP, 1 fetch de exchange, comparacao justa.
- Cap 5 limita CPU pico a ~5x o backtest individual (suportavel sem worker pool).
- 3 tests novos: fetch chart UMA vez (counting adapter), rejeita strategies vazio, propaga commission/slippage. Total 281/281.

## Referencias
- ADR-024 MultiExchangeMarketDataAdapter
- ADR-050 Rate limiting publico
- ADR-057 Backtesting engine v1
- ADR-058 Comissao + slippage + UI
- ADR-059 SMC Confluence strategy
