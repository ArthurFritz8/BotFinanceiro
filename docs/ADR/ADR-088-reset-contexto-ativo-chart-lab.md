# ADR-088 - Reset de Contexto de Ativo do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

Depois do ADR-087, respostas atrasadas de grafico passaram a ser descartadas por token de geracao. Ainda restava uma janela visual: ao trocar ativo ou simbolo, estados locais do Intelligence Desk permaneciam visiveis ate o novo snapshot chegar.

Os principais pontos eram sessoes Ghost Tracker, auditoria Ghost persistida, payload de noticias e alertas transitorios de sync. Esses estados eram eventualmente corrigidos pelo proximo snapshot, mas podiam exibir informacao do ativo anterior durante a latencia do carregamento.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-asset-context-reset.js` com helpers puros para detectar mudancas relevantes de contexto:

- `assetId`;
- `symbol`;
- `strategy`;
- `operationalMode`.

Conectar `main.js` por meio de `resetChartAssetScopedState`, chamado no inicio de `loadChart`, antes de `chartLabStore.patchSelection`. Quando o contexto muda, o reset limpa:

- Ghost Tracker de binarias;
- Ghost Tracker spot/margem;
- auditoria Ghost backend;
- payload/cache local de noticias;
- token de requisicao de noticias;
- alertas transitorios de sync;
- snapshot e metricas visuais do contexto anterior.

A telemetria agregada de SLA e os circuit breakers de broker permanecem globais por design, pois representam saude operacional do sistema/provedor, nao estatistica do ativo atual.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: reset centralizado sem reescrever renderizadores das abas.
- Fail-honest: a UI deixa de mostrar estatistica antiga como se fosse do ativo novo.
- Testabilidade: deteccao de mudanca e execucao de callbacks possuem testes Node isolados.
- Compatibilidade: o reset roda apenas quando contexto relevante muda, evitando apagar estado em refresh de mesmo ativo.

## Plano / DoD

- [x] Criar helper puro de reset de contexto.
- [x] Conectar reset no inicio de `loadChart`.
- [x] Invalidar noticias em voo ao trocar contexto.
- [x] Limpar Ghost/session/auditoria e snapshot stale.
- [x] Preservar telemetria global e circuit breaker por design.
- [x] Adicionar testes unitarios e atualizar smoke/script web.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Reduz stale visual durante troca de ativo/simbolo.
- + Evita que Ghost Tracker do ativo anterior apareca no contexto novo.
- + Centraliza o criterio de mudanca sem espalhar resets por listeners.
- - O proximo corte ainda deve trocar as flags de Confluencia/SMC baseadas em regex por derivacoes numericas reais.
