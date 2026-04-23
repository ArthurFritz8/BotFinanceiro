# ADR-071 — Detalhamento SMC Institucional na aba "SMC"

- **Status:** Aceito
- **Data:** 2026-04-23
- **Escopo:** `apps/web` (Intelligence Desk · aba "SMC")
- **Refs:** ADR-048 (Intelligence Desk 360°), ADR-068 (Ensemble Engine), ADR-070 (Velocímetro de Confluência)

## Objetivo

Transformar a aba "SMC" do Intelligence Desk — que renderizava apenas três frases livres (`structure/liquidity/sweepRisk`) ou, quando havia payload `institutional`, dois cartões textuais Top‑Down 3×1 — num **terminal de auditoria SMC** com Estrutura (BOS/CHoCH + medidor Discount/Equilibrium/Premium), Order Blocks candidatos auditáveis, Fair Value Gap ativo com distância percentual e Monitor de Liquidez (BSL/SSL com flag de Sweep). Top‑Down 3×1 + Killzone preservados como drill‑down secundário (`<details>`). Padrão hedge fund: cores sóbrias, fontes mono para preços, dados 100% derivados de `snapshot.insights.marketStructure` — sem fabricação.

## Contexto

- A aba "SMC" anterior (`apps/web/src/main.js`, branch `if (activeAnalysisTabId === "smc")`) só exibia narrativa textual livre — nenhum sinal estrutural visualmente segmentado, nenhum medidor de zona D/E/P, nenhuma listagem auditável de OBs/FVG/liquidez. Isso descartava silenciosamente todo o payload rico que o backend já calcula em `crypto-chart-service.ts → CryptoMarketStructure`: `bias, bosSignal, chochSignal, fairValueGapActive/Bias/Lower/Upper, institutionalZone, lastSwingHigh/Low, previousSwingHigh/Low, liquiditySweepReferenceHigh/Low, liquiditySweepSignal, swingRangePercent`.
- O Gemini (Arquiteto SMC) propôs uma aba completa com lista de Order Blocks por preço, FVGs, Pools de Liquidez (Topos/Fundos Iguais) e badge "Sweep". Peer review vetou parte:
  - **VETO 1:** "Liste 5 OBs com preços" no estilo da concorrência — backend só expõe último swing high/low + swing prévio. Inventar 5 OBs seria fabricação. Solução honesta: derivar **2 OBs principais + 2 históricos** dos campos reais (`lastSwing*` + `previousSwing*`), com flag "Ativo/Mitigado/Pendente/Histórico" calculada cruzando `currentPrice` com o nível.
  - **VETO 2:** "Pools de Liquidez (Topos/Fundos Iguais)" — não detectamos equal highs/lows na engine atual. Substituído por **BSL/SSL** (`liquiditySweepReferenceHigh/Low`) que são os pools reais de stop-hunt institucional.
  - **VETO 3:** "Tailwind puro" — projeto usa CSS custom (`analysis-block`, `analysis-grid`, `data-tone`) com print/dark/reduced-motion já configurados. Reusar sistema existente.
- Aprimoramentos proativos aprovados:
  - Medidor visual **Discount/Equilibrium/Premium** com marker do preço posicionado entre `lastSwingLow` e `lastSwingHigh` (33/33/33%) — animação suave `cubic-bezier`.
  - **Distância % do preço até o ponto médio do FVG** com seta direcional (↑/↓).
  - Linha de **invalidação estrutural** (`analysis.timing.invalidationLevel`) integrada ao painel de estrutura.
  - **Tooltips `title=`** + `cursor: help` em cada métrica para auditabilidade institucional.
  - **Top‑Down 3×1 + Killzone** preservados como `<details>` colapsável (drill-down) — não duplicar com a leitura primária.
  - **Heartbeat "AO VIVO"** pulsante (1.8s, com `prefers-reduced-motion` honrado).
  - IDs `id="smc-*"` preparados para hidratação live SSE futura.

## Solução

### Renderer

