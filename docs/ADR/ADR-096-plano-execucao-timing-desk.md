# ADR-096 - Plano de Execucao no Timing Desk

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

O ADR-095 adicionou um Execution Gate capaz de dizer se o setup esta armado, em observacao ou bloqueado. Ainda assim, o operador precisava traduzir esse veredito para um plano pratico: zona exata de entrada, invalidacao, parciais, distancia ate o preco e risco tatico liberado.

Sem essa camada, o gate melhora a decisao, mas nao reduz totalmente o atrito operacional no momento do clique. O Timing Desk precisa apresentar o plano como uma mesa institucional: o que fazer, onde invalida e quanto risco pode ser usado.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/execution-plan.js` como derivador puro que consome `analysis.signal`, preco atual e `executionGate`.

O contrato:

- valida geometria de entrada, stop e alvos para compra/venda;
- calcula se o preco esta dentro da zona operacional;
- transforma o status do gate em estado de plano (`trigger`, `waiting`, `watch`, `blocked`, `incomplete`);
- calcula distancia ate entrada, distancia do stop, R:R por alvo e risco sugerido;
- bloqueia risco quando a geometria esta invalida ou o gate esta bloqueado;
- devolve checks auditaveis para renderizacao no Timing Desk.

A aba Timing passa a renderizar o painel "Plano de Execucao" logo abaixo do Execution Gate.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: derivacao isolada em modulo puro.
- Fail-honest: geometria invalida ou gate bloqueado zera o risco sugerido.
- Coesao: reaproveita `analysis.signal` e `executionGate`, sem criar motor paralelo.
- UX institucional: transforma evidencia em plano acionavel sem alerta nativo ou friccao artificial.

## Plano / DoD

- [x] Criar derivador puro do execution plan.
- [x] Integrar painel ao Timing Desk.
- [x] Expor entrada, invalidacao, alvos e risco tatico.
- [x] Cobrir gatilho, espera e geometria invalida com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O Timing Desk passa de veredito para plano operacional completo.
- + O usuario ve rapidamente se deve clicar, esperar preco ou preservar capital.
- + Risco sugerido fica atrelado ao gate, evitando lote cheio em setup degradado.
- - A qualidade do plano continua dependente dos niveis `analysis.signal` calculados a montante.
