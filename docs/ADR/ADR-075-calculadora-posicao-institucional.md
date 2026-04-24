# ADR-075 — Calculadora de Posicao Institucional (Forex/Cripto Margin)

## Status
Aceito — implementado em `apps/web/src/main.js` (helpers + render + handlers) e `apps/web/src/styles.css` (`.pos-calc__*`).

## Contexto
A aba "Calculadora" em modo spot ja contava com o **Risk Lab Monte Carlo** (gestao de banca de longo prazo: P10/P50/P90, risco de ruina, estrategias de stake). Essa ferramenta permanece valida para perfil estatistico de carreira de trader, mas **nao calcula tamanho de posicao por trade individual** (lote por risco%, pip-value, custo de spread, lucro por TP em $).

Peer review do prompt sugerido pelo Gemini (Quant Risk Manager + UI/UX Sr) identificou:
- ✅ Concordo: 3 perfis (Conservador 0.5–1% / Moderado 1–2% / Agressivo 2–3%) + matriz TP1/TP2/TP3 com R:R + resumo executivo dinamico sao institucionais e somam ao Risk Lab.
- ❌ Veto: NAO substituir Risk Lab Monte Carlo. Coexistencia em vez de substituicao.
- ❌ Correcao: pip-value automatico so faz sentido em forex. Para cripto, degradar para "unidades / notional" com label adaptado.
- ❌ Correcao: spread medio nao pode ser hardcoded — expor como input editavel com default por classe.
- ➕ "Sim, e alem disso...": detector automatico de classe (forex/cripto) via assetId, botao "Copiar Plano" para clipboard, alerta de risco>10% honesto.

## Decisao
1. Adicionar **`renderPositionCalculator`** + **`attachPositionCalculatorHandlers`** acima do Risk Lab existente. Risk Lab fica em `<details open>` colapsavel.
2. **`classifyPositionAssetSpec(assetId, currency)`** detecta:
   - **forex**: pip=0.0001 (ou 0.01 para JPY pairs), contractSize=100k, lotMin=0.01, defaultSpread=0.8 pips
   - **cripto/default**: pip=null, contractSize=1, lotMin=0.0001, defaultSpread=0
3. **`computePositionCalc`** calcula:
   - Lote sugerido = `riskBudget / (stopDistancePips * pipValuePerLot)` (forex) ou `riskBudget / stopDistanceAbs` (cripto)
   - Quantizado ao `lotStep`, respeitando `lotMin`
   - Risco real recalculado pos-quantizacao (pode exceder alvo se lotMin > ideal — alerta)
   - 3 cenarios paralelos (Conservador 0.75% / Moderado 1.5% / Agressivo 2.5%)
   - 3 TPs com lucro $, ganho %, distancia em pips/ticks, R:R
   - Spread cost = `lot * spreadPips * pipValuePerLot`
4. **UI**:
   - Card de niveis pre-carregados do sinal (Entrada, Stop, TP1/2/3)
   - Input destacado de Capital com prefixo "$"
   - 3 radio cards de perfil com cor amber no ativo (estilo screenshot)
   - Tabela comparativa clicavel (clicar linha = selecionar perfil)
   - Card "Risco Maximo (Stop Loss)" com Prejuizo $ + Stop em + spread editavel
   - Grid TP1/TP2/TP3 com tag R:R
   - Resumo da Gestao com texto dinamico em HTML rico
   - Botao "Copiar Plano" -> clipboard (texto plano)
   - Card "Importante" com specs do ativo

## Honestidade & Graceful Degradation
- Sem `entry`/`stop` validos => `ready=false`, todos os outputs ficam em "—".
- Capital=0 => mostra "Insira capital" nos perfis, summary explica o que digitar.
- Lote minimo > ideal => alerta amber "Atencao ao Tamanho da Posicao" honesto.
- Risco real > 10% capital => alerta vermelho.
- Cripto sem pip => labels mudam para "unidades" e "ticks", spread=0 por default.

## Persistencia
`localStorage` chave `botfinanceiro:position-calc:v1` armazena `{ capital, profile, spreadPips }`. Failure-tolerant.

## Acessibilidade
- `role="status" aria-live="polite"` no warning
- `aria-label` em todas as secoes/inputs
- `<fieldset>` + `<legend>` (off-screen) para os perfis
- `prefers-reduced-motion` neutraliza transitions
- Mobile: grid responsivo (5 niveis -> 2 cols, comparativo esconde colunas extras)

## Referencias
- Risk Lab Monte Carlo (preservado): ADR anterior do Risk Lab
- Sinal/levels: `analysis.signal.{entryLow, stopLoss, takeProfit1/2/3, riskReward}`
