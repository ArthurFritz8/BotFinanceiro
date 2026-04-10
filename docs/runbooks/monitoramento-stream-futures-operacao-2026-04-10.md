# Runbook - Monitoramento do Stream Futures (2026-04-10)

## Escopo

Operacao e diagnostico do stream de ticker futures da Binance no backend, incluindo reconexao automatica, fallback REST e endpoint interno de saude.

## Endpoint interno

1. `GET /internal/health/streams/futures`
- header obrigatorio: `x-internal-token`
- resposta: status do stream, cache e staleness

## Campos principais de diagnostico

1. `stream.enabled`
- `true`: stream habilitado no runtime
- `false`: stream desabilitado por configuracao/ambiente

2. `stream.connected`
- indica conexao WebSocket aberta

3. `stream.connecting`
- indica handshake/conexao em andamento

4. `stream.cacheSize`
- quantidade de simbolos com ticker no cache local

5. `stream.freshSymbols` e `stream.staleSymbols`
- simbolos atualizados dentro/fora da janela de staleness

6. `stream.stalenessThresholdMs`
- limite em ms para considerar ticker fresco

7. `stream.freshestTickerAt`
- timestamp ISO do ticker mais recente no cache

8. `stream.reconnectAttempt`
- contador de tentativas de reconexao apos desconexao

9. `stream.streamUrl`
- URL efetiva usada para assinatura do stream

## Variaveis de ambiente relacionadas

1. `BINANCE_FUTURES_WS_ENABLED`
2. `BINANCE_FUTURES_WS_BASE_URL`
3. `BINANCE_FUTURES_TIMEOUT_MS`
4. `MARKET_OVERVIEW_CACHE_TTL_SECONDS`

## Sinais de alerta

1. `enabled=true` e `connected=false` por periodo prolongado.
2. `staleSymbols` crescendo continuamente.
3. `reconnectAttempt` subindo sem estabilizar.
4. `cacheSize=0` em horario normal de mercado futures.

## Acoes operacionais recomendadas

1. Validar conectividade externa para `BINANCE_FUTURES_WS_BASE_URL`.
2. Confirmar token interno e consultar endpoint de health.
3. Verificar logs de "stream disconnected" e "scheduling reconnect".
4. Confirmar se fallback REST esta respondendo nos snapshots.
5. Em incidente prolongado, avaliar desabilitar WS temporariamente (`BINANCE_FUTURES_WS_ENABLED=false`) mantendo operacao via REST.

## Comandos de validacao

1. Typecheck API:

```bash
npm run typecheck -w @botfinanceiro/api
```

2. Testes API:

```bash
npm run test -w @botfinanceiro/api
```

3. Consulta do endpoint interno:

```bash
curl "http://localhost:3000/internal/health/streams/futures" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

## Evidencias desta entrega

1. Nova rota interna de stream futures com autenticacao interna.
2. Teste de integracao cobrindo retorno do endpoint.
3. Suite completa da API validada sem regressao.
