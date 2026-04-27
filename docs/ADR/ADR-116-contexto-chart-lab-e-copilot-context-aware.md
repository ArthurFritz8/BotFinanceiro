# ADR-116 - Contexto expandido no Chart Lab e Copiloto context-aware por terminal ativo

- Status: Aceito
- Data: 2026-04-27
- Personas ativas: Arquiteto Socratico, Arquiteto de Dashboards Financeiros + HFT Peer Review, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

1. O reset de contexto no Chart Lab detectava mudanca apenas por `assetId/symbol/strategy/operationalMode`, deixando brechas para estado stale quando broker/exchange/interval/mode/range mudavam.
2. A comunicacao visual de Order Flow podia sugerir leitura de microestrutura real, embora os sinais atuais sejam derivados de OHLCV agregado (proxy).
3. O dashboard probabilistico usava premissas fixas (`min sample = 30`, anualizacao por 252) sem ajuste por faixa temporal/cadencia efetiva dos candles.
4. O Copiloto recebia contexto textual geral, mas sem injeccao estruturada do contexto ativo do terminal para orientar defaults operacionais.

## Decisao

### 1. Expandir o gatilho de mudanca de contexto do Chart Lab

Foi adotada comparacao por dimensao completa de contexto:

1. `assetId`
2. `broker`
3. `exchange`
4. `interval`
5. `mode`
6. `operationalMode`
7. `range`
8. `strategy`
9. `symbol`

Implementacao principal em:

1. `apps/web/src/modules/chart-lab/chart-asset-context-reset.js`
2. `apps/web/src/main.js` (passagem de contexto completo no `loadChart`)

### 2. Tornar explicita a proveniencia proxy do bloco de fluxo

A nomenclatura e hints do painel de fluxo foram alinhados para "proxy OHLCV", evitando interpretacao de order book real:

1. `Fluxo (proxy OHLCV): CVD / Volume`
2. orientacoes e textos de suporte com ressalva metodologica

Implementacao principal em:

1. `apps/web/src/main.js`

### 3. Calibracao probabilistica orientada por contexto

Foi introduzida calibracao dinamica para estatistica probabilistica:

1. `minReturnsForStats` derivado por `range` com piso amostral;
2. `periodsPerYear` derivado por estrategia e mediana de passo temporal dos candles;
3. funcoes estatisticas aceitam configuracao opcional sem quebrar contrato anterior.

Implementacao principal em:

1. `apps/web/src/modules/chart-lab/quant/probabilistic.js`
2. `apps/web/src/main.js`

### 4. Copiloto context-aware com contexto do terminal ativo

Foi adicionado `chartContext` no contrato de `/v1/copilot/chat` e `/v1/copilot/chat/stream`, com injeccao segura no prompt de sistema:

1. frontend envia `assetId/broker/exchange/interval/mode/range/strategy/symbol/operationalMode`;
2. backend normaliza e sanitiza contexto;
3. composicao final respeita limite de 4000 caracteres para `systemPrompt`.

Implementacao principal em:

1. `apps/web/src/main.js`
2. `apps/api/src/modules/copilot/interface/copilot-controller.ts`
3. `apps/api/src/modules/copilot/application/copilot-chat-service.ts`

## Conformidade

1. Zero Budget: sem novas dependencias.
2. Validacao estrita: schema Zod para `chartContext` no controller e normalizacao defensiva no service.
3. Degradacao graciosa: contexto adicional e opcional; ausencia de contexto nao bloqueia chat.
4. Observabilidade semantica: painel de fluxo explicita metodologia proxy (fail-honest).

## Plano / DoD

- [x] Reset de contexto cobre broker/exchange/interval/mode/range.
- [x] Copy de fluxo explicita proxy OHLCV e evita claim de book real.
- [x] Probabilistico aceita calibracao dinamica sem regressao de contrato.
- [x] Copiloto recebe e sanitiza `chartContext` com limite hard de prompt.
- [x] Teste de reset de contexto atualizado para novas dimensoes.
- [x] Lint/typecheck/testes focais executados e verdes.

## Evidencias de validacao

1. `npm run lint -w @botfinanceiro/api` -> sucesso.
2. `npm run typecheck -w @botfinanceiro/api` -> sucesso.
3. `npm run test -w @botfinanceiro/web -- tests/chart-asset-context-reset.test.mjs tests/chart-lab-quant.test.mjs` -> sucesso.
4. `node --import tsx --test apps/api/src/modules/copilot/interface/copilot-routes.test.ts` -> sucesso.

## Consequencias

### Positivas

1. Menor risco de estado stale no Chart Lab em mudancas operacionais intra-ativo.
2. Melhor auditabilidade da leitura de fluxo por semantica metodologica correta.
3. Estatistica probabilistica mais aderente ao contexto de janela/cadencia.
4. Copiloto mais consistente com contexto ativo do operador no terminal.

### Negativas / mitigadas

1. Aumento de logica de calibracao no frontend; mitigado por defaults backward-compatible.
2. Crescimento de prompt por contexto adicional; mitigado por truncamento hard em 4000 chars.