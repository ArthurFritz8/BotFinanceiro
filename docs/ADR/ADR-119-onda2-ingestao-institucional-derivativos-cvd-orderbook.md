# ADR-119 - Onda 2 de ingestao institucional: derivativos perp, CVD e orderbook L2

- Status: Aceito
- Data: 2026-04-28
- Personas ativas: Arquiteto Staff CTO + Lead Quant Hedge Fund, Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

Apos a Onda 1 (ADR-118) corrigir os riscos sistemicos do Intelligence Desk (epoch, fail-honest, registry, badge mock, coalescing), o desk continuava cego para tres feeds que mesas profissionais de cripto consideram nao-negociaveis:

1. **Funding rate / Open Interest / Mark Price (perpetuos)**: principal sinal de pressao de leverage. Funding > +5 bps indica longs sobreestendidos pagando shorts (bias bearish curto prazo); funding < -5 bps indica shorts em panico (combustivel para short squeeze). OI absoluto + delta indicam construcao/desmonte de posicoes.
2. **CVD (Cumulative Volume Delta)**: delta entre volume agressor de compra e venda. E a metrica fundamental para detectar **absorcao** - quando preco nao se move apesar de buy pressure crescente (oferta institucional escondida). O calculo nativo do Binance Futures usa o flag `isBuyerMaker` em `/fapi/v1/aggTrades`: `isBuyerMaker=true` significa que o agressor foi o vendedor.
3. **Orderbook L2 / spread / liquidity imbalance**: bid/ask agregado por nivel para alimentar futuro heatmap de liquidez e calcular imbalance bruto `(bidLiq - askLiq) / (bidLiq + askLiq)` em [-1, +1].

A peer-review HFT (memoria persistente do projeto) **vetou** consumir Binance WebSocket diretamente do navegador para esses feeds (quebra circuit breaker, multiusuario, LGPD por chave API exposta). Solucao correta: REST proxy server-side com cache curto + degradacao stale.

Reuso identificado: `BinanceFuturesMarketDataAdapter.getContractSnapshot()` ja consumia `/fapi/v1/premiumIndex` e `/fapi/v1/openInterest` desde a base da plataforma, mas apenas para o "Terminal PRO" agregar derivativos no card de cotacao - sem endpoint REST proprio para o frontend nem agregacao em metricas institucionais (rateBps, interpretacao categorica, imbalance de liquidez).

## Decisao

Expandir o adapter Futures com dois metodos publicos novos e expor tres endpoints REST cache-first via novo service `CryptoDerivativesService`:

### 1. Adapter (`apps/api/src/integrations/market_data/binance-futures-market-data-adapter.ts`)

Adicionados schemas Zod estritos (`aggTradesArraySchema`, `depthSchema`) e dois metodos publicos:

- `getAggTrades({ symbol, limit })` -> `/fapi/v1/aggTrades` com `limit` clampado em [1, 1000], retorna trades parseados (`{ tradeId, price, quantity, timestamp, isBuyerMaker }`) ordenados por timestamp ASC. Falha com `BINANCE_FUTURES_SCHEMA_MISMATCH` em payload invalido.
- `getOrderbookDepth({ symbol, levels })` -> `/fapi/v1/depth` com `levels` em {5, 10, 20, 50, 100} (validacao ja na controller via Zod), retorna `{ bids, asks, lastUpdateId }` com niveis filtrados (descarta `quantity <= 0`).

Ambos reusam `requestJson` privado (mesmo timeout, mesma propagacao de `AppError`), `retryWithExponentialBackoff` (3 tentativas, baseDelay 200ms, jitter 20%) e `shouldRetryFuturesRequest` (5xx + 408/425/429 + erros transitorios). Princípio Arquiteto Socratico: **nao duplicar infraestrutura** ja madura, apenas estender superficie publica.

### 2. Service (`apps/api/src/modules/crypto/application/crypto-derivatives-service.ts` - NOVO)

`CryptoDerivativesService` orquestra cache + interpretacao + degradacao stale:

