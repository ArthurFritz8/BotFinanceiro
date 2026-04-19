# ADR-056 — Auto Paper Trading Bridge: Intelligence Desk → Paper Trading + Web Push

- Status: Aceito
- Data: 2026-04-19
- Wave: 16

## Contexto

A Wave 15 (ADR-055) entregou paper trading com persistência local. A Wave 14
(ADR-054) entregou Web Push notifications. Faltava o "tecido conectivo": um
bridge que **automaticamente** transformasse sinais fortes do Intelligence
Desk (confluência SMC tier=high) em entradas virtuais e notificasse o
usuário quando trades fechassem.

Sem essa ponte, o paper trading vira um endpoint manual — o usuário teria
que ler o sinal e disparar `POST /internal/paper-trading/trades` por conta
própria, derrotando o propósito de "validação automática de estratégia".

## Decisão

### 1. AutoPaperTradingBridge (Application Service)

Localização: `apps/api/src/modules/paper_trading/application/auto-paper-trading-bridge.ts`

Responsabilidades:

- **`tryOpenFromConfluence(signal)`**: aceita `ConfluenceSignal` (Zod
  validado), aplica gate `tier >= minTier` (default `high`), verifica
  duplicidade (não abre 2 trades do mesmo ativo simultaneamente — protege
  contra rajadas quando o scheduler reemite o mesmo sinal) e abre via
  `paperTradingService.openTrade`. Score 0-100 backend é normalizado para
  0-5 do domínio Trade. Dispara broadcast Web Push "Trade aberto".
- **`evaluateOpenTrades()`**: agrupa trades abertos por ativo, busca preço
  via `PriceProvider` (callback injetado), chama
  `paperTradingService.evaluatePrice` e — para cada trade que fechou —
  dispara broadcast "WIN ✅ / LOSS ❌" com PnL%. Failure-soft: erro de
  preço por ativo é capturado e contabilizado em `errors`, próxima
  iteração tenta novamente.

### 2. PriceProvider (abstração)

Tipo: `(assetId: string) => Promise<number>`. Decisão deliberada: o bridge
**não** depende de `MultiExchangeMarketDataAdapter` diretamente. Isso permite:

- Testes determinísticos (injeção de mock síncrono).
- Migração futura para WebSocket Binance (Wave 17) ou outras fontes sem
  alterar o bridge.
- Trocar o broker via env (`AUTO_PAPER_TRADING_BROKER` ∈
  `bybit|coinbase|kraken|okx`, default `bybit`) sem refatorar o serviço.

### 3. AutoPaperTradingJobRunner (Job)

Localização: `apps/api/src/jobs/auto-paper-trading-job-runner.ts`

Padrão idêntico aos demais runners do projeto: `setInterval(...).unref()`,
`start()` idempotente, `stop()` chamado via `app.addHook("onClose")`.
Intervalo configurável `AUTO_PAPER_TRADING_INTERVAL_SECONDS` (default 60s,
faixa 10-3600). Failure-soft: erros logados como `warn`, não interrompem
o ciclo.

### 4. Rotas internas (gated por ADR-007/008)

- `POST /internal/paper-trading/auto-signal`: scheduler externo (ou
  Intelligence Desk job) envia `ConfluenceSignal` para acionar abertura.
- `POST /internal/paper-trading/auto-evaluate`: gatilho manual de
  evaluation (útil para debug e testes operacionais).

### 5. Env vars

```
AUTO_PAPER_TRADING_ENABLED=true
AUTO_PAPER_TRADING_INTERVAL_SECONDS=60
AUTO_PAPER_TRADING_MIN_TIER=high
AUTO_PAPER_TRADING_BROKER=bybit
```

Failure-open: se `AUTO_PAPER_TRADING_ENABLED=false`, o bridge ainda existe
(rotas funcionam), mas o job runner não inicia. Se
`PUSH_NOTIFICATIONS_ENABLED=false`, broadcasts viram no-op silencioso.

## Alternativas consideradas

- **Pub/Sub interno (EventEmitter)**: rejeitado por adicionar acoplamento
  implícito entre Intelligence Desk e Paper Trading. Bridge explícito é
  mais auditável e testável.
- **Bridge dentro do PaperTradingService**: rejeitado por violar SRP —
  PaperTradingService cuida só de domínio de trades; bridge orquestra
  cross-module com notifications + price provider externos.
- **Não passar broker via env**: rejeitado por engessar — operador pode
  preferir kraken/bybit conforme liquidez do ativo monitorado.

## Consequências

- **Positivas**: ciclo end-to-end completo (sinal → trade virtual →
  evaluation periódica → notificação push); zero acoplamento direto entre
  módulos (apenas DI); testes determinísticos via fakes.
- **Negativas**: adiciona uma dependência soft entre Intelligence Desk e
  Paper Trading via convenção de payload `ConfluenceSignal` — mudança de
  schema exige sincronização com quem produz o sinal.
- **Compatibilidade**: 100% backwards-compatible. `AUTO_PAPER_TRADING_ENABLED=false`
  desabilita totalmente sem afetar paper trading manual (Wave 15).

## Integração futura

- **Wave 17** (Binance WS): substituir `multiExchangeAdapter` por adapter
  WebSocket — apenas trocar a implementação do `priceProvider` em `app.ts`.
- **Wave 18** (Calendário econômico): adicionar gate adicional no bridge
  (`shouldSkipDueToEvent(asset, timestamp)`) para suspender aberturas
  durante eventos macro de alto impacto.
