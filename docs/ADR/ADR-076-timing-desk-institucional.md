# ADR-076 — Timing Desk Institucional (Sessões, Killzones e Calendário Macro)

- Status: Aceito
- Data: 2026-04-24
- Decisores: Arquiteto Socratico + Trading Institucional + UI/UX Terminais Financeiros
- Contexto operacional: Zero Budget Free Tier; Snake_case DB / camelCase JS; Zod estrito; Graceful Degradation; OCSP

## Contexto

A aba "Timing" do Intelligence Desk (`apps/web/src/main.js`, render em
`activeAnalysisTabId === "timing"`) era composta apenas por dois cards
estaticos ("Janela de execucao" + "Ritmo operacional"), sem mapeamento
real de liquidez de sessoes, killzones institucionais (ICT/SMC) ou
calendario macro consumivel pelo trader.

Em paralelo, o backend ja entrega:

- `institutional.macroRadar.upcomingEvents` (eventos macro proximos com
  impacto e horas para evento) — produzido no Intelligence Desk;
- `insights.volatilityPercent` em `buildQuantitativeAnalysis()`;
- helper `isLikelyForexPairSymbol()` em main.js para classe do ativo.

Faltava agregar esses sinais em uma visao unica de "Timing Desk" estilo
Bloomberg/TradingView, com adaptacao por classe de ativo (cripto vs
forex vs equities) e respeito ao envelope Zero Budget (nenhum fetch
externo novo).

## Decisao

1. Estender `analysis.timing` em `buildQuantitativeAnalysis()` com
   `volatilityPercent` (numero) — derivado de `insights.volatilityPercent`,
   sem novos calculos.
2. Reescrever o bloco de render `activeAnalysisTabId === "timing"` para
   produzir 4 secoes:
   - **Header de contexto**: 2 cards lado-a-lado — Volatilidade
     (bucket Baixa / Normal / Alta / Extrema) e Sessao Ativa atual com
     relogio UTC live;
   - **Mapa de Liquidez**: timeline horizontal 0-23h UTC com 3 sessoes
     globais (Asia / Londres / Nova York) e marcador "VOCE ESTA AQUI";
   - **Killzones ICT/SMC**: 4 cards com janelas recomendadas (London
     Killzone, NY AM Killzone, Asian Range, NY PM) + zonas a evitar
     (lunch gap, fechamento erratico) — adaptativo: cripto inclui
     funding windows 00/08/16 UTC;
   - **Calendario Macro**: consome `institutional.macroRadar.upcomingEvents`
     com tag de impacto colorida; fallback gracioso para
     `analysis.newsProxy` quando ausente.
3. Helpers puros adicionados em `main.js`:
   - `getCurrentTradingSessionUtc(nowMs)` — retorna `{ active: [...], primary, label }`;
   - `getVolatilityRegime(volPct)` — retorna `{ key, label, tone }`;
   - `getKillzonesForAssetClass(assetClass)` — retorna `{ recommended: [...], avoid: [...] }`;
   - `formatUtcClock(date)` — `HH:mm UTC` com `tabular-nums`.
4. Relogio UTC: interval unico module-scope (`timingUtcClockInterval`),
   armado ao entrar na aba e desarmado ao sair / re-render — evita leaks.
5. CSS apendado em `apps/web/src/styles.css` com classes `timing-*`,
   respeitando dark premium, `font-mono tabular-nums` em horarios e
   `@media (prefers-reduced-motion: reduce)` neutralizando transicoes.

## Consequencias

Positivas:
- Trader recebe escudo macro institucional sem custo (tudo derivado de
  dados ja calculados ou de `Date.now()` UTC deterministico);
- Adaptativo por classe (cripto vs forex) elimina conselhos invalidos;
- Killzones ICT/SMC fundem o modulo Timing com SMC (ADR-071), criando
  narrativa coerente de leitura institucional;
- IDs estaveis (`timing-vol-status`, `timing-session-active`,
  `timing-utc-clock`, `timing-killzone-list`, `timing-events-list`)
  permitem futura injecao por backend sem refactor.

Negativas / Trade-offs:
- Relogio UTC adiciona um interval; mitigado por single-instance guard
  + cleanup em re-render;
- Mapa estatico de killzones nao reflete eventos pontuais (overruled em
  dias de FOMC etc.) — calendario macro complementa essa lacuna.

## Alternativas consideradas

- Integrar API paga ForexFactory/Investing.com — **rejeitado** por
  violar Zero Budget e por TOS restritivo;
- Renderizar o timing como SVG inline animado — **rejeitado**: complexity
  alta e ganho marginal vs CSS gradient + flex.

## Referencias

- ADR-068 Ensemble Engine
- ADR-071 Detalhamento SMC institucional
- ADR-074 Dashboard Probabilistico Quantitativo
- ICT Inner Circle Trader (Killzones reference)
