# ADR 022 - Testes negativos de validacao nas rotas agregadas internas

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Elevar confiabilidade do contrato HTTP das rotas agregadas internas com cobertura de cenarios de erro e validacao.

## Contexto

As rotas agregadas JSON e CSV ja tinham cobertura de sucesso e ausencia de token. Faltavam cenarios negativos adicionais para validar comportamento de autenticacao invalida e query params invalidos.

## Solucao

1. Expandida a suite de integracao das rotas agregadas em `system-routes.test.ts`.
2. Cenarios novos cobertos:
- 401 com token interno invalido (JSON e CSV)
- 400 quando `from > to` (JSON e CSV)
- 400 para `granularity` invalida
- 400 para `bucketLimit` fora do intervalo permitido
3. Assert padronizado para respostas de erro com `code=VALIDATION_ERROR` e `message=Invalid payload` quando aplicavel.

## Prevencao

1. Mudancas de validacao em query params passam a exigir ajuste explicito de testes.
2. Reduz risco de regressao silenciosa em regras de protecao de rotas internas.
3. Cobertura negativa roda automaticamente no CI.

## Impacto

1. API interna mais previsivel em cenarios de uso incorreto.
2. Menor risco operacional em integracoes que consomem observabilidade.
3. Base de testes mais completa para evolucao de filtros e parametros.