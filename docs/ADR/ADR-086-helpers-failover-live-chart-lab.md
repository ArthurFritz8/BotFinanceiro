# ADR-086 - Helpers de Failover Live do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois do ADR-085, o Chart Lab ja montava descriptors de stream live fora do `main.js`. Porem, a selecao de broker para stream cripto ainda combinava, no mesmo bloco de UI/SSE, normalizacao do broker solicitado, preferencia `auto`, cadeia de failover, exchange efetivo e mensagem de contingencia.

Essa regra e pequena, mas sensivel: ela decide se o stream usa o broker primario, pula um broker com circuito aberto ou atualiza a preferencia automatica apos uma falha. Manter tudo inline dificultava testar esses cenarios sem `EventSource`, DOM e timers.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-live-failover.js` com helpers puros para:

- resolver a selecao live cripto (`selectedRequestedBroker`, `selectedBroker`, `exchange` e contingencia);
- montar a legenda padronizada de contingencia;
- escolher o proximo broker em modo `auto` quando o exchange atual abre circuito.

`main.js` continua responsavel por `markBrokerFailure`, `markBrokerSuccess`, `isBrokerCircuitOpen`, `buildBrokerFailoverChain`, handlers SSE, fallback polling e renderizacao. Os helpers recebem esses contratos como entrada quando necessario.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: extraido apenas nucleo puro de decisao, sem mover o ciclo de vida do stream.
- Backend-mediated: o cliente continua usando `EventSource` contra endpoints da API, sem acesso direto a exchanges.
- Fail-honest: contingencia continua visivel quando o exchange efetivo difere do broker selecionado.
- Testabilidade: cenarios de auto/manual/circuit breaker foram cobertos por testes Node isolados.

## Plano / DoD

- [x] Criar helpers puros de failover live.
- [x] Conectar `connectChartLiveStream` aos helpers.
- [x] Preservar `markBrokerFailure/Success`, circuit breaker e handlers SSE no `main.js`.
- [x] Adicionar testes unitarios dos helpers.
- [x] Atualizar script de testes web.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz duplicacao na reacao a `stream-error` e `onerror`.
- + Isola uma regra sensivel de broker sem acoplar testes ao DOM.
- + Facilita um proximo corte em normalizacao/telemetria de failover, se necessario.
- - `main.js` ainda contem o ciclo de vida SSE por decisao de baixo risco.
