# ADR 002 - Fundacao tecnica do monorepo TypeScript

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Criar a fundacao tecnica do ecossistema para permitir crescimento modular, com padroes de qualidade, validacao de ambiente e base resiliente da API.

## Contexto

O repositorio tinha apenas estrutura de pastas e documentacao inicial. Faltavam scripts de build, lint, typecheck e bootstrap minimo da API para iniciar desenvolvimento seguro.

## Solucao

1. Implementacao de monorepo npm workspaces com apps e packages.
2. Configuracao TypeScript com projeto referenciado.
3. Configuracao de lint e formatacao no root.
4. Bootstrap da API com Fastify, logger centralizado e tratamento de erro global.
5. Validacao estrita das variaveis de ambiente com schema.

## Prevencao

1. Script `check` para lint + typecheck antes de merge.
2. Regra de nao uso de logs soltos fora do logger central.
3. Schema de ambiente para falhar cedo em configuracao invalida.
4. Novas mudancas estruturais devem gerar ADR sequencial.

## Impacto

1. Base pronta para iniciar modulos de dominio sem acoplamento.
2. Melhor previsibilidade de qualidade desde o primeiro commit tecnico.
3. Menor risco de erro por ambiente mal configurado.