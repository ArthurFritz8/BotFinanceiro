# ADR-092 - Order Flow CVD e Volume z-score no Timing

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A auditoria institucional apontou que o Timing Desk ainda explicava sessoes, killzones e calendario macro, mas nao mostrava uma leitura objetiva do fluxo de agressao recente. A aba Micro-Timing ja tinha Trigger Heat, porem sem evidencia direta de CVD ou anomalia estatistica de volume.

O frontend ja recebe `snapshot.points` com OHLCV para o ativo corrente. Isso permite enriquecer Timing sem novo provider, sem WebSocket direto de exchange e sem acoplar o render principal a calculos inline.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/order-flow.js` como derivador puro de order flow. O contrato entrega:

- CVD por candle, usando sinal de `close - open` multiplicado pelo volume;
- delta acumulado, direcao de acumulacao/distribuicao/equilibrio e banda de um desvio padrao dos deltas;
- z-score do volume atual contra janela historica local;
- flag de anomalia quando `|z| >= 2`;
- sparkline compacta derivada do CVD para renderizacao responsiva.

A UI passa a renderizar uma faixa de fluxo abaixo do Trigger Heat no Micro-Timing e um painel dedicado na aba Timing. Quando a base estatistica e insuficiente, o estado fica em aquecimento em vez de fabricar leitura.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: derivacao pura isolada em modulo pequeno.
- Fail-honest: z-score exige amostra minima e desvio padrao valido.
- Asset-awareness: leitura usa apenas OHLCV do `snapshot.points` do ativo atual.
- Backend-mediated: nenhum stream direto cliente-exchange foi adicionado.

## Plano / DoD

- [x] Criar derivador puro para CVD e volume z-score.
- [x] Conectar faixa de order flow ao Micro-Timing abaixo do Trigger Heat.
- [x] Adicionar painel CVD / Volume na aba Timing.
- [x] Cobrir CVD, z-score e degradacao estatistica com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O Timing passa a ter evidencia quantitativa de fluxo recente.
- + Anomalias de volume ficam explicitas sem depender de narrativa manual.
- + O Micro-Timing ganha leitura de confirmacao logo abaixo do gatilho.
- - A qualidade do z-score depende da presenca de volume confiavel em `snapshot.points`.
