# ADR-094 - Regime Institucional no Timing Desk

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

O Chart Lab ja mostrava volatilidade, sessoes, killzones, CVD, volume z-score e heatmap de liquidez. Ainda assim, a decisao executiva do Timing ficava espalhada: o usuario precisava combinar manualmente volatilidade, tendencia, volume e fluxo para entender se o mercado estava em tendencia, range, squeeze ou stress.

Essa classificacao de regime e essencial para um terminal institucional, porque muda o tipo de execucao: seguir fluxo, operar extremos, aguardar ruptura ou reduzir tamanho.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/market-regime.js` como derivador puro de regime. O contrato:

- normaliza OHLCV local;
- calcula Efficiency Ratio, slope percentual, ATR proxy e volume z-score;
- cruza a direcao local com CVD quando disponivel;
- classifica o regime em tendencia, range, squeeze, stress ou aquecimento;
- devolve score, multiplicador tatico de risco, checks auditaveis e guidance.

A aba Timing passa a exibir o painel "Regime Institucional" antes de Order Flow, alem de um card compacto no header do Timing Desk.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: derivacao pura isolada em modulo pequeno.
- Fail-honest: sem doze candles retorna aquecimento e risco tatico zero.
- Asset-awareness: usa apenas `snapshot.points` do ativo atual.
- Coesao: reaproveita CVD quando ja calculado, sem criar provider paralelo.

## Plano / DoD

- [x] Criar derivador puro de regime institucional.
- [x] Integrar painel ao Timing Desk.
- [x] Expor risco tatico e checks auditaveis.
- [x] Cobrir tendencia, squeeze e aquecimento com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O Timing passa a indicar a fase operacional antes do usuario interpretar os paineis detalhados.
- + O risco tatico fica adaptativo ao regime, sem fabricar precisao de trade.
- + Squeeze e stress deixam de aparecer apenas como texto de volatilidade solto.
- - A classificacao depende da granularidade e qualidade do OHLCV recebido.
