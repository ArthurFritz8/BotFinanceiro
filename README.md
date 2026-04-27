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
4. Guard de documentacao: `npm run guard:docs`

## Padrao obrigatorio de documentacao

1. Regra oficial de documentacao e verificacao:
- `docs/runbooks/padrao-obrigatorio-documentacao-e-verificacao.md`
2. Template de apoio para registrar entrega:
- `docs/templates/checklist-mudanca.md`
3. Template de PR com checklist obrigatorio:
- `.github/pull_request_template.md`

## Monitoramento smoke

Workflow dedicado: `.github/workflows/monitoring-smoke.yml`.

1. Executa a cada 30 minutos e em `workflow_dispatch`.
2. Faz smoke checks de `GET /health`, `GET /ready` e `GET /v1/copilot/history`.
3. Quando `MONITOR_BASE_URL` nao existe, sobe uma API local no job como fallback e roda os checks nela.

Configuracao no GitHub Actions:

1. Opcional: crie a Actions variable `MONITOR_BASE_URL` com a URL base publica da API, ex: `https://api.seudominio.com`
2. Sem essa variable, o workflow continua funcional via fallback local (nao monitora disponibilidade externa)

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
3. conversas por usuario (`copilot_user_conversations`)
4. mensagens por conversa (`copilot_user_messages`)

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
3. ADR 031: `docs/ADR/ADR-031-resiliencia-mercado-coincap-e-copiloto.md`
4. ADR 032: `docs/ADR/ADR-032-inteligencia-noticias-cripto-e-analise-profunda.md`
5. ADR 033: `docs/ADR/ADR-033-memecoin-radar-social-sentiment.md`
6. ADR 034: `docs/ADR/ADR-034-hardening-cotacao-fx-copiloto.md`
7. ADR 035: `docs/ADR/ADR-035-hardening-market-navigator-e-stream-futures.md`
8. ADR 036: `docs/ADR/ADR-036-resiliencia-overview-e-chart-simbolo-externo.md`
9. ADR 037: `docs/ADR/ADR-037-painel-interno-saude-market-navigator-modulos.md`
10. ADR 038: `docs/ADR/ADR-038-sse-pipe-shared-controllers.md`
11. ADR 039: `docs/ADR/ADR-039-provider-chain-com-circuit-breaker.md`
12. ADR 040: `docs/ADR/ADR-040-fundacao-shared-utils-smc-core.md`
13. ADR 041: `docs/ADR/ADR-041-dom-syncer-rAF-parse-stream-web.md`
14. ADR 042: `docs/ADR/ADR-042-indicador-live-market-anti-otc-seletor-ativos.md`
15. ADR 043: `docs/ADR/ADR-043-cta-analisar-mercado-intelligence-desk.md`
16. ADR 044: `docs/ADR/ADR-044-cache-bypass-fresh-fetch-cta-manual.md`
17. ADR 045: `docs/ADR/ADR-045-coinbase-24h-stats-e-stream-oscilacao-defer.md`
18. ADR 046: `docs/ADR/ADR-046-catalogo-unificado-30-assets-multi-broker.md`
19. ADR 047: `docs/ADR/ADR-047-expansao-catalogo-60-ativos-chart-lab-cta.md`
20. ADR 048: `docs/ADR/ADR-048-intelligence-desk-360-institutional-summary.md`
21. ADR 049: `docs/ADR/ADR-049-ghost-tracker-persistence-confluence-badge-tooltips.md`
22. ADR 050: `docs/ADR/ADR-050-rate-limit-publico-owasp-a05.md`
23. ADR 051: `docs/ADR/ADR-051-cabecalhos-seguranca-http-owasp-a05.md`
24. ADR 052: `docs/ADR/ADR-052-ci-matrix-node-20-22-lts.md`
25. ADR 053: `docs/ADR/ADR-053-metrics-prometheus-endpoint.md`
26. ADR 054: `docs/ADR/ADR-054-web-push-notifications-zero-cost.md`
27. ADR 055: `docs/ADR/ADR-055-paper-trading-pnl-persistente-zero-cost.md`
28. ADR 056: `docs/ADR/ADR-056-auto-paper-trading-bridge.md`
29. ADR 057: `docs/ADR/ADR-057-backtesting-engine-zero-cost.md`
30. ADR 058: `docs/ADR/ADR-058-backtesting-publico-comissao-slippage-ui.md`
31. ADR 059: `docs/ADR/ADR-059-smc-confluence-estrategia-backtest.md`
32. ADR 060: `docs/ADR/ADR-060-backtest-comparativo-multi-estrategia.md`
33. ADR 061: `docs/ADR/ADR-061-backtest-historico-leaderboard.md`
34. ADR 062: `docs/ADR/ADR-062-backtest-regime-alerts.md`
35. ADR 063: `docs/ADR/ADR-063-backtest-alerts-history-recurrence.md`
36. ADR 064: `docs/ADR/ADR-064-regime-alerts-push-notifications.md`
37. ADR 065: `docs/ADR/ADR-065-regime-alerts-periodic-scanner.md`
38. ADR 066: `docs/ADR/ADR-066-regime-alerts-mute.md`
39. ADR 067: `docs/ADR/ADR-067-regime-alerts-scanner-status.md`
40. ADR 068: `docs/ADR/ADR-068-narrativa-gatilho-e-ensemble-engine-derivado.md`
41. ADR 069: `docs/ADR/ADR-069-relatorio-executivo-briefing-tatico.md`
42. ADR 070: `docs/ADR/ADR-070-velocimetro-confluencia-institucional.md`
43. ADR 071: `docs/ADR/ADR-071-detalhamento-smc-institucional.md`
44. ADR 072: `docs/ADR/ADR-072-detalhamento-harmonico-xabcd.md`
45. ADR 073: `docs/ADR/ADR-073-central-wegd-institucional.md`
46. ADR 074: `docs/ADR/ADR-074-dashboard-probabilistico-quantitativo.md`
47. ADR 075: `docs/ADR/ADR-075-calculadora-posicao-institucional.md`
48. ADR 076: `docs/ADR/ADR-076-timing-desk-institucional.md`
49. ADR 077: `docs/ADR/ADR-077-camada-anotacoes-grafico-interativo.md`
50. ADR 078: `docs/ADR/ADR-078-hub-inteligencia-fundamentalista.md`
51. ADR 079: `docs/ADR/ADR-079-polimento-resumo-e-anotacoes-chart-lab.md`
52. ADR 080: `docs/ADR/ADR-080-live-signals-screener-cross-asset.md`
53. ADR 081: `docs/ADR/ADR-081-modularizacao-quant-chart-lab.md`
54. ADR 082: `docs/ADR/ADR-082-store-minimo-chart-lab.md`
55. ADR 083: `docs/ADR/ADR-083-controlador-load-chart-lab.md`
56. ADR 084: `docs/ADR/ADR-084-controlador-live-stream-chart-lab.md`
57. ADR 085: `docs/ADR/ADR-085-builders-live-stream-chart-lab.md`
58. ADR 086: `docs/ADR/ADR-086-helpers-failover-live-chart-lab.md`
59. ADR 087: `docs/ADR/ADR-087-token-geracao-ativo-chart-lab.md`
60. ADR 088: `docs/ADR/ADR-088-reset-contexto-ativo-chart-lab.md`
61. ADR 089: `docs/ADR/ADR-089-derivacoes-smc-confluencia-chart-lab.md`
62. ADR 090: `docs/ADR/ADR-090-calculadora-posicao-multi-asset.md`
63. ADR 091: `docs/ADR/ADR-091-visual-ia-evidencia-quantitativa.md`
64. ADR 092: `docs/ADR/ADR-092-order-flow-cvd-volume-zscore-timing.md`
65. ADR 093: `docs/ADR/ADR-093-heatmap-liquidez-price-zones.md`
66. ADR 094: `docs/ADR/ADR-094-regime-institucional-market-regime.md`
67. ADR 095: `docs/ADR/ADR-095-execution-gate-timing-desk.md`
68. ADR 096: `docs/ADR/ADR-096-plano-execucao-timing-desk.md`
69. ADR 097: `docs/ADR/ADR-097-execution-journal-ghost-score-timing.md`
70. ADR 098: `docs/ADR/ADR-098-action-rail-visual-state-execution.md`
71. ADR 099: `docs/ADR/ADR-099-score-qualidade-plano-execucao.md`
72. ADR 100: `docs/ADR/ADR-100-hud-execucao-chart-lab.md`
73. ADR 101: `docs/ADR/ADR-101-auto-guard-execucao-controlada.md`
74. ADR 102: `docs/ADR/ADR-102-rota-operador-paper-trading-auto-signal.md`
75. ADR 103: `docs/ADR/ADR-103-operador-auto-paper-trading-frontend.md`
76. ADR 104: `docs/ADR/ADR-104-journal-circuit-breaker-operator-dispatch.md`
77. ADR 105: `docs/ADR/ADR-105-journal-operator-dispatch-backend.md`
78. ADR 106: `docs/ADR/ADR-106-filtros-journal-operator-dispatch.md`
79. ADR 107: `docs/ADR/ADR-107-painel-frontend-auditoria-centralizada-operator.md`
80. ADR 108: `docs/ADR/ADR-108-metrica-prometheus-operator-dispatch.md`
81. ADR 109: `docs/ADR/ADR-109-persistencia-ndjson-operator-dispatch.md`
82. ADR 110: `docs/ADR/ADR-110-calibracao-explicita-micro-timing-binario.md`
83. ADR 111: `docs/ADR/ADR-111-remocao-template-morto-technical-gauge.md`
84. ADR 112: `docs/ADR/ADR-112-badge-sinal-quantitativo-news-fallback.md`
85. ADR 113: `docs/ADR/ADR-113-acessibilidade-wcag-tabs-principais-chart-lab.md`
86. ADR 114: `docs/ADR/ADR-114-veto-redesign-visual-ia-observabilidade-defensiva.md`
87. ADR 115: `docs/ADR/ADR-115-serie-institucional-real-fallback-sintetico-e-live-signals-feed-real.md`

