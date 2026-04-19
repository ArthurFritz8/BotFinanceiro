# ADR-057 — Backtesting Engine zero-cost (estrategias deterministicas + reuso de stats)

- Status: Aceito
- Data: 2026-04-19
- Wave: 17

## Contexto

O Paper Trading (ADR-055) e o Auto-Bridge (ADR-056) validam estrategias
**em tempo real**. Mas validar uma ideia de estrategia em tempo real
exige semanas de operacao para ter amostra estatisticamente
significativa — e cada hipotese descartada custa tempo. Backtesting
retroativo sobre OHLC historico permite validar/descartar ideias em
segundos, com zero custo de API (dados ja disponiveis via adapters
existentes Yahoo/CoinGecko/MultiExchange).

Sem isso, a unica forma de comparar duas variacoes de estrategia
(ex.: stop=2% vs stop=3%) e rodar paper trading em paralelo por dias.

## Decisao

### 1. BacktestEngine (pure replay, sem dependencias externas)

`apps/api/src/modules/backtesting/application/backtest-engine.ts`

- Recebe `BacktestRunRequest` com `candles` injetados (decoupled de
  qualquer fonte de mercado — testavel sem mock de fetch).
- Replay sequencial bar-a-bar: estrategia decide entry no fechamento do
  candle do sinal; stop/target avaliados a partir do **proximo** candle
  via `low <= stop` / `high >= target`.
- Conflict resolution intra-bar: se ambos forem tocados no mesmo candle,
  assume STOP (worst-case — nao temos tick data para resolver ordem).
- Cooldown configuravel (default 1 candle) impede re-entrada imediata.

### 2. Estrategias puras (auditaveis a olho nu)

`apps/api/src/modules/backtesting/domain/strategies.ts`

Duas estrategias canonicas para MVP:

- **EMA Crossover** (trend-following): long quando fast EMA cruza acima
  da slow; short quando cruza abaixo. Stop/target derivados em % do
  entry. Parametros default: fast=9, slow=21, SL=2%, TP=4%.
- **RSI Mean Reversion** (counter-trend): long quando RSI cruza para
  cima do oversold; short quando cruza para baixo do overbought.
  Default: period=14, oversold=30, overbought=70, SL=3%, TP=6%.

Funcoes `computeEma` e `computeRsi` (Wilder classico) sao puras: dado
o array de candles e endIndex, retornam o valor naquele ponto. Sem
estado externo — facil testar e provar correcao.

### 3. Reuso de `PaperTradingStats` (mesmo shape)

`computeStatsFromBacktestTrades` reproduz a logica de
`PaperTradingService.computeStats` (winrate, profit factor com Inf se
losses=0, avg win/loss, max drawdown peak-to-trough, equity curve)
para que o frontend possa renderizar resultados de backtest e paper
trading com o **mesmo componente**. Convergencia de UX entre validacao
historica e validacao live.

### 4. Rota interna

`POST /internal/backtesting/run` (gated ADR-007/008). Mantida interna
porque:

- Backtest e CPU-bound em arrays grandes (ate 20k candles) — protege
  contra abuso publico.
- E idempotente, sem efeito colateral persistente — seguro re-executar.

Alternativa rejeitada (rota publica com rate-limit dedicado): adia para
quando houver demanda de UI publica de backtest.

### 5. Env flag

```
BACKTESTING_ENABLED=true
```

Failure-open: `BACKTESTING_ENABLED=false` desabilita a rota mas nao
afeta paper trading nem auto-bridge.

## Alternativas consideradas

- **Replicar o SMC analyzer** (computeSmcConfluence/computeTradePlan)
  sobre candles historicos: rejeitado para MVP — o SMC analyzer e
  acoplado a indicadores de live (fetched cache, sessao atual) e exigiria
  refatoracao significativa para extrair pure functions. Estrategias
  classicas (EMA cross, RSI) ja entregam a primitiva "engine de
  backtest"; SMC backtest fica para Wave futura.
- **Engine event-driven (com tick data)**: rejeitado por exigir feed
  intra-bar inexistente nos adapters atuais. Modelo bar-a-bar com
  worst-case (STOP em conflito) e conservador e adequado.
- **Persistir resultados de backtest**: rejeitado para MVP — backtest e
  determinista, basta re-executar. Persistencia adiciona estado e
  pressao de IO sem ganho proporcional.

## Consequencias

- **Positivas**: validacao retroativa de estrategias em segundos; mesmo
  shape `PaperTradingStats` permite UI compartilhada; estrategias puras
  facilmente extensiveis (Bollinger, MACD divergence, etc.); zero
  dependencia adicional.
- **Negativas**: modelo bar-a-bar nao captura whipsaw intra-bar (real
  trading pode ter execucao diferente); estrategias ainda nao incluem
  comissao/slippage (proxima refinement quando integrarmos com paper
  trading historico).
- **Compatibilidade**: 100% backwards-compatible. Modulo isolado em
  `modules/backtesting/`. Sem migracao necessaria.

## Integracao futura

- **Wave 18**: extrair pure SMC analyzer e adicionar como terceira
  estrategia no backtest engine (`smc_confluence`).
- **Wave 19**: rota publica `/v1/backtesting/run` com rate-limit
  dedicado + UI no frontend (form para upload CSV ou seletor de ativo +
  range).
- **Wave 20**: comissao + slippage parametrizaveis via request.
