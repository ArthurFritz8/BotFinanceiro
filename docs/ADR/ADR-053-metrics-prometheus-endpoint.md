# ADR-053: Endpoint Prometheus em /internal/metrics

- Status: Aceito
- Data: 2026-04-22
- Wave: 13

## Contexto

Apos as Waves 10-12 (rate-limit publico, security headers HTTP e CI matrix
Node 20+22), a API ja possui defesa em profundidade nos canais publicos e
verificacao continua nas duas LTS suportadas. O proximo gap de maturidade
operacional eh **observabilidade externa**: nao temos como acoplar
ferramentas padrao de mercado (Prometheus + Grafana, Datadog, New Relic
OpenMetrics) para inspecionar:

- Volume de requisicoes HTTP por rota / metodo / status.
- Distribuicao de latencia (p50, p95, p99) por rota.
- Saude do processo Node (heap, RSS, uptime).

Os stores existentes em `apps/api/src/shared/observability/*` (live-chart,
operational-health, ghost-audit, etc.) ja mantem snapshots e ring buffers
para as rotas internas `/internal/health/*`, mas em formato JSON proprietario
voltado para inspecao manual e exportacao CSV (ADR-013/014/015/016/017/018).
Eles nao sao consumiveis por scrapers de metricas que falam o protocolo
texto Prometheus 0.0.4.

OWASP A09 (Security Logging and Monitoring Failures) reforca a importancia
de instrumentacao operacional acessivel por ferramentas externas.

## Decisao

Implementar um endpoint Prometheus minimalista, **zero deps externas**
(in-process registry + serializador texto manual), exposto em
`GET /internal/metrics` com `Content-Type: text/plain; version=0.0.4`.

Familias de metricas instrumentadas:

| Familia | Tipo | Labels | Origem |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status` | Hook `onResponse` |
| `http_request_duration_seconds` | histogram | `method`, `route` | Hook `onResponse` (`reply.elapsedTime`) |
| `process_uptime_seconds` | gauge | -- | `process.uptime()` |
| `nodejs_heap_used_bytes` | gauge | -- | `process.memoryUsage().heapUsed` |
| `nodejs_heap_total_bytes` | gauge | -- | `process.memoryUsage().heapTotal` |
| `nodejs_rss_bytes` | gauge | -- | `process.memoryUsage().rss` |

### Decisoes-chave

- **Template de rota como label** (`request.routeOptions.url`): rotas
  parametrizadas como `/v1/crypto/:id` reportam o template, nao o valor real
  (`bitcoin`, `ethereum`, ...), evitando explosao de cardinalidade.
- **Buckets do histograma**: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1,
  2.5, 5, 10]` segundos. Otimizados para uma API JSON com medianas tipicas
  de 5-50ms e caudas longas em consultas a CoinGecko (ate ~5s).
- **Excluir `/internal/metrics` da contagem**: evita feedback loop quando
  scrape em alta frequencia poluiria a propria rota.
- **Auth via `assertInternalRouteAuth`**: reusa ADR-007 (token) + ADR-008
  (whitelist IP opcional). O endpoint nao deve ser publico.
- **Failure-open via `METRICS_ENABLED`** (default `true`): permite kill-switch
  sem redeploy.
- **Zero deps externas**: nao adiciona `prom-client` ou similar. O custo de
  manutencao do serializador texto e' baixo e elimina supply-chain risk
  adicional.

## Consequencias

Positivas:

- Compatibilidade imediata com qualquer scraper Prometheus (Grafana Cloud,
  Datadog OpenMetrics, VictoriaMetrics, Mimir).
- Visibilidade externa de saude do processo Node sem depender de logs.
- Endpoint protegido pela mesma camada das demais rotas internas.
- Template-based labels mantem cardinalidade limitada e custo de scrape
  previsivel.

Neutras:

- Stores especificos (live-chart, operational-health, ghost-audit) continuam
  expondo JSON proprietario via rotas existentes. A exportacao Prometheus
  desses dados pode ser adicionada incrementalmente em ADR futuro se
  ferramentas externas precisarem deles.

Negativas:

- Implementacao manual do formato texto Prometheus exige cuidado se novas
  familias de metrica forem adicionadas (escapar labels, ordenar buckets,
  emitir `+Inf`, `_sum`, `_count`).

## Alternativas consideradas

1. **`prom-client`** (npm): biblioteca de referencia. Descartada por
   adicionar dep externa ao produto principal e por o nosso conjunto de
   metricas inicial ser pequeno (< 10 series basicas).
2. **`fastify-metrics`** plugin: depende de `prom-client` indiretamente.
   Mesmo veredito.
3. **Expor JSON em vez de Prometheus**: quebra compatibilidade com o
   ecossistema padrao de scraping.
4. **Agregar metricas dos stores existentes (live-chart, ghost-audit, etc.)
   ja na primeira entrega**: aumentaria o escopo. Sera tratado em ADR
   incremental se necessario.

## Referencias

- ADR-007 (Auth rotas internas observabilidade)
- ADR-008 (Whitelist opcional IP rotas internas)
- ADR-006 / ADR-010 / ADR-011 (Observabilidade scheduler / circuit breaker)
- OWASP Top 10 2021 - A09 Security Logging and Monitoring Failures
- Prometheus Exposition Format 0.0.4: https://prometheus.io/docs/instrumenting/exposition_formats/