## Relatorio completo desta entrega

1. `docs/runbooks/relatorio-completo-publicacao-e-resiliencia-2026-04-01.md`
2. `docs/runbooks/checklist-deploy-macro-radar-institucional-2026-04-14.md`
3. `docs/runbooks/checklist-mudanca-strategy-routing-macro-radar-2026-04-14.md`
4. `docs/runbooks/release-changelog-institucional-live-signals-2026-04-27.md`

## Exemplo de operador Paper Trading

Configure `PAPER_TRADING_OPERATOR_TOKEN` no backend e use `x-paper-trading-operator-token` apenas para abertura simulada versionada. Nao reutilize `INTERNAL_API_TOKEN` no frontend.

```bash
curl -X POST "http://localhost:3000/v1/paper-trading/operator/auto-signal" \
	-H "content-type: application/json" \
	-H "x-paper-trading-operator-token: $PAPER_TRADING_OPERATOR_TOKEN" \
	-d '{"asset":"bitcoin","side":"long","entryPrice":100,"stopPrice":95,"targetPrice":112,"confluenceScore":88,"tier":"high"}'
```

Inspecione a auditoria centralizada (ADR-105) — ring buffer in-memory dos disparos recentes:

```bash
curl "http://localhost:3000/v1/paper-trading/operator/journal?limit=50" \
	-H "x-paper-trading-operator-token: $PAPER_TRADING_OPERATOR_TOKEN"
```

