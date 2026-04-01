# ADR 003 - Contrato de resposta e estrutura modular de rotas

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Padronizar resposta HTTP da API e iniciar arquitetura por modulo com separacao de responsabilidades entre routes, controllers e services.

## Contexto

A API estava funcional, mas sem um contrato de resposta unificado. Isso aumenta risco de inconsistencia entre endpoints e dificulta observabilidade do cliente.

## Solucao

1. Criado contrato padrao com status, meta e payload de sucesso/erro.
2. Error handler global passou a responder no mesmo formato para AppError, validacao e erro interno.
3. Modulo system criado com camadas application e interface para health e ready.
4. Modulo crypto iniciado com endpoint de politica de sincronizacao e validacao por schema de query.

## Prevencao

1. Todo novo endpoint deve usar o contrato de resposta compartilhado.
2. Toda entrada externa deve passar por validacao de schema.
3. Novos modulos devem manter separacao route-controller-service.
4. Erros devem ser tratados apenas no handler central, sem respostas ad hoc.

## Impacto

1. Menos divergencia de payload entre endpoints.
2. Maior clareza para frontend e integracoes.
3. Base preparada para adicionar cache e jobs por modulo sem acoplamento.