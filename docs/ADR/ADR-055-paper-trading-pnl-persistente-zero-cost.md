# ADR-055 — Paper Trading com PnL persistente local (zero-cost)

- Status: Aceito
- Data: 2026-04-18
- Wave: 15

## Contexto

O BotFinanceiro precisa demonstrar valor concreto e mensurável dos sinais de
confluência (Intelligence Desk 360 + binary options + análise SMC) **antes**
do usuário comprometer capital real. O caminho idiomático para isso é **paper
trading**: cada sinal forte vira uma "entrada virtual" e o sistema rastreia
fechamento contra alvo / stop, gerando estatísticas agregadas (winrate,
profit factor, max drawdown, equity curve).

A restrição inegociável do projeto é **zero custo operacional**: não pode
exigir banco gerenciado, broker externo, fila distribuída, container extra
ou qualquer SaaS pago. O dado precisa ser persistido localmente e
recuperável após restart.

## Decisão

Implementar um módulo `paper_trading` em Clean Architecture
(`apps/api/src/modules/paper_trading/`) com:

1. **Domain** (`paper-trading-types.ts`): schemas Zod para `Trade`,
   `OpenTradeInput`, `EvaluatePriceInput`, `PaperTradingStats`.
   Refinement no schema de input garante invariantes geométricas
   (long: stop < entry < target; short: invertido). Helper `computePnlPercent`
   centraliza fórmula de PnL em percentual relativo (independente de capital).

2. **Infrastructure** (`jsonl-trade-store.ts`): persistência **append-only
   JSONL** em arquivo local (default `apps/api/data/paper-trading.jsonl`,
   override via `PAPER_TRADING_DATA_FILE`). Cada upsert escreve uma linha
   completa serializada. No boot, replay sequencial reconstrói estado por
   "última versão por id vence" (LWW). Vantagens: zero dependência nativa,
   recuperação de histórico completo, atomicidade por linha. Limitação: O(N)
   no boot e single-process apenas — aceitável para milhares de trades/dia.

3. **Application** (`paper-trading-service.ts`):
   - `openTrade(input)` valida via Zod, gera UUID, persiste com status=open;
   - `evaluatePrice({ asset, price })` itera trades abertos do ativo e
     fecha como `win` (preço atinge target) ou `loss` (preço atinge stop);
     modelo simplificado: execução assumida ao preço exato (sem slippage,
     sem gap) — conservador para projeção de paper trading;
   - `computeStats()` agrega winrate, profit factor (sumWins / sumLosses
     em valor absoluto), avg win/loss, total PnL, max drawdown
     (peak-to-trough da equity curve cumulativa) e a equity curve completa.

4. **Interface** (`paper-trading-controller.ts` + `paper-trading-routes.ts`):
   - **Públicas** (`/v1`): `GET /paper-trading/trades`, `GET /paper-trading/stats`
     — read-only, seguras por desenho.
   - **Internas** (gated por `assertInternalRouteAuth` — ADR-007/008):
     `POST /internal/paper-trading/trades`, `POST /internal/paper-trading/evaluate`
     — apenas o scheduler interno (ou operador via curl) abre trades e
     dispara reavaliação contra preço corrente.

5. **Frontend**: novo route `paper` (sidebar nav) + painel
   `#paper-trading-panel` que faz fetch de stats e trades a cada 30s,
   renderizando 4 métricas (Trades, Win Rate, Profit Factor, PnL/DD) e
   tabela com últimos 10 trades. Failure-open: erro de rede silencioso.

## Alternativas consideradas

- **SQLite (`better-sqlite3`)**: rejeitado por adicionar dependência nativa
  com binários pré-compilados (risco de quebra no Windows + bump de install
  time). JSONL atende o volume previsto sem complexidade extra.
- **Reusar Postgres existente**: rejeitado porque exige Postgres rodando
  (contraria mandato zero-cost local) e força operações I/O assíncronas
  num módulo que se beneficia de leitura síncrona.
- **In-memory only**: rejeitado por perder histórico no restart.

## Consequências

- **Positivas**: zero dependência nova, persistência auditável (JSONL é
  legível), histórico completo recuperável (event-sourcing simplificado),
  encaixa naturalmente nos pipelines existentes (Intelligence Desk gera o
  sinal → scheduler chama `POST /internal/paper-trading/trades` → cron
  reavalia a cada tick com `POST /internal/paper-trading/evaluate`).
- **Negativas**: performance degrada linearmente após dezenas de milhares
  de trades; concorrência multi-process exige migração para SQLite/Postgres.
- **Migração futura**: contrato `JsonlTradeStore` é uma classe simples
  (upsert/list); trocar implementação para SQLite-backed é local — basta
  honrar a mesma API pública.

## Integração com outros ADRs

- ADR-007/008: rotas `/internal/paper-trading/*` herdam autenticação e
  whitelist de IP.
- ADR-054 (Web Push): integração futura (Wave 16+) — auto-broadcast quando
  trade fecha.
- ADR-006 (Observabilidade): métricas Prometheus podem expor counters
  `paper_trading_trades_opened_total`, `_closed_total{outcome}` no futuro.
