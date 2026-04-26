# ADR-108 - Metrica Prometheus para o journal centralizado de operator dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-105 entregou o ring buffer in-memory e a ADR-107 expos a UI para auditoria pontual via filtros. Ainda assim, observabilidade contínua continuava cega:

- O dashboard Prometheus/Grafana ja agrega `http_requests_total` (ADR built-in `prometheus-metrics-plugin`), mas sem semântica de _outcome_ do dispatch — um POST `/auto-signal` retorna `200` mesmo quando o bridge classifica `skipped`/`error`.
- Para detectar storms de skips (ex: `duplicate_open_trade` em loop) ou janelas de `error`, um operador precisa abrir manualmente o painel `paper-trading-operator__central` (ADR-107). Sem alerta passivo.
- O ring buffer tem janela limitada (default 100, teto 500); contadores absolutos somem ao despejar entradas antigas, inviabilizando taxa de erro de longo prazo.

## Decisao

Expor um **counter cumulativo** `paper_trading_operator_dispatches_total` com label `action="opened|skipped|error"` via mecanismo de _collectors_ no `prometheus-metrics-plugin`.

### 1. `InMemoryOperatorDispatchJournal` ganha contadores cumulativos

- Novo campo privado `cumulative: { opened, skipped, error }` incrementado em `record(...)`.
- Independente do ring buffer: nao decresce quando entradas antigas sao despejadas. Reseta apenas em `clear()`.
- Novo metodo publico `cumulativeTotals(): { opened, skipped, error, total }` para leitura idempotente (sem efeito colateral, seguro para chamar a cada scrape).

### 2. `prometheus-metrics-plugin` aceita coletores externos

Nova opcao `collectors?: ReadonlyArray<() => string>`:

- Cada coletor retorna fragmento Prometheus ja formatado (`# HELP` + `# TYPE` + linhas).
- Fragmentos sao concatenados apos as metricas built-in no handler de `/internal/metrics`.
- **Failure-open**: se um coletor lanca, o erro vira `logger.warn({ err }, "prometheus_collector_failed")` e o scrape continua com os demais — observabilidade nunca pode derrubar a propria observabilidade.

### 3. Wire em `app.ts`

```ts
const operatorDispatchJournal = new InMemoryOperatorDispatchJournal();

registerPrometheusMetrics(app, {
  enabled: env.METRICS_ENABLED,
  collectors: [() => renderOperatorDispatchPrometheusFragment(operatorDispatchJournal)],
});
```

O journal foi promovido para escopo anterior ao plugin (era criado tarde, antes do controller). O controller continua recebendo a mesma instancia — single source of truth preservada.

### 4. Cardinalidade fixa

`paper_trading_operator_dispatches_total` tem **3 series fixas** (`opened`/`skipped`/`error`). NAO incluímos label de `asset` ou `tier`: cardinalidade explosao em ambientes com muitos ativos é pior do que metrica granular ausente. Drill-down por asset continua disponivel via journal HTTP (ADR-106) ou painel UI (ADR-107).

## Conformidade

- **Zero Budget**: nada novo no `package.json`. O coletor reusa a mesma string-render do plugin.
- **Validacao estrita**: contadores sao numeros inteiros positivos derivados de `action` ja validado por Zod (`operatorDispatchActionSchema`).
- **Backward compatible**: `registerPrometheusMetrics(app, { enabled })` sem `collectors` continua funcionando — opcao opcional com default `[]`.
- **Failure-open**: collector que lanca nao derruba scrape (ja coberto por teste).
- **Auth preservada**: `/internal/metrics` continua exigindo `INTERNAL_API_TOKEN` (ADR-007/008) — nada vaza sem token.
- **Cardinalidade controlada**: 3 series fixas; sem labels de alta cardinalidade.

## Plano / DoD

- [x] `InMemoryOperatorDispatchJournal` ganha `cumulativeTotals()` + reset em `clear()`.
- [x] `renderOperatorDispatchPrometheusFragment(journal)` exportado do mesmo modulo.
- [x] `prometheus-metrics-plugin` aceita opcao `collectors`.
- [x] Hook `app.ts` injeta o coletor mantendo singleton do journal.
- [x] 4 testes novos (cumulativo cresce + sobrevive ring buffer; clear reseta; render emite 3 series; collector failure-open).
- [x] 2 testes novos no plugin (fragmento custom anexado; coletor que lanca nao derruba scrape).
- [x] ADR + README atualizados.
- [x] Build TS verde, guard:docs verde.

## Consequencias

### Positivas

- Alertas Prometheus podem disparar em `rate(paper_trading_operator_dispatches_total{action="error"}[5m]) > 0.1`.
- Razao de aceitacao calculavel ao longo de qualquer janela: `opened / (opened + skipped + error)`.
- Mecanismo de `collectors` fica disponivel para futuros modulos (ex: ADR-109 podera expor counter de circuit breakers do operator local).

### Negativas / mitigadas

- Counters in-memory zeram em restart do processo. Aceitavel: scrape Prometheus tipicamente toma diferenca discreta (`rate()`) e tolera reset via `resets()`.
- Sem label de `asset`/`tier`: drill-down requer journal HTTP. Mitigado pela ADR-107 (painel UI).
- Coletor sincrono: se virar custoso, podemos migrar para snapshot async em ADR proprio. Hoje `cumulativeTotals()` eh O(1).
