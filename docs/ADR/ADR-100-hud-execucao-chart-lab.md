# ADR-100 - HUD de Execucao no Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Os ADRs 095 a 099 levaram gate, plano, journal, action rail e score de qualidade para o Timing Desk. O grafico ja desenhava linhas e zonas, mas o estado operacional ainda ficava concentrado nos paineis abaixo do canvas.

O operador precisa enxergar, no proprio contexto do grafico, se o setup esta prime, qualificado, em observacao ou rejeitado. Isso deve ser feito sem duplicar engine, sem interceptar interacao do chart e sem acionar paper trading automaticamente.

## Decisao

Adicionar um HUD compacto dentro de `chart-copilot-stage`, alimentado pelos mesmos snapshots ja derivados no Timing Desk:

- Execution Gate;
- Execution Plan;
- Execution Quality;
- preco atual;
- zona de entrada;
- risco sugerido;
- estado da amostra do journal.

O HUD usa `pointer-events: none`, fica escondido quando nao ha analise ativa e herda o tom do score de qualidade. O estado tambem continua sendo refletido via dataset no `chart-viewport`.

## Conformidade

- Zero Budget: sem dependencia nova.
- Sem ordem real: HUD e apenas visual.
- Reuso de derivadores existentes: nao cria engine paralela.
- UI responsiva: HUD reduz e empilha em telas menores.

## Plano / DoD

- [x] Adicionar container do HUD ao chart stage.
- [x] Renderizar HUD a partir de gate, plano e quality score.
- [x] Limpar HUD quando a analise profunda nao estiver disponivel.
- [x] Estilizar estados bull/warn/danger e responsividade.
- [x] Atualizar smoke test e indice de ADRs.

## Consequencias

- + O grafico passa a carregar o estado operacional de forma imediata.
- + Mantem o canvas interativo e sem sobreposicao clicavel.
- + Facilita leitura de terminal institucional sem inventar novo backend.
- - O HUD ainda depende do render do Timing Desk; uma camada persistente global pode ser avaliada quando houver automacao autenticada.
