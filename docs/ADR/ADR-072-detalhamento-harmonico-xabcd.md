# ADR-072 — Detalhamento Harmônico XABCD na aba "Harmônicos"

- **Status:** Aceito
- **Data:** 2026-04-23
- **Escopo:** `apps/web` (Intelligence Desk · aba "Harmônicos")
- **Refs:** ADR-048 (Intelligence Desk 360°), ADR-068 (Ensemble Engine), ADR-070 (Velocímetro), ADR-071 (Detalhamento SMC)

## Objetivo

Transformar a aba "Harmônicos" — que renderizava cards com nome, estado, barra de confiança e três níveis inline (PRZ/Alvos/Stop em texto corrido) — num **terminal de auditoria geométrica XABCD** com: tabela de validação dos 4 ratios de Fibonacci (XB/AC/BD/XD) por padrão, com valor esperado vs atual e ícone ✓/✕/•; bloco de execução com 3 cards distintos (PRZ, Alvos, Stop) usando font-mono tabular-nums; lista auxiliar de níveis clássicos de Fibonacci (23.6% → 161.8%) classificados como Suporte/Resistência vs preço atual; badge de Confluência cross-pattern (ICT PRZ overlap). Padrão hedge fund: dados 100% derivados de `analysis.harmonic` + `analysis.context` reais — sem fabricação de pivôs.

## Contexto

- A aba "Harmônicos" anterior (`apps/web/src/main.js`, função `renderHarmonicScanner`) entregava só ~30% do que um terminal institucional exige: nome + estado + barra + 3 níveis em `<div>` de texto. Não havia tabela de ratios, nenhuma validação esperado vs atual, nenhuma seção dedicada de níveis Fibonacci auxiliares.
- O Gemini (Arquiteto Socrático) propôs cards expansíveis com tabela XB/AC/BD/XD, blocos PRZ/Alvos/Stop, lista de Fibonacci 23.6%-161.8%. Peer review crítico:
  - **VETO 1 (honestidade):** o backend (`crypto-chart-service` → `analysis.harmonic`) só fornece `{ pattern, ratio, confidence }` — **uma única razão dominante**, não os 4 pivôs XABCD. Cravar 4 valores "Atual" por padrão seria fabricação (anti-pattern fail-honest). Solução: usar `analysis.harmonic.ratio` apenas no leg `XD` (que é o que o backend resolve); legs XB/AC/BD ficam com status `pending` + tooltip "Pivôs XABCD individuais — backend fase 2 (ADR-072)". Sem mentir.
  - **VETO 2:** `<details>` expansível por padrão — em terminal HFT empilhar 5 collapsibles gera fricção. Cards sempre abertos.
  - **VETO 3:** "Padrão invalidado se fora da margem" para todos os 4 ratios — só dá para invalidar o leg que tem dado real (XD). Os outros ficam pendentes, não inválidos.
- Aprimoramentos proativos aprovados:
  - **Confluência cross-pattern**: badge "🎯 Confluência Nx" quando 2+ padrões apontam PRZs próximos (delta < 0.3% do range) — Scott Carney chama de "PRZ overlap", o setup mais robusto.
  - **Tooltips numéricos** em cada ratio expondo alvo + tolerância (`title="Esperado: 0.382-0.886 (alvo 0.618 ±0.04)"`) para auditoria.
  - **Marker "📍 PRÓXIMO"** no nível Fibonacci mais próximo do preço atual.
  - **Distância em %** entre preço corrente e cada nível Fib (`+0.42%`, `-1.15%`).
  - **`role="list"` + `role="listitem"` + `aria-live="polite"`** no scanner (acessibilidade hedge fund).
  - **`font-mono tabular-nums`** em todos os preços e ratios.
  - **`@media (prefers-reduced-motion: reduce)`** neutralizando a transição da barra de progresso.
  - **Reuso de `formatPrice`, `escapeHtml`, `clampNumber`** já existentes (sem duplicação).

## Solução

### Renderer (`apps/web/src/main.js`)

