# ADR 019 - CI com check e testes na branch principal

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Automatizar validacao de qualidade em cada pull request e push da branch principal para reduzir regressao e padronizar o DoD tecnico.

## Contexto

O fluxo local ja executa `npm run check` e `npm test`, mas sem gate automatizado no remoto havia risco de merge com falhas de lint, typecheck ou testes.

## Solucao

1. Criado workflow GitHub Actions em `.github/workflows/ci.yml`.
2. Gatilhos configurados para:
- `pull_request` na branch `master`
- `push` na branch `master`
- `workflow_dispatch` para execucao manual
3. Etapas do pipeline:
- checkout
- setup Node.js 20 com cache npm
- `npm ci`
- `npm run check`
- `npm test`
4. Adicionado controle de concorrencia para cancelar execucoes antigas no mesmo ref.
5. Script de testes da API ajustado para runner sem glob de shell (`node scripts/run-tests.mjs`), garantindo compatibilidade no Node 20 do CI.

## Prevencao

1. Timeout de 15 minutos para evitar execucoes penduradas.
2. Pipeline usa lockfile (`npm ci`) para reproducibilidade.
3. Mudancas de qualidade minima exigem atualizacao explicita deste ADR.

## Impacto

1. Feedback rapido de qualidade em PR.
2. Menor risco de regressao na branch principal.
3. Base pronta para evoluir com gates adicionais (coverage, seguranca, build por app).