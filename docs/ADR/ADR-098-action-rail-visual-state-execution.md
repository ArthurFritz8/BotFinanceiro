# ADR-098 - Action Rail e Estado Visual de Execucao

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Com o Execution Journal ativo, o Timing Desk passou a auditar planos. Faltava reduzir a friccao operacional segura: abrir rapidamente o painel de Paper Trading e refletir visualmente no grafico se o plano esta em gatilho, espera, observacao ou bloqueio.

Nao devemos disparar uma ordem real nem chamar rota interna de paper trading sem contexto de autenticacao interno. O fluxo correto e deixar a acao explicita, rastreavel e sem side effect perigoso.

## Decisao

Adicionar uma action rail no painel Execution Journal com:

- `Registrar plano`, que preserva o registro manual ja criado no ADR-097;
- `Abrir Paper`, que navega para o painel Paper Trading existente;
- `Limpar`, que reinicia o journal local.

Adicionar tambem `data-execution-state`, `data-execution-gate` e `data-execution-journal-tone` ao viewport do grafico interativo durante o render do Timing Desk. O CSS usa esses atributos para aplicar destaque visual discreto no chart quando o plano esta `trigger`, `waiting`, `watch`, `blocked` ou `incomplete`.

## Conformidade

- Zero Budget: sem dependencia nova.
- Failure-safe: nenhuma chamada de execucao real ou rota interna sem token.
- UX institucional: acoes explicitas e estado visual sem alert nativo.
- Coesao: reaproveita roteamento existente e o estado derivado por Execution Plan/Journal.

## Plano / DoD

- [x] Adicionar acao "Abrir Paper" ao Execution Journal.
- [x] Reusar `navigateToRoute(APP_ROUTE_PAPER)`.
- [x] Projetar estado do plano no viewport do grafico.
- [x] Estilizar estados sem animacao nova.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O operador consegue sair do plano para o painel de simulacao em um clique.
- + O grafico passa a ecoar o estado operacional do Timing Desk.
- + Evita acoplamento indevido com rotas internas de paper trading.
- - A abertura efetiva de trade simulado por botao dedicado continua dependente de uma API publica ou fluxo interno autenticado separado.
