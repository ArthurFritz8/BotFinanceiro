# ADR-099 - Score de Qualidade do Plano de Execucao

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

O Timing Desk ja possui gate, plano, action rail e journal. Ainda faltava uma camada sintetica para responder se o plano e apenas possivel ou se tem qualidade institucional suficiente para ser tratado como candidato operacional.

Sem essa camada, o usuario precisa interpretar manualmente gate, entry band, R:R, risco sugerido e score do journal. Isso aumenta friccao e pode levar a clique impulsivo em plano tecnicamente valido, mas ainda fraco.

## Decisao

Criar `execution-quality.js` como derivador puro e zero-dependency. Ele calcula um score ponderado com:

- gate institucional;
- checks do plano;
- timing da entrada;
- assimetria R:R;
- disciplina de risco;
- evidencia recente do Execution Journal.

O score gera status `prime`, `qualified`, `watch` ou `reject`, grade `A`, `B+`, `B`, `C`, `D` ou `F`, guidance textual e contribuicoes auditaveis. Enquanto o journal tiver menos de 5 planos fechados, o score fica fail-honest: pode qualificar o plano, mas nao promove para `prime`.

## Conformidade

- Zero Budget: sem dependencia nova.
- Fail-honest: amostra insuficiente permanece `Aquecendo`.
- Strangler pattern: logica pura isolada em modulo quant.
- Auditabilidade: painel mostra contribuicoes ponderadas com tooltip.

## Plano / DoD

- [x] Criar derivador puro de qualidade.
- [x] Adicionar testes unitarios de prime, reject e aquecimento do journal.
- [x] Renderizar painel no Timing Desk.
- [x] Propagar grade para dataset visual do chart.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O operador passa a ver uma decisao sintetica sem perder rastreabilidade.
- + Planos com journal imaturo deixam isso explicito.
- + O score nao abre trade nem substitui o gate; ele orienta disciplina.
- - Pesos sao heuristica inicial e devem ser recalibrados com dados reais do journal/backend no futuro.
