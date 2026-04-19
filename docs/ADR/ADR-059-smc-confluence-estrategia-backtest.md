# ADR-059 — SMC Confluence como 3a estrategia de backtest (Wave 19)

## Status
Aceito · 2026-04-19 (Wave 19, sucessor do ADR-058)

## Contexto
A Mesa Inteligente expoe analise SMC (Smart Money Concepts) viva via `crypto/application/crypto-chart-service.ts`, mas o backtest engine (Waves 17-18, ADRs 057-058) suportava apenas estrategias indicador-classico (`ema_crossover`, `rsi_mean_reversion`). Sem uma estrategia SMC backtestavel ficava impossivel:

1. Validar historicamente o win-rate dos sinais que a Mesa publica em producao.
2. Comparar SMC vs trend-following / mean-reversion no mesmo dataset.
3. Fechar o loop entre auto-paper-bridge (Wave 16, ADR-056) e validacao quantitativa.

O `crypto-chart-service.ts` opera sobre `CryptoChartPoint` (timestamp ISO, etc.) e produz scoreboard contextual (sessao + volatilidade), nao um `StrategySignal {side, entry, stop, target}`. Portar in-place exigiria refatorar dezenas de pontos da Mesa — risco alto.

## Decisao
1. **Extracao por duplicacao controlada** em `domain/smc-analyzer.ts`: novas primitives `detectSwingPoints`, `computeStructureSnapshot`, `computeSmcScore` operando sobre `Candle` (tipo do backtest). Replica a logica essencial de BOS detection com o mesmo `BOS_TOLERANCE = 0.0008` (0.08%) usado no servico cripto. NAO toca o `crypto-chart-service.ts` original — zero risco para a Mesa.
2. **Nova estrategia `smc_confluence`** em `domain/strategies.ts`:
   - Sinal long quando candle dispara BOS bullish + score >= `minScore`.
   - Stop = `lastSwingLow * (1 - stopBufferPercent)`.
   - Target = `entry + risk * riskRewardRatio` (R:R configuravel, default 2.0).
   - Short simetrico via `lastSwingHigh`.
   - Sem swing oposto valido = sem trade (sem stop natural).
3. **Schema novo** `smcConfluenceParamsSchema`: `lookAround` (1..10, default 2), `minScore` (0..100, default 70 → tier high), `stopBufferPercent` (0..10, default 0.2), `riskRewardRatio` (>0..20, default 2).
4. **Wire**: enum `strategyKindSchema` ganha `"smc_confluence"`; `backtestRunRequestSchema` ganha `smcParams`; engine dispatch + `BacktestingService.runForAsset` propagam.
5. **UI**: opcao adicionada ao select de estrategia em `apps/web/src/shared/backtesting-panel.js`.

## Invariantes
- Stop SEMPRE no swing oposto (long: low, short: high). Se nao houver swing confirmado antes do BOS → descarta sinal.
- Stop NUNCA pode estar do lado errado do entry: se `stop >= entry` (long) ou `stop <= entry` (short) → descarta sinal.
- Target NUNCA pode ser <= 0 (curto extremo) → descarta.
- `BOS_TOLERANCE` constante (0.08%) compartilhada com Mesa Inteligente, alinhando semantica de "rompimento valido".
- Backwards compat preservada: tests Waves 17-18 continuam intocados (272/272 → 278/278 com 6 novos).

## Alternativas rejeitadas
- **Mover SMC inteiro do crypto-chart-service para o backtesting** (refatoracao com extracao verdadeira): rejeitado por risco — Mesa Inteligente em producao com testes acoplados ao shape `CryptoChartPoint`. Migrar exigiria cirurgia em pelo menos 3 modulos. ADR explicitamente assume duplicacao temporaria.
- **Reusar `computeSmcConfluence` original via shim de tipo**: rejeitado porque exige sessao/volatilidade contextual (`CryptoMarketSession`, `CryptoTrend`) que nao tem analogo natural em `Candle` puro.
- **SMC com FVG e order blocks completos**: adiado — primeira iteracao foca em BOS + swing stop (cobre 70%+ do valor com 30% da complexidade).

## Consequencias
- Loop fechado: a mesma logica de BOS que dispara sinais na Mesa pode agora ser testada offline contra qualquer ativo + range zero-cost.
- Debt explicit: existe duplicacao SMC. Plano de consolidacao em Wave futura (extracao real apos Mesa estabilizar shape Candle-friendly).
- 6 tests novos em `application/smc-analyzer.test.ts` (swings, structure snapshot, score, strategy long/discard, end-to-end engine). Total 278/278.

## Referencias
- ADR-024 MultiExchangeMarketDataAdapter
- ADR-056 Auto Paper Trading Bridge
- ADR-057 Backtesting engine v1
- ADR-058 Comissao + slippage + UI
- `crypto/application/crypto-chart-service.ts` — fonte original do SMC analyzer