Filtros opcionais (ADR-106) aceitam `from`/`to` em ISO 8601, `action=opened|skipped|error` e `asset=<id>`:

```bash
curl "http://localhost:3000/v1/paper-trading/operator/journal?from=2026-04-26T00:00:00.000Z&to=2026-04-26T23:59:59.000Z&action=skipped&asset=bitcoin" \
	-H "x-paper-trading-operator-token: $PAPER_TRADING_OPERATOR_TOKEN"
```

Painel frontend (ADR-107): dentro do Operator Desk, abra a secao "Auditoria centralizada (servidor)" para filtrar action/asset/from/to e listar os disparos sem precisar de `curl`. O painel reusa o token salvo via `paper-trading-operator-client.js` e nao expoe credencial alguma no bundle.

Counter Prometheus (ADR-108): com `METRICS_ENABLED=true`, o scrape `/internal/metrics` passa a expor `paper_trading_operator_dispatches_total{action="opened|skipped|error"}` (cardinalidade fixa em 3 series). Permite alertas como `rate(...{action="error"}[5m]) > 0.1` e calculo de taxa de aceitacao cumulativa cross-window.

Persistencia NDJSON (ADR-109): configure `OPERATOR_DISPATCH_JOURNAL_FILE=apps/api/data/operator-dispatch-journal.jsonl` (default ja aplicado). Cada `record` e anexado em append-only e o boot hidrata ring buffer + contadores cumulativos a partir do disco — restart do processo deixa de zerar UI (ADR-107) e Prometheus (ADR-108). Linhas corrompidas e falhas de I/O degradam silenciosamente para in-memory (failure-open). Gitignore ja cobre `apps/api/data/*.jsonl`.

