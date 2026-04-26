# ADR-105 - Journal centralizado de operator dispatch (backend)

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Especialista em Trading Institucional, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-104 entregou o journal local (em `localStorage`) do operator auto-dispatch. Excelente para auditoria por operador, mas insuficiente para um terminal institucional que precisa de visao centralizada cross-device:

- O operador A nao ve o que o operador B disparou no mesmo dia, mesmo usando o mesmo `PAPER_TRADING_OPERATOR_TOKEN`.
- Em incidentes (ex: storm de skips por `duplicate_open_trade`), nao ha como reconstituir a sequencia real recebida pelo backend.
- O journal local pode ser limpo pelo operador a qualquer momento (botao "Limpar histórico"), apagando evidencia.

A ADR-104 ja antecipou o gap ("Proxima ADR candidata: endpoint backend `GET /v1/paper-trading/operator/journal`"). Esta ADR cumpre essa promessa sem inflar o escopo: zero persistencia em disco, zero novo middleware, reuso integral do `assertPaperTradingOperatorAuth` (ADR-102).

## Decisao

Adicionar um journal centralizado, in-memory, alimentado pelo proprio `AutoPaperTradingController` ao processar `POST /v1/paper-trading/operator/auto-signal`.

### 1. Domain — `operator-dispatch-types.ts`

Schema Zod minimo e nao sensivel:

```ts
operatorDispatchEntrySchema = z.object({
  id, occurredAtMs, asset, side, tier, confluenceScore,
  action: "opened" | "skipped" | "error",
  reason: string | null,
});
```

Deliberadamente **nao** persiste token, IP nem payload completo — apenas o que ja viaja no signal + resultado do bridge. LGPD/seguranca preservadas: nada que vaze em export ou devtools.

### 2. Infrastructure — `InMemoryOperatorDispatchJournal`

Ring buffer single-process com:

- `record(input)`: valida via Zod, gera `id` (`randomUUID`), aplica timestamp e empurra para o array. Quando excede `maxEntries`, descarta as mais antigas.
- `snapshot(limit?)`: retorna `{ total, opened, skipped, errors, entries }` ordenado por `occurredAtMs` desc. `limit` saturado em `maxEntries` (default 100, teto absoluto 500).
- `clear()` / `size()`: utilitarios para teste e futura rota de manutencao.

Escolha de **in-memory** (vs JSONL como `JsonlTradeStore`):

- O journal local do ADR-104 ja garante persistencia por operador.
- Disparos sao eventos operacionais voláteis (intencao), nao registros financeiros (esses ja vivem em `paper-trading-trades.jsonl`).
- Single-process com restart ocasional aceita perda de janela curta — nao justifica I/O sincrono em hot path.
- Migrar para JSONL futuro e trivial (mesma interface).

### 3. Interface — controller + rota

`AutoPaperTradingController` agora aceita `operatorJournal?` como segundo parametro:

- No `submitConfluenceSignal`, apos o bridge tentar abrir o trade, registra entrada com `asset/side/tier/confluenceScore/action/reason` (parseando o body novamente com `confluenceSignalSchema.safeParse` para nao confiar em estado cruzado).
- Novo handler `listOperatorJournal`:
  - Sem journal injetado: 503 com `enabled: false` e contadores zerados (degradacao explicita).
  - Com journal: 200 + snapshot. Aceita `?limit=N` (Zod union string|number, range 1-500).

`registerPaperTradingPublicRoutes` adiciona `GET /paper-trading/operator/journal` reusando `operatorRouteOptions` (mesmo `assertPaperTradingOperatorAuth` da ADR-102 — header `x-paper-trading-operator-token`).

### 4. Wiring (app.ts)

```ts
const operatorDispatchJournal = new InMemoryOperatorDispatchJournal();
const autoPaperTradingController = new AutoPaperTradingController(
  autoPaperTradingBridge,
  operatorDispatchJournal,
);
```

Sem flag dedicada: o journal segue o mesmo gate `AUTO_PAPER_TRADING_ENABLED` da rota POST. Se `autoController` nao e registrado, a rota GET tambem nao existe — coerencia binaria.

## Conformidade

- **Zero Budget**: sem dependencia nova; `randomUUID` + array + Zod ja presentes.
- **Validacao estrita Zod**: schema separado em `domain/`, parse no `record` e no query do GET.
- **Seguranca**: mesmo `assertPaperTradingOperatorAuth` da rota POST; nenhuma credencial persistida; ring buffer de 100 (teto 500) evita inundacao por DoS local.
- **Fail-honest**: 503 explicito quando journal nao injetado; sem fallback silencioso para snapshot vazio.
- **Reuso**: o controller chama `safeParse` do mesmo `confluenceSignalSchema` ja validado pelo bridge — fonte unica de verdade para o shape do signal.

## Plano / DoD

- [x] Domain `operator-dispatch-types.ts` com schema Zod e tipos.
- [x] Infra `InMemoryOperatorDispatchJournal` com 4 testes unitarios verdes.
- [x] Controller estende com `listOperatorJournal` + record no `submitConfluenceSignal`.
- [x] Rota `GET /paper-trading/operator/journal` com `operatorRouteOptions`.
- [x] Wiring em `app.ts`.
- [x] 3 novos testes em `paper-trading-routes.test.ts` (401 sem token, listagem com agregacao, query `?limit=`).
- [x] `npm run build`/`test` verdes.
- [x] ADR e README atualizados.

## Consequencias

- + Operadores ganham visao centralizada cross-device dos disparos sem dependencia de export do journal local.
- + Auditoria de incidentes (storm de skips, taxa de erros) fica trivial via `curl` autenticado.
- + Schema minimo + ring buffer mantem footprint < 50KB tipico em memoria.
- − Journal nao sobrevive a restart do processo. Aceito porque trades reais ja estao em `paper-trading-trades.jsonl`; quem precisa de retencao longa consulta o trade store.
- − Em deploy multi-replica futuro, cada replica teria seu proprio journal. Solucao: trocar `InMemoryOperatorDispatchJournal` por implementacao Redis/JSONL via mesma interface — sem alterar controller nem rota.
- → Proxima ADR candidata: filtros temporais (`?from=&to=`) e por `asset`/`action` no GET, espelhando o padrao `/internal/health/operational/history` (ADR-016).
