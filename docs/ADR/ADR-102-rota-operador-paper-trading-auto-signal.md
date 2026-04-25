# ADR-102 - Rota de Operador para Auto Signal Paper Trading

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Backend Engineer, Arquiteto Socratico, Especialista em Trading Institucional.

## Contexto / Observacao

O Auto Guard do ADR-101 define quando um plano esta elegivel para automacao simulada. O backend ja tinha `/internal/paper-trading/auto-signal`, protegido por `INTERNAL_API_TOKEN`, mas esse token nao deve ser exposto ao frontend nem usado como credencial de operador humano.

Precisamos de um contrato backend deliberado para abertura simulada, com autenticacao propria, rate limit publico e sem enfraquecer as rotas internas.

## Decisao

Adicionar `PAPER_TRADING_OPERATOR_TOKEN` e a rota versionada:

`POST /v1/paper-trading/operator/auto-signal`

A rota exige o header `x-paper-trading-operator-token`, valida o token em tempo constante e delega ao `AutoPaperTradingController.submitConfluenceSignal`. O contrato reaproveita o `AutoPaperTradingBridge`, mantendo validacao Zod, rejeicao por tier minimo e bloqueio de trade duplicado aberto por ativo.

## Conformidade

- Zero Budget: sem dependencia nova.
- Seguranca: nao expor `INTERNAL_API_TOKEN` ao frontend.
- Controle operacional: token dedicado e opt-in; se ausente, a rota retorna 503.
- Rate limit: rota fica sob `/v1`, portanto segue o limitador publico.
- Reuso: nao duplica regra de abertura, usa o bridge existente.

## Plano / DoD

- [x] Adicionar env `PAPER_TRADING_OPERATOR_TOKEN`.
- [x] Criar autenticacao dedicada por header `x-paper-trading-operator-token`.
- [x] Registrar rota versionada de operador quando Auto Paper Trading estiver habilitado.
- [x] Cobrir sem token, token invalido e abertura com token valido.
- [x] Atualizar README e indice de ADRs.

## Consequencias

- + O frontend podera integrar abertura simulada sem conhecer token interno.
- + A operacao fica explicitamente separada de rotas internas de manutencao.
- + A rota degrada para 503 se o operador nao configurar token.
- - Ainda falta a UX frontend para armazenar/enviar token de operador de forma controlada.
