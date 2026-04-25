# ADR-082 - Store Minimo do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois da extracao dos motores quant no ADR-081, `apps/web/src/main.js` ainda mantinha estados centrais do Chart Lab como variaveis soltas: snapshot atual, loading, modo visual, modo operacional, modulo de origem do simbolo e estrategia do pipeline.

Esse estado era lido por renderizadores, handlers, atalhos e rotinas de sincronizacao. A refatoracao completa ainda nao deve mover a UI inteira, mas o proximo corte seguro e criar uma fonte de verdade pequena para o runtime da aba.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-lab-store.js` com um store zero-dependency para o contexto minimo do Chart Lab:

- selecao atual: ativo, range, modo, broker, exchange, intervalo e simbolo;
- snapshot atual;
- flag de loading;
- modo visual Terminal PRO/Insights IA;
- modo operacional Spot/Margem ou Binarias;
- modulo de origem do simbolo;
- estrategia ativa do pipeline.

`main.js` passa a usar uma fachada `chartLabState` sobre o store para preservar o comportamento atual e reduzir o acoplamento com variaveis globais, sem alterar ids, classes, handlers ou layout.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: o store entra como fundacao incremental, sem migrar a UI para outro framework.
- Compatibilidade: os fluxos de load, fallback, TradingView e Intelligence Desk permanecem iguais.
- Testabilidade: o store possui testes Node isolados e nao depende de DOM.
- Fail-honest: loading/snapshot continuam refletindo o estado real, sem delay artificial.

## Plano / DoD

- [x] Criar store minimo do Chart Lab.
- [x] Conectar `main.js` ao store via fachada local.
- [x] Registrar selecao carregada no store durante `loadChart`.
- [x] Cobrir o store com testes unitarios Node.
- [x] Atualizar smoke test estatico quando a assinatura textual mudar.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz o numero de variaveis globais soltas no Chart Lab.
- + Facilita os proximos cortes: fila de requests, realtime e renderers por aba.
- + Cria uma API pequena para testes e futuras sincronizacoes.
- - `main.js` ainda concentra renderizacao e bindings; esta decisao cobre apenas o estado runtime minimo.
