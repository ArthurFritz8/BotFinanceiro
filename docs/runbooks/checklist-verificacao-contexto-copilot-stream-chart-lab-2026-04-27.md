# Checklist de Verificacao - Contexto Copilot Stream no Chart Lab (2026-04-27)

## Objetivo

Validar, de ponta a ponta, que o contexto ativo do Chart Lab e enviado para o Copiloto e influencia corretamente o fluxo de resposta no endpoint de stream (`/v1/copilot/chat/stream`).

## Pre-condicoes

1. API ativa localmente (`npm run dev:api`).
2. Frontend ativo (`npm run dev:web`) para validacao visual opcional.
3. `OPENROUTER_API_KEY` configurada no ambiente.
4. Ambiente de teste com `x-internal-token` disponivel para auditoria interna.

## Escopo da verificacao

1. Contrato do endpoint de stream em NDJSON.
2. Presenca de evento `meta`, ao menos um `chunk` e fechamento com `done`.
3. Coerencia entre contexto enviado e resposta final.
4. Persistencia da trilha de auditoria para reproducao do caso.

## Passo a passo (API)

1. Enviar chamada stream com `chartContext` explicito:

```bash
curl "http://localhost:3000/v1/copilot/chat/stream" \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "message":"Atualize o contexto atual em stream",
    "temperature":0.1,
    "sessionId":"sessao_stream_ctx_001",
    "chartContext":{
      "assetId":"ethereum",
      "broker":"bybit",
      "exchange":"BYBIT",
      "interval":"15m",
      "mode":"live",
      "range":"24h",
      "strategy":"crypto",
      "symbol":"ETHUSDT",
      "operationalMode":"spot_margin"
    }
  }'
```

2. Confirmar que a saida contem linhas NDJSON com:

1. `"type":"meta"`
2. `"type":"chunk"`
3. `"type":"done"`

3. Opcional: validar auditoria interna por sessao:

```bash
curl "http://localhost:3000/internal/copilot/audit/history?sessionId=sessao_stream_ctx_001&limit=5" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

4. Opcional avancado: validar filtro combinado por sessao + tool + janela temporal exata:

```bash
curl "http://localhost:3000/internal/copilot/audit/history?sessionId=sessao_stream_ctx_001&toolName=get_crypto_chart_insights&from=2026-04-27T20:30:14.213Z&to=2026-04-27T20:30:14.213Z&limit=10&offset=0" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Observacao: ajuste `toolName` e timestamps para os valores reais retornados na sua trilha.

5. Opcional avancado: validar paginacao no mesmo filtro combinado (`limit`/`offset`):

```bash
curl "http://localhost:3000/internal/copilot/audit/history?sessionId=sessao_stream_ctx_001&toolName=get_crypto_chart_insights&from=2026-04-27T20:30:14.213Z&to=2026-04-27T20:31:14.213Z&limit=1&offset=1" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Resultado esperado: `totalMatched` permanece estavel enquanto `records` muda conforme `offset`.

6. Opcional avancado: validar `offset` acima do total filtrado:

```bash
curl "http://localhost:3000/internal/copilot/audit/history?sessionId=sessao_stream_ctx_001&toolName=get_crypto_chart_insights&from=2026-04-27T20:30:14.213Z&to=2026-04-27T20:31:14.213Z&limit=1&offset=999" \
  -H "x-internal-token: $INTERNAL_API_TOKEN"
```

Resultado esperado: `records` vazio, com `totalMatched` preservado para refletir o total real da busca.

## Passo a passo (UI opcional)

1. Abrir Chart Lab no frontend.
2. Selecionar ativo diferente (ex.: BTC -> ETH) e trocar intervalo/range.
3. Enviar pergunta no Copilot em modo stream.
4. Confirmar que a resposta reflete o ativo/contexto selecionado e nao contexto antigo.

## Criterios de aceite

1. Stream responde com `application/x-ndjson`.
2. Sequencia minima de eventos: `meta -> chunk -> done`.
3. `done.data.answer` nao vazio.
4. Sessao consultada em auditoria retorna interacao correspondente.
5. Nao ha erro 4xx/5xx durante o fluxo nominal.

## Diagnostico rapido

1. Se faltar `chunk` e houver apenas `meta` + `error`, revisar chave OpenRouter e timeout.
2. Se resposta vier com contexto antigo, forcar troca de ativo e repetir com nova `sessionId`.
3. Se auditoria nao refletir a sessao, validar `COPILOT_CHAT_AUDIT_ENABLED=true` e caminho de persistencia configurado.
4. Se stream quebrar em CORS no browser, validar `CORS_ALLOWED_ORIGINS` e `Origin` permitido.

## Evidencias recomendadas

1. Trecho do stream NDJSON (3 primeiras linhas).
2. Payload da auditoria da sessao.
3. Hash do commit e horario UTC da execucao.
