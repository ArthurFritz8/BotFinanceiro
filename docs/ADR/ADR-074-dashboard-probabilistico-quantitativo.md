# ADR-074 — Dashboard Probabilistico Quantitativo (Aba "Probabilistica" Institucional)

- Status: Aceito
- Data: 2026-04-23
- Autor: Engenheiro Full-Stack Senior + Arquiteto Quantitativo
- Refs: ADR-049 (Ghost Tracker), ADR-068 (Ensemble), ADR-070 (Velocimetro), ADR-073 (WEGD)

## O — Objetivo

Promover a aba "Probabilistica" do Intelligence Desk de uma renderizacao basica
(3 barras Compra/Venda/Neutro + 2 cartoes de cenario) para um dashboard
quantitativo institucional com:

- 3 KPIs Win Rate (Geral / Long / Short) auditados via Ghost Tracker.
- Estatisticas historicas honestas sobre a janela disponivel (Retorno
  cumulativo, Volatilidade anualizada, Sharpe Ratio, Max Drawdown).
- Simulacao de Monte Carlo (10.000 trajetorias) com banda P5/P50/P95 e
  nivel de confianca 90%.
- 3 cenarios probabilisticos (Alta / Neutro / Baixa) com alvos derivados.
- Sazonalidade mensal (Jan-Dez) com mediana Open->Close + win rate por mes,
  destacando o mes corrente.
- Metricas de risco quantitativas (VaR 95%, Expected Shortfall, Beta,
  Correlacao) com graceful degradation para "n/d" quando benchmark ausente.

## C — Contexto

A imagem de referencia fornecida pelo usuario evidencia o gap: a aba atual
renderiza apenas 5 elementos enquanto o alvo institucional possui 6 secoes
densas. Tarefas anteriores (SMC, Harmonicos, WEGD) eram refatoracao de
features ja existentes; aqui ha lacuna real de aproximadamente 90% do
conteudo. O peer review com o Gemini identificou tres anti-patterns na
proposta original:

1. "Padroes com taxa de acerto real" (Martelo/Engolfo/Doji) sem backtest
   auditado fabrica win rate -- viola a regra fail-honest ja estabelecida
   em ADR-049.
2. "Sazonalidade ultimos 30 dias / horario / dia da semana" exigiria
   detector de candles inexistente no frontend e produziria estatistica
   fraca; substituido por matriz mensal Jan-Dez (mediana Open->Close +
   win rate) que e estatisticamente robusta e visivelmente rica.
3. Skewness/Curtose com janela fixa de 1000 candles desconsidera que
   `snapshot.points` raramente atinge esse volume (depende do
   range/broker). Calculamos com a janela real e rotulamos como "N
   periodos" honestamente.

## S — Solucao

### Helpers quantitativos (apps/web/src/main.js)

- `computeReturnsSeries(points)`: retorno log-aritmico bar-a-bar.
- `computeProbabilisticStats(returns)`: retorno cumulativo, volatilidade
  anualizada (sqrt(252)), Sharpe (rf=0), Max Drawdown via running max.
- `computeRiskMetrics(returns)`: VaR 95% e Expected Shortfall via
  distribuicao empirica (percentil 5%, sem premissa gaussiana).
- `runMonteCarloProjection(lastClose, returns, simulations=10000,
  horizon=N)`: bootstrap dos retornos historicos com horizonte N
  (default = 0.25 * len). Retorna percentis P5, P50, P95 e nivel de
  confianca 90%.
- `computeMonthlySeasonality(points)`: agrupa por mes calendario,
  calcula mediana de retorno Open->Close e win rate por mes (12
  buckets). Marca o mes corrente.
- `computeProbabilisticScenarios(analysis)`: deriva targets das tres
  hipoteses (alta/neutro/baixa) reusando levels existentes em
  `analysis.scenarios` + bracket neutro = midprice.

### Renderizacao

- `renderInstitutionalProbabilisticTab(analysis, snapshot, currency)`:
  monta o HTML com IDs estaveis (`prob-winrate-overall`,
  `prob-stats-return`, `prob-mc-p50`, `prob-var-95`, etc.) para
  injecao via WebSocket sem re-render.
- Graceful Degradation: insuficiencia amostral (< 30 retornos) marca
  os campos como "—" + tooltip "Aquecendo".
