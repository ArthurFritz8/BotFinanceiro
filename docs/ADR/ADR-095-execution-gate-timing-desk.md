# ADR-095 - Execution Gate no Timing Desk

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois dos cortes de Visual IA, Order Flow, Heatmap de Liquidez e Regime Institucional, o Chart Lab passou a ter evidencias fortes, mas ainda faltava uma decisao executiva unica: se o setup esta armado, em observacao ou bloqueado.

Sem esse gate, o usuario precisa combinar manualmente confianca do sinal, regime, CVD, volume, liquidez e R:R. Isso aumenta risco de clique impulsivo justamente quando o terminal ja tem informacao suficiente para vetar execucao ruim.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/execution-gate.js` como derivador puro de quality gate operacional. O contrato:

- normaliza o lado do sinal;
- valida confianca minima e assimetria R:R;
- bloqueia stress/aquecimento de regime;
- cruza direcao maior com o sinal;
- exige CVD alinhado ou coloca o setup em observacao;
- considera volume e heatmap de liquidez como checks auditaveis;
- devolve status `armed`, `watch` ou `blocked`, score e escala de risco liberada.

A aba Timing passa a renderizar o painel "Execution Gate" entre Regime Institucional e Order Flow.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: gate isolado em modulo puro.
- Fail-honest: stress, aquecimento, sinal neutro ou R:R insuficiente bloqueiam execucao.
- Asset-awareness: usa somente analise e snapshots do ativo atual.
- Coesao: compoe Regime, CVD e Liquidez ja existentes em vez de criar motor paralelo.

## Plano / DoD

- [x] Criar derivador puro do execution gate.
- [x] Integrar painel ao Timing Desk.
- [x] Expor score, status e risco tatico liberado.
- [x] Cobrir armado, bloqueado e observacao com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O Timing passa a ter uma decisao operacional unica e auditavel.
- + Setups em stress ou sem assimetria ficam bloqueados antes do clique.
- + CVD neutro/conflitado deixa de ser ignorado e rebaixa o setup para observacao.
- - O gate continua dependente da qualidade de OHLCV, volume e R:R calculados a montante.
