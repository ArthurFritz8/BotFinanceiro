# ADR-084 - Controlador de Live Stream do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois dos ADRs 082 e 083, `apps/web/src/main.js` ainda concentrava handles mutaveis do realtime do Chart Lab: `EventSource`, chave do stream, timer de backoff, contador de reconexao, fallback polling e timer de legenda diferida para `stream-error`.

Esse trecho e sensivel porque precisa preservar:

- stream backend-mediated, sem WebSocket direto cliente-exchange;
- failover/circuit breaker por broker;
- fallback polling enquanto o stream oscila;
- supressao de banner quando um snapshot recupera rapido;
- politica de reconexao com backoff.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-live-stream-controller.js` como controlador de handles/timers do realtime do Chart Lab.

O controlador passa a centralizar:

- stream ativo e chave do stream;
- fechamento seguro do `EventSource`;
- timer de fallback polling;
- timer de reconexao/backoff;
- contador de tentativas de reconnect;
- timer de legenda diferida;
- transicao de status live/offline/reconnecting via callback injetado.

`main.js` permanece responsavel por montar URLs, parsear payloads SSE, aplicar snapshots, marcar sucesso/falha de broker, decidir failover e exibir mensagens.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: extraido apenas o estado operacional de realtime, sem mover regras de provider/renderizacao.
- Backend-mediated: preservado o uso de endpoints SSE da API.
- Fail-honest: fallback polling continua ativo durante oscilacao real do stream.
- UX: legenda de `stream-error` continua diferida para permitir recovery silencioso por snapshot rapido.
- Testabilidade: handles/timers/backoff agora possuem testes Node isolados.

## Plano / DoD

- [x] Criar controlador de live stream do Chart Lab.
- [x] Remover handles/timers soltos de realtime do `main.js`.
- [x] Preservar wrappers `stopChartLiveStream`, `startChartLiveFallbackPolling` e `stopChartLiveFallbackPolling`.
- [x] Atualizar smoke tests para o novo contrato textual.
- [x] Adicionar testes unitarios do controlador.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz estado global solto no `main.js`.
- + Mantem a politica de realtime auditavel e testavel.
- + Prepara extracao futura de builders de stream key/url ou handlers de SSE.
- - `main.js` ainda contem regras de broker/failover e renderizacao de snapshot, por escolha deliberada de baixo risco.