`renderInstitutionalSmcTab(analysis, snapshot, currency)` em `apps/web/src/main.js` (após `renderSmcConfluenceChecklist`). Substitui o branch antigo do handler `if (activeAnalysisTabId === "smc")` por chamada única.

Funções de apoio (todas puras):

- `buildSmcInstitutionalView(analysis, snapshot, currency)` — extrai `marketStructure`, calcula `pricePosition` no range, deriva `obCandidates` e `fvgDistancePercent`. Não muta entrada.
- `renderSmcStructurePanel(view, currency)` — Bias badge + 3 tags (BOS/CHoCH/Sweep) + medidor D/E/P + invalidação.
- `renderSmcOrderBlocksPanel(view, currency)` — lista até 4 OBs candidatos com flag de mitigação.
- `renderSmcFvgPanel(view, currency)` — limites Inferior/Superior + distância %; estado vazio honesto se inativo.
- `renderSmcLiquidityPanel(view, currency)` — BSL/SSL + badge ⚠ SWEEP quando `liquiditySweepSignal !== "none"`.
- `renderSmcTopDownDrillDown(snapshot, currency)` — `<details>` colapsável com Top-Down 3×1 + Killzone (só renderiza se `snapshot.institutional` existir).

### Graceful degradation

Se `marketStructure` ausente (ex.: ativos forex no modo legado), cai automaticamente no fallback antigo (`renderSmcConfluenceChecklist` + texto base) e ainda anexa o drill-down Top-Down se houver `institutional`. Nenhum dado fabricado.

### CSS

Bloco dedicado `.smc-institutional`, `.smc-panel`, `.smc-zone-meter`, `.smc-ob-row`, `.smc-fvg-grid`, `.smc-liq-row`, `.smc-drilldown` em `apps/web/src/styles.css`. Cores sóbrias (esmeralda `#6ee7b7`, rosa `#fca5a5`, âmbar `#fcd34d` para sweep/invalidação). Fontes mono em todos os preços (`font-feature-settings: "tnum"`). `@media (prefers-reduced-motion: reduce)` neutraliza animação do marker e do badge live. `@media print` esconde live badge e força `break-inside: avoid` no drill-down.

### Acessibilidade

- `role="list"` nas listas SMC.
- `title=` + `cursor: help` em todas as métricas (BOS, CHoCH, Sweep, BSL, SSL, Distância FVG, Zona D/E/P).
- `aria-hidden="true"` no marker da zona (decorativo — valor numérico já está nas legendas adjacentes).
- Contraste mínimo WCAG AA validado nos badges sobre fundo dark.

## Prevenção / DoD

- Fonte única de verdade: SEM fabricação de OBs/FVGs/Pools — qualquer lista exibida deriva de campos existentes em `snapshot.insights.marketStructure` (`lastSwing*`, `previousSwing*`, `fairValueGap*`, `liquiditySweepReference*`).
- Graceful degradation testada: ativos sem `marketStructure` caem no fallback textual sem quebrar.
- Drill-down Top-Down 3×1 não é duplicado: só renderiza se `snapshot.institutional` existir.
- IDs estáveis (`smc-bias`, `smc-bos`, `smc-choch`, `smc-sweep`, `smc-zone-marker`, `smc-zone-label`, `smc-invalidation`, `smc-ob-{0..3}`, `smc-fvg-{low,high,distance}`, `smc-bsl`, `smc-ssl`) — preparados para hidratação live SSE sem refactor.
- `prefers-reduced-motion` e `print` honrados — não introduz regressão de acessibilidade vs. ADR-070.
- Sem alteração no backend — pura camada de apresentação consumindo contrato existente.

## Trade-offs

- Backend ainda não detecta equal highs/lows nem múltiplos OBs por timeframe; o painel é honesto e mostra apenas o que temos. Quando o backend evoluir (próxima ADR), os IDs já existentes permitirão substituição sem refactor de UI.
- O drill-down Top-Down 3×1 é silenciosamente omitido quando `snapshot.institutional` não vem no payload (ativos cripto sem o módulo macro). Isso é intencional — não fabricar.
