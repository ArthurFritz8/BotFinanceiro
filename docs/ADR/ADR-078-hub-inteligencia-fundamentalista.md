# ADR-078 — Hub de Inteligência Fundamentalista (refator aba Notícias)

## Contexto
A aba "Notícias" da workspace de análise renderizava uma lista achatada de
items vindos de `crypto-news-intelligence-service` (RSS multi-source), sem
agregar sentimento, sem chips de keywords, sem narrativa AI macro, sem
separar Notícias × Eventos Econômicos e sem destaque visual de impacto. O
trader não tinha leitura institucional fundamentalista no mesmo nível que
SMC, WEGD, Probabilística e Timing Desk já entregam.

## Decisão
Refatorar a aba "Notícias" em um **Hub de Inteligência Fundamentalista**
puramente derivado dos dados que já existem no payload de `news-intelligence`
e em `institutional.macroRadar.upcomingEvents` (ADR-076). Nenhuma chamada
externa nova. Estrutura:

1. **Card de Sentimento de Mercado (AI)**: gauge 0-100 derivado dos campos
   `sentiment` agregados dos items (positive/negative/neutral); barra
   horizontal com legenda Bearish/Neutro/Bullish; botão de refresh que reusa
   `syncIntelligenceDeskForCurrentContext({ force: true })`.
2. **Chips de palavras-chave monitoradas**: top 10 tags mais frequentes
   agregadas dos items (Map count + sort).
3. **Análise Macro Sintética colapsável**: usa `analysis.summary` quando
   existir, senão compõe narrativa fail-honest a partir de
   `compositeScore` + `signal.title` + leitura agregada.
4. **Card Radar Macro Institucional**: alertLevel (green/yellow/red),
   safeHavenBias e blockDirectionalRisk vindos de `institutional.macroRadar`.
5. **Tabs Notícias / Eventos Econômicos** com contadores; tab persistida em
   `localStorage` (chave `fundi-hub:tab:v1`); empty-states honestos.
6. **Badges de impacto** dinâmicos via `data-impact="high|medium|low"`
   classificados por `impactScore` numérico (≥7/≥4/<4) ou string
   (`high|medium|low`) — CSS único reaproveitado em notícias e eventos.
7. **Pulse < 30 min** para eventos iminentes via `@keyframes` com
   `prefers-reduced-motion: reduce` honrado.

### Rejeitado / Vetado
- **"Dossiê Econômico do Ativo" com Taxa de Juros / Inflação / Emprego**
  (sugestão Gemini) — Zero Budget free tier não tem APIs FRED/BCB; mockar
  feriria o princípio de fail-honest. Substituído por Radar Macro real.
- **Calendário macro novo** — duplicaria Timing Desk (ADR-076). Reusa
  `institutional.macroRadar.upcomingEvents` como single source of truth.
- **Tailwind raw classes (`bg-red-500`)** — projeto usa CSS tokens próprios
  + glassmorphism dark premium; uso `data-impact` semântico para consistência
  com Velocímetro e Timing Desk.

## Consequências
**Positivas**
- Zero novo fetch HTTP / latência preservada.
- Reuso de pipeline existente (ciclo de news intelligence + macroRadar).
- Padrão de persistência UI versionada (`v1`) reutiliza receita já validada
  em outras abas.
- Acessibilidade: roles ARIA (`role="meter"`, `role="tab"`, `role="tabpanel"`),
  `aria-selected`, tabindex correto, `prefers-reduced-motion` aplicado.
- Escalável: adicionar uma 3ª aba (ex.: "Insider/On-chain") basta criar
  `data-fundi-hub-tab` + `data-fundi-hub-panel` + entrada na nav.

**Negativas / Trade-offs**
- Sentimento agregado é determinístico (contagem positive/negative). Não
  usa LLM. Aceitável: hedge fund prefere pipeline auditável a black-box.
- Keywords vêm das `tags` do backend, qualidade depende do extrator RSS.
  Trade-off aceito; melhorias futuras isoladas no service backend.

## Status
Aceita.

## Referências
- ADR-076 — Timing Desk Institucional (Sessões / Killzones / Calendário).
- `apps/api/src/modules/crypto/application/crypto-news-intelligence-service.ts`
- `apps/web/src/main.js` (renderFundamentalistHubHtml + handlers).
- `apps/web/src/styles.css` (seção `.fundi-hub-*`).
