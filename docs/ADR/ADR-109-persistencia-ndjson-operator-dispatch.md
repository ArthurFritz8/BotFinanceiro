# ADR-109 - Persistencia NDJSON do journal centralizado de operator dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-105 entregou o ring buffer in-memory (default 100, teto 500) e a ADR-108 expos os contadores cumulativos como counter Prometheus. Restavam dois gaps observacionais:

- Restart do processo (deploy, OOM, crash) zera o ring buffer e os contadores cumulativos. Painel UI (ADR-107) e scrape Prometheus (ADR-108) ficam sem historico ate o trafego repopular.
- Auditoria forense pos-incidente nao tem trilha durable: se a janela do buffer ja rodou, o evento que disparou o alerta ja saiu do snapshot.

A ADR-055 ja consolidou padrao NDJSON append-only para `paper-trading.jsonl`, e o `.gitignore` cobre `apps/api/data/*.jsonl` — temos infraestrutura comprovada.

## Decisao

Adicionar persistencia NDJSON **opcional** ao `InMemoryOperatorDispatchJournal`, mantendo o caminho in-memory puro como fallback (failure-open).

### 1. Construtor aceita `filePath`

```ts
new InMemoryOperatorDispatchJournal({ filePath, maxEntries });
```

- Sem `filePath`: comportamento ADR-105 inalterado (puramente in-memory).
- Com `filePath`: garante diretorio (`mkdirSync recursive`) + arquivo (criado vazio se ausente) e hidrata estado a partir do disco no boot.

### 2. Hidratacao no boot

`loadFromDisk(filePath)` le o NDJSON linha-a-linha:

- Cada linha valida e parseada com `operatorDispatchEntrySchema` (Zod) e empurrada para o ring buffer + contadores cumulativos.
- **Linhas corrompidas sao ignoradas silenciosamente** (try/catch por linha) para nao bloquear o boot — JSON invalido, schema invalido, arquivo cortado em flush parcial.
- Apos hidratacao, ring buffer mantem so as ultimas `maxEntries` posicoes; **contadores cumulativos refletem TODAS as entradas validas**, preservando o invariante do ADR-108 (counter Prometheus nao decresce ao despejar entradas antigas).

### 3. Append em `record(...)`

Cada `record` validado e:

1. Empurrado para o ring buffer (comportamento ADR-105).
2. Incrementa contadores cumulativos (comportamento ADR-108).
3. Se `filePath` configurado: `appendFileSync(filePath, JSON.stringify(entry) + "\n")` em try/catch.

**Failure-open**: se `appendFileSync` falha (disco cheio, permissao, FS readonly), erro e silenciosamente ignorado. Buffer in-memory continua autoritativo. Observabilidade nunca derruba o pipeline de dispatch.

### 4. `clear()` trunca o arquivo

`clear()` zera o ring buffer + contadores E sobrescreve o arquivo NDJSON com string vazia (mesmo padrao failure-open: I/O falha nao reverte o reset in-memory).

### 5. Wire em `app.ts` + `env.ts`

- `env.ts`: nova var `OPERATOR_DISPATCH_JOURNAL_FILE` com default `apps/api/data/operator-dispatch-journal.jsonl`.
- `app.ts`: `new InMemoryOperatorDispatchJournal({ filePath: env.OPERATOR_DISPATCH_JOURNAL_FILE })`.
- `.env.example`: documenta a variavel logo apos `PAPER_TRADING_DATA_FILE`.
- `.gitignore`: ja cobre `apps/api/data/*.jsonl` — nenhum dump entra no repo.

## Conformidade

- **Zero Budget**: nada novo no `package.json`. NDJSON usa `node:fs` sincrono — mesmo padrao de `paper-trading.jsonl` (ADR-055).
- **Validacao estrita**: cada linha re-validada com `operatorDispatchEntrySchema` na hidratacao.
- **Backward compatible**: construtor numerico (`new InMemoryOperatorDispatchJournal(50)`) e construtor sem args continuam funcionando — ADR-109 e opt-in via opcao estruturada.
- **Failure-open**: I/O falha (read, write, mkdir) degrada para in-memory sem lancar.
- **Privacidade**: arquivo NDJSON contem apenas dados ja expostos por `/v1/paper-trading/operator/journal` (asset, side, tier, score, action, reason). Sem PII, sem credenciais.
- **Gitignore**: `apps/api/data/*.jsonl` ja cobre — nenhum risco de commit acidental.

## Plano / DoD

- [x] Construtor aceita `OperatorDispatchJournalOptions` com `filePath`.
- [x] `loadFromDisk` hidrata ring buffer + cumulativos, ignorando linhas corrompidas.
- [x] `record` faz append NDJSON com try/catch failure-open.
- [x] `clear` trunca o arquivo (failure-open).
- [x] `env.ts` ganha `OPERATOR_DISPATCH_JOURNAL_FILE` com default seguro.
- [x] `app.ts` injeta `filePath` no construtor.
- [x] `.env.example` documenta a variavel.
- [x] 4 testes novos: append por record; hidratacao alem do ring buffer; clear trunca; ignora linhas corrompidas.
- [x] ADR + README atualizados.
- [x] Suite completa verde (`npm run test -w @botfinanceiro/api`), `guard:docs` verde.

## Consequencias

### Positivas

- Restart do processo nao perde mais o historico recente — UI (ADR-107) e Prometheus (ADR-108) reabrem ja com contadores hidratados.
- Trilha forense durable para incidentes: time pode `cat operator-dispatch-journal.jsonl | jq` apos um alerta sem depender de SSH em janela ativa.
- Padroniza-se com `paper-trading.jsonl` (ADR-055), reduzindo curva de aprendizado para novos modulos persistentes.

### Negativas / mitigadas

- Arquivo cresce indefinidamente. Mitigacao parcial: `clear()` trunca; rotacao automatica fica para ADR proprio se tamanho virar problema (NDJSON e amigavel a `logrotate` externo).
- I/O sincrono no hot path do `record`: cada append e `fsync` implicito do SO. Volume real (auto-paper-trading 60s) e <1 evento/min — impacto negligivel. Caso volume cresca, migrar para fila assincrona em ADR proprio.
- Linhas corrompidas viram silent loss. Aceitavel: alternativa (boot quebra) e pior. Diagnostico continua possivel inspecionando o arquivo manualmente.
