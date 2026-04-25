# ADR-089 - Derivacoes SMC Numericas para Confluencia do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A auditoria do Chart Lab apontou que a Confluencia 3/5 e parte do painel SMC ainda usavam regex sobre narrativas textuais (`smc.structure`, `smc.liquidity`, `smc.sweepRisk`) para decidir sweep e FVG. Como essas narrativas podem ser fixas ou genericas, a UI podia exibir um check institucional sem uma leitura objetiva dos candles.

Esse comportamento era especialmente perigoso no bloco "Mitigacao de FVG": a string de estrutura nao contem necessariamente FVG, entao o check podia ficar falso por motivo textual ou verdadeiro por coincidencia de legenda, nao por desequilibrio real de tres candles.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/smc-derivations.js` com derivacoes puras sobre OHLC:

- normalizacao de candles (`open`, `high`, `low`, `close`, `volume`);
- deteccao recente de sweep por rompimento de extremo e fechamento de volta para dentro;
- deteccao de FVG por gap de tres candles;
- mitigacao de FVG por toque posterior na zona;
- rejeicao por wick dominante;
- contrato `deriveSmcConfluence` com checks auditaveis.

`renderInstitutionalSummary`, `buildSmcPriceActionConfluence` e a confianca SMC do Ensemble Engine passam a consumir esse contrato numerico em vez de regex sobre strings.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: adicionada uma camada pura sem reescrever a aba SMC inteira.
- Fail-honest: sem OHLC suficiente, os checks ficam falsos/aquecendo em vez de fabricar confluencia.
- Testabilidade: sweep, rejeicao e FVG mitigado possuem testes Node isolados.
- Coesao algoritmica: pesos SMC e checklist usam a mesma fonte de verdade.

## Plano / DoD

- [x] Criar derivador SMC puro em `quant/smc-derivations.js`.
- [x] Substituir regex de sweep/FVG no resumo institucional.
- [x] Reutilizar o contrato na aba SMC.
- [x] Ajustar confianca SMC do Ensemble Engine.
- [x] Adicionar testes unitarios no pacote quant.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + A Confluencia 3/5 passa a refletir candles reais.
- + O peso Smart Money Concepts deixa de contar strings sempre preenchidas como sinal.
- + O painel SMC fica mais auditavel sem depender de texto narrativo.
- - O proximo corte deve expandir a calculadora de posicao para indices e commodities.
