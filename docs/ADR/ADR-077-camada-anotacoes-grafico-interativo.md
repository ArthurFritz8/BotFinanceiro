# ADR-077 — Camada de Anotações do Gráfico Interativo (Lightweight Charts)

- **Status:** Aceito
- **Data:** 2026-04-24
- **Escopo:** `apps/web` (gráfico interativo Insights IA — `lightweight-charts` v5.1.x)
- **Refs:** ADR-048 (Intelligence Desk 360°), ADR-068 (Ensemble Engine), ADR-070 (Velocímetro), ADR-071 (Detalhamento SMC), ADR-075 (Calculadora de Posição)

## Objetivo

Transformar a apresentação "crua" do gráfico interativo (`#chart-viewport`, `Lightweight Charts` v5.1.0) em um **plano de trade visual** institucional inspirado no padrão TradingView/Vortex: rótulos de preço sincronizados com a Calculadora (Entry/SL/TP), zonas SMC sombreadas (Order Block / Fair Value Gap), Position Tool de Risco/Retorno e R:R numérico embutido nos axis labels. Sem quebrar a renderização existente (`applyChartLevels`) e sem custo de runtime perceptível em pan/zoom (≥ 60 fps).

## Contexto

- O painel **"Visual IA"** (`label: "Visual IA"` em [main.js#L1605](../../apps/web/src/main.js#L1605)) **NÃO é um gráfico interativo** — é um screenshot PNG gerado pelo backend Vision (Gemini). Anotar via JS sobre `<img>` é anti-pattern (HTML sobre bitmap desalinha em qualquer resize/zoom). Anotações para "Visual IA" devem ser feitas no **prompt do backend**, não no front. Esta ADR cobre apenas o gráfico interativo Lightweight Charts (`Insights IA / Terminal interno`).
- A função `applyChartLevels(snapshot, enabled)` em [main.js#L16637](../../apps/web/src/main.js#L16637) já cria `priceLine` para `SUP, RES, ENT LO, ENT HI, STOP, TP1, TP2` mas com paleta inconsistente, sem R:R numérico, sem status de toques e sem caixas/zonas sombreadas.
- O Gemini (Arquiteto Socrático) propôs (1) Price Labels Entry/SL/TP coloridos; (2) Position Tool R:R sombreada; (3) Estilização de zonas OB/FVG com `opacity 0.15` + borda 1px + rótulo no canto; (4) limpeza de grid. Peer review crítico:
  - **VETO 1 — Lightweight Charts NÃO tem retângulo nativo.** Caixas (OB/FVG/Position Tool) exigem **Series Primitives** (`attachPrimitive`, ISeriesPrimitive da v5) com canvas próprio, OU SVG overlay. Veto à abordagem SVG: reflow custoso a cada `subscribeVisibleTimeRangeChange`. Adoção de **primitive nativo** (`paneViews().renderer().draw(target)` sobre `useBitmapCoordinateSpace`) — pintura no mesmo canvas do chart, zero reflow.
  - **VETO 2 — Anotar "Visual IA"** (PNG) via JS é anti-pattern. Excluído desta ADR.
  - **VETO 3 — Memory leak silencioso.** `applyChartLevels` é chamada em todo refresh do snapshot. Cada primitive precisa ser **detachado** no `clearChartPriceLines` / `destroyInteractiveChart` / `clearChartSurface`, senão acumulam ao infinito.
  - **VETO 4 — `priceFormat` precisa refletir os dígitos do ativo** (forex 5 casas, cripto variável); senão axis label trunca e induz erro de leitura.
  - **VETO 5 — Animar `opacity` das caixas viola `prefers-reduced-motion`.** Cores semi-transparentes são fixas (sem transição).
  - **Redundância parcial:** itens 1 e 4 do prompt original já estão 80% implementados — a ADR refina, não reescreve.
- Aprimoramentos proativos aprovados (todos selecionados pelo usuário):
  - **(A)** Linha vertical tracejada do candle de origem do OB/FVG até "Now".
  - **(B)** Status do nível: `Não testado` / `Testado` / `Mitigado` no `title` do `priceLine`.
  - **(C)** R:R numérico embutido no axis label do TP (`TP1 1.18400 (1:2.3)`) reusando `computeRiskReward()` em [main.js#L6760](../../apps/web/src/main.js#L6760).
  - **(D)** Toggle "Anotações ON/OFF" persistido em `localStorage` (`vortex:chart:annotations:v1`) — reaproveita o checkbox `#chart-overlay-levels` existente.
  - **(E)** Drawdown histórico do Ghost Tracker no card R:R quando disponível (graceful: badge "Coletando" se `< 5` trades resolvidos).
  - **(F)** CSS variables (`--anno-entry`, `--anno-sl`, `--anno-tp`, `--anno-ob-bull`, `--anno-ob-bear`, `--anno-fvg`, `--anno-rr-profit`, `--anno-rr-risk`) — Dark Premium consistente, fácil dar tema.

## Decisão

1. **Novo arquivo `apps/web/src/chart-zones-primitive.js`** exportando `PriceZonesPrimitive` (ISeriesPrimitive v5):
   - `attached({ chart, series })` armazena referências.
   - `paneViews()` retorna 1 view com renderer canvas que itera `this._zones` e desenha `ctx.fillRect()` semi-transparente + `ctx.strokeRect()` borda 1px + `ctx.fillText()` rótulo no canto superior esquerdo.
   - Conversão preço→y via `series.priceToCoordinate()`; range temporal: full-width visível (zonas SMC e Position Tool são "horizontais com extensão futura", padrão TradingView).
   - `setZones(zones)` + `updateAllViews()` para re-render leve.
   - `detached()` para cleanup explícito.
2. **Refinar `applyChartLevels(snapshot, enabled)` em main.js**:
   - Detectar `side` (buy/sell) via inferência: `tp1 > entry > sl` → `buy`; senão `sell`.
   - Para cada `priceLine` de TP, computar R:R via `computeRiskReward()` e embutir no `title` (ex.: `"TP1 (1:2.3)"`).
   - Status de toques no SUP/RES/OB: comparar `currentPrice` com `level` para classificar `Mitigado` / `Testado` / `Não testado`.
   - Anexar `PriceZonesPrimitive` ao `chartBaseSeries` com zonas:
     - Zona Entry (entryZoneLow ↔ entryZoneHigh, azul `--anno-entry` com borda).
     - Zona Lucro (entry ↔ TP2, verde `--anno-rr-profit`).
     - Zona Risco (entry ↔ SL, vermelho `--anno-rr-risk`).
     - Zonas FVG (low ↔ high, amarelo `--anno-fvg`) quando `fairValueGapActive`.
     - Zonas OB ativas (level ± 0.05% como faixa estreita) extraídas de `marketStructure` (swing high/low + previous swings).
   - Cada zona com label `OB H1` / `FVG M15` / `R:R 1:3.2` (timeframe vem de `chartCurrentInterval`).
3. **Detach explícito** do primitive em `clearChartPriceLines`, `clearChartSurface`, `destroyInteractiveChart` e quando `enabled = false`.
4. **Persistência localStorage** do toggle `#chart-overlay-levels` em `vortex:chart:annotations:v1` — hidratação síncrona no boot (sanitização contra valor inválido) + escrita no `change` listener (não precisa debounce — 1 click = 1 write).
5. **CSS variables** em `apps/web/src/styles.css` (cores Dark Premium institucionais) + `@media (prefers-reduced-motion: reduce)` neutralizando qualquer transition em `.toggle-chip`.
6. Atualizar `clearChartPriceLines()` para também detachar primitive (renomear conceito para `clearChartAnnotations()` mantendo backward compatibility do nome antigo via aliás).

## Consequências

### Positivas
- Plano de trade **lido em 1 segundo** sem ter que consultar abas (Calculadora, SMC, Probabilística).
- Zero reflow em pan/zoom: pintura no canvas do próprio chart.
- Reaproveita `computeRiskReward` e dados já calculados em `marketStructure` — sem novo backend.
- CSS vars permitem temizar (claro/escuro/HUD vermelho) sem tocar JS.
- Persistência respeita preferência por sessão.
- `prefers-reduced-motion` respeitado (sem opacity transitions).

### Negativas / Trade-offs
- **Custom primitive** adiciona ~150 linhas de código pintura. Mitigado: arquivo isolado e simples (paneViews retorna 1 renderer).
- Não cobre o painel "Visual IA" (PNG). Trade-off aceito — anotação Vision é trabalho de prompt (futura ADR dedicada, se necessário).
- Caixas estendem-se à largura visível inteira (não delimitam o candle de origem da zona). Mitigação parcial via "(A) linha vertical ao candle de origem" desenhada pelo mesmo primitive.
- Drawdown Ghost Tracker exige snapshot histórico (`resolvedTrades`); fail-honest com badge "Coletando" se `< 5` trades.

## Definition of Done (Sênior)

- [x] Peer review honesto registrado (4 vetos + 6 aprimoramentos aprovados).
- [x] ADR sequencial (ADR-077) criada antes do código.
- [x] `chart-zones-primitive.js` isolado, testável, sem efeitos colaterais.
- [x] `applyChartLevels` refinado; `clearChartPriceLines` detacha primitive.
- [x] Persistência `vortex:chart:annotations:v1` hidratada no boot.
- [x] CSS vars semânticas + `prefers-reduced-motion`.
- [x] `npm run build` (apps/web) verde.
- [x] Commit Conventional Commits referenciando ADR-077.
- [x] Push para remote (etapa final).

## Referências

- Lightweight Charts v5 — Series Primitives (ISeriesPrimitive, paneViews, useBitmapCoordinateSpace).
- TradingView Position Tool — UI de referência para R:R sombreado.
- ADR-070 (Velocímetro de Confluência) — fonte do score que pode penalizar trade quando R:R < 1:1.5.
