# ADR 025 - Integracao OpenRouter no Copiloto de Chat

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Colocar o OpenRouter em funcionamento no projeto para habilitar respostas de IA no endpoint de Copiloto com baixo acoplamento e validacao robusta.

## Contexto

As configuracoes de OpenRouter foram adicionadas no ambiente, mas ainda nao existia fluxo de backend para consumir o provider e retornar resposta ao cliente.

## Solucao

1. Incluidas variaveis OpenRouter no schema Zod de ambiente.
2. Criado adapter dedicado `OpenRouterChatAdapter` com:
- timeout configuravel
- validacao de request/response com Zod
- tratamento de falhas de rede, status e schema
3. Criado modulo Copiloto com service + controller + rota:
- `POST /v1/copilot/chat`
4. Adicionados testes de integracao para:
- 503 quando provider nao configurado
- 200 com sucesso usando fetch mockado
- 400 para payload invalido
5. Sanitizado `.env.example` para remover chave real e manter placeholder seguro.

## Prevencao

1. Chave de API permanece fora de arquivos versionados de configuracao de exemplo.
2. Endpoint falha com erro explicito quando a chave nao esta configurada.
3. Contrato HTTP e integracao com provider ficam protegidos por testes em CI.

## Impacto

1. Copiloto funcional via OpenRouter sem alterar arquitetura modular existente.
2. Menor risco de erros silenciosos por mismatch de payload externo.
3. Base pronta para evoluir para function/tool calling de forma incremental.