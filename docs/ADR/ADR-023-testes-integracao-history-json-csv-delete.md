# ADR 023 - Testes de integracao para history JSON/CSV e limpeza

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Completar cobertura de integracao dos endpoints internos de historico operacional, incluindo leitura JSON, exportacao CSV e limpeza segura.

## Contexto

A cobertura de integracao ja existia para rotas agregadas. Ainda faltavam validacoes fim a fim para:
- GET /internal/health/operational/history
- GET /internal/health/operational/history.csv
- DELETE /internal/health/operational/history

## Solucao

1. Expandida a suite `system-routes.test.ts` com cenarios positivos e negativos.
2. Coberturas adicionadas:
- GET history JSON: 200, 400 e 401
- GET history CSV: 200 e 400
- DELETE history: 200, 400 e 401
3. Para evitar efeito colateral em disco nos testes de limpeza, `operationalHealthHistoryStore.clear` foi stubado por fixture em memoria.

## Prevencao

1. Contratos de auth, validacao e payload dos endpoints de historico ficam protegidos contra regressao.
2. Mudancas nos query params ou semantica de limpeza exigem ajuste explicito de testes.
3. Cobertura executada automaticamente via CI.

## Impacto

1. Observabilidade interna com contrato HTTP mais confiavel.
2. Menor risco de quebra silenciosa nas rotinas de analise/exportacao/limpeza.
3. Reducao de risco operacional sem custo adicional de infraestrutura.