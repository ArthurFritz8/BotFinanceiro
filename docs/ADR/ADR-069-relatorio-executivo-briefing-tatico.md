# ADR-069 — Relatório Executivo (Briefing Tático Institucional)

- Status: Aceito
- Data: 2026-04-23
- Autores: Arquiteto Frontend + Quant Engineer (peer review de proposta externa)
- Relaciona: ADR-066 (resumo institucional SMC+HFT), ADR-068 (narrativa do gatilho + ensemble engine derivado)

## Contexto

Proposta externa solicitou uma aba "Relatório Executivo" com 9 tópicos rigorosos,
botões Copiar/Exportar PDF e função `generateExecutiveReport(data)`. Auditoria
do `apps/web/index.html` + `apps/web/src/main.js` confirmou que o snapshot
`analysis` já produz toda a matéria-prima necessária (`signal`, `context`,
`smc`, `harmonic`, `monteCarlo`, `newsProxy`, `wegd`, `multiTimeframe`,
`microTiming`). O gap real é apenas o invólucro do dossiê + UX de
compartilhamento.

## Decisão

### 1. Modal `<dialog>` nativo (não overlay div)

`<dialog id="executive-report-modal">` aproveita semântica nativa, focus trap,
`Escape` close e `::backdrop` sem JS adicional. ARIA completo
(`aria-modal`, `aria-labelledby`, `role` herdado).

### 2. Sem dependência externa de PDF

**VETO ao jsPDF/html2pdf** (250KB+, fere Zero Budget e bundle do Vite).
Exportação via `window.print()` + `@media print` dedicado:

- `color-scheme: light` força fundo branco legível em papel/PDF.
- `body > *:not(#executive-report-modal) { display: none }` isola o dossiê.
- `page-break-inside: avoid` por `.report-section` evita corte feio.
- Botões/backdrop ocultos em print.

### 3. Sem dependência de LLM por abertura

**VETO ao "Visão Geral via LLM Output" como default**: cada abertura geraria
custo OpenRouter. Narrativa é **derivada determinística** do snapshot
(`signal.title` + `context.zone` + `smc.sweepRisk|structure` +
`signal.confidence`), mesmo padrão da ADR-068. Caminho para enriquecimento
LLM fica aberto como botão futuro opcional.

### 4. Ghost Tracker fail-honest

Tópico 7 respeita a regra memorizada `resolvedTrades >= 5`:

- ≥ 5 trades resolvidos: exibe `winRate` real + amostra (W/L/P).
- < 5 trades: exibe "Aquecendo (N/5)" + texto explicando que a estatística
  não é fabricada.

### 5. Clipboard com fallback

`navigator.clipboard.writeText()` em contextos seguros, fallback
`document.execCommand('copy')` via `<textarea>` posicionado fora da viewport
para iframes/HTTP. Feedback visual `data-feedback="ok"` por 2s.

### 6. Web Share API opcional

Detecção `if (navigator.share)` no bootstrap → injeta botão "Compartilhar"
no rodapé apenas em browsers compatíveis (mobile principalmente). Zero custo
em desktop.

### 7. WebSocket-ready

`generateExecutiveReport(data)` é **idempotente** e barato: pode ser chamada
a cada update SSE/WS sem reconstruir o DOM. Cada `<section>` carrega
`data-section` para futura atualização granular (`data.smc` mudou →
re-render apenas seção 3). Já é chamada dentro de
`renderDeepAnalysisPanelImmediate()` (coalescido por `scheduleRender`).

### 8. Indicador "AO VIVO" / "CACHE Xm"

Cabeçalho mostra estado real do snapshot:
- `< 60s` → badge verde "AO VIVO" com pulse (respeitando
  `prefers-reduced-motion`).
- `≥ 60s` → badge âmbar "CACHE Nm".

### 9. Report ID (auditabilidade)

Rodapé exibe hash FNV-1a de `asset+ts+confidence`. Quando o trader
compartilha o print no grupo, o ID permite rastrear o snapshot exato
no histórico operacional.

### 10. Disclaimer regulatório fixo

Seção 9 sempre carrega aviso "Análise técnica educacional — não
constitui recomendação de investimento (CVM 88/22)" para proteção
legal do produto B2C.

## Consequências

**Positivas:**
- Zero dependência externa adicional. Bundle não cresce.
- Vetor de growth: trader copia/imprime e compartilha → marca o produto.
- Auditável (Report ID + Ghost Tracker honesto).
- Acessível (dialog nativo + ARIA + reduced-motion).
- WebSocket-ready sem refactor.

**Negativas / Trade-offs:**
- `window.print()` depende do diálogo de impressão do browser (UX varia
  entre Chrome/Firefox/Safari). Mitigação: CSS print testado nos 3.
- Modal `<dialog>` tem suporte limitado em browsers muito antigos
  (< Chrome 88, Safari < 15.4). Para o público-alvo (trader B2C 2026)
  é aceitável. Fallback `setAttribute("open", "")` cobre o resto.

## Arquivos alterados

- [apps/web/index.html](../../apps/web/index.html) — modal `<dialog>` + botão "Abrir Relatório Executivo" no header da Intelligence Desk.
- [apps/web/src/executive-report.js](../../apps/web/src/executive-report.js) — módulo novo: `generateExecutiveReport`, `openExecutiveReport`, `closeExecutiveReport`, `bootstrapExecutiveReport`.
- [apps/web/src/main.js](../../apps/web/src/main.js) — import + `bootstrapExecutiveReport()` + chamada `generateExecutiveReport()` em `renderDeepAnalysisPanelImmediate()`.
- [apps/web/src/styles.css](../../apps/web/src/styles.css) — tokens visuais do modal + media print + botão launcher.
