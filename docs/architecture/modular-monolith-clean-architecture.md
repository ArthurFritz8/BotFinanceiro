# Arquitetura Base - Modular Monolith + Clean Architecture

## Principios
1. Custo zero por padrao (free tier ou open-source sem custo recorrente).
2. Modulos independentes por dominio de negocio.
3. Integracoes externas isoladas por adapters.
4. Validacao estrita de entrada/saida com schema.
5. Tratamento de erro centralizado e logger unico.

## Estrutura de pastas
- apps/api/src/shared
- apps/api/src/modules
- apps/api/src/integrations
- apps/api/src/jobs
- apps/api/src/main
- apps/api/tests
- apps/web/src/app
- apps/web/src/modules
- apps/web/src/shared
- apps/web/src/state
- apps/web/tests
- packages/shared_types
- packages/shared_schemas
- packages/shared_utils
- docs/ADR
- docs/runbooks

## Convencoes de nomenclatura
1. Banco de dados: snake_case.
2. Codigo JS/TS: camelCase e PascalCase.
3. Variaveis de ambiente e constantes: UPPER_SNAKE_CASE.

## Resiliencia e degradacao
1. Cada modulo deve operar de forma independente.
2. Falha em provider de acoes nao pode parar modulo cripto/airdrops.
3. Toda chamada externa deve aplicar timeout, retry com backoff e circuit breaker.
4. Cache em camadas antes de novas chamadas externas.

## Camadas por modulo (referencia)
1. domain: entidades, regras e contratos.
2. application: casos de uso e orquestracao.
3. infrastructure: adapters de API, repositorio e cache.
4. interface: controllers, rotas e DTOs.

## Definicao de pronto obrigatoria
1. Codigo limpo, modular e tipado.
2. Erros centralizados.
3. Sem segredo hardcoded.
4. ADR/O.C.S.P. atualizado.
5. Runbook/README atualizados para mudancas operacionais ou de uso.
6. Evidencias de validacao registradas (`check`, testes e build aplicavel).
7. Checklist de mudanca preenchido quando a entrega envolver multiplos arquivos.
