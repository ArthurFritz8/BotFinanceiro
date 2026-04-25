# ADR-087 - Token de Geracao de Ativo do Chart Lab

- Status: Aceito
- Data: 2026-04-25
- Personas ativas: Arquiteto de Software Staff + Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, UX/UI Engineer.

## Contexto / Observacao

A auditoria do Chart Lab identificou uma race potencial no fluxo de troca de ativo: uma requisicao de grafico iniciada para o ativo A podia retornar depois que o usuario ja havia selecionado o ativo B. O `chartLoadController` ja protegia a fila latest-wins, mas nao carregava uma identidade temporal do contexto.

Sem essa barreira, uma resposta atrasada ainda poderia chegar a `applyChartSnapshot` e atualizar grafico, metricas e Intelligence Desk com dados do contexto anterior por alguns instantes.

## Decisao

Criar `apps/web/src/modules/chart-lab/chart-asset-generation.js` com um gerenciador puro de geracao:

- `advance()` incrementa a geracao quando o usuario troca ativo/simbolo;
- `resolveToken()` captura a geracao atual no inicio de um load;
- `assertCurrent()` rejeita respostas atrasadas com erro identificavel;
- `isStaleChartAssetGenerationError()` permite descarte silencioso no orquestrador.

O token passa pelo `chartLoadController`, pelos requests cripto/binarias/institucional e pelas chamadas de `applyChartSnapshot`. Respostas stale sao descartadas antes de renderizar ou atualizar estado visual.

## Conformidade

- Zero Budget: sem dependencia nova.
- Strangler pattern: adicionada uma barreira pequena, sem reescrever o pipeline de chart.
- Fail-honest: resposta atrasada nao vira erro visual para o usuario; apenas deixa a requisicao nova assumir o contexto.
- Backend-mediated: nao altera provedores nem transporte SSE/HTTP.
- Testabilidade: gerenciador de geracao e fila latest-wins possuem testes Node isolados.

## Plano / DoD

- [x] Criar gerenciador puro de geracao de ativo.
- [x] Preservar token em requisicoes pendentes do load controller.
- [x] Propagar token por cripto, binarias e institutional macro.
- [x] Avancar geracao na troca de ativo, watchlist e input de simbolo.
- [x] Descartar respostas stale antes de aplicar snapshot.
- [x] Adicionar testes unitarios e atualizar smoke/script web.
- [x] Atualizar indice de ADRs no README.

## Consequencias

- + Evita mistura visual entre ativo anterior e ativo atual sob latencia.
- + Reduz risco de stale em grafico, metricas e Intelligence Desk.
- + Mantem o load controller simples e testavel.
- - Ainda resta um corte separado para limpar estados globais de sessao, como Ghost Tracker e payload de noticias, no momento exato da troca de ativo.
