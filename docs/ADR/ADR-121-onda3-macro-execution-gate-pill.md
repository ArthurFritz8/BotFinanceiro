# ADR-121 — Onda 3: Macro Execution Gate Pill

- Status: Aceito
- Data: 2026-04-02
- Autor: Equipe Plataforma (Arquiteto Staff CTO + Lead Quant Hedge Fund — peer review acumulado)
- Tags: `macro`, `execution-gate`, `forex`, `intelligence-desk`, `risco-sistematico`

## Contexto

Mesa profissional **nunca** abre direcional discricionario nas ~30min em torno
de eventos macro de alto impacto (FOMC, CPI, NFP, ECB, payrolls).
A causa eh estrutural: spreads alargam 5-30x, microstructure colapsa,
correlacoes cripto/forex/equities convergem para 1, e qualquer setup tecnico
(SMC, RSI, MACD) perde poder preditivo.

Auditoria interna mostrou que o Bot Financeiro ja possui o nucleo macro:

- `apps/api/src/modules/forex/application/institutional-macro-service.ts`
  contem `loadExternalMacroEvents()` (consome `FOREX_MACRO_CALENDAR_URL` em JSON
  generico) e `buildFallbackMacroEvents()` sintetizando agenda determinista
  (CPI, NFP, FOMC Minutes) baseada na semana corrente.
- O servico ja eh consumido em `getStrategySnapshot` para o card forex
  institucional, mas **nao havia endpoint enxuto** que devolvesse apenas a
  agenda upcoming + classificacao de risco direcional para a mesa cripto/binarias.
- Como consequencia, a UI nao expunha nenhum aviso visual quando havia evento
  iminente, e o futuro `execution-gate` (bloqueio automatico de novas entradas)
  nao tinha fonte de verdade para macro risk.

## Decisao

Onda 3 entrega o **Macro Execution Gate** end-to-end com superficie minima:

### Backend

1. Funcao publica `getUpcomingMacroEvents()` exportada de
   `institutional-macro-service.ts`, retornando contrato:

   ```ts
   {
     alertLevel: "red" | "yellow" | "green";
     blockDirectionalRisk: boolean;
     events: Array<{
       country: string; impact: "low"|"medium"|"high";
       hoursToEvent: number; minutesToEvent: number; name: string;
       timestampIso: string;
     }>;
     fetchedAt: string;
     minutesToNextHighImpact: number | null;
     nextEvent: {...} | null;
     source: "external" | "fallback";
   }
   ```

2. Classificacao deterministica de `alertLevel`:
   - `red` se proximo high-impact ocorre em <=180min (3h);
   - `yellow` se high-impact em <=480min (8h) **ou** medium-impact em <=180min;
   - `green` caso contrario.
   - `blockDirectionalRisk = alertLevel === "red"`.

3. Rota REST `GET /v1/macro/upcoming-events` exposta via
   `forex-routes.ts` (alias top-level `/macro/...` para liberar a evolucao
   futura para um modulo dedicado sem quebrar URL publica).
4. Reusa toda a logica de fetch existente (`loadExternalMacroEvents` ja tem
   timeout 8s, retry exponential backoff e logger). Sem nova superficie de
   integracao externa.

### Frontend

5. Modulo isolado `apps/web/src/modules/intelligence-desk/macro-gate-pill.js`
   monta uma pill no header do Chart Lab (`#macro-gate-pill` em `index.html`):
   - Polling 60s via `sharedCoalescer.run("macro-gate-pill", fn)` evitando
     stampede entre re-mounts ou multiplos consumidores;
   - Latest-wins via token monotonico (`activeRequestToken`) - igual padrao
     ADR-120;
   - Texto: `"<nome> · <countdown> · alto|medio"` (ex.: `"FOMC Minutes · 28min · alto"`);
   - `data-alert-level` em `green|yellow|red` ditando cor + animacao de pulso
     (so em red, com `prefers-reduced-motion` neutralizando);
   - Auto-hide quando `alertLevel=green` e proximo evento esta a >24h
     (mesa nao precisa de ruido visual na ausencia de risco macro);
   - State global `globalThis.__BOT_MACRO_GATE_STATE__` + `subscribeMacroGateState()`
     prontos para futura integracao com `execution-gate`.

