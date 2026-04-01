# ADR 020 - Testes de integracao da rota interna CSV agregada

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Garantir regressao zero no contrato HTTP da rota interna de exportacao CSV agregada do historico operacional.

## Contexto

Ja existiam testes de nivel de service para a agregacao e CSV, mas faltava cobertura fim a fim da camada HTTP (auth, headers e payload) para a rota:
GET /internal/health/operational/history/aggregate.csv

## Solucao

1. Criado teste de integracao com Fastify inject para a rota interna CSV agregada.
2. Coberturas implementadas:
- 401 sem token interno
- 200 com token interno valido
- `Content-Type` CSV
- `Content-Disposition` com nome de arquivo de exportacao
- cabecalho CSV esperado no corpo de resposta
3. Fixture de historico controlada no teste para resultado deterministico.
4. Ajustada assinatura do `preHandler` interno para callback com `done`, evitando requests pendentes quando a autenticacao e valida.

## Prevencao

1. O teste protege contrato de autenticacao e formato de exportacao contra regressao acidental.
2. Mudancas futuras no schema do CSV devem atualizar o teste e gerar novo ADR quando alterarem contrato externo.
3. Cobertura passa a ser executada automaticamente no pipeline de CI.

## Impacto

1. Maior confiabilidade da observabilidade exportavel para operacao.
2. Reducao de risco de quebra silenciosa de headers ou formato CSV.
3. Base para ampliar testes de integracao das demais rotas internas.