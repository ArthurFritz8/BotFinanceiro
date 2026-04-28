# ADR-118 - Onda 1 de hardening institucional do Intelligence Desk (epoch, fail-honest, registry, badge mock, coalescing)

- Status: Aceito
- Data: 2026-04-27
- Personas ativas: Arquiteto Staff CTO + Lead Quant Hedge Fund (modo READ-ONLY institucional), Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A auditoria arquitetural senior do Intelligence Desk (Chart Lab Pro) identificou cinco classes de risco institucional que precisavam ser tratadas antes de qualquer expansao de funcionalidade (CVD, Order Book L2, funding, on-chain, etc.):

1. **Race condition silenciosa no `chartLabStore.snapshot`**: o snapshot e compartilhado entre as 12 abas (Resumo, Tecnica, SMC, Harmonicos, WEGD, Probabilistica, Micro-Timing, Calculadora, Risco, Timing, Visual IA, Noticias). Como `setSnapshot()` e disparado por chart load, live stream tick e sync manual sem versionamento, um render iniciado para o ativo A pode terminar lendo dados ja substituidos pelo ativo B - gerando confluencia mista sem erro visivel.
2. **Win rate fabricado com amostra insuficiente**: `summarizeExecutionJournal` retornava `winRate: 0` e era renderizado como "100.0%" no card "Win rate ghost" quando havia 1 vitoria em 1 trade (consumer em `main.js` checava `resolved > 0`). Isso induz o operador a martingale - exatamente o anti-padrao que outros KPIs do projeto ja tratam com a convencao "Aquecendo (N/5)".
3. **Caches por aba nao invalidados em troca de ativo**: `newsIntelligencePayload`, `marketNavigatorViewCache` e a chave `WEGD_SUBTAB_PERSISTENCE_KEY` permaneciam validos apos troca de ativo/broker. O modulo `chart-asset-context-reset` aceitava callbacks por chamada, mas exigia que o orquestrador (`main.js`, 20k+ linhas) conhecesse cada lista - acoplamento fragil.
4. **Mock indistinguivel de feed real**: `live-signals.js` cai automaticamente em `generateMockSignals()` quando o backend nao expoe `/v1/live-signals/feed`. O status pill mostrava "Radar degradado" - texto ambiguo que o operador podia interpretar como "feed real intermitente". Sem badge visual, o operador podia treinar viés contra dados sinteticos.
5. **Chamadas duplicadas para o mesmo endpoint**: `loadChart`, `syncIntelligenceDeskForCurrentContext` e `requestMemecoinRadar` podiam ser disparados em paralelo (clique rapido, troca de broker concorrente, auto-refresh + manual refresh) sem coalescing, gerando carga redundante e risco de respostas fora de ordem.

## Decisao

### 1. Snapshot epoch e selection epoch monotonicos no `chart-lab-store`

O store passa a expor `getSnapshotEpoch()` e `getSelectionEpoch()`. Cada `setSnapshot()` incrementa `snapshotEpoch` (mesmo quando o snapshot e identico ou `null`, pois o ato de re-set sinaliza intencao de invalidar derivados). Cada `patchSelection()` incrementa `selectionEpoch` apenas quando algum campo muda de fato, evitando ruido em patches no-op.

Renderizadores de abas e calculos pesados podem capturar o epoch antes do trabalho e abortar/descartar resultados quando o epoch muda durante o calculo - eliminando a race condition sem custo de lock.

Implementacao principal em:

1. `apps/web/src/modules/chart-lab/chart-lab-store.js`

### 2. Fail-honest no `summarizeExecutionJournal`

`winRate` agora retorna `null` (e nao `0`) quando `resolved < EXECUTION_JOURNAL_MIN_RESOLVED_FOR_WIN_RATE = 5`. O resumo passa a expor `minResolvedForWinRate` para que consumidores ajustem o label. O threshold de `sampleState = "Robusto"` foi elevado de 20 para `EXECUTION_JOURNAL_ROBUST_SAMPLE_THRESHOLD = 30` (alinhamento estatistico classico).

O painel `renderTimingExecutionJournalPanel` em `apps/web/src/main.js` foi atualizado para checar `summary.winRate !== null` e renderizar `"Aquecendo · N/5"` em vez de uma porcentagem enganosa.

Implementacao principal em:

1. `apps/web/src/modules/chart-lab/quant/execution-journal.js`
2. `apps/web/src/main.js` (`renderTimingExecutionJournalPanel`)

### 3. Registry global no `chart-asset-context-reset`

Novas exportacoes:
- `registerAssetContextResetHandler(handler)`: handler global recebe `{ next, previous, reason }` em toda mudanca de contexto detectada. Retorna funcao de unregister.
- `clearAssetContextResetHandlers()`: util para teardown em testes.
- `getAssetContextResetHandlerCount()`: introspecao.

`resetChartAssetContext` agora dispara o registry global apos os callbacks por-chamada, isolado em try/catch para que um handler com bug nao derrube o pipeline (warning silencioso). Modulos como `news-intelligence`, `market-navigator` e `wegd subtab persistence` podem se inscrever uma vez na inicializacao para invalidar seus proprios caches sem que o orquestrador conheca a lista.