6. CSS dedicado `.macro-gate-pill` em `styles.css` com tokens consistentes
   com `chart-lab-fallback-badge` (mesma altura, mesma fonte) e
   `prefers-reduced-motion: reduce` neutralizando transitions/animacoes.

7. Hook minimo em `main.js` (~10 linhas IIFE `bootstrapMacroGatePill`),
   defensivo - no-op se elemento ausente (testes/SSR).

### Testes

8. `apps/api/src/modules/forex/interface/macro-upcoming-events-routes.test.ts`
   (2/2 PASS): valida shape completo + classificacao `red` quando high-impact
   <=60min via mock de `globalThis.fetch` em URL externa configurada.
9. `apps/web/tests/macro-gate-pill.test.mjs` (5/5 PASS): exercita
   `formatCountdown` cobrindo agora/sub-hora/hora-inteira/hora+min/invalido.

## Consequencias

### Positivas

- Mesa cripto/binarias passa a ter **a mesma higiene macro** de mesas Tier-1
  forex/equities: pill vermelha sinaliza explicitamente "evite novas direcoes".
- Backend prepara o terreno para `execution-gate` automatico:
  `subscribeMacroGateState((s) => s.blockDirectionalRisk && rejeita())` eh
  um gancho de uma linha.
- Zero novas dependencias externas: agenda externa ja era opcional via env;
  fallback determinista mantem disponibilidade 100% mesmo sem provider.
- Anti-God-Object: arquivo isolado <200 linhas, contrato testavel via
  `_testables`, padrao identico ao ADR-120 (derivativos card).

### Riscos / Tradeoffs

- Classificacao por threshold absoluto (180min/480min) ignora **volatilidade
  esperada** do evento - dois CPIs sucessivos podem ter perfis diferentes.
  Iteracao futura pode incorporar consenso vs surpresa esperada.
- Polling 60s aceita defasagem maxima de 1min - aceitavel para countdown de
  horas, e sharedCoalescer evita stampede entre abas.
- Endpoint nao expoe `Cache-Control` ainda - como o response eh barato e o
  cliente debounceia via polling, deixamos para Onda futura se telemetria
  mostrar pressao no provider externo.

## Alternativas consideradas

- **Pendurar logica direto no card derivativos (ADR-120)**: rejeitado, viola
  separacao de responsabilidades - macro eh transversal a cripto/forex/binarias.
- **Modulo `apps/api/src/modules/macro/` dedicado**: avaliado e adiado -
  service ja vive em `forex/application` e mover agora exigiria mudar imports
  existentes sem ganho funcional. Resolvido via *alias* de rota top-level
  (`/macro/...`) em `forex-routes.ts`, permitindo migracao futura sem quebra
  de URL publica.
- **WebSocket push para countdown**: rejeitado - countdown de eventos
  conhecidos com horas de antecedencia nao precisa de push; polling 60s eh
  preciso o suficiente e mais simples de operar (sem servidor stateful adicional).

## Definicao de Pronto

- [x] Funcao publica `getUpcomingMacroEvents()` em service com classificacao
      red/yellow/green deterministica.
- [x] Rota `GET /v1/macro/upcoming-events` registrada e respondendo 200 com
      `data` envelope padrao.
- [x] Modulo `macro-gate-pill.js` montado no header do Chart Lab com polling
      60s, latest-wins, sharedCoalescer e auto-hide.
- [x] CSS `.macro-gate-pill` com 3 tones + `prefers-reduced-motion`.
- [x] Backend test: 2/2 PASS (fallback shape + red trigger via mock fetch).
- [x] Frontend test: 5/5 PASS (formatCountdown cases).
- [x] README atualizado com referencia ADR-121.
- [x] Doc-guard verde, typecheck verde, lint zero warnings.
