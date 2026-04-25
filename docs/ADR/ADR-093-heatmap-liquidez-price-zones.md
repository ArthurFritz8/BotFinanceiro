# ADR-093 - Heatmap de Liquidez via PriceZonesPrimitive

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois do ADR-092, o Timing passou a enxergar CVD e volume z-score, mas o grafico ainda nao mostrava onde a liquidez estava concentrada. A camada ADR-077 ja possuia `PriceZonesPrimitive` para desenhar zonas horizontais sem reflow, entao nao fazia sentido criar outro overlay.

O Chart Lab recebe `snapshot.points` com OHLCV local. Esses candles permitem derivar clusters de liquidez por toques em high/low/close ponderados por volume, sem novo provider, sem WebSocket direto e sem custo externo.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/liquidity-heatmap.js` como derivador puro de heatmap. O contrato:

- normaliza OHLCV local;
- divide o range em buckets de preco;
- pondera high, low e close por volume relativo;
- seleciona os buckets mais densos evitando zonas adjacentes redundantes;
- classifica zonas em BSL, SSL ou liquidez corrente;
- retorna `zones` prontas para o `PriceZonesPrimitive` e resumo para UI SMC.

A UI SMC passa a exibir um painel "Heatmap de Liquidez" e o overlay do grafico passa a pintar essas zonas junto das anotacoes existentes quando o usuario mantem os niveis habilitados.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: derivacao pura isolada em modulo pequeno.
- Fail-honest: menos de oito candles retorna heatmap em aquecimento.
- Asset-awareness: leitura derivada somente do `snapshot.points` do ativo corrente.
- Reuso de arquitetura: usa o `PriceZonesPrimitive` existente em vez de criar outro overlay.

## Plano / DoD

- [x] Criar derivador puro de heatmap de liquidez.
- [x] Conectar zonas ao `PriceZonesPrimitive` no overlay do grafico.
- [x] Exibir resumo BSL/SSL no painel SMC.
- [x] Cobrir clusterizacao e degradacao com testes Node.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O grafico mostra bolsos de liquidez como faixas auditaveis.
- + A aba SMC passa a explicar BSL/SSL proximas sem depender apenas de narrativa.
- + O overlay reaproveita a infraestrutura ADR-077 e preserva pan/zoom leve.
- - A qualidade da leitura depende da qualidade de `volume` e da granularidade dos candles recebidos.
