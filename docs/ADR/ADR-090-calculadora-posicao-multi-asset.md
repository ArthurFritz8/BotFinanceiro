# ADR-090 - Calculadora de Posicao Multi-Asset no Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A auditoria do Chart Lab apontou que a Calculadora de Posicao tratava pares forex conhecidos com pip-value correto, mas classificava indices e commodities como cripto/unidades. Para ativos como `NAS100`, `SPX500`, `GER40`, `XAUUSD`, `XAGUSD` e `WTI`, isso fazia `pipSize` cair para `null` e o tamanho de posicao podia virar uma leitura genérica, sem contrato ou tick institucional.

Esse comportamento era fail-silent: a UI continuava exibindo lote/risco como se a especificacao estivesse correta, quando o calculo dependia de contratos de CFD/commodity.

## Decisao

Expandir `apps/web/src/modules/chart-lab/quant/position-calculator.js` para classificar quatro modelos:

- `forex`: pip-value com contrato de 100.000 unidades;
- `index`: CFD linear com valor padrao de USD 1 por ponto por contrato;
- `commodity`: contrato/tick por ativo, cobrindo ouro, prata, WTI, Brent e gas natural;
- `generic`: fallback explicito em unidade/notional bruto quando nao ha especificacao cadastrada.

A UI da Calculadora passa a consumir `describePositionAssetSpec(spec)` para mostrar contrato, tick, spread medio e fallback honesto. Quando o ativo e desconhecido, um aviso visivel informa que o usuario precisa validar contrato, tick e lote minimo no broker antes de executar.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: mudanca isolada no helper quant e na renderizacao ja existente.
- Fail-honest: ativo desconhecido deixa de ser assumido como cripto e vira `generic` com aviso.
- Testabilidade: indices, commodities e fallback possuem testes Node.
- Coesao institucional: risco, spread, TP e cenarios usam o mesmo modelo de valor por tick.

## Plano / DoD

- [x] Expandir classificacao de ativos para indices e commodities.
- [x] Generalizar `computePositionCalc` para modelos com valor por tick/contrato.
- [x] Expor descricao auditavel da especificacao usada pela UI.
- [x] Mostrar aviso fail-honest para ativo sem contrato cadastrado.
- [x] Adicionar testes para NAS100, XAUUSD e fallback generico.
- [x] Atualizar indice de ADRs.

## Consequencias

- + A Calculadora deixa de subdimensionar ou superdimensionar indices/commodities como se fossem cripto.
- + O usuario ve explicitamente qual contrato/tick foi usado no calculo.
- + Ativos desconhecidos degradam de forma honesta, sem fingir precisao.
- - Valores de CFD podem variar por broker; por isso a UI declara o contrato padrao e mantem a obrigacao de validar condicoes reais antes da execucao.