- Win Rate Long/Short consulta Ghost Tracker persistido (ja existente)
  via reuso de `getBinaryOptionsGhostBackendStats()`. Sample state <
  5 trades resolvidos exibe label "Aquecendo (N/5)".
- Mes corrente em sazonalidade recebe classe `.prob-season-cell--current`
  (highlight ciano).

### CSS (apps/web/src/styles.css)

- `.prob-dashboard` grid 1 coluna em mobile, 2 em desktop.
- `.prob-kpi-row` topo com 3 cards Win Rate.
- `.prob-stats-grid`, `.prob-mc-bar`, `.prob-scenario-row`,
  `.prob-season-grid` (6x2), `.prob-risk-grid` (4 metricas).
- `tabular-nums` font-feature-settings em todos os valores numericos.
- `@media (prefers-reduced-motion: reduce)` neutraliza transicoes.

## P — Plano de implementacao

1. Adicionar helpers proximos a `runMonteCarloRiskSimulation` (ja
   existente para Calculadora) reusando `clampNumber`/`roundNumber`.
2. Substituir o bloco `if (activeAnalysisTabId === "probabilistica")`
   por `renderInstitutionalProbabilisticTab(...)`.
3. Adicionar bloco CSS dedicado em `apps/web/src/styles.css`
   (precedido de comentario de origem ADR-074).
4. Verificar lint e push.

## DoD

- [x] ADR-074 publicado.
- [x] Helpers determinanticos (Monte Carlo usa seed-less bootstrap; sem
      side-effects).
- [x] Graceful degradation para amostra insuficiente.
- [x] IDs estaveis para injecao WebSocket futura.
- [x] Sem fabricar win rate (Ghost Tracker auditado ou "Aquecendo").
- [x] `prefers-reduced-motion` honrado.
- [x] Conventional commit referenciando ADR-074.

## Atualizacao Fase 2 (mesmo ADR)

### Contexto
Peer review honesto identificou 6 lacunas vs prompt original do Gemini: header bipartido global, sazonalidade horaria + dia da semana (30 dias), padroes candle (Martelo/Engolfo/Doji), Skewness com vies textual, Curtose com alerta de caudas, tooltips educacionais.

### Decisao
Estender o `renderInstitutionalProbabilisticTab` mantendo todos os componentes da Fase 1 (KPIs, Stats, Monte Carlo, Cenarios, Sazonalidade Mensal, Risco) e adicionando:

1. **Header Probabilidade Direcional Global** — barra bipartida bull/bear com edge em pontos percentuais e neutro residual, IDs `prob-direction-bull`, `prob-direction-bear`, `prob-direction-edge`.
2. **Sazonalidade Horaria (24 cells UTC)** + **Dia da Semana (7 cells)** com janela de 30 dias, win rate por bucket, marcador de horario/dia atual. IDs `prob-season-hourly`, `prob-season-weekday`.
3. **Padroes de Candlestick** — detector heuristico para Martelo, Engolfo de Alta, Engolfo de Baixa, Doji. Taxa de acerto medida pela direcao do proximo candle (>=5 ocorrencias para ativar — graceful degradation honesto). ID `prob-candle-patterns`.
4. **Distribuicao de Retornos** — Volatilidade + Skewness com vies textual (Cauda direita/esquerda, Levemente positiva/negativa, Simetrica) + Curtose excess com alerta de caudas (Caudas MUITO gordas / gordas / normal / finas). IDs `prob-dist-skewness`, `prob-dist-skewness-bias`, `prob-dist-kurtosis`, `prob-dist-kurtosis-alert`.

### Honestidade & Graceful Degradation
- Skewness/Curtose exigem >=30 retornos (mesma constante `PROBABILISTIC_MIN_RETURNS_FOR_STATS`).
- Padroes candle exigem >=5 ocorrencias para exibir win rate (caso contrario: "—" + "Aquecendo").
- Sazonalidade horaria/semanal exige >=2 candles por bucket.
- Tooltips via `title=` + `cursor: help` no CSS expoem amostra/threshold sem poluir UI.
- Beta/Correlacao continuam "n/d" honesto sem benchmark.

### Acessibilidade
- `aria-label` em todas as secoes/barras.
- `role="img"` na barra direcional.
- `prefers-reduced-motion` neutraliza transitions de width e cells de sazonalidade.

### Referencia
- Commit Fase 1: `8b21841`
- Commit Fase 2: (este commit)