```bash
curl -H "x-internal-token: $INTERNAL_API_TOKEN" \
	http://localhost:3000/internal/metrics | grep paper_trading_operator
```


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

5. Saude da inteligencia de airdrops (JSON)

```bash
curl "http://localhost:3000/internal/health/airdrops" \
	-H "x-internal-token: $INTERNAL_API_TOKEN"
```

6. Saude da inteligencia de airdrops (CSV)

```bash
curl "http://localhost:3000/internal/health/airdrops.csv" \
	-H "x-internal-token: $INTERNAL_API_TOKEN" \
	-o airdrops-health.csv
```

7. Saude do stream de cotacoes por corretora (CSV)

```bash
curl "http://localhost:3000/internal/health/streams/brokers.csv" \
	-H "x-internal-token: $INTERNAL_API_TOKEN" \
	-o brokers-stream-health.csv
```

8. Saude do live-chart por exchange (CSV)

```bash
curl "http://localhost:3000/internal/health/live-chart/crypto.csv" \
	-H "x-internal-token: $INTERNAL_API_TOKEN" \
	-o live-chart-health.csv
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
3. `get_crypto_market_overview`
4. `get_crypto_chart_insights`
5. `get_airdrop_opportunities`
6. `get_broker_live_quote`
7. `get_forex_market_snapshot`
8. `get_futures_market_snapshot`
9. `get_options_market_snapshot`
10. `get_commodities_market_snapshot`
11. `get_fixed_income_market_snapshot`
12. `get_b3_market_snapshot`
13. `get_fiis_market_snapshot`
14. `get_equities_market_snapshot`
15. `get_wall_street_market_snapshot`
16. `get_defi_market_snapshot`
17. `get_etfs_market_snapshot`
18. `get_global_sectors_market_snapshot`
19. `get_macro_rates_market_snapshot`
20. `get_portfolio_risk_snapshot`
21. `get_financial_market_snapshot`
22. `get_operational_health`
23. `get_crypto_sync_policy`

Observacao tecnica da tool de grafico:

1. `get_crypto_chart_insights` aceita `mode`:
- `delayed` (historico padrao com fallback CoinGecko -> Binance)
- `live` (snapshot quase em tempo real por exchange: Binance, Bybit, Coinbase, Kraken ou OKX)

Observacao tecnica da tool de airdrops:

1. `get_airdrop_opportunities` agrega multiplas fontes (`airdrops.io`, `airdropalert`, `DefiLlama`, `CoinGecko trending`) e retorna score, confianca e tarefas sugeridas.
2. Fontes premium por API key podem ser habilitadas via env para expandir cobertura sem quebrar o fluxo base.
3. O resultado e informativo (nao garante reward) e pode incluir oportunidades especulativas quando `includeSpeculative=true`.

Observacao tecnica do MemeCoin Radar:

1. O endpoint `GET /v1/meme-radar/notifications` combina discovery de novos pools (`solana`/`base`) com enriquecimento de sinais via DexScreener.
2. O score de hype usa camada heuristica com opcao de reforco por IA (OpenRouter); sem chave, o fluxo permanece funcional em fallback.
3. O pinning operacional e feito por `POST /v1/meme-radar/notifications/:notificationId/pin` para manter sinais prioritarios no topo da wall.

Quando o modelo usa ferramentas, a resposta inclui `toolCallsUsed` com a lista das tools executadas no fluxo.

Cobertura de consultas apos esta evolucao:

1. cripto (preco, comparativo, resumo, risco de curto prazo por fatores, analise de grafico)
2. airdrops (radar multi-fonte com score, confianca e checklist de elegibilidade)
3. forex (pares spot e visao por presets: majors, latam, europe, asia e global)
4. futuros cripto (snapshot por contrato com funding rate, open interest e mark/index price)
5. opcoes (proxy de volatilidade via VIX, move esperado por vencimento e bias tatico por underlying)
6. commodities (metais, energia e agro com snapshots por contrato e cestas tematicas)
7. renda fixa (curva de juros, proxies de credito e inclinacao 10y-5y)
8. B3 (acoes brasileiras e indices locais com presets e batch resiliente)
9. FIIs (fundos imobiliarios brasileiros com snapshots por ticker e visao por cesta)
10. equities globais (acoes por ticker com presets de mega caps, inovacao e dividendos)
11. Wall Street (indices, setores, taxas e fatores de risco)
12. DeFi (tokens de infraestrutura/DEX/lending com cestas tematicas)
13. ETFs globais (broad market, tematicos, internacionais e renda fixa)
14. setores globais (rotacao setorial, forca relativa e breadth advance/decline)
15. macro rates (curva de juros, dolar, VIX e proxies de regime de risco)
16. portfolios (diagnostico de carteira com pesos customizados, exposicao por classe, score de risco e regime)
17. mercado global (indices, cambio, juros, commodities e simbolos customizaveis via Yahoo)
18. corretoras (status de integracao e cotacao ao vivo por broker, com Binance ativa e IQ Option mapeada para configuracao)
19. inteligencia de noticias cripto (multi-fonte RSS com score de relevancia, impacto e sentimento por ativo)

Endpoint tecnico para grafico:

```bash
curl "http://localhost:3000/v1/crypto/chart?assetId=bitcoin&currency=usd&range=7d"
```

Endpoint tecnico para grafico ao vivo:

```bash
curl "http://localhost:3000/v1/crypto/live-chart?assetId=bitcoin&range=24h&exchange=bybit"
```

Endpoint tecnico para noticias e eventos por ativo:

```bash
curl "http://localhost:3000/v1/crypto/news-intelligence?assetId=bitcoin&limit=8"
```

Endpoint tecnico para radar de airdrops:

```bash
curl "http://localhost:3000/v1/airdrops/opportunities?limit=10&minScore=30&query=base&includeSpeculative=true&chain=base&confidence=high&sources=airdrops_io,defillama&sortBy=recent"
```

Endpoint tecnico para MemeCoin Radar & Social Sentiment:

```bash
curl "http://localhost:3000/v1/meme-radar/notifications?chain=all&priority=all&pinnedOnly=false&limit=24&refresh=true"
curl -X POST "http://localhost:3000/v1/meme-radar/notifications/solana%3A<fingerprint>/pin" \
	-H "Content-Type: application/json" \
	-d '{"pinned":true}'