Implementacao principal em:

1. `apps/web/src/modules/chart-lab/chart-asset-context-reset.js`

### 4. Badge MOCK explicito no `live-signals`

O modulo passa a propagar a origem dos dados (`mock` | `real`) para os atributos `data-source` no `#live-signals-stage` e `#live-signals-feed`. O texto do status pill mudou de "Radar degradado" para "Radar simulado (sem feed real)". O CSS adiciona uma faixa amarela acima do feed com o texto `● SIMULAÇÃO — feed real ainda não conectado` quando `data-source="mock"`.

Implementacao principal em:

1. `apps/web/src/live-signals.js`
2. `apps/web/src/styles.css`

### 5. Helper de coalescing `createCoalescer`

Novo modulo `apps/web/src/shared/coalesce.js` exporta `createCoalescer()` (factory isolavel para testes) e `sharedCoalescer` (instancia conveniencia). API:
- `run(key, fn)`: se ja existe promise pendente com a chave, reusa; caso contrario chama `fn()` sincronicamente e armazena ate settlement.
- `inFlight(key)`, `clear(key?)`, `size()`.

A chamada de `fn()` e sincrona (nao envolvida em microtask) para que side-effects sejam observaveis imediatamente pelo caller. O cleanup em `finally` so remove a entrada se ainda for a mesma promise (paranoia contra `clear()` concorrente). Helper nao cancela requests - AbortController fica a cargo do caller.

Implementacao principal em:

1. `apps/web/src/shared/coalesce.js`

### 6. Cobertura de testes

Adicoes:
- `apps/web/tests/chart-lab-store.test.mjs`: testes para `snapshotEpoch` monotonico e `selectionEpoch` que so incrementa em mudanca real.
- `apps/web/tests/chart-lab-quant.test.mjs`: testes de fail-honest (`winRate === null` antes de 5 trades, ativacao em >= 5, `Robusto` so em >= 30).
- `apps/web/tests/chart-asset-context-reset.test.mjs`: testes de registry global (registro/desregistro, isolamento de erro de handler).
- `apps/web/tests/coalesce.test.mjs`: 7 testes cobrindo reuse, isolamento por chave, settlement, rejeicao, validacao e clear.

## Justificativa

- **Snapshot epoch** elimina classe inteira de bugs de inconsistencia entre abas com custo zero em runtime e sem mudanca de contrato (epoch e novo, callers existentes continuam funcionando).
- **Fail-honest** alinha o `executionJournal` ao padrao ja estabelecido em outros KPIs do projeto (Aquecendo / Moderado / Robusto) e protege o operador de ancoragem em estatisticas fabricadas.
- **Registry de invalidacao** quebra o acoplamento entre o orquestrador e a lista de caches, permitindo que cada modulo seja responsavel por sua propria invalidacao - consistente com o padrao de `Object.freeze` e single source of truth ja adotado no catalogo de ativos multi-broker.
- **Badge MOCK** segue a convencao de honestidade institucional: melhor o operador ver "SIMULACAO" claro do que treinar viés contra dados sinteticos.
- **Coalescing** prepara o terreno para a Onda 2 (CVD, Order Book, funding rate) onde request volume cresce significativamente.

## Consequencias

### Positivas

- Race condition de cross-tab eliminada por design (epoch).
- Win rate enganoso impossivel de aparecer (null em vez de 0).
- Modulos podem se inscrever para invalidacao sem tocar `main.js`.
- Operador identifica visualmente quando esta em modo simulado.
- Helper `coalesce` reusavel em qualquer modulo (Chart Lab, Market Navigator, Memecoin Radar).
- 147 testes do `apps/web` passando, 0 regressoes.

### Riscos / acompanhamentos

- Renderizadores de abas ainda nao consomem `snapshotEpoch` - a infra esta pronta, mas a integracao em cada `renderInstitutional*Tab()` fica para a Onda 2.
- Modulos de cache (news, market-navigator, wegd subtab) ainda nao se registraram via `registerAssetContextResetHandler` - integracao incremental na Onda 2.
- O texto `Radar simulado` no `live-signals` nao bloqueia operacao real (live-signals e analitico, nao executor); badge serve como aviso, nao gate.

## Plano de Onda 2 (proximas iteracoes - nao implementadas neste ADR)

Onda 2 - Ingestao institucional (CVD, Order Book L2 proxy, funding rate, OI, liquidations via Coinglass free, macro calendar via TradingEconomics free).
Onda 3 - Diferenciais (Bayesian Confluence Calibrator, Strategy Replay/Time-Travel Debugger, quebra do God Object `main.js`).

## Referencias

- ADR-082 (PAPER_TRADING_OPERATOR_BREAKER_FAILURE_THRESHOLD)
- ADR-110 (calibracao micro-timing)
- ADR-117 (hardening contexto Copilot)
- ADR-080 (Live Signals Screener)
