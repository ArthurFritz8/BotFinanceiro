# ADR-058 — Backtesting publico com comissao + slippage e UI frontend (Wave 18)

## Status
Aceito · 2025-XX-XX (Wave 18, sucessor do ADR-057)

## Contexto
O ADR-057 entregou o modulo `apps/api/src/modules/backtesting/` com BacktestEngine puro (replay bar-a-bar) e estrategias canonicas (`ema_crossover`, `rsi_mean_reversion`), exposto APENAS via rota interna autenticada com candles inline no body. Limitacoes:

1. UX nao existia: o usuario precisava ter candles ja serializados para experimentar.
2. Sem custos de transacao a comparacao com a Mesa Inteligente (que projeta entradas reais) era enganosa.
3. Loop de feedback fechado: roadmap zero-cost prevê reuso da mesma chain de exchanges publicas (`MultiExchangeMarketDataAdapter`, ADR-024) para alimentar candles historicos.

## Decisao
1. **Engine — comissao + slippage realistas**:
   - `commissionPercent: number (0..5)` deduzido em CADA lado (entry + exit) do PnL → `netPnl = grossPnl - commissionPercent * 2`.
   - `slippagePercent: number (0..5)` aplicado no PIOR lado:
     - Long: entry `* (1 + slippage)`, exit `* (1 - slippage)`.
     - Short: entry `* (1 - slippage)`, exit `* (1 + slippage)`.
   - `outcome` agora baseado em `netPnl >= 0 ? "win" : "loss"` (substitui `stopHit`-based). Backwards-compat: defaults `0/0` mantem comportamento original.
2. **BacktestingService novo** (`application/backtesting-service.ts`): orquestra fetch de OHLC via `MultiExchangeMarketDataAdapter.getMarketChart({assetId, broker, range})` e delega ao engine. Mapeia `point.timestamp` (ISO string) para `Date.parse(...)` em `tMs`.
3. **Rota publica nova** `POST /v1/backtesting/run-asset` (sem candles inline, apenas `{asset, broker, range, strategy, commissionPercent, slippagePercent, ...}`). Rate-limit padrao publico (ADR-050) ja se aplica ao prefix `/v1`. Rota interna anterior (`/internal/backtesting/run`) preservada.
4. **UI frontend** (`apps/web/src/shared/backtesting-panel.js`, rota `#/backtesting`): formulario simples (asset, broker, range, strategy, commission, slippage, cooldown), botao Rodar, render de stats agregadas + ultimos 15 trades.

## Invariantes
- Slippage SEMPRE piora o pior lado (long gasta mais para entrar, recebe menos para sair; short oposto). Nunca melhora.
- Comissao deduzida 2 vezes (entrada + saida) — modelo conservador independente do tamanho da posicao.
- Defaults `commission=0, slippage=0` preservam todos os testes Wave 17 (267 passantes mantidos).
- Outcome `win`/`loss` baseado em PnL liquido pos-custos: trade que bateria target mas com fee maior vira `loss`.
- BacktestingService NUNCA expoe candles brutos no response — apenas o resultado do engine.

## Alternativas rejeitadas
- **Manter rota interna apenas**: rejeitado por bloquear UX; valor do backtest e o feedback rapido para o usuario.
- **Comissao como pos-processamento (depois de outcome decidido)**: rejeitado por gerar desalinhamento entre `outcome` e `pnlPercent` (`win` com PnL negativo).
- **Slippage proporcional ao volume**: rejeitado por exigir orderbook; modelo flat % e zero-cost e suficiente para v1.
- **Extrair SMC analyzer como 3a estrategia agora**: adiado para Wave 19 — exige refatoracao maior do `crypto-chart-service.ts`.

## Consequencias
- Mesa Inteligente, Paper Trading e Backtesting passam a falar a mesma linguagem (sinais com custos reais).
- Endpoint publico abre superficie de ataque marginal (mitigada por rate-limit ADR-050 + Zod validation + caps `0..5%`).
- 5 testes novos (`backtest-engine.test.ts`: 2; `backtesting-service.test.ts`: 3) → 272/272.

## Referencias
- ADR-024 MultiExchangeMarketDataAdapter
- ADR-050 Rate limiting publico
- ADR-055 Paper Trading
- ADR-057 Backtesting engine v1
