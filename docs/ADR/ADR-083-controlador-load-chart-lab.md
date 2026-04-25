# ADR-083 - Controlador de Load do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Apos o ADR-082, o Chart Lab passou a ter um store minimo para estado runtime. Ainda assim, `apps/web/src/main.js` continuava mantendo a fila `pendingChartLoadRequest` e manipulando diretamente a concorrencia do `loadChart`.

Esse controle e sensivel porque evita descartar silenciosamente updates enquanto uma chamada esta em progresso: quando o usuario altera ativo, range, broker ou modo durante loading, a ultima requisicao precisa vencer e ser processada logo depois do ciclo atual.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-load-controller.js` para centralizar:

- leitura/escrita da flag de loading via adaptador externo;
- fila latest-wins de uma unica requisicao pendente;
- sanitizacao do payload pendente (`assetId`, `mode`, `range`, `silent`);
- finalizacao do ciclo atual com devolucao da proxima requisicao, quando existir;
- limpeza explicita da fila no destroy do chart.

`main.js` permanece responsavel por montar a requisicao, chamar providers, renderizar UI e disparar `loadChart(nextRequest)` quando o controlador devolve uma pendencia.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: a mudanca extrai apenas o controle de concorrencia, sem mover a renderizacao.
- UX honesta: nenhuma demora artificial e nenhum descarte silencioso da ultima interacao do usuario.
- Compatibilidade: o comportamento latest-wins da fila anterior foi preservado.
- Testabilidade: o controlador possui testes Node isolados e nao depende de DOM.

## Plano / DoD

- [x] Criar controlador de load do Chart Lab.
- [x] Conectar o controlador ao store minimo via adaptador `getLoading`/`setLoading`.
- [x] Remover `pendingChartLoadRequest` do `main.js`.
- [x] Atualizar smoke tests para o novo contrato textual.
- [x] Adicionar testes unitarios do controlador.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz estado global solto no `main.js`.
- + Deixa a politica latest-wins explicita e testavel.
- + Prepara a extracao futura de realtime/fallback polling.
- - `loadChart` ainda e grande; este ADR cobre apenas fila e concorrencia.
