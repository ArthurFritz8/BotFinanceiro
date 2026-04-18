# ADR-046 — Catálogo unificado de 30 ativos multi-broker (single source of truth + hidratação dinâmica)

- **Status:** Aceito
- **Data:** 2026-04-18
- **Persona acumulada:** Engenheiro HFT (continuidade ADR-044/045) + Engenheiro UI/UX + Sócratico (auditoria)
- **Contexto da onda:** Wave 7 — paridade de corretoras + catálogo global de ativos

## Contexto

Após o usuário relatar que (1) "outras corretoras também tinham problemas, não só a Coinbase" e (2) "tem moeda que eu seleciono que nem funciona, porque? falta de api?", uma auditoria sistemática foi conduzida nos cinco adapters (binance, bybit, coinbase, kraken, okx) e no catálogo de ativos exposto pelo frontend.

Foram identificadas três categorias de inconsistência:

1. **Drift entre catálogos**: o `binance-market-data-adapter.ts` mapeava 16 ativos; o `multi-exchange-market-data-adapter.ts` mapeava apenas 14. Ativos como `maker`, `polygon-pos` e variações da família Polygon existiam no Binance mas não nas outras corretoras.
2. **HTML hardcoded fora de sincronia**: o `<select id="chart-asset">` em `apps/web/index.html` listava apenas 11 dos 14 ativos suportados pelo backend. `litecoin`, `tron` e `polkadot` estavam mapeados no backend porém invisíveis na UI (assets órfãos).
3. **Variedade insuficiente**: o catálogo de 14 moedas era insuficiente para um produto "global" — usuários esperam pelo menos o top-30 de capitalização disponível para seleção.

## Decisão

### 1. Single source of truth — `asset-catalog.ts`

Criado `apps/api/src/integrations/market_data/asset-catalog.ts` como fonte canônica do catálogo. Cada entrada expõe:

```ts
interface AssetCatalogEntry {
  id: string;          // CoinGecko id (e.g. "bitcoin", "polygon-pos")
  name: string;        // "Bitcoin"
  symbol: string;      // "BTC"
  rank: number;        // 1..30 (top market cap)
  brokerPairs: {
    binance:  string | null;  // "BTCUSDT"
    bybit:    string | null;
    coinbase: string | null;  // null => não listado
    kraken:   string | null;  // "XBTUSD" alias para BTC
    okx:      string | null;
  };
}
```

- **30 ativos** ordenados por rank (bitcoin → sui).
- **5 corretoras** suportadas. `null` em `brokerPairs.X` indica explicitamente ausência (e.g. BNB não tem par USD direto na Coinbase nem na Kraken).
- `ASSET_CATALOG` é congelado (`Object.freeze`) — imutabilidade defensiva.
- `findAssetCatalogEntry(assetId)` resolve aliases (`bnb→binancecoin`, `matic-network→polygon-pos`).

### 2. Refatoração dos adapters

Tanto `multi-exchange-market-data-adapter.ts` quanto `binance-market-data-adapter.ts` passam a consultar primeiro o catálogo central via `findBrokerPair(assetId, broker)`, com fallback para a heurística existente (`normalizeBaseSymbol` + sufixo) preservando compatibilidade.

- O `assetPairMap` local do multi-exchange foi **removido**.
- O `assetIdToBinanceSymbol` legado foi **mantido** como fallback histórico, com comentário explícito.

### 3. Endpoint REST `GET /v1/crypto/asset-catalog`

Exposto via `getAssetCatalog` em `crypto-controller.ts` e registrado em `crypto-routes.ts`. Retorna:

```jsonc
{
  "status": "success",
  "data": {
    "assets": [
      {
        "id": "bitcoin",
        "name": "Bitcoin",
        "symbol": "BTC",
        "rank": 1,
        "brokerPairs": { "binance": "BTCUSDT", "kraken": "XBTUSD", ... },
        "supportedBrokers": ["binance", "bybit", "coinbase", "kraken", "okx"]
      }
    ],
    "total": 30
  }
}
```

### 4. Hidratação dinâmica + fallback estático (graceful degradation)

`apps/web/index.html` foi expandido para listar os 30 ativos como **fallback estático** (funciona offline / com endpoint indisponível). No runtime, `hydrateChartAssetCatalog()` em `apps/web/src/main.js` consome `/v1/crypto/asset-catalog`, valida a forma da resposta, preserva o valor selecionado pelo usuário e repopula o `<select>`. Em caso de erro, falha **silenciosamente** — a lista estática já cobre o catálogo completo.

## Consequências

### Positivas

- **Paridade garantida**: HTML, backend e adapters consultam a mesma fonte de verdade. Drift impossível por construção.
- **Variedade global**: 30 ativos top-30 cobrem a maioria das dores do usuário ("muito pouca variedade").
- **Onboarding de novo broker**: adicionar uma corretora exige apenas estender `brokerPairs` no catálogo + criar adapter; UI atualiza automaticamente.
- **Graceful degradation**: endpoint quebrado não derruba a UI (fallback estático cobre 30 opções).
- **Testabilidade**: novo teste em `crypto-routes.test.ts` valida total ≥ 30, ordenação por rank, presença dos órfãos antigos (litecoin/tron/polkadot/polygon-pos) e exceções conhecidas (BNB sem coinbase/kraken). Smoke web cobre presença das 30 opções e da função de hidratação.

### Negativas / riscos aceitos

- Algumas combinações `brokerPairs` precisarão de ajuste fino conforme telemetria real revelar pares inválidos em corretoras (catálogo é uma "melhor estimativa" inicial).
- O fallback estático precisa ser mantido manualmente em sincronia quando o catálogo crescer — risco de drift retorna em escala maior. Mitigação futura: gerador de HTML a partir do catálogo TS via build step (não escopo desta onda).

## Validação

- `npm test --workspace apps/api`: **215 passed** (+1 teste novo).
- `npm test --workspace apps/web`: **22 passed** (+2 testes novos).
- `npm run lint --workspace apps/api`: **OK**.
- `npm run typecheck --workspace apps/api`: **OK**.

## Referências

- ADR-044 (CTA fresh-fetch): peer-review HFT.
- ADR-045 (Coinbase /stats + stream defer): paridade Coinbase.
- ADR-024 / ADR-026: arquitetura UI Copiloto (mantida intacta).
