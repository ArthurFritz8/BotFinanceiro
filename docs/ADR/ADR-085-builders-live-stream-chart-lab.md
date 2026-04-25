# ADR-085 - Builders de Live Stream do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois do ADR-084, o Chart Lab ja possuia um controlador para handles e timers do realtime. Ainda assim, `apps/web/src/main.js` continuava montando inline as chaves de stream e URLs SSE para cripto e binarias.

Essa montagem e pequena, mas critica: a key define quando o stream atual pode ser reaproveitado, e a URL define os parametros enviados ao backend-mediated stream. Drift nesses parametros pode quebrar fallback, cache por corretora, resolucao e modo binarias.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-live-stream-selection.js` com builders puros para:

- descriptor de stream cripto (`streamKey` + `streamUrl`);
- descriptor de stream de binarias (`streamKey` + `streamUrl`);
- builders explicitamente testaveis de key;
- validacao minima de selecao live obrigatoria: `assetId`, `range`, `requestedBroker`, `exchange`, `intervalMs` e, para binarias, `resolution`.

`main.js` continua responsavel por resolver broker, failover chain, modo operacional, `EventSource`, parse SSE e aplicacao de snapshot.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: extraida apenas montagem pura de key/url, sem mover handlers SSE.
- Backend-mediated: URLs continuam apontando para endpoints da API (`/v1/crypto/live-stream` e `/v1/binary-options/live-stream`).
- Compatibilidade: formato das keys e query params foi preservado com testes.
- Testabilidade: descriptors agora possuem testes Node isolados.

## Plano / DoD

- [x] Criar builders puros de descriptor/key/url.
- [x] Conectar `connectChartLiveStream` e `connectBinaryOptionsLiveStream` aos descriptors.
- [x] Preservar failover/circuit breaker/renderizacao no `main.js`.
- [x] Adicionar testes unitarios dos builders.
- [x] Atualizar script de testes web.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz string building inline no `main.js`.
- + Diminui risco de drift entre stream cripto e binarias.
- + Facilita proximo corte em validacao/normalizacao de selecao live.
- - `main.js` ainda contem handlers SSE e regras de broker, por escolha de baixo risco.
