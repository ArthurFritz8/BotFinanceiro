# ADR 027 - Tool Calling read-only no Copiloto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir que o Copiloto combine resposta em linguagem natural com consultas read-only ao dominio financeiro e operacional, sem abrir superficie de escrita nem acoes destrutivas.

## Contexto

A integracao inicial com OpenRouter entregava apenas completions textuais. Para perguntas dependentes de estado atual (preco, saude operacional, politica de sincronizacao), o modelo precisava de acesso a dados dinamicos da API.

## Solucao

1. Evoluido o adapter `OpenRouterChatAdapter` para suportar `tools` e `tool_calls`.
2. Implementado loop controlado de tool calling com limite de rodadas para evitar recursao infinita.
3. Definido catalogo de tools read-only no `CopilotChatService`:
- `get_crypto_spot_price`
- `get_operational_health`
- `get_crypto_sync_policy`
4. Validacao de argumentos de tools com Zod antes da execucao.
5. Tratamento seguro de erros de ferramenta com payload estruturado para o modelo.
6. Inclusao de `toolCallsUsed` na resposta final para rastreabilidade.
7. Cobertura de teste de integracao para fluxo completo de tool calling (duas chamadas ao provider).

## Prevencao

1. Apenas ferramentas read-only sao expostas ao modelo.
2. Argumentos invalidos nao quebram o fluxo: retornam erro estruturado de validacao.
3. Loop de tools limitado por numero maximo de rodadas.
4. Tool desconhecida retorna erro controlado (`TOOL_NOT_ALLOWED`).

## Impacto

1. Respostas mais precisas por uso de dados operacionais e de mercado em tempo real.
2. Mantem postura de seguranca e custo zero, sem operacoes de escrita.
3. Melhora observabilidade funcional via `toolCallsUsed` para auditoria de comportamento do Copiloto.
