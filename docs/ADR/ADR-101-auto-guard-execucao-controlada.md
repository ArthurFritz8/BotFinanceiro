# ADR-101 - Auto Guard de Execucao Controlada

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A etapa seguinte ao HUD e preparar automacao operacional sem romper seguranca. O frontend nao deve chamar rotas internas de Paper Trading nem abrir trade automaticamente sem contrato de autenticacao e trilha de auditoria.

Ainda assim, o terminal precisa mostrar quando uma automacao simulada estaria tecnicamente permitida. Esse guard reduz ambiguidade entre plano forte, plano manual-only e ciclo bloqueado.

## Decisao

Criar `execution-automation.js` como derivador puro. Ele avalia:

- feed live;
- modo operacional spot/margem;
- gate armado;
- plano no gatilho;
- quality score minimo;
- journal maduro.

O resultado pode ser `armed`, `manual-only` ou `blocked`. Apenas `armed` marca `canAutoPaper=true`, e mesmo assim nenhuma chamada POST e feita neste corte. O painel Auto Guard renderiza as travas no Timing Desk.

## Conformidade

- Zero Budget: sem dependencia nova.
- Seguranca: sem POST para rota interna e sem endpoint publico novo.
- Fail-honest: journal aquecendo vira `manual-only`, nao automacao.
- Auditabilidade: cada trava aparece no painel.

## Plano / DoD

- [x] Criar derivador puro de Auto Guard.
- [x] Testar armado, manual-only e bloqueado.
- [x] Renderizar painel no Timing Desk.
- [x] Atualizar smoke test e indice de ADRs.
- [x] Manter Paper Trading como leitura/acao explicita, sem side effect automatico.

## Consequencias

- + O terminal passa a ter uma camada clara de elegibilidade para automacao.
- + Evita chamada indevida para rotas internas protegidas.
- + Cria base segura para um backend bridge autenticado futuro.
- - A automacao real continua pendente de contrato backend deliberado e testes de API.
