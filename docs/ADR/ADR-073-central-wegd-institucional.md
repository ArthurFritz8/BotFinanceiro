# ADR-073 — Central WEGD Institucional (Wyckoff · Elliott · Gann · Dow)

- **Status:** Aceito
- **Data:** 2026-04-23
- **Escopo:** `apps/web` (Intelligence Desk · aba "WEGD")
- **Refs:** ADR-048 (Intelligence Desk 360°), ADR-068 (Ensemble Engine), ADR-070 (Velocímetro), ADR-071 (Detalhamento SMC), ADR-072 (Detalhamento Harmônico XABCD)

## Objetivo

Substituir o placeholder textual da aba "WEGD" — que renderizava apenas 4 `<p>` com direção/gradiente/energia/pressão — por uma **central visual institucional** que integra as 4 grandes teorias clássicas (Wyckoff, Elliott, Gann, Dow) num único terminal de auditoria com sub-tabs ARIA, painel de convergência clássica ponderado e marcação honesta entre dados live e métricas derivadas/heurísticas. Padrão hedge fund: zero fabricação de sinal, graceful degradation quando snapshot não tem pivôs suficientes.

## Contexto

- A aba "WEGD" anterior (`apps/web/src/main.js`, branch `if (activeAnalysisTabId === "wegd")`) era literalmente "uma lista de texto básica" — exatamente a crítica do Gemini Arquiteto Socrático.
- O Gemini propôs 4 quadrantes (Wyckoff/Elliott/Gann/Dow) + Painel de Convergência. Peer review crítico:
  - **VETO 1 (honestidade institucional):** o backend (`analysis.wegd`) só fornece `{ direction, gradient, energy, pressure }` — **não tem detector real de Spring/UTAD/SOS, contagem de ondas Elliott, ângulos Gann calibrados nem fases Wyckoff explícitas**. Fabricar esses dados como se fossem reais seria quebra de confiança institucional (mockups da imagem original mostravam "1×8: 1.15090" com 5 decimais — fabricação flagrante). Solução: derivar tudo via heurística honesta a partir de `snapshot.insights` (rsi14, emaFast, emaSlow, momentumPercent, atrPercent, volatilityPercent, trend) + `snapshot.points` (zigzag local) + `analysis.wegd` (gradiente/energia/pressão) e marcar a seção inteira com badge `⚙ AUDITORIA · derivado` no rodapé. Tooltips expõem que são heurísticas.
  - **VETO 2 (bug visual da imagem original):** "Participação Pública 257%" — barra de progresso passando de 100%. Anti-pattern visual. Fix: `clampPercent01()` em todos os fills, exibindo o valor bruto apenas no `title` para auditoria.
  - **VETO 3 (acessibilidade):** sub-tabs sem ARIA tab pattern. Fix: `role="tablist"` + `role="tab"` + `aria-selected` + `aria-controls` + navegação via setas (← →, Home, End).
  - **VETO 4 (anti-pattern de re-render):** rodar `renderAnalysisTabContent` inteiro a cada toggle de sub-tab é desperdício de CPU. Fix: `bindWegdSubTabButtons` re-pinta apenas `.wegd-subnav` + `.wegd-panel` (cirúrgico).
  - **VETO 5 (cards vazios poluentes — bug das imagens originais):** "Alvos de Fibonacci" e "Quadrado do Preço" vazios ocupando metade da tela. Fix: graceful degradation com mensagens contextualizadas ou cálculo derivado real (Square of 9 simplificado para Gann).
- Aprimoramentos proativos aprovados:
  - **Persistência da sub-tab ativa** em `localStorage` com chave versionada `botfinanceiro:wegd:subtab:v1` (padrão "persistencia segura de state UI" da memória do projeto: hidratação síncrona, sanitização contra IDs inválidos, debounce não necessário pois é 1 escrita por click).
  - **Painel de Convergência Clássica ponderado**: cada teoria emite voto buy/sell/neutral com confiança própria; veredicto final é maioria simples + força ponderada por confiança. Tooltip do badge "Confluência: N/4" expõe os 4 votos individuais (`1↑ 1↓ 2→`).
  - **Glassmorphism dark real**: `backdrop-filter: blur(18px) saturate(140%)` + `bg rgba(15,23,42,0.55)` + `border rgba(255,255,255,0.08)` + radial gradient sutil bull/bear/neutral no `::before`.
  - **`font-mono tabular-nums`** (JetBrains Mono / Fira Code fallback) em todos preços, ângulos e percentuais — alinhamento institucional.
  - **`@media (prefers-reduced-motion: reduce)`** neutralizando transitions.
  - **`@media print`** para exportação de relatório executivo.

## Decisão

