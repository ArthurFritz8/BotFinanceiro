# ADR-091 - Visual IA com Evidencia Quantitativa no Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A auditoria do Chart Lab apontou que a aba "Visual IA" reapresentava bullets ja cobertos por Resumo, Tecnica e SMC. A tela parecia sofisticada, mas nao adicionava decisao nova nem auditabilidade propria.

O projeto ja possuia dois insumos defensaveis para uma leitura visual real:

- `detectProbabilisticCandlePatterns(points)`, com padroes de candle e win rate historico por ocorrencia;
- `buildHarmonicGeometryScanner(analysis, currency)`, com geometria XABCD, confianca e validacao da razao dominante.

## Decisao

Criar `apps/web/src/modules/chart-lab/quant/visual-intelligence.js` como derivador puro de evidencia visual. O contrato combina:

- candle estatistico primario;
- melhor padrao harmonico ranqueado;
- alinhamento direcional entre candle, harmonico e sinal;
- confianca operacional e risco/recompensa.

A aba "Visual IA" deixa de renderizar `analysis.visualChecklist` e passa a exibir cards auditaveis, checklist numerico e bloco de auditoria da leitura. Sem OHLC ou sem amostra minima, o score fica baixo e a UI orienta aguardar em vez de fabricar gatilho.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: camada pura adicionada sem reescrever o Chart Lab.
- Fail-honest: padroes sem cinco ocorrencias ficam em aquecimento.
- Asset-awareness: a leitura deriva de `snapshot.points` do ativo corrente.
- Coesao: reaproveita detectores existentes em vez de criar motor visual paralelo.

## Plano / DoD

- [x] Criar derivador puro de evidencia visual.
- [x] Conectar a aba Visual IA ao scanner harmonico e aos candles do snapshot.
- [x] Renderizar cards/checklist/auditoria com score derivado.
- [x] Adicionar testes Node para setup valido e degradacao sem amostra.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + A aba passa a responder a padroes reais de candle e geometria harmonica.
- + O usuario entende por que um gatilho visual esta validado ou pendente.
- + O conteudo deixa de duplicar Resumo/Tecnica/SMC sem adicionar decisao.
- - O proximo refinamento pode mover CVD e volume z-score para Timing para enriquecer ainda mais a leitura de fluxo.