```

Endpoints tecnicos para forex:

```bash
curl "http://localhost:3000/v1/forex/spot-rate?pair=EURUSD"
curl "http://localhost:3000/v1/forex/spot-rate/batch?pairs=EURUSD,USDBRL,USDJPY"
curl "http://localhost:3000/v1/forex/market-overview?preset=latam&limit=6"
curl "http://localhost:3000/v1/forex/strategy-chart?symbol=EURUSD&range=7d&mode=delayed"
curl "http://localhost:3000/v1/forex/institutional-macro/snapshot?symbol=XAUUSD&range=24h&mode=live"
```

Endpoint tecnico para strategy chart cripto:

```bash
curl "http://localhost:3000/v1/crypto/strategy-chart?assetId=bitcoin&range=24h&mode=live&exchange=binance"
```

Endpoints tecnicos para futuros:

```bash
curl "http://localhost:3000/v1/futures/snapshot?symbol=BTCUSDT"
curl "http://localhost:3000/v1/futures/snapshot/batch?symbols=BTCUSDT,ETHUSDT,SOLUSDT"
curl "http://localhost:3000/v1/futures/market-overview?preset=crypto_majors&limit=5"
```

Endpoints tecnicos para opcoes:

```bash
curl "http://localhost:3000/v1/options/snapshot?underlying=SPY&daysToExpiry=30"
curl "http://localhost:3000/v1/options/snapshot/batch?underlyings=SPY,QQQ,AAPL&daysToExpiry=45"
curl "http://localhost:3000/v1/options/market-overview?preset=us_indices&limit=5&daysToExpiry=30"
```

Endpoints tecnicos para commodities:

```bash
curl "http://localhost:3000/v1/commodities/snapshot?symbol=GC%3DF"
curl "http://localhost:3000/v1/commodities/snapshot/batch?symbols=GC%3DF,CL%3DF,NG%3DF"
curl "http://localhost:3000/v1/commodities/market-overview?preset=global&limit=6"
```

Endpoints tecnicos para renda fixa:

```bash
curl "http://localhost:3000/v1/fixed-income/snapshot?symbol=%5ETNX"
curl "http://localhost:3000/v1/fixed-income/snapshot/batch?symbols=%5EIRX,%5EFVX,%5ETNX,%5ETYX"
curl "http://localhost:3000/v1/fixed-income/market-overview?preset=us_curve&limit=6"
```

Endpoints tecnicos para ETFs:

```bash
curl "http://localhost:3000/v1/etfs/snapshot?symbol=SPY"
curl "http://localhost:3000/v1/etfs/snapshot/batch?symbols=SPY,VTI,QQQ"
curl "http://localhost:3000/v1/etfs/market-overview?preset=broad_market&limit=6"
```

Endpoints tecnicos para setores globais:

```bash
curl "http://localhost:3000/v1/global-sectors/snapshot?symbol=XLK"
curl "http://localhost:3000/v1/global-sectors/snapshot/batch?symbols=XLK,XLF,XLE"
curl "http://localhost:3000/v1/global-sectors/market-overview?preset=us_sectors&limit=6"
```

Endpoints tecnicos para macro rates:

```bash
curl "http://localhost:3000/v1/macro-rates/snapshot?symbol=%5ETNX"
curl "http://localhost:3000/v1/macro-rates/snapshot/batch?symbols=%5EIRX,%5EFVX,%5ETNX,DX-Y.NYB"
curl "http://localhost:3000/v1/macro-rates/market-overview?preset=usd_rates&limit=6"
```

Endpoints tecnicos para portfolios:

```bash
curl "http://localhost:3000/v1/portfolios/snapshot?preset=balanced"
curl "http://localhost:3000/v1/portfolios/snapshot?positions=SPY:30,QQQ:20,AGG:25,GLD:15,BTC-USD:10"
curl "http://localhost:3000/v1/portfolios/snapshot/batch?presets=conservative,balanced,growth,crypto_tilt"
curl "http://localhost:3000/v1/portfolios/market-overview?presets=conservative,growth&limit=2"
```

Endpoints tecnicos para B3:

```bash
curl "http://localhost:3000/v1/b3/snapshot?symbol=PETR4"
curl "http://localhost:3000/v1/b3/snapshot/batch?symbols=PETR4,VALE3,ITUB4"
curl "http://localhost:3000/v1/b3/market-overview?preset=blue_chips&limit=6"
```

Endpoints tecnicos para FIIs:

```bash
curl "http://localhost:3000/v1/fiis/snapshot?symbol=HGLG11"
curl "http://localhost:3000/v1/fiis/snapshot/batch?symbols=HGLG11,KNRI11,XPLG11"
curl "http://localhost:3000/v1/fiis/market-overview?preset=high_liquidity&limit=6"
```

Endpoints tecnicos para equities globais:

```bash
curl "http://localhost:3000/v1/equities/snapshot?symbol=AAPL"
curl "http://localhost:3000/v1/equities/snapshot/batch?symbols=AAPL,MSFT,NVDA"
curl "http://localhost:3000/v1/equities/market-overview?preset=us_mega_caps&limit=6"
```

Endpoints tecnicos para Wall Street:

```bash
curl "http://localhost:3000/v1/wall-street/snapshot?symbol=SPY"
curl "http://localhost:3000/v1/wall-street/snapshot/batch?symbols=%5EGSPC,%5EIXIC,%5EVIX"
curl "http://localhost:3000/v1/wall-street/market-overview?preset=indices&limit=6"
```

Endpoints tecnicos para DeFi:

```bash
curl "http://localhost:3000/v1/defi/spot-rate?assetId=aave"
curl "http://localhost:3000/v1/defi/spot-rate/batch?assetIds=aave,uniswap,chainlink"
curl "http://localhost:3000/v1/defi/market-overview?preset=blue_chips&limit=6"
```

Filtros avancados disponiveis no radar de airdrops:

1. `chain` (ex.: `base`, `zksync`, `arbitrum`)
2. `confidence` (`high`, `medium`, `low`)
3. `sources` (CSV com `airdrop_alert`, `airdrops_io`, `coingecko_trending`, `defillama`, `drops_tab`, `earnifi`)
4. `sortBy` (`score` ou `recent`)

Endpoints tecnicos para corretoras:

```bash
curl "http://localhost:3000/v1/brokers/catalog"
curl "http://localhost:3000/v1/brokers/live-quote?broker=binance&assetId=bitcoin"
curl "http://localhost:3000/v1/brokers/live-quote?broker=iqoption&assetId=bitcoin"
```

Variaveis de ambiente para conectores de corretora (opcional):

1. `IQOPTION_ENABLED`
2. `IQOPTION_API_BASE_URL`
3. `IQOPTION_TIMEOUT_MS`

Variaveis de ambiente para futuros:

1. `BINANCE_FUTURES_API_BASE_URL`
2. `BINANCE_FUTURES_TIMEOUT_MS`

Variaveis de ambiente para macro radar institucional (opcional):

1. `FOREX_MACRO_CALENDAR_URL`
2. `FOREX_MACRO_CALENDAR_API_KEY`

Variaveis de ambiente para inteligencia de airdrops:

1. `AIRDROPS_TIMEOUT_MS`
2. `AIRDROPS_MAX_ITEMS_PER_SOURCE`
3. `AIRDROPS_IO_SOURCE_URL`
4. `AIRDROP_ALERT_SOURCE_URL`
5. `DEFILLAMA_API_BASE_URL`
6. `AIRDROPS_DROPS_TAB_SOURCE_URL` (opcional, premium)
7. `AIRDROPS_DROPS_TAB_API_KEY` (opcional, premium)
8. `AIRDROPS_EARNIFI_SOURCE_URL` (opcional, premium)
9. `AIRDROPS_EARNIFI_API_KEY` (opcional, premium)

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

5. Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configurados, o frontend habilita login e vincula historico ao usuario autenticado.
6. Para desbloquear historico persistido do Ghost Tracker e o painel de health backend no Chart Lab, configure `VITE_INTERNAL_API_TOKEN` (minimo 16 caracteres) no frontend interno ou injete em runtime no navegador com `window.__botfinanceiroSetInternalToken("seu_token")`.
7. Em ambientes publicos, evite embutir token interno no build; prefira injecao runtime de sessao para operadores.
8. O card "Conversas" permite criar e alternar multiplas threads; cada thread e persistida por usuario no banco.
9. Sidebar Chat-First com rotas principais: `/` (Chat), `/chart-lab` (Chart Lab) e `/radar` (Radar), com destaque visual da rota ativa.
10. O estado da rota e do menu colapsado e persistido no navegador para manter continuidade entre refreshs.
11. O card "Chart Lab" permite alternar entre modo `Delay` e `Ao vivo`, visualizar preco e sinais tecnicos avancados (EMA, RSI, MACD, ATR, suporte/resistencia, acao tatica e niveis de risco) e enviar analise automatica ao chat com um clique.
12. O bloco "Radar de oportunidades" dentro do Chart Lab carrega `/v1/airdrops/opportunities` com filtros de chain, confianca, score minimo e busca textual.
13. Cada card do radar possui acao "Levar ao chat" para preencher automaticamente um prompt contextual (projeto, tarefas, score, confianca e fontes), acelerando analise operacional.
14. O radar persiste filtros no navegador (chain, confianca, score, query e includeSpeculative), mantendo contexto entre reloads.
15. Cada card agora inclui acao "Copiar prompt" para usar o contexto em qualquer fluxo externo (chat, runbook ou checklist operacional).
16. Atalhos inteligentes incluem prompts dedicados para forex, futuros, opcoes, commodities, renda fixa, ETFs, setores globais, macro rates, carteira, B3, FIIs, equities globais, Wall Street e DeFi, acelerando consultas multi-mercado no Copiloto.
17. Atalhos de rota Chat-First: `Alt+7` abre Chat, `Alt+8` abre Chart Lab e `Alt+9` abre Radar.

## Frontend publico

Para publicar frontend e API em dominios diferentes:

1. Configure no backend (`.env` da API):
- `CORS_ALLOWED_ORIGINS=https://seu-frontend.exemplo.com`
2. Configure no frontend (`apps/web/.env` ou env da plataforma):
- `VITE_API_BASE_URL=https://sua-api.exemplo.com`
- `VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co`
- `VITE_SUPABASE_ANON_KEY=...`

