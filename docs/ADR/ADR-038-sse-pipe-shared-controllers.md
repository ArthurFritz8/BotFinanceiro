# ADR 038 - Helper compartilhado openSsePipe para controllers SSE

- Data: 2026-04-17
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Eliminar a duplicacao de logica de boilerplate Server-Sent Events (SSE) entre os controllers `crypto` e `binary_options`, concentrando em um unico ponto o contrato de headers, hijack, cleanup, tratamento de erro e emissao de eventos `meta`/`snapshot`/`stream-error`.

## Contexto

Os controllers `streamLiveChart` (crypto) e `streamBinaryOptionsLiveChart` (binary_options) replicavam, com quase nenhuma variacao, aproximadamente 100 linhas cada de:

1. Normalizacao e validacao da `Origin` do request.
2. Configuracao dos headers canonicos de SSE (`Content-Type`, `Cache-Control`, `Connection`, `X-Accel-Buffering`, CORS).
3. `reply.hijack()` + `flushHeaders()`.
4. Gerenciamento de estado local (`isClosed`, `isInFlight`, `streamTimer`) e cleanup em `close`/`aborted`.
5. Escrita de `event: X\ndata: JSON\n\n` em tres momentos (`meta`, `snapshot`, `stream-error`).
6. Interval de push periodico.

A duplicacao trazia:

- Risco de divergencia sutil entre os streams (por exemplo, mensagem de erro diferente, header faltando).
- Custo de manutencao duplo para qualquer ajuste de contrato SSE.
- Area de teste ausente - cada controller tinha que ser testado via integracao pesada para validar o mesmo boilerplate.

## Solucao

1. Novo helper em `apps/api/src/shared/http/sse-pipe.ts`:
- `openSsePipe(request, reply, options): { accepted: boolean }`
- `writeSseEvent(reply, eventName, payload): void`

2. `options` aceita:
- `allowedOrigins: Set<string>` - origens permitidas (403 se nao bater).
- `intervalMs: number` - intervalo de push.
- `pushSnapshot: () => Promise<unknown>` - funcao que produz o payload de cada tick.
- `streamName: string` - usado na mensagem default de `stream-error` (`Falha no stream ${streamName} ao vivo`).

3. Comportamento padronizado:
- Gate de origem (403 + `{error:"Origin not allowed"}`).
- Headers canonicos SSE mais CORS quando origem permitida.
- `reply.hijack()` e `flushHeaders()`.
- Guard `isClosed`/`isInFlight` em cada tick.
- Cleanup em `request.raw.close`/`aborted` (clearInterval + `reply.raw.end()`).
- Primeiro evento sempre `meta` com `generatedAt`, `mode:"live"`, `requestId`.
- Em seguida, snapshot inicial imediato e depois `setInterval` com `intervalMs`.
- Falha do `pushSnapshot` vira `stream-error` sem encerrar o pipe.

4. Adocao nos dois controllers:
- `apps/api/src/modules/binary_options/interface/binary-options-controller.ts` - `streamBinaryOptionsLiveChart` reduzido a uma chamada de `openSsePipe` com `streamName:"de binarias"`.
- `apps/api/src/modules/crypto/interface/crypto-controller.ts` - `streamLiveChart` reduzido a uma chamada de `openSsePipe` com `streamName:"de chart"`.
- Remocao das funcoes `writeSseEvent` locais e do bloco de `pushSnapshot`/`setInterval`/`cleanup` duplicados.

5. Cobertura unitaria em `apps/api/src/shared/http/sse-pipe.test.ts`:
- Rejeicao de origem nao permitida (403, sem hijack).
- Aceitacao, `meta` + `snapshot` inicial, headers corretos.
- `stream-error` emitido ao falhar o `pushSnapshot` sem encerrar.
- Cleanup deterministico no `close` do request (interval limpo, `writableEnded=true`).

## Prevencao

1. Qualquer novo stream SSE adicionado ao backend deve usar `openSsePipe`. PRs que introduzam escrita bruta de `reply.raw.write("event:")` em controller sao considerados regressao de arquitetura e devem ser ajustados no review.
2. Mudancas no contrato SSE (headers, nome de evento, formato de erro) sao feitas em um unico lugar, com testes atualizados em `sse-pipe.test.ts` antes de adocao nos controllers.
3. O `streamName` e obrigatorio para garantir que mensagens de erro sejam descritivas por modulo.
4. `openSsePipe` nao expoe `reply.raw.write` diretamente aos controllers, o que impede a construcao de eventos fora do padrao por acidente.
