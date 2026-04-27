# ADR-115 - Serie institucional real com fallback sintetico e feed real no Live Signals

- Status: Aceito
- Data: 2026-04-27
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

1. O snapshot institucional macro estava baseado em serie sintetica como fonte primaria, o que reduzia aderencia ao mercado quando havia conectividade externa disponivel.
2. O painel Live Signals no frontend operava majoritariamente em fluxo mock, limitando auditabilidade operacional em cenarios multi-ativo.
3. O contrato institucional nao deixava explicito, no payload, a origem final da serie utilizada (real vs sintetica).
4. Em mudanca de contexto de ativo no Chart Lab, a aba ativa podia permanecer em estado anterior, aumentando risco de leitura de contexto stale.

## Decisao

### 1. Priorizar serie real para snapshot institucional com fallback sintetico

Foi adotada a estrategia `cacheless-provider-first` para o snapshot institucional:

1. tentar serie de mercado real via Yahoo Finance Chart;
2. em erro de rede, timeout, status nao-sucesso ou schema invalido, degradar automaticamente para serie sintetica;
3. manter resposta valida ao cliente sem falha dura no endpoint.

Implementacao principal em:

1. `apps/api/src/modules/forex/application/institutional-macro-service.ts` (`loadMarketBackedSeries` + acoplamento no snapshot)

### 2. Tornar a origem de dados observavel no contrato

O payload institucional passa a expor explicitamente:

1. `marketDataSource` (`yahoo_finance|synthetic`)
2. `marketDataSymbol` (simbolo resolvido para a consulta real)

Cobertura de contrato atualizada em:

1. `apps/api/src/modules/forex/interface/forex-routes.test.ts`

### 3. Conectar Live Signals a feed real com fallback mock

O modulo Live Signals foi evoluido para aceitar carregamento assincrono real sem perder resiliencia:

1. `bootstrapLiveSignals({ fetchSignals, onAuditSignal })`
2. normalizacao robusta de payload (`normalizeLiveSignal`/`normalizeLiveSignals`)
3. fallback para sinais mock quando feed real falhar

Implementacao principal em:

1. `apps/web/src/live-signals.js`
2. `apps/web/src/main.js`
3. `apps/web/tests/live-signals.test.mjs`

### 4. Reforcar consistencia de contexto no Chart Lab

Ao trocar o ativo, a aba principal passa a resetar para `resumo`, reduzindo ambiguidade de navegacao e risco de leitura de insights da aba anterior.

## Conformidade

1. Zero Budget: nenhuma dependencia nova paga; uso de provedor publico com degradacao para sintetico.
2. Validacao estrita: parsing/shape guard no backend e normalizacao defensiva no frontend.
3. Degradacao graciosa: caminho sintetico no backend e mock no frontend preservam operacao sob falha externa.
4. Observabilidade: origem da serie fica explicita no contrato (`marketDataSource`/`marketDataSymbol`).

## Plano / DoD

- [x] Backend institucional tenta serie real e cai para sintetico quando necessario.
- [x] Contrato institucional exposto com `marketDataSource` e `marketDataSymbol`.
- [x] Live Signals com `fetchSignals` real e fallback mock.
- [x] Fluxo de auditoria multi-ativo e troca de contexto estabilizados no frontend.
- [x] Testes backend/frontend da entrega em estado verde.
- [x] ADR-115 registrado em `docs/ADR`.

## Evidencias de validacao

1. `npm run test -w @botfinanceiro/web` -> 134 passed, 0 failed.
2. `npm run test -w @botfinanceiro/api` -> 325 passed, 0 failed.
3. `npm run check` -> sucesso (lint + typecheck).
4. `MONITOR_BASE_URL=http://127.0.0.1:3000 npm run monitor:smoke` -> health/ready/copilot-history com status 200.

## Consequencias

### Positivas

1. Maior fidelidade de mercado no snapshot institucional quando fonte real esta disponivel.
2. Transparencia operacional para QA/observabilidade via metadados de origem no payload.
3. Painel Live Signals deixa de depender apenas de mock e ganha caminho real com resiliencia.
4. Menor risco de confusao de contexto no Chart Lab apos troca de ativo.

### Negativas / mitigadas

1. Maior dependencia de disponibilidade do provedor externo para enriquecer serie institucional; mitigado por fallback sintetico.
2. Variabilidade de latencia no caminho real; mitigada por timeout + degradacao para resposta local.