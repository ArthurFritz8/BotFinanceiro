# BotFinanceiro

Monorepo TypeScript para um ecossistema de mercado financeiro global e cripto.

## Requisitos

1. Node.js 20+
2. NPM 10+

## Inicio rapido

1. Copie o arquivo `.env.example` para `.env`.
2. Instale dependencias com `npm install`.
3. Suba a API em modo desenvolvimento com `npm run dev:api`.

## Qualidade

1. Lint: `npm run lint`
2. Typecheck: `npm run typecheck`
3. Check completo: `npm run check`

## Monitoramento smoke

Workflow dedicado: `.github/workflows/monitoring-smoke.yml`.

1. Executa a cada 30 minutos e em `workflow_dispatch`.
2. Faz smoke checks de `GET /health`, `GET /ready` e `GET /v1/copilot/history`.
3. Opcionalmente valida endpoint interno quando `MONITOR_INTERNAL_TOKEN` estiver configurado.

Configuracao no GitHub Actions:

1. Crie a Actions variable `MONITOR_BASE_URL` com a URL base publica da API, ex: `https://api.seudominio.com`
2. Opcional: defina `MONITOR_INTERNAL_TOKEN` no step do workflow para incluir checks de rotas internas

Execucao local:

```bash
MONITOR_BASE_URL=http://localhost:3000 npm run monitor:smoke
```

## Persistencia (Supabase/Postgres)

Modo recomendado em producao: Supabase Postgres para trilha operacional e auditoria do Copiloto.

1. `DATABASE_PROVIDER=postgres`
2. `DATABASE_URL=postgresql://...`
3. `DATABASE_SSL=true`
4. `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (comum no Supabase)

Com `DATABASE_PROVIDER=auto` (default), a API usa Postgres quando `DATABASE_URL` existe e faz fallback para arquivo local quando nao existe.

Migracoes versionadas:

1. `npm run db:migrate`
2. Startup aplica migracoes automaticamente quando `DATABASE_AUTO_MIGRATE=true`

Dados persistidos:

1. snapshots de health operacional
2. auditoria de interacoes do Copiloto (mensagem, resposta, tools usadas)

Politica de retencao:

1. `OPS_HEALTH_SNAPSHOT_RETENTION_DAYS`
2. `COPILOT_CHAT_AUDIT_RETENTION_DAYS`

## Estrategia de custo zero

1. Priorizar provedores gratuitos e open-source.
2. Sempre usar cache antes de chamadas externas.
3. Aplicar degradacao graciosa para evitar indisponibilidade total.

## Documentacao de decisoes

1. ADR 001: `docs/ADR/ADR-001-politica-degradacao-rate-limit.md`
2. ADR 002: `docs/ADR/ADR-002-fundacao-tecnica-monorepo-typescript.md`

## Exemplos de chamadas internas

Use o header `x-internal-token` para endpoints internos.

1. Historico operacional agregado (JSON)

```bash
curl "http://localhost:3000/internal/health/operational/history/aggregate?granularity=hour&bucketLimit=48&from=2026-03-31T00:00:00.000Z&to=2026-04-01T00:00:00.000Z" \
	-H "x-internal-token: $INTERNAL_API_TOKEN"
```

2. Historico operacional agregado (CSV)

```bash
curl "http://localhost:3000/internal/health/operational/history/aggregate.csv?granularity=day&bucketLimit=30&from=2026-03-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z" \
	-H "x-internal-token: $INTERNAL_API_TOKEN" \
	-o operational-health-aggregate.csv
```

3. Auditoria do Copiloto (JSON)

```bash
curl "http://localhost:3000/internal/copilot/audit/history?limit=20&offset=0&toolName=get_crypto_multi_spot_price" \
	-H "x-internal-token: $INTERNAL_API_TOKEN"
```

4. Limpeza da auditoria do Copiloto

```bash
curl -X DELETE "http://localhost:3000/internal/copilot/audit/history?confirm=true" \
	-H "x-internal-token: $INTERNAL_API_TOKEN"
```

## Copiloto IA (OpenRouter)

Configure as variaveis no `.env`:

1. `OPENROUTER_API_KEY`
2. `OPENROUTER_MODEL`
3. `OPENROUTER_API_BASE_URL`
4. `OPENROUTER_TIMEOUT_MS`
5. `OPENROUTER_APP_NAME`
6. `OPENROUTER_APP_URL` (opcional)

Exemplo de chamada:

```bash
curl "http://localhost:3000/v1/copilot/chat" \
	-H "Content-Type: application/json" \
	-d '{"message":"Resuma o mercado cripto de hoje","temperature":0.1,"maxTokens":350,"sessionId":"sessao_demo_001"}'
```

Historico por sessao:

```bash
curl "http://localhost:3000/v1/copilot/history?sessionId=sessao_demo_001&limit=30"
```

Tool calling read-only habilitado no Copiloto:

1. `get_crypto_spot_price`
2. `get_crypto_multi_spot_price`
3. `get_operational_health`
4. `get_crypto_sync_policy`

Quando o modelo usa ferramentas, a resposta inclui `toolCallsUsed` com a lista das tools executadas no fluxo.

## Interface web do Copiloto

1. Suba a API:

```bash
npm run dev:api
```

2. Em outro terminal, suba o frontend:

```bash
npm run dev:web
```

3. Abra no navegador:

`http://localhost:5173`

4. Opcional: para usar API em outro host no dev web:

```bash
VITE_DEV_API_PROXY_TARGET=http://localhost:3000 npm run dev:web
```

5. O frontend usa `sessionId` persistido no navegador para carregar historico remoto em `GET /v1/copilot/history` e mantém fallback local.
6. O card "Historico local" limpa mensagens da sessao atual e inicia uma nova sessao local/remota.