- **Cache em memoria por chave** com TTLs distintos por sensibilidade do dado:
  - Derivatives: `DERIVATIVES_TTL_MS = 10s` (funding/OI mudam lentamente).
  - CVD: `CVD_TTL_MS = 3s` (sensivel a fluxo recente).
  - Orderbook: `ORDERBOOK_TTL_MS = 5s` (snapshot, nao stream).
- **Stale tolerance**: `STALE_TOLERANCE_MS = 60s`. Se fresh fetch falha mas cache ainda esta dentro de 60s, retorna `cache.state="stale"` com `ageMs`. Sem cache valido, propaga `AppError`.
- **`getDerivatives({ assetId })`**: chama `getContractSnapshot()`, calcula `fundingPressure.rateBps = rate * 10000` e classifica em `interpretation: "neutral" | "long_pressure" | "short_pressure" | "extreme_long" | "extreme_short"` (thresholds em multiplos de 1bp: ±1bp e ±5bp).
- **`getCvd({ assetId, limit })`**: itera `aggTrades`, soma `buyVolume` (isBuyerMaker=false) e `sellVolume` (isBuyerMaker=true), retorna `cvd = buyVolume - sellVolume`, `buyRatio = buyVolume / total`, timestamps do primeiro/ultimo trade.
- **`getOrderbook({ assetId, levels })`**: agrega `bidLiquidity = Σ(price*qty)` e `askLiquidity` analogamente, calcula `imbalance` em [-1, 1], `spread.absolute` e `spread.relativeBps = (spread / bestAsk) * 10000`.

Resolucao de simbolo via `resolveBinanceSymbol(assetId)` (single source of truth do `asset-catalog`), garantindo paridade com o resto do modulo crypto.

### 3. Controller + Rotas (`apps/api/src/modules/crypto/interface/`)

Tres novos handlers (`getDerivatives`, `getCvd`, `getOrderbookDepth`) com schemas Zod (`derivativesQuerySchema`, `cvdQuerySchema`, `orderbookQuerySchema`) registrados em `crypto-routes.ts`:

- `GET /v1/crypto/derivatives?assetId=<id>` - default `bitcoin`.
- `GET /v1/crypto/cvd?assetId=<id>&limit=<50..1000>` - default `limit=500`.
- `GET /v1/crypto/orderbook-depth?assetId=<id>&levels=<5|10|20|50|100>` - default `levels=20`.

Resposta padrao do projeto: `buildSuccessResponse(request.id, data)`.

## Plano de validacao (DoD)

- [x] Service novo sem dependencia direta de `fetch`: testavel via mock de adapter ou mock de `globalThis.fetch` (path escolhido).
- [x] Suite `crypto-derivatives-routes.test.ts` (4 testes) cobrindo:
  - happy path derivatives com classificacao `extreme_long` em funding=6bps;
  - calculo CVD com fixture controlada (4 buys de 1 + 2 sells de 0.5 -> cvd=3, buyRatio=0.8);
  - orderbook com totals/spread/imbalance numericos esperados;
  - rejeicao 400 para `levels=37` (fora de {5,10,20,50,100}).
- [x] `npm run typecheck -w @botfinanceiro/api` verde.
- [x] `npm run lint -w @botfinanceiro/api -- --max-warnings=0` verde nos arquivos editados.

## Consequencias

- O frontend institucional ganha tres feeds que mesas profissionais consideram baseline para confluencia perp (funding bias, CVD absorcao, orderbook imbalance).
- Onda 3 podera plotar heatmap de liquidez (canvas) consumindo `/v1/crypto/orderbook-depth` com `levels=100`, e construir gauge de funding pressure consumindo `/v1/crypto/derivatives`.
- Latencia: cache curto (3-10s) absorve cliques rapidos do operador; ainda fresh o suficiente para HFT discreto a frame-rate de UI (humanos nao operam abaixo de ~200ms perceptivel).
- **Nao** consumimos WS browser-direct (peer-review HFT do projeto). Caso futuro precise de tick-by-tick, manter via WS server-side e republicar ao cliente via SSE existente.
- Macro calendar (FOMC/CPI/NFP gate) e heatmap canvas ficam para Onda 3 - exigem decisao de provider (TradingEconomics free tier vs scraping ForexFactory) e canvas pesado, fora do escopo deste hardening de ingestao.
