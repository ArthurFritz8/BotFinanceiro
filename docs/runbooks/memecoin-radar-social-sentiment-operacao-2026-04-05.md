# Runbook - MemeCoin Radar & Social Sentiment (2026-04-05)

## Escopo

Entrega do modulo de discovery para memecoins (Solana/Base) com notification wall, pinning e score de hype (heuristico + IA opcional).

## Endpoints

1. `GET /v1/meme-radar/notifications`
- query params: `chain`, `priority`, `pinnedOnly`, `limit`, `refresh`
2. `POST /v1/meme-radar/notifications/:notificationId/pin`
- body: `{ "pinned": true | false }`

## Dependencias externas

1. GeckoTerminal (novos pools por rede)
2. DexScreener (enriquecimento de par)
3. OpenRouter (opcional para score IA)

## Variaveis de ambiente

1. `MEME_RADAR_TIMEOUT_MS`
2. `MEME_RADAR_REFRESH_INTERVAL_SECONDS`
3. `MEME_RADAR_NEW_POOLS_PER_CHAIN`
4. `MEME_RADAR_DEX_ENRICH_LIMIT`
5. `MEME_RADAR_AI_MAX_ITEMS`
6. `MEME_RADAR_CACHE_FRESH_SECONDS`
7. `MEME_RADAR_CACHE_STALE_SECONDS`

## Fluxo operacional

1. Scheduler dispara refresh periodico.
2. Backend coleta pools novos de Solana e Base.
3. Backend enriquece top pools com DexScreener.
4. Backend calcula hype/confidence e prioridade.
5. Backend atualiza wall e snapshots de sentimento.
6. Frontend consome board com filtros e acao de pin.

## Comandos de validacao

1. Typecheck API:

```bash
npm run typecheck -w @botfinanceiro/api
```

2. Testes API:

```bash
npm run test -w @botfinanceiro/api
```

3. Build frontend:

```bash
npm run build -w @botfinanceiro/web
```

## Checklist DoD

1. Codigo modular e tipado: concluido.
2. Erro centralizado: concluido (AppError + httpErrorHandler).
3. Sem segredo hardcoded: concluido.
4. ADR O.C.S.P. atualizado: concluido (`ADR-033`).
5. Runbook atualizado: concluido (este documento).
6. Evidencias de validacao: concluido (`typecheck`, `test`, `build`).
