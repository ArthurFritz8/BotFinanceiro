# ADR-068 — Narrativa Institucional do Gatilho + Ensemble Engine derivado (não-fixo)

- Status: Aceito
- Data: 2026-04-23
- Autores: Arquiteto Frontend + Quant Engineer (peer review de proposta externa)
- Relaciona: ADR-066 (resumo institucional SMC+HFT)

## Contexto

A aba "Resumo" do Intelligence Desk recebeu uma sugestão externa de evolução
inspirada em plataformas PRO competitivas: (a) acrescentar narrativa textual do
gatilho abaixo do veredito; (b) introduzir um painel de "Ensemble Engine" com
pesos algorítmicos por motor (Ghost Tracker, SMC, HFT Kinetic, Harmônicos,
Macro). A proposta original sugeria pesos fixos (35/30/20/10/5).

Auditoria do `apps/web/index.html` + `apps/web/src/main.js` confirmou que
~80% da arquitetura visual sugerida já existe (`#analysis-signal-card`,
`#institutional-summary`, cenários duplos na aba `probabilistica`,
`#analysis-context-card` com slider Premium/Discount/Equilíbrio,
`analysis.newsProxy` renderizado como insights). O gap real eram apenas os
itens (a) e (b).

## Decisão

### 1. Narrativa textual do gatilho — `#analysis-trigger-narrative`

Novo elemento `<p>` posicionado imediatamente abaixo de `#analysis-signal-card`.
Conteúdo é **gerado dinamicamente** a partir do snapshot real, combinando:

- `analysis.smc.sweepRisk` (sweep de liquidez detectado)
- `analysis.smc.structure` (estrutura HH/HL ou compressão)
- `analysis.smc.liquidity` (zonas de liquidez)
- `analysis.timing.note` (gatilho de timing)
- `analysis.context.zone` (sufixo "Zona atual: …")

Sem string fixa. Tom (`buy`/`sell`/`neutral`) ecoado em `data-tone` para CSS
colorir a borda esquerda. `aria-live="polite"` para screen readers.

### 2. Ensemble Engine — `#analysis-ensemble-engine`

Painel com 5 motores (Ghost Tracker, SMC, HFT Kinetic, Harmônicos, Macro F&G)
exibindo barra horizontal de peso normalizada (0–100%, soma = 100).

**VETO ao anti-pattern de pesos fixos:** pesos hardcoded (35/30/20/10/5)
mentem ao usuário em ambiente quantitativo. Em vez disso, `weight = base *
(confidence / 100)` renormalizado para somar 100. Cada componente:

| Motor | Confiança derivada de | Peso BASE binary | Peso BASE spot |
|-------|-----------------------|------------------|----------------|
| Ghost Tracker | `winRate` quando `resolvedTrades >= 5`; senão 0 (fail-honest) | 35 | 22 |
| SMC | nº de sinais não-vazios em `{structure, liquidity, sweepRisk}` / 3 | 22 | 32 |
| HFT Kinetic | `microTiming.momentumStrength*100` (binary) ou `signal.confidence` (spot) | 28 | 18 |
| Harmônicos | `analysis.harmonic.confidence` | 8 | 18 |
| Macro F&G | `100 - 2*|50 - fearGreed.score|` (favorece F&G fora do extremo) | 7 | 10 |

Pesos BASE adaptativos ao `operationalMode`: timing curto (binary) privilegia
Ghost+HFT; estrutura (spot) privilegia SMC+Harmônicos.

Cada barra carrega tooltip `title=` com a métrica bruta (auditabilidade hedge
fund — padrão já adotado nos KPIs `.institutional-kpi`).

### 3. WebSocket-ready

Cada `<article class="analysis-ensemble-row">` tem `id="ensemble-engine-{id}"`
e `data-engine`/`data-weight`/`data-confidence` estáveis. Layer SSE/WS futura
pode atualizar `style.width` da fill bar e dataset sem reconstruir o DOM,
seguindo o padrão `requestAnimationFrame` coalescido já utilizado em
`scheduleRender("deep-analysis", ...)`.

`#analysis-ensemble-engine` e `#analysis-trigger-narrative` carregam
`data-ws-channel` declarando o canal lógico esperado.

### 4. Acessibilidade e degradação

- `aria-live="polite"` na narrativa.
- `prefers-reduced-motion: reduce` neutraliza transitions das barras.
- `hidden` por default; `clearTriggerNarrative()` / `clearEnsembleEngine()`
  invocados no branch `if (!analysis)` mantêm UI silenciosa quando snapshot
  não está disponível.

## Consequências

**Positivas:**
- Pesos do ensemble refletem o estado real do sistema, não constantes.
- Auditável: hover em qualquer barra revela inputs brutos.
- Adaptativo ao modo operacional sem if-else espalhado em consumidores.
- Pronto para hidratação WebSocket sem refactor adicional.

**Negativas / Trade-offs:**
- Soma normalizada para 100% pode confundir leitor que espera ver "peso fixo
  do algoritmo X". Mitigação: subtítulo deixa explícito que pesos são derivados.
- Quando todos os motores têm confiança 0 (snapshot vazio), `rawTotal = 0` e
  todas as barras vão a 0%. Comportamento aceitável: equivale a "sem edge".

## Arquivos alterados

- [apps/web/index.html](../../apps/web/index.html) — 2 elementos novos após `#analysis-signal-card`.
- [apps/web/src/main.js](../../apps/web/src/main.js) — refs DOM + `renderTriggerNarrative()` + `renderEnsembleEngine()` + clears + chamadas em `renderDeepAnalysisPanelImmediate()`.
- [apps/web/src/styles.css](../../apps/web/src/styles.css) — tokens visuais para `.analysis-trigger-narrative` e `.analysis-ensemble-*` (cores por motor + reduced-motion).
