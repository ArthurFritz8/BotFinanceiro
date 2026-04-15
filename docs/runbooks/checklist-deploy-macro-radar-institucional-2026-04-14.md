# Checklist de Deploy - Macro Radar Institucional (2026-04-14)

## Objetivo

Publicar com seguranca a evolucao do strategy routing (crypto x institucional) e do macro radar institucional no endpoint de strategy chart.

## Escopo da publicacao

1. Frontend Chart Lab com bifurcador de estrategia e painel Risk & Prop Firm Desk.
2. Backend com endpoint institucional:
- `GET /v1/forex/strategy-chart`
- `GET /v1/forex/institutional-macro/snapshot`
3. Backend com endpoint unificado cripto:
- `GET /v1/crypto/strategy-chart`
4. Macro radar com fonte externa opcional e fallback sintetico automatico.

## Variaveis de ambiente (producao)

Obrigatorias para esta feature:

1. `FOREX_MACRO_CALENDAR_URL` (opcional, recomendado em producao)
2. `FOREX_MACRO_CALENDAR_API_KEY` (opcional, depende do provedor)

Configuracao recomendada (exemplo):

```env
FOREX_MACRO_CALENDAR_URL=https://financialmodelingprep.com/api/v3/economic_calendar
FOREX_MACRO_CALENDAR_API_KEY=<SUA_CHAVE>
```

Comportamento esperado:

1. Se URL/chave estiverem configuradas e o provedor responder, o radar usa agenda externa.
2. Se houver erro, timeout, schema invalido ou variavel ausente, o radar cai para agenda sintetica sem quebrar o endpoint.

## Checklist pre-deploy

1. [ ] `npm run test` executado na branch de release.
2. [ ] Validado que `GET /v1/forex/strategy-chart` retorna `strategy=\"institutional_macro\"`.
3. [ ] Validado que `GET /v1/crypto/strategy-chart` respeita `mode=delayed|live`.
4. [ ] Confirmado que `FOREX_MACRO_CALENDAR_URL` e `FOREX_MACRO_CALENDAR_API_KEY` estao configuradas no ambiente alvo (quando aplicavel).
5. [ ] Confirmado que token interno e observabilidade estao ativos para investigacao rapida.

## Passos de deploy

1. Publicar API com as variaveis acima.
2. Publicar frontend com build atualizado.
3. Reiniciar processos da API para carregar env novo.
4. Executar smoke tests imediatamente apos subir.

## Smoke tests (pos-deploy)

1. Rota institucional (delayed):

```bash
curl "http://localhost:3000/v1/forex/strategy-chart?symbol=EURUSD&range=7d&mode=delayed"
```

2. Rota institucional (live):

```bash
curl "http://localhost:3000/v1/forex/institutional-macro/snapshot?symbol=XAUUSD&range=24h&mode=live"
```

3. Rota cripto unificada (live):

```bash
curl "http://localhost:3000/v1/crypto/strategy-chart?assetId=bitcoin&range=24h&mode=live&exchange=binance"
```

Validacoes de resposta (esperado):

1. `status` igual a `success`.
2. Campo `data.strategy` presente (`institutional_macro` no forex institucional).
3. Campo `data.institutional.macroRadar.upcomingEvents` com pelo menos 1 evento.
4. Campo `data.institutional.macroRadar.alertLevel` em `green|yellow|red`.

## Criterios de Go/No-Go

Go:

1. 100% dos smoke tests acima com HTTP 200 e payload valido.
2. Sem aumento anormal de 5xx nos endpoints novos por 15 minutos apos deploy.

No-Go:

1. Erro sistematico em `strategy-chart` institucional.
2. Regressao no endpoint `crypto/strategy-chart` em `mode=live`.

## Rollback rapido

1. Esvaziar `FOREX_MACRO_CALENDAR_URL` e `FOREX_MACRO_CALENDAR_API_KEY`.
2. Reiniciar API para forcar fallback sintetico.
3. Se persistir anomalia, reverter para build anterior da API.
4. Reexecutar smoke tests para confirmar recuperacao.

## Monitoramento pos-deploy

1. Taxa de erro e latencia de:
- `GET /v1/forex/strategy-chart`
- `GET /v1/crypto/strategy-chart`
2. Logs de fallback de calendario macro para identificar instabilidade do provedor externo.
3. Saude geral da API em `GET /health` e `GET /ready`.

## Evidencias minimas para fechar mudanca

1. Print/log dos 3 smoke tests com status 200.
2. Registro das variaveis aplicadas no ambiente (sem expor segredo).
3. Janela de observacao pos-deploy (15 min) sem incidentes criticos.