Exemplo build do frontend com URL publica da API:

```bash
VITE_API_BASE_URL=https://sua-api.exemplo.com npm run build -w @botfinanceiro/web
```

Exemplo deploy rapido em host estatico:

1. Netlify/Vercel/Cloudflare Pages para `apps/web/dist`
2. API continua no Render
3. Ajuste `CORS_ALLOWED_ORIGINS` na API com o dominio final do frontend

### Opcao 100% gratis: GitHub Pages

Workflow pronto no repositório: `.github/workflows/deploy-web-pages.yml`.

1. No GitHub: `Settings -> Pages -> Build and deployment -> Source: GitHub Actions`
2. No GitHub: `Settings -> Secrets and variables -> Actions -> Variables`
3. Crie a variável `VITE_API_BASE_URL` com a URL pública da API (ex.: `https://sua-api.onrender.com`)
4. Crie a variável `VITE_SUPABASE_URL` com a URL do projeto Supabase (ex.: `https://SEU_PROJETO.supabase.co`)
5. Crie a variável `VITE_SUPABASE_ANON_KEY` com a publishable key do projeto Supabase
6. Rode o workflow `Deploy Web Pages` em `Actions`
7. URL final esperada: `https://SEU_USUARIO.github.io/BotFinanceiro/`
8. No backend (Render), ajuste `CORS_ALLOWED_ORIGINS` para essa URL final do GitHub Pages

Observacao:

1. O build usa `VITE_BASE_PATH=/<nome-repo>/` automaticamente para funcionar em subdiretório no GitHub Pages.