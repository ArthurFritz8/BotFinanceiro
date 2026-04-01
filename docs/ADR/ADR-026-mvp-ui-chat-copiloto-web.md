# ADR 026 - MVP da interface web de chat do Copiloto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Entregar uma interface web inicial para o Copiloto Financeiro, conectada ao endpoint de backend ja implementado, para validacao rapida de experiencia e fluxo de produto.

## Contexto

O backend do Copiloto via OpenRouter ja estava funcional com `POST /v1/copilot/chat`, mas ainda nao havia interface visual para uso continuo por chat.

## Solucao

1. Scaffold do app web com Vite no workspace `apps/web`.
2. Criada UI de chat responsiva com:
- historico de mensagens
- status de conexao
- prompts rapidos
- exibicao de metadados de modelo/tokens
3. Integracao direta do frontend com `POST /v1/copilot/chat`.
4. Configurado proxy de desenvolvimento para `/v1` via `vite.config.js`.
5. Scripts adicionados para execucao local do frontend e documentacao atualizada no README.

## Prevencao

1. O frontend usa endpoint relativo (`/v1`) para reduzir risco de CORS no dev com proxy.
2. Erros de API sao exibidos no chat com degradacao graciosa para o usuario.
3. Estrutura preparada para evoluir com function/tool calling sem quebrar contrato atual.

## Impacto

1. Habilita validacao de UX do Copiloto imediatamente.
2. Reduz ciclo de feedback entre backend e experiencia final.
3. Cria base visual para proximos incrementos de automacao inteligente.