1. Adicionar state module-scope `activeWegdSubTabId` + helpers de hidratação/persistência via `localStorage` (chave versionada `WEGD_SUBTAB_PERSISTENCE_KEY = "botfinanceiro:wegd:subtab:v1"`, sanitização contra IDs fora de `WEGD_SUBTAB_IDS`).
2. Implementar derivadores puros (sem efeitos colaterais) que transformam `analysis` + `snapshot` em `view`:
   - `deriveZigzagPivots(points, minMovePercent)` — pivots locais com threshold percentual configurável.
   - `deriveWyckoffPanel(insights, analysis, currentPrice, points)` — fase (ACUMULAÇÃO/MARKUP/DISTRIBUIÇÃO/MARKDOWN/CONSOLIDAÇÃO) por RSI+EMA+momentum; Composite Man por gradiente+pressão; eventos PSY/SC/ST por pivots reais; Spring/UTAD/SOS detectados condicionalmente (sem fabricar quando ausentes).
   - `deriveElliottPanel(insights, analysis, currentPrice, points, currency)` — contagem 1-2-3-4-5-A-B-C sobre os últimos 8 pivots do zigzag; tipo IMPULSIVA/CORRETIVA; progresso por % de viagem entre pivots; alvos Fib 1.272/1.618/2.000 sobre última perna; confiança por proporcionalidade (Onda 3 ≥ Onda 1).
   - `deriveGannPanel(insights, analysis, currentPrice, points)` — ângulo dominante 1×8 → 4×1 por `|gradient|/atr%`; suportes/resistências por ATR steps; Quadrado do Tempo por delta dos últimos 2 pivots; Square of 9 por `Math.sqrt(price)` arredondado.
   - `deriveDowPanel(insights, analysis, currentPrice)` — primária/secundária/menor (trend label, EMA fast-slow, momentum); fase de mercado clamped 0-100% (FIX bug 257%); confirmações preço×volume e índices.
   - `buildClassicalConvergence(panels)` — votos + força + veredicto.
3. Renderers puros: `renderWegdConvergenceHeader`, `renderWegdSubTabs` (ARIA tablist), `renderWegdActivePanel`, `renderWegdWyckoffPanel`, `renderWegdElliottPanel`, `renderWegdGannPanel`, `renderWegdDowPanel`.
4. `renderInstitutionalWegdTab(analysis, snapshot, currency)` orquestra: try/catch com fallback graceful para o template antigo se `buildWegdInstitutionalView` lançar. Substitui o branch `if (activeAnalysisTabId === "wegd")` em `renderAnalysisTabContent`.
5. `bindWegdSubTabButtons(container, analysis, snapshot, currency)` — click + keyboard (← → Home End com `event.preventDefault()`); re-pinta cirurgicamente `.wegd-subnav` + `.wegd-panel` via `outerHTML`; re-bind no novo nav; foco automático na nova tab (padrão WAI-ARIA).
6. CSS isolado sob namespace `.wegd-institutional` em `apps/web/src/styles.css` (sem colisão com `.smc-institutional`).

## Consequências

**Positivas:**
- UI da aba WEGD elevada de "lista de 4 `<p>`" para terminal institucional com 4 painéis (Wyckoff/Elliott/Gann/Dow) + convergência ponderada — paridade visual com mockups premium do Gemini, mas com honestidade de dados derivados.
- Sub-tab persistida entre sessões (UX premium, padrão Bloomberg/Reuters).
- ARIA tab pattern completo: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabindex="-1/0"`, navegação por setas — passa em audits de acessibilidade.
- Bug visual "257%" eliminado por `clampPercent01()` em 100% das barras.
- Cards vazios poluentes substituídos por: (a) cálculo derivado real (Square of 9 Gann), ou (b) mensagem honesta de empty state ("Aguardando ao menos 3 pivots auditáveis").
- Convergência clássica auditável: tooltip do badge expõe os 4 votos individuais.
- `prefers-reduced-motion` e `print` suportados — institucional respeita preferências do usuário.
- Zero novas dependências; apenas template literals + helpers já existentes (`escapeHtml`, `formatPrice`, `formatPercent`, `clampNumber`, `roundNumber`, `toFiniteNumber`).

**Negativas / dívida técnica explícita:**
- Os derivadores são heurísticas, não substituem detectores formais (ZigZag profissional, Composite Man real, contagem Elliott por algoritmo de Neely/Prechter, Square of 9 com cardinal/ordinal cross). Marcado como `derived: true` e badge `⚙ AUDITORIA · derivado` no rodapé. Próximas ADRs (074-077) podem promover detectores específicos para o backend — quando forem promovidos, basta substituir o `view.{section}.derived` por `false` e remover o badge.
- A função `renderInstitutionalWegdTab` cresceu o `main.js` em ~620 linhas (renderers + derivadores + CSS por extenso). Aceitável dado o padrão monolítico atual (`main.js` já tem ~18.300 linhas e o equivalente SMC vive ali). Refatoração em arquivo dedicado `apps/web/src/wegd-detail.js` fica para ADR de modularização global.

## Definition of Done (Senior)

- [x] Branch `if (activeAnalysisTabId === "wegd")` no `renderAnalysisTabContent` substituído por `renderInstitutionalWegdTab` + `bindWegdSubTabButtons`.
- [x] Sub-tab persistida em `localStorage` com chave versionada e sanitização de ID inválido.
- [x] `prefers-reduced-motion` e `@media print` cobertos no CSS.
- [x] ARIA tab pattern completo (`role="tablist"/"tab"/"tabpanel"`, `aria-selected`, `aria-controls`, `tabindex` rotacional, setas).
- [x] Bug "257%" corrigido via `clampPercent01()` em todos os fills.
- [x] Cards vazios eliminados via empty state honesto ou cálculo derivado real.
- [x] Conventional Commit referenciando ADR-073.
- [x] Sem novas dependências; sem novos pacotes npm.
- [ ] Backend (`crypto-chart-service`) ganhar detectores formais de Wyckoff/Elliott/Gann (ADR-074+).