1. **`HARMONIC_PATTERN_DEFINITIONS`** estendido com `ratios` (números ideais Scott Carney) e `ratiosLabel` (range textual). Constante `HARMONIC_RATIO_TOLERANCE = 0.04`.
2. **`buildHarmonicGeometryScanner`** agora computa `ratiosValidation` por padrão: XD com `actual` real (do backend) + status `ok|invalid` baseado em tolerância; XB/AC/BD com `actual: null` e status `pending` (honesto). Adiciona detecção de confluência cross-pattern (`confluenceCount`) e flag `backendXabcdAvailable: false` para permitir migração futura.
3. **`renderHarmonicScanner`** reescrito com helper `renderRatioCell` produzindo grid 2×2 de ratios (cor verde/vermelha/cinza por status, ícone ✓/✕/•, tooltip com tolerância). Bloco de execução com 3 cards distintos (`harmonic-exec--prz`, `harmonic-exec--target`, `harmonic-exec--stop`) usando font-mono. Hint global "Backend resolve apenas XD..." quando `backendXabcdAvailable === false`.
4. **`buildFibonacciAuxiliaryLevels`** (novo) deriva os 8 níveis clássicos de `context.rangeHigh - context.rangeLow`, classifica cada um como SUPORTE (preço > nível) ou RESISTÊNCIA (preço ≤ nível), calcula distância percentual e marca o mais próximo.
5. **`renderFibonacciAuxiliary`** (novo) renderiza lista 3-coluna (ratio | preço | papel+distância) com `data-tone` ok/warning espelhando role.
6. **Branch `harmonicos`** injeta `renderHarmonicScanner(scanner) + renderFibonacciAuxiliary(fib)` antes da leitura agregada existente.

### Estilos (`apps/web/src/styles.css`)

Bloco "Harmonic detail (ADR-072)" adicionado com:
- `.harmonic-scanner__header` (flex space-between para o badge de confluência);
- `.harmonic-confluence-badge` (amber, `cursor: help`);
- `.harmonic-card__ratios` (grid 2 colunas) + `.harmonic-ratio` com variantes `--ok` (verde), `--invalid` (vermelho), `--pending` (cinza, `opacity: 0.78`);
- `.harmonic-card__execution` (grid 3 colunas) + `.harmonic-exec--prz/target/stop` com cores azul/verde/vermelho por papel;
- `.fib-levels` + `.fib-row` com `data-tone` ok/warning, `.fib-row__nearest` badge azul;
- `@media (prefers-reduced-motion: reduce)` neutralizando `transition` da barra de progresso.

## Consequências

- ✅ **Auditabilidade real**: cada ratio mostra esperado + atual + status com tolerância numérica explícita no tooltip.
- ✅ **Honestidade**: sem fabricar pivôs XB/AC/BD — backend fase 2 já está documentado como dependência.
- ✅ **Hierarquia visual**: PRZ/Alvos/Stop deixam de ser texto corrido e viram 3 cards com cor semântica.
- ✅ **Confluência detectada automaticamente**: padrões com PRZ alinhado disparam badge sem cálculo extra do usuário.
- ✅ **Acessibilidade**: roles ARIA, `aria-live`, tooltips, `prefers-reduced-motion` honrado.
- ⚠️ **Dependência futura**: ADR-072 fase 2 (backend) precisará expor `analysis.harmonic.pivots = { X, A, B, C, D }` para os 4 ratios saírem de `pending`.
- ⚠️ **Manutenção**: `HARMONIC_PATTERN_DEFINITIONS.ratios` é fonte da verdade dos ideais Scott Carney — qualquer ajuste teórico passa por ela.

## Alternativas Descartadas

- **Derivar pivôs XABCD frontend a partir de `lastSwingHigh/Low`:** insuficiente (precisaríamos de 5 pivôs, temos 2).
- **Mostrar só XD e ocultar XB/AC/BD:** entrega visual menor que a do prompt e elimina o "checklist visual" institucional. A solução pending+tooltip é melhor.
- **Calcular níveis Fib do `swingHigh/swingLow` em vez de `rangeHigh/rangeLow`:** range é mais estável (timeframe maior) e já alimenta `equilibriumPrice`. Manter consistente.
