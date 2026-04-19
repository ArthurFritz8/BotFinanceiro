# ADR-061 — Persistencia de historico + leaderboard de backtests (Wave 21)

## Status
Aceito · 2026-04-19 (Wave 21, sucessor do ADR-060)

## Contexto
ADR-060 entregou comparacao multi-estrategia side-by-side, mas cada rodada eh
volatil — ao navegar para outra rota ou recarregar, o usuario perdia a
memoria de "o que ja foi testado". Questoes nao respondidas:

- "Qual estrategia tem performado melhor em BTC ao longo do mes?"
- "Ja testei ETH 7d com RSI?"
- "Qual o PnL medio do SMC por ativo?"

Forca bruta (repetir compareForAsset toda vez) desperdica fetches e nao
da ranking global. UX de "portfolio de backtests" exige persistencia +
agregacao.

## Decisao

1. **Novo store** `JsonlBacktestRunStore` em `backtesting/infrastructure/`:
   reusa padrao do `JsonlTradeStore` (paper-trading) — JSONL append-only,
   load O(N) no boot, append O(1). Cap configuravel (default 500) com
   compactacao FIFO automatica ao ultrapassar.

2. **Shape leve** persistido (`BacktestHistoryEntry`): apenas metricas
   agregadas por estrategia (totalTrades, winRatePercent, profitFactor,
   totalPnlPercent, maxDrawdownPercent). NAO persistimos trades
   individuais — historico e leaderboard nao precisam de drill-down,
   arquivo fica enxuto (1 linha ≈ 200 bytes).

3. **Novo metodo** `BacktestingService.compareForAsset` passa a chamar
   `persistHistory()` internamente quando `historyStore` esta presente.
   Opcional (store injetado via options), mantendo o service testavel
   sem side-effect de filesystem. `clock` injetavel para determinismo em
   tests.

4. **Metodos novos**:
   - `listHistory(limit?)`: retorna entradas ordenadas por ranAtMs desc.
   - `computeLeaderboard()`: agrupa por `(asset, strategy)`, calcula
     medias aritmeticas simples (cada rodada conta igual), expoe
     `roundsCount`, `bestPnlPercent`, `worstPnlPercent`, `lastRanAtMs`.
     Ordenacao por `avgPnlPercent` descendente.

5. **Rotas publicas novas** (rate-limited ADR-050):
   - `GET /v1/backtesting/history?limit=N`
   - `GET /v1/backtesting/leaderboard`

6. **UI**: novas secoes logo abaixo do output atual do painel de
   backtest. Tabela de historico (20 ultimas rodadas, PnL por estrategia
   resumido) + leaderboard (top 30, ranking com PnL medio, WinRate medio,
   PF medio, melhor, pior, ultima rodada). Auto-refresh apos cada
   compareForAsset bem-sucedido + botao manual "Atualizar".

7. **Env vars**:
   - `BACKTESTING_HISTORY_DATA_FILE` (default `apps/api/data/backtesting-history.jsonl`)
   - `BACKTESTING_HISTORY_MAX_ENTRIES` (default 500)

## Invariantes
- Apenas `compareForAsset` (ADR-060) persiste. `runForAsset` (single
  strategy) NAO persiste — ruido evitado (casos exploratorios).
- Profit factor Infinity convertido para 0 na persistencia (JSON nao
  serializa Infinity de forma portavel).
- Leaderboard recomputado on-demand (O(N*M) onde N=rodadas, M=estrategias
  medias por rodada). Para 500 rodadas x 3 estrategias = 1500 ops,
  desprezivel. Nao ha cache intermediario.
- Store opcional: ausencia de `historyStore` no service faz `listHistory`
  e `computeLeaderboard` retornarem `[]` (tests podem rodar sem fs).
- Cap 500 + compactacao FIFO impede crescimento ilimitado do JSONL.
- `runForAsset` completamente intocado — backwards compat total com ADR-058/059/060.

## Alternativas rejeitadas
- **SQLite**: overkill para volume esperado (500 rodadas). Reuso do
  padrao JSONL mantem consistencia com paper-trading.
- **Cache em memoria**: perde-se no restart. Persistencia e requisito
  explicito para responder "qual estrategia bateu mais neste mes?".
- **Persistir trades individuais**: arquivo cresceria rapido (cada trade
  ~300 bytes x centenas por rodada), sem ganho — drill-down de trades
  ainda disponivel em tempo real no compareForAsset.
- **Endpoint unico `/history-with-leaderboard`**: rejeitado — `GET`s
  separados sao cacheaveis independentemente e a UI pode refrescar
  apenas um lado.

## Consequencias
- Loop fechado "memoria longa de backtests + ranking global por ativo".
- 3 tests novos (persiste single round; leaderboard agrega 2 rodadas BTC
  + 1 rodada ETH com buckets corretos; store ausente retorna vazios).
  Total 284/284.
- Custo adicional por compareForAsset: 1 writeFile + 1 append (O(1)).
- Superficie de rota publica cresceu em 2 GETs, ambos idempotentes e
  read-only (rate-limit ja cobre).

## Referencias
- ADR-043 JsonlTradeStore (paper-trading)
- ADR-050 Rate limiting publico
- ADR-057..060 Backtesting evolucao
