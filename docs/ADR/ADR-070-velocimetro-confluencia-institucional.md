# ADR-070 — Velocímetro de Confluência Institucional na aba "Técnica"

- **Status:** Aceito
- **Data:** 2026-04-23
- **Escopo:** `apps/web` (Intelligence Desk · aba "Técnica")
- **Refs:** ADR-048 (Intelligence Desk 360°), ADR-049 (Ghost Tracker), ADR-068 (Ensemble Engine), ADR-069 (Relatório Executivo)

## Objetivo

Substituir a aba "Técnica" do Intelligence Desk — que exibia apenas dois cartões textuais ("Estrutura técnica" + "Indicadores-chave") — por um painel institucional de alto impacto visual, hierarquizando sinais SMC/HFT como leitura primária e mantendo indicadores clássicos (RSI/MACD/SMA) como confirmação secundária colapsável. Resultado deve igualar a apresentação visual da concorrência (gauge + placares + barra de consenso) sem perder o rigor quantitativo do nosso stack proprietário.

## Contexto

- Concorrência (TradingView/Investing) usa "velocímetro" + placares ↑/—/↓ + barra de consenso para consolidar dezenas de indicadores. Esse formato gera reconhecimento imediato e suporta decisão tática rápida.
- A nossa aba "Técnica" anterior (`apps/web/src/main.js`, branch `if (activeAnalysisTabId === "tecnica")`) renderizava apenas dois `<article class="analysis-block">` textuais — nenhum gauge, nenhum placar agregado, nenhum heatmap multi-timeframe.
- O Gemini (Arquiteto Socrático) propôs replicar o formato de varejo. Peer review vetou parte da proposta:
  - **VETO 1:** "substituir o varejo" — RSI/MACD seguem válidos como confirmação secundária (regra acumulada / ADR-068). Os 44 indicadores devem viver num accordion `<details>`, não desaparecer.
  - **VETO 2:** Falsificar gauge com `border-radius` + `conic-gradient` — quebra em retina, não anima suave e não imprime. Solução correta: SVG `<path>` + `<line>` rotacionado por `--gauge-deg`.
  - **VETO 3:** SVG sem `viewBox` — não é responsivo. Definido `viewBox="0 0 220 130"` + `preserveAspectRatio`.
- Já existem campos prontos no payload: `analysis.signal.{tone,confidence}`, `analysis.compositeScore`, `analysis.buyProbability/sellProbability/neutralProbability`, `analysis.wegd`, `analysis.fearGreed`, `analysis.context.{trend,supportLevel,resistanceLevel,equilibriumPrice}`, `snapshot.institutional.topDown.{daily,h4,m5}`, e `buildMicroTimingAnalysis(analysis,snapshot)` para modo binário.

## Solução

### Componente

- Novo helper `renderInstitutionalTechnicalTab(analysis, snapshot, currency)` em `apps/web/src/main.js`, posicionado logo após `renderSmcConfluenceChecklist`. Substitui o `innerHTML` inline do branch `tecnica`.
- Estrutura visual:
  1. **Cabeçalho** "Velocímetro de Confluência Institucional" + badge `Ao vivo` com pulse CSS.
  2. **Velocímetro SVG** (220×130 viewBox) com gradiente vermelho→cinza→verde, ponteiro rotacionado por CSS variable `--gauge-deg`, score numérico central com `title=` da fórmula (auditabilidade hedge fund), label de viés `aria-live="polite"`.
  3. **Heatmap MTF** (M5 · M15 · H1 · H4 · D1) — dot colorido por `data-bias` (`bull`/`bear`/`neutral`); fonte primária `snapshot.institutional.topDown.{daily,h4,m5}`, fallback derivado de `analysis.context.trend` e `signal.tone`.
  4. **Bloco de contexto estrutural** (Suporte / Equilíbrio / Resistência) — não perde os dados do componente antigo.
  5. **Painel SMC** "Sensores de Liquidez" — placar 3-cells (↑ a favor / — neutro / ↓ contra) + 3 itens (Order Block H1, FVG mitigado, Sweep) derivados de `buildSmcPriceActionConfluence(analysis)`.
  6. **Painel HFT** "Sensores de Exaustão" — placar idêntico + 3 itens (Desaceleração cinética, Divergência de delta, Pressão de book) derivados de `buildMicroTimingAnalysis()` e `analysis.wegd`.
  7. **Barra de consenso** tricolor (Venda · Neutro · Compra) com larguras proporcionais a `buyProbability/sellProbability/neutralProbability`.
  8. **Accordion `<details>`** "Indicadores clássicos — confirmação secundária" preservando RSI/MACD/SMA-style como nas screenshots de referência.

### Score adaptativo (regra UI/UX acumulada)

```
binary  -> microTiming.momentumStrength             (0..100)
spot    -> analysis.signal.confidence ?? compositeScore
gauge_deg = clamp((score - 50) * 1.8, -90, 90)
```

### CSS

- 180+ linhas anexadas a `apps/web/src/styles.css`, namespace `.tech-*` para não colidir com `.exec-*` (ADR-069), `.ghost-*` (ADR-049) ou `.analysis-block`.
- `transition: transform 600ms cubic-bezier(.22,.61,.36,1)` no ponteiro.
- `@media (prefers-reduced-motion: reduce)` neutraliza animação e pulse.
- `@media print` esconde badge AO VIVO e neutraliza transições — o snapshot da aba técnica entra limpo no PDF do Relatório Executivo (ADR-069).

### Acessibilidade

- `role="meter"` + `aria-valuenow` no SVG.
- `aria-live="polite"` no label de viés.
- `cursor: help` + `title=` no score central com a fórmula completa.
- `<details>` nativo para o accordion (sem JS).

### Sensores HFT (regras determinísticas)

- **Desaceleração cinética** (warning): `momentumStrength < 35 && neutralProbability > 35`.
- **Divergência de delta** (against): `wegd.gradient` com sinal oposto a `signal.tone`.
- **Pressão de book** (favor): `wegd.pressure` alinhado a `signal.tone` com `wegd.energy ≥ 50`.

Polaridade traduzida em `data-state` (`bull` / `bear` / `warning` / `neutral`) com `border-left-color` próprio. Placar ↑/—/↓ derivado dos estados.

## Prevenção

1. **Não introduzir libs externas** (`Chart.js`, `D3`) — Zero Budget Pillar 1. Toda animação é CSS + SVG nativo.
2. **Não duplicar estado**: o ponteiro lê `--gauge-deg` que vem direto do `score` calculado em `renderInstitutionalTechnicalTab` — sem fontes paralelas.
3. **Não bloquear modo binário/spot**: helper detecta via `isBinaryOptionsOperationalMode()` e degrada graciosamente se `buildMicroTimingAnalysis` falhar (try/catch silencioso).
4. **Não esconder o varejo**: indicadores clássicos preservados no accordion `<details>` (regra de não-vetar RSI/MACD).
5. **Acessibilidade obrigatória**: todo painel novo deve ter `role`/`aria-*` + suporte a `prefers-reduced-motion` + impressão limpa via `@media print`.
6. **Namespace de IDs**: `tech-*` reservado para esta aba — não reutilizar em outras telas para evitar colisão de hooks futuros (animação JS, WebSocket update, screenshots E2E).

## DoD

- [x] Helper isolado, testável, sem dependência circular.
- [x] CSS escopado, sem sobrescrever tokens existentes.
- [x] Sem erros TypeScript/ESLint (`get_errors` em `main.js` retorna 0).
- [x] Sem libs externas adicionadas.
- [x] `prefers-reduced-motion` + `@media print` cobertos.
- [x] ADR-070 registrado.
