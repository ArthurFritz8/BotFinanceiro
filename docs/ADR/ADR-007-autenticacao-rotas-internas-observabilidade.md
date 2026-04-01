# ADR 007 - Autenticacao de rotas internas de observabilidade

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Impedir exposicao indevida de dados operacionais internos, protegendo endpoints de observabilidade com token interno configurado por ambiente.

## Contexto

O endpoint interno de metricas do scheduler estava acessivel sem autenticação explicita. Isso aumenta risco de vazamento de informacoes de consumo de cota e saude operacional.

## Solucao

1. Adicionada variavel de ambiente `INTERNAL_API_TOKEN`.
2. Criado guard de autenticacao para rotas internas com header `x-internal-token`.
3. Aplicada comparacao em tempo constante do token para reduzir risco de timing attack.
4. Rota `/internal/scheduler/crypto-metrics` passou a exigir preHandler de autenticacao.
5. Em producao, `INTERNAL_API_TOKEN` com menos de 16 caracteres falha na validacao de ambiente.

## Prevencao

1. Toda nova rota interna deve aplicar o mesmo guard de autenticacao.
2. Nao versionar valor real de token; uso estrito de ambiente.
3. Revisar periodicamente rotacao de token interno em ambiente de producao.
4. Monitorar respostas 401/503 para detectar tentativa de acesso indevido ou configuracao incompleta.

## Impacto

1. Reducao do risco de exposicao de metadados operacionais.
2. Maior controle sobre consumo de endpoint interno.
3. Seguranca alinhada com requisito de nao hardcode de dado sensivel.