# ADR-047 — Expansão do catálogo para 60 ativos + label explícito "Abrir no Chart Lab"

- **Status:** Aceito
- **Data:** 2026-04-18
- **Persona acumulada:** Engenheiro HFT + Engenheiro UI/UX + Sócratico (continuidade ADR-046)

## Contexto

Após o ADR-046 entregar 30 ativos com paridade multi-broker, o usuário relatou:

1. "Tem muitas opções que nem moedas têm e as que tem algumas não estão pegando" — interpretação dupla: (a) Mercados é multi-classe (índices, equities, ETFs, FIIs, commodities, etc.) e nem todo item é cripto; (b) muitos criptoativos populares (SHIB, PEPE, TON, TIA, WLD, ONDO, JUP, PYTH, RNDR, IMX, FET, GRT, etc.) não estavam no catálogo de 30, então o botão "Abrir no chart" ficava desativado para eles.
2. "O botão de levar ao chart tem que levar direto ao chart lab ok?" — confirmação de comportamento. O botão `openMarketItemInChart` já chamava `navigateToRoute(APP_ROUTE_CHART_LAB)` em [main.js linha 5820](../../apps/web/src/main.js), mas o label "Abrir no chart" não deixava isso óbvio para o usuário.

## Decisão

### 1. Expansão do catálogo: 30 → 60 ativos

Adicionados 30 novos ativos (rank 31-60) ao [asset-catalog.ts](../../apps/api/src/integrations/market_data/asset-catalog.ts), cobrindo memecoins (SHIB, PEPE), L1s emergentes (TIA, SEI, SUI já existia), AI/DePIN (RNDR, FET, TAO, GRT), DeFi (ONDO, COMP, CRV, LDO, JUP), gaming (GALA, APE, CHZ), L2/Restaking (IMX), oracles (PYTH), identity (WLD), e clássicos (ICP, HBAR, VET, XTZ, EOS, MINA, FLOW, KAVA, FTM, ZEC, DYDX).

Princípios mantidos:
- `null` explícito quando o broker não lista (ex.: TAO ausente da Binance, VET ausente da Kraken).
- Pares validados conforme convenções de cada exchange.
- Ordenação por `rank` aproximado de market cap.

### 2. Hidratação dinâmica + fallback estático sincronizado

O `<select id="chart-asset">` em [index.html](../../apps/web/index.html) foi expandido para 60 opções estáticas (fallback). A função `hydrateChartAssetCatalog()` no [main.js](../../apps/web/src/main.js) já consome `/v1/crypto/asset-catalog` em runtime e cobre automaticamente os 30 novos ativos.

Resultado: assets do market navigator com `assetId` em ⟨shiba-inu, pepe, hedera-hashgraph, render-token, ...⟩ agora passam pela checagem `hasAssetOption` em `resolveChartTargetFromMarketItem` e o botão fica habilitado.

### 3. Label explícito "Abrir no Chart Lab"

Renomeado de "Abrir no chart" para "Abrir no Chart Lab" em [main.js](../../apps/web/src/main.js). Comportamento permanece idêntico: `openMarketItemInChart()` navega via `navigateToRoute(APP_ROUTE_CHART_LAB)`, atualiza `chartAssetSelect.value`, dispara `loadChart()` e `refreshWatchlistMarket()`.

## Consequências

### Positivas

- **2x mais variedade**: dobra a cobertura de criptoativos, atendendo memecoins, narrativas IA/DePIN, restaking, gaming, etc.
- **Menos botões "Chart indisponivel"**: market navigator agora consegue rotear para chart-lab muito mais ativos sem alterar contrato de API.
- **UX clarificada**: label "Abrir no Chart Lab" elimina dúvida sobre destino da navegação.
- **Zero risco de regressão**: novos ativos são puramente aditivos; testes existentes (215 API + 22 web) seguem verdes.

### Negativas / riscos aceitos

- Algumas combinações `brokerPairs` para ativos novos podem revelar 404 em produção quando a corretora retornou pair desativado/renomeado. Mitigação: cadeia de failover entre brokers (binance → bybit → coinbase → kraken → okx) já cobre esse caso degradado.
- Manutenção do fallback estático no HTML cresce linearmente com o catálogo. Mitigação futura: gerar HTML do catálogo via build step (não escopo desta onda).

## Validação

- `npm test --workspace apps/api`: **215 passed**.
- `npm test --workspace apps/web`: **22 passed**.
- `npm run lint --workspace apps/api`: **OK**.
- `npm run typecheck --workspace apps/api`: **OK**.

## Referências

- ADR-046 (catálogo unificado 30 ativos): base arquitetural mantida intacta.
- ADR-045 (Coinbase /stats + stream defer).
- ADR-044 (CTA fresh-fetch).
