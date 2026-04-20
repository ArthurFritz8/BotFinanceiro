# ADR-067 — Status observavel do scanner de alertas de regime (Wave 27)

## Contexto

O `RegimeAlertsScannerJobRunner` (ADR-064) executa avaliacoes periodicas
de degradacao de regime, mas seu estado interno era opaco. Operadores nao
tinham visibilidade sobre se o scanner estava habilitado, em execucao, qual
foi o ultimo tick, quanto tempo levou, quantos alertas foram emitidos ou se
o ultimo tick falhou. A unica forma de inferir comportamento era ler logs
estruturados ou observar o histograma de alertas.

## Decisao

1. Estender `RegimeAlertsScannerJobRunner` com:
   - Campos privados de metricas: `ticksTotal`, `ticksFailed`,
     `lastTickAtMs`, `lastDurationMs`, `lastAlertsTotal`,
     `lastAlertsCritical`, `lastErrorMessage`.
   - Opcao `clock?: () => number` (default `Date.now`) para tornar o
     calculo de duracao deterministico em testes.
   - Metodo publico `getStatus(): RegimeAlertsScannerStatus` que retorna um
     snapshot imutavel incluindo `enabled`, `running`, `intervalMs`,
     `nextTickAtMs` (calculado como `lastTickAtMs + intervalMs` apenas
     quando o runner esta `started` e ja houve pelo menos um tick).
2. Expor o snapshot via rota publica
   `GET /v1/backtesting/scanner/status`, registrada dentro do mesmo bloco
   `register("/v1", ...)` em `apps/api/src/main/app.ts`. A resposta segue o
   contrato padrao `buildSuccessResponse(request.id, status)`.
3. Adicionar card "Status do scanner periodico" ao painel de backtesting da
   UI (`apps/web/src/shared/backtesting-panel.js`), renderizado antes do
   card de alertas. O fetch usa degradacao graciosa: se o endpoint
   responder !ok (ex.: 404 quando o scanner esta desabilitado em algum
   ambiente), exibe "Sem dados de status" sem quebrar o resto do painel.

## Alternativas avaliadas

- **Metricas Prometheus completas**: rejeitado pelo objetivo zero-cost
  (sem agente/exporter adicional) e por exigir deploy de stack externa.
- **Scraping de logs estruturados**: rejeitado pela UX de operador
  (precisaria de agregador de logs) e por nao expor proximo tick previsto.
- **Endpoint interno (`/_internal/...`)**: rejeitado para manter o card
  visivel diretamente na UI publica do painel sem dependencia de auth
  interna.

## Consequencias

- Operadores conseguem confirmar em segundos se o scanner esta vivo,
  quando rodou pela ultima vez, quantos alertas emitiu e se ha erro
  pendente — tudo via UI.
- Custo: 1 endpoint adicional, 11 campos no snapshot, 1 card de UI.
  Nenhuma dependencia nova.
- Testes: 2 novos casos em
  `regime-alerts-scanner-job-runner.test.ts` cobrindo sucesso (com
  duracao deterministica via `clock`) e falha cumulativa
  (`ticksFailed`, `lastErrorMessage`). Total: 301/301 tests verdes.
