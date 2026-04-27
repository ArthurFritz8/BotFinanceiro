# Release Changelog - Serie institucional real + Live Signals feed real (2026-04-27)

## Objetivo

Registrar formalmente a entrega tecnica que elevou o snapshot institucional para serie de mercado real (com fallback sintetico) e conectou o painel Live Signals a feed real, mantendo degradacao graciosa e rastreabilidade de origem.

## Resumo executivo

1. Backend institucional passou a tentar serie real Yahoo Finance Chart antes da serie sintetica.
2. Contrato institucional passou a expor origem de dados com `marketDataSource` e `marketDataSymbol`.
3. Frontend Live Signals passou a suportar `fetchSignals` assincrono com fallback para mock local.
4. Fluxo de auditoria multi-ativo no Chart Lab foi reforcado com contexto do sinal selecionado.
5. Troca de ativo passou a resetar a aba principal para `resumo`, evitando contexto stale.

## Escopo tecnico consolidado

### Arquivos de backend

1. `apps/api/src/modules/forex/application/institutional-macro-service.ts`
2. `apps/api/src/modules/forex/interface/forex-routes.test.ts`

### Arquivos de frontend

1. `apps/web/src/live-signals.js`
2. `apps/web/src/main.js`
3. `apps/web/tests/live-signals.test.mjs`
4. `apps/web/package.json`

### Artefatos de build versionados

1. `apps/web/dist/index.html`
2. `apps/web/dist/sw.js`

## Contratos/endpoints impactados

1. `GET /v1/forex/institutional-macro/snapshot`
2. `GET /v1/forex/strategy-chart`

Campos novos validados em contrato institucional:

1. `marketDataSource` com valores `yahoo_finance|synthetic`
2. `marketDataSymbol` com simbolo efetivamente resolvido

## Variaveis de ambiente

Sem novas variaveis obrigatorias nesta entrega.

Variaveis relevantes para o novo caminho real:

1. `YAHOO_FINANCE_API_BASE_URL`
2. `YAHOO_FINANCE_TIMEOUT_MS`

## Evidencias de validacao

### 1. Homologacao rapida (smoke local com API real em execucao)

Comando:

```bash
MONITOR_BASE_URL=http://127.0.0.1:3000 npm run monitor:smoke
```

Resultado:

1. `[OK] health (33.61ms, status=200)`
2. `[OK] ready (11.81ms, status=200)`
3. `[OK] copilot-history (1546.71ms, status=200)`

### 2. Evidencias de qualidade da release (execucao anterior da mesma entrega)

1. `npm run test -w @botfinanceiro/web` -> 134 passed, 0 failed
2. `npm run test -w @botfinanceiro/api` -> 325 passed, 0 failed
3. `npm run check` -> sucesso (lint + typecheck globais)

## Riscos conhecidos

1. Dependencia de fonte externa Yahoo para serie real institucional.
2. Em indisponibilidade/timeout/schema invalido do provedor externo, o sistema retorna serie sintetica (degradacao esperada).

## Plano de rollback

1. Reverter commit de integracao da serie real em `institutional-macro-service.ts`.
2. Manter somente serie sintetica no snapshot institucional.
3. Reverter bootstrap do Live Signals para fonte mock-only, caso o feed real apresente regressao.
4. Reexecutar smoke + testes de rota/frontend apos rollback.

## Governanca

1. Decisao estrutural registrada em `docs/ADR/ADR-115-serie-institucional-real-fallback-sintetico-e-live-signals-feed-real.md`.
2. Este documento funciona como release notes/changelog operacional da entrega.