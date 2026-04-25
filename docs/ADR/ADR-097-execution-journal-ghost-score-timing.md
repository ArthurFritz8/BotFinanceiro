# ADR-097 - Execution Journal e Ghost Score no Timing Desk

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois do Execution Gate e do Plano de Execucao, o terminal passou a dizer se o setup pode ser operado e quais niveis usar. Faltava transformar essa decisao em evidencia auditavel ao longo do tempo.

Sem journal, o operador nao consegue responder perguntas institucionais simples: quantos planos foram gerados, quantos tocaram entrada, quantos bateram TP2, quantos estoparam e qual o payoff medio ghost.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/execution-journal.js` como derivador puro de journal e settlement ghost.

O contrato:

- cria entradas de journal a partir de `executionPlan`, `executionGate` e `snapshot`;
- evita duplicidade de plano aberto na mesma janela operacional;
- liquida planos ghost por preco atual contra entrada, stop, TP1 e TP2;
- calcula payoff em R, win rate, abertos, fechados, score e qualidade amostral;
- zera score institucional enquanto houver menos de 5 planos fechados;
- permite persistencia local versionada e tolerante a falhas no frontend.

A aba Timing passa a renderizar o painel "Execution Journal" abaixo do Plano de Execucao, com botoes para registrar manualmente o plano atual e limpar o journal. Em modo live spot/margem, setups `trigger` com gate `armed` tambem entram no journal automaticamente com deduplicacao.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: journal isolado em modulo puro.
- Fail-honest: score institucional fica "Aquecendo" ate 5 planos fechados.
- Persistencia segura: localStorage versionado com sanitizacao e degradacao silenciosa para memoria.
- Coesao: consome Execution Gate e Execution Plan, sem criar motor paralelo de sinal.

## Plano / DoD

- [x] Criar derivador puro do execution journal.
- [x] Persistir journal local com sanitizacao.
- [x] Auto-registrar gatilhos armados em live spot/margem.
- [x] Renderizar painel com score, win rate, payoff e historico recente.
- [x] Adicionar acoes de registrar/limpar no Timing Desk.
- [x] Cobrir registro, deduplicacao e aquecimento amostral com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O terminal passa a auditar as proprias decisoes operacionais.
- + O usuario ve quando o edge ainda esta aquecendo em vez de confiar em porcentagem fabricada.
- + O ghost score prepara terreno para ranking por ativo, regime e corretora.
- - O journal local nao substitui auditoria backend multi-sessao; isso continua como evolucao futura.
