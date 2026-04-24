# ADR-078 — Live Signals Screener (Top Opportunities cross-asset)

- Status: Aceito
- Data: 2026-04-24
- Personas ativas: Engenheiro Full-Stack Sênior + Arquiteto Sócrático, Especialista em Trading Institucional, Arquiteto UI/UX para Terminais Institucionais, Engenheiro Frontend Sênior + Arquiteto de Dashboards de Trading.

## Contexto / Observação

Hoje a plataforma expõe (a) `analysis-signal-card` no Chart Lab (1 ativo por vez) e (b) `paper-trading-panel` (histórico simulado).
Não existe um **screener cross-asset** que consolide os top setups com confluência ≥ 85% num radar único — a peça mais demandada por quem opera em mesa institucional rápida (HFT/SMC).

A imagem de referência mostra um painel "Sinais IA em Tempo Real" com:

- Banner "Sinais Desbloqueados" (1 crédito PRO/hora) + countdown.
- Toggle de Som global.
- Cards horizontais por sinal: ticker, timeframe, badge "Ativo", Entrada / Stop / Take, score %, R:R.

O prompt original sugere ainda: tabela com Score + Setup Detectado + Status + botão "Auditar Sinal" para abrir a análise profunda do ativo nas demais abas.

## Conformidade

Padrões mantidos:

- Zero Budget (sem dependências novas, sem novo endpoint backend nesta fase).
- Tokens CSS dedicados (`.live-signals-*`) com `data-tone="bull|bear|neutral"`, sem cores Tailwind cruas (mantém Dark Premium coerente com `.fundi-hub-radar-pill`, `.institutional-confluence-badge`).
- Persistência segura `botfinanceiro:liveSignals:v1` (sanitize-on-load + falha silenciosa em modo privado).
- A11y: `prefers-reduced-motion`, `aria-live`, `role="status"`, `title=` com `signalId` para auditabilidade ghost-tracker.
- Fail-honest: nada de "42 ativos" hardcoded — vem do payload (mock inicial) com fallback `n/d`. Status do sinal (Aguardando Gatilho / Trade Ativo / Alvo Atingido) deriva de campo real.

## Solução

### Estrutura

- Nova rota `live-signals` na sidebar (junta `chat`, `chart-lab`, `mercados`, `memecoins`, `airdrops`, `paper`, `backtesting`).
- Nova section `#live-signals-stage` em `apps/web/index.html`, escondida por classe `route-hidden`.
- Novo módulo `apps/web/src/live-signals.js` (boot + render + interações), importado de `main.js` para evitar inflar o monolito de 18 mil linhas.

### Pontos-chave

1. **Header do Screener (Status do Radar)**: ponto verde animado (com `prefers-reduced-motion: reduce` neutralizado), texto dinâmico "Monitorando N ativos... confluência > NN%".
2. **Banner PRO Unlock** com countdown persistido em `localStorage`. Stub: NÃO consome crédito real — extension point comentado no código para integrar com o sistema de créditos posteriormente.
3. **Toggle de Som** global persistido. Beep curto via `AudioContext` quando entra sinal score ≥ 90 (sem dependência externa). `webkitAudioContext` fallback.
4. **Filtros**: timeframe (M5/M15/H1/H4/D1) + slider de score mínimo (85→99).
5. **Grid responsivo** (`#live-signals-feed`): cards horizontais (desktop) / empilhados (mobile). Cada card tem:
   - ticker + timeframe + badge `data-tone`.
   - Trio Entrada / Stop / Take em fonte monospace.
   - Score % colorido por faixa (≥90 verde-neon / ≥85 amarelo / <85 muted).
   - R:R derivado.
   - Status badge: `aguardando`, `ativo`, `tp1`, `tp2`, `stop`.
   - Botão "Auditar Sinal" → dispara `setActiveRoute("chart-lab")` + carrega o ativo no `chart-asset` select (extension point já existente: `syncIntelligenceDeskForCurrentContext`).
   - `title=` tooltip com `signalId` + `snapshotAt` para rastreabilidade ghost-tracker.
6. **Sem WebSocket nesta fase** — a função `subscribeLiveSignals(callback)` já existe como extension point. Polling stub coalescido em `setTimeout` (5s) renderiza dados mock institucionais. Quando o backend expor SSE, troca-se o transport em **um único lugar** sem mexer em UI.

### Veto (correções sobre a sugestão Gemini)

- `bg-red-500 / bg-yellow-500 / bg-gray-500` substituídos por tokens dedicados.
- `animate-pulse` cru → `@media (prefers-reduced-motion: reduce)` neutraliza.
- "42 ativos" hardcoded → contador derivado do payload (`monitoredAssets`).
- WebSocket prematuro → arquitetura preparada, transport stub.

## Plano (DoD)

- [x] HTML: nova section + botão sidebar + ids semânticos (`#live-signals-stage`, `#live-signals-feed`, `#live-signals-monitor-count`, `#live-signals-pro-banner`, `#live-signals-pro-countdown`, `#live-signals-sound-toggle`, etc.).
- [x] CSS: bloco `.live-signals-*` com glassmorphism dark, tokens semânticos `data-tone`, reduced-motion guard.
- [x] JS: `live-signals.js` exportando `bootstrapLiveSignals(deps)`. Persistência `botfinanceiro:liveSignals:v1`. Integração com `setActiveRoute` via callback injetado (sem acoplamento circular).
- [x] Roteamento: `APP_ROUTE_LIVE_SIGNALS`, `APP_ROUTE_SHORTCUTS`, `setRouteVisibility`, `resolveRouteFromLocation`.
- [x] Build (`npm run build`).
- [x] Commit `feat(web): live signals screener cross-asset (Top Opportunities) - Refs ADR-078` + push.

## Consequências

- + Ponto único para revisar top setups sem percorrer ativo a ativo.
- + Reduz carga cognitiva e tempo até auditoria detalhada (botão dispara abertura no Chart Lab).
- + Arquitetura preparada para SSE/WebSocket futuro sem reescrita de UI.
- − Dados mock até backend expor `/v1/live-signals/feed` (ADR futuro).
