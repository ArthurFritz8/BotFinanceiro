# ADR-109 - Persistencia NDJSON do journal centralizado de operator dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-105 entregou o ring buffer in-memory do journal de operator dispatch e a ADR-108 expos os contadores cumulativos via Prometheus. Restava uma lacuna critica para auditoria operacional:

- **Volatil entre restarts**: cada `pm2 restart`, redeploy ou crash zera o ring buffer (`entries[]`) **e** os contadores cumulativos (`opened/skipped/error`). Isso quebra a leitura prometheus de longo prazo (counter cai para 0 = "reset detectado", mas neste caso o reset e' real e perde toda a serie historica).
- **Sem replay de incidente**: se o operador suspeita que um burst de `error` ocorreu antes do ultimo deploy, nao ha como recuperar o detalhe das entradas — nem na UI (ADR-107) nem no Prometheus (ADR-108 so mostra deltas a partir do scrape).
- **Inconsistente com `JsonlTradeStore`** (ADR-055): trades paper ja sobrevivem a restart via NDJSON append-only no mesmo diretorio `apps/api/data/`. O journal de dispatch ficava como ilha volatil.

## Decisao

Introduzir persistencia **opcional** NDJSON append-only no `InMemoryOperatorDispatchJournal`, hidratando o estado (ring buffer + cumulativos) na construcao a partir do disco.

### 1. Construtor aceita `OperatorDispatchJournalOptions`

```ts
new InMemoryOperatorDispatchJournal({
  maxEntries: 100,
  filePath: "apps/api/data/operator-dispatch-journal.jsonl",
});
```

- Compatibilidade backward com ADR-105: `new InMemoryOperatorDispatchJournal()` e `new InMemoryOperatorDispatchJournal(2)` continuam funcionando — o construtor aceita `number | OperatorDispatchJournalOptions`.
- Sem `filePath` o comportamento e' identico ao do ADR-105 (puramente in-memory). Util para testes que nao querem tocar disco.

### 2. Append sincrono em cada `record()`

- Apos o `parse` Zod e o ajuste do ring buffer, a entrada validada e' serializada em JSON e escrita via `appendFileSync` (uma linha por entrada, terminada com `\n`).
- **Failure-tolerant**: I/O lanca em ambientes read-only (ex: container sem volume montado) → entrada permanece em memoria, processo continua. Eventos de log seriam ruido no hot-path; preferimos degradacao silenciosa coerente com o resto do stack (`JsonlTradeStore` ignora corrupcao na carga, este journal ignora falha de append).

### 3. Hidratacao no boot via `loadFromDisk`

- Le o arquivo, faz split por `\n`, descarta linhas vazias.
- Para cada linha: `JSON.parse` + `operatorDispatchEntrySchema.parse` (Zod). Linha invalida → ignorada silenciosamente (truncamento parcial, JSON corrompido, payload de versao incompativel).
- **Cumulativos refletem TODAS as entradas validas**, mesmo que excedam `maxEntries`. O ring buffer e' aparado ao final preservando apenas as ultimas `maxEntries` posicoes — invariante do ADR-108 e' preservado (cumulativos cross-window, snapshot bounded).

### 4. `clear()` trunca arquivo + memoria

- `writeFileSync(filePath, "")` apos limpar `entries[]` e `cumulative`. Operacao atomica suficiente para single-process (alinhada ao padrao `JsonlTradeStore.clear()`).

### 5. Wire em `app.ts` + nova env

- Nova variavel `OPERATOR_DISPATCH_JOURNAL_FILE` com default `apps/api/data/operator-dispatch-journal.jsonl`.
- `app.ts` injeta `{ filePath: env.OPERATOR_DISPATCH_JOURNAL_FILE }` na construcao do singleton — coletor Prometheus ja' enxerga cumulativos restaurados antes do primeiro scrape.

## Consequencias

### Positivas

- Counter Prometheus `paper_trading_operator_dispatches_total` (ADR-108) sobrevive a restart — alertas de taxa de erro/skip de longo prazo se tornam confiaveis.
- Painel UI (ADR-107) volta com historico real em vez de comecar do zero apos cada deploy.
- Replay de incidente possivel: arquivo NDJSON e' grep-friendly (`grep '"action":"error"' apps/api/data/operator-dispatch-journal.jsonl | tail`).

### Custos / Trade-offs

- I/O sincrono no hot-path do dispatch. Cada entrada e' ~200 bytes; em throughput esperado (<10 disparos/min em producao) o impacto e' < 1 ms por gravacao. Se a taxa subir 100x sera necessario migrar para `appendFileSync` async ou stream em batch.
- Arquivo cresce monotonicamente — ainda nao ha rotacao. Mitigado pelo perfil de uso (poucas entradas/dia); rotacao por idade/tamanho fica para ADR proprio se necessario.
- Single-process. Multi-instance precisa de SQLite ou broker dedicado (mesmo limite do `JsonlTradeStore`).

## Validacao

- Test `ADR-109: persistencia NDJSON > anexa cada record no arquivo configurado`.
- Test `ADR-109 > hidrata estado a partir do disco preservando cumulativos alem do ring buffer` (escreve 6 entradas, reabre com `maxEntries: 2`, valida `total=6` em cumulativos e `size=2` no buffer).
- Test `ADR-109 > clear trunca o arquivo e zera cumulativos`.
- Test `ADR-109 > ignora linhas corrompidas durante a hidratacao`.
- Suite completa `npm run test -w @botfinanceiro/api` permanece verde.

## Alternativas Consideradas

- **Classe separada `JsonlOperatorDispatchStore` com decoracao**: aumentaria churn em 6+ call sites (controller, routes, tests). O custo de coesao supera o ganho de SRP num modulo pequeno.
- **SQLite via `better-sqlite3`**: nao zero-budget, exige binario nativo; over-engineered para o volume atual.
- **Persistencia async com queue**: complica recovery (`process.exit` perde entradas em flight). Sync sem batch preserva fail-honest acima de throughput marginal.
