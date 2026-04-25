# ADR-081 - Modularizacao Quant do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Lead Quant Developer, Arquiteto Socratico, Especialista em Trading Institucional, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A auditoria da aba Chart Lab identificou que `apps/web/src/main.js` ainda concentrava motores quantitativos, renderizacao, estado, DOM, realtime e persistencia em um unico arquivo.

Os blocos de maior retorno e menor risco para o primeiro corte eram:

- Risk Lab / Monte Carlo de gestao de banca.
- Calculadora de posicao institucional.
- Dashboard probabilistico quantitativo.

Esses blocos ja eram majoritariamente puros, mas estavam acoplados ao monolito web. Isso dificultava teste isolado, auditoria numerica e futuras evolucoes sem tocar na UI.

## Decisao

Criar a pasta `apps/web/src/modules/chart-lab/quant/` e mover para ela os nucleos puros do Chart Lab:

- `risk-lab.js`: estrategias de stake, simulacao Monte Carlo de banca, classificacao de risco de ruina e persistencia tolerante.
- `position-calculator.js`: classificacao forex/cripto, calculo de lote, risco, spread e cenarios por perfil.
- `probabilistic.js`: retornos, estatisticas historicas, VaR/Expected Shortfall, Monte Carlo direcional, sazonalidade e padroes de candle.

`apps/web/src/main.js` permanece como orquestrador/renderizador e importa esses helpers, preservando os seletores, strings visuais e fluxo atual da UI.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: sem reescrever a aba inteira e sem migrar framework.
- Fail-honest: estatisticas continuam aquecendo quando amostra e insuficiente.
- Determinismo de teste: simulacoes Monte Carlo aceitam `random` injetavel sem alterar o comportamento padrao da UI.
- Compatibilidade: markup, CSS classes e ids existentes foram preservados.

## Plano / DoD

- [x] Extrair Risk Lab para modulo quant.
- [x] Extrair Calculadora de Posicao para modulo quant.
- [x] Extrair Probabilistico para modulo quant.
- [x] Adicionar testes unitarios Node para os modulos puros.
- [x] Manter `main.js` como camada de render/orquestracao, sem alterar UX.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz o acoplamento do Chart Lab sem alterar comportamento visual.
- + Permite testar calculos financeiros fora do DOM.
- + Abre caminho para um `chartLabStore` e renderers por aba em etapas futuras.
- - `main.js` ainda segue grande; este ADR cobre apenas o primeiro corte de motores puros.
