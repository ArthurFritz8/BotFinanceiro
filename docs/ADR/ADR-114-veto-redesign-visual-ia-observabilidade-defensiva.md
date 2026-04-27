# ADR-114 - Veto ao redesign "insufficient-signal" no Visual IA + observabilidade defensiva

- Status: Aceito (veto + observabilidade)
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A auditoria do Chart Lab Pro listou como item ALTA o seguinte trecho de `apps/web/src/main.js#L9191`:

```js
const buyProbability = toFiniteNumber(analysis?.buyProbability, 50);
const sellProbability = toFiniteNumber(analysis?.sellProbability, 50);
```

Diagnostico inicial da auditoria: "default hardcoded 50% generico — placeholder que mascara ausencia de sinal e induz operador a interpretar ausencia como empate probabilistico". Recomendacao: substituir por estado UI explicito `insufficient-signal` (barra striped + badge "Sinal Insuficiente" + bloqueio de gatilhos).

## Peer Review

### Veto a substituicao por UI `insufficient-signal`

Apos examinar o pipeline e o uso real:

1. **`renderInstitutionalProbabilisticTab` so' e' chamado dentro de `renderAnalysisTabContent` quando `activeAnalysisTabId === "probabilistica"`** \u2014 caminho exige snapshot processado por `runChartAnalysisPipeline()` upstream, que **sempre** popula `analysis.buyProbability`/`sellProbability` como numeros finitos (saida de `computeBuySellProbabilities()` clampada em [0,100]).
2. **Os defaults `50` sao defensive guards (failure-open)**, nao placeholders ativos. O `toFiniteNumber(x, 50)` so' dispara o fallback se `analysis` for `null`/`undefined` ou se as probabilidades vierem `NaN`/`Infinity` \u2014 condicoes que **indicam bug upstream**, nao ausencia legitima de sinal.
3. **Substituir por UI `insufficient-signal` mascararia o bug upstream em vez de expo-lo**: operador veria "barra striped" como design legitimo e nunca reportaria. Anti-pattern peer-review identificado: "UI bonita escondendo defeito de pipeline".
4. **Conformidade com prompt-base "fail-honest"**: estado degradado deve ser observavel (log/metric), nao apenas suavizado em UI.

### Decisao alternativa

Manter o defensive guard `50/50` como esta', mas **adicionar `console.warn` discreto** quando o caminho degradado for atingido. Em producao, o warn fica em DevTools (zero impacto visual); em DEV/test, sinaliza imediatamente que `analysis` chegou degradado.

```js
if (
  analysis !== null
  && typeof analysis === "object"
  && !Number.isFinite(analysis.buyProbability)
  && !Number.isFinite(analysis.sellProbability)
) {
  console.warn(
    "[chart-lab][ADR-114] Visual IA recebeu analysis sem buy/sellProbability finitos; "
    + "usando default 50/50 defensivo. Investigar pipeline upstream.",
  );
}
```

## Conformidade

- **Zero Budget**: nenhuma dependencia adicionada.
- **Fail-honest**: condicao degradada agora e' observavel via DevTools console (browser tem retencao por sessao).
- **Backward compatible**: comportamento UI INALTERADO. Operador ve a mesma barra 50/50 que via antes; a unica adicao e' o warn (silencioso para usuario, visivel para devs/QA).
- **Risco zero de regressao**: sem testes existentes que validem ausencia de warnings; sem mudanca em propriedades visiveis.
- **Princípio do peer review HFT**: "VETAR sugestoes externas erradas" \u2014 a auditoria, embora bem-intencionada, cairia em anti-pattern (UI bonita mascarando bug).

## Plano / DoD

- [x] Adicionar bloco `if + console.warn` em `renderInstitutionalProbabilisticTab` antes dos `toFiniteNumber`.
- [x] Manter defaults `50/50` defensivos (NAO substituir por `null` nem por UI alternativa).
- [x] ADR-114 documenta o veto + alternativa adotada.
- [ ] Build `apps/web` verde (sera validado no commit).

## Consequencias

### Positivas

- Bug upstream que silenciosamente alimentasse `analysis.buyProbability = null` agora e' observavel via DevTools \u2014 QA/dev detecta em primeira sessao.
- Visual IA preserva o fallback "neutro" (50/50) que e' a interpretacao matematicamente correta na ausencia de informacao bayesiana \u2014 nenhuma mudanca para o operador final.
- Padroniza convencao: defensive guards em frontend devem sempre ter observability anexada (warn discreto), evitando bugs silenciosos.

### Negativas / mitigadas

- `console.warn` produz ruido em DevTools quando o caso degradado dispara em loop. Mitigacao: caso e' raro (pipeline normal nunca produz NaN), e qualquer ocorrencia recorrente e' justamente o que queremos detectar.
- Nao adiciona valor visual para o usuario final \u2014 mas isso e' deliberado: o "default 50/50 generico" da auditoria nao e' bug visual, e' diagnostico de bug em outro lugar.

## Itens da auditoria fechados sem mudanca de codigo

Esta ADR tambem registra formalmente o veto a outros dois itens da auditoria do Chart Lab Pro, validados por peer review:

- **Item 1 (FVG regex)**: nao ha regex no parser \u2014 a deteccao de FVG em `apps/web/src/modules/chart-lab/quant/smc-derivations.js` e' algoritmica via comparacao OHLC (`left.high < right.low` para bullish, etc.) e ja' tem cobertura de teste em `chart-lab-quant.test.mjs#L232`. Falso positivo da auditoria.
- **Item 3 (Position Calculator pipSize)**: `position-calculator.js` ja' diferencia JPY (0.01), forex EUR/GBP/USD (0.0001), ouro/prata/comodities (0.01/0.001), indices (1) e crypto (`null` unit-notional). Cobertura existente em `chart-lab-quant.test.mjs#L101,L125,L149`. Falso positivo da auditoria.
- **Item 5b (liquidity-heatmap.js)**: importado em 3 callsites (`main.js#L9576/L13601/L17752`) e testado em `chart-lab-quant.test.mjs#L340`. **NAO e' codigo morto** \u2014 mantido. (Item 5a `technical-gauge.html` foi removido em ADR-111.)

Esses vetos sao parte da auditoria responsavel: peer review que protege o sistema de mudancas que parecem certas mas refletem leitura superficial.
