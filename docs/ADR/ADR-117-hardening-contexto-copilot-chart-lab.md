# ADR-117 - Hardening de contexto do Copiloto no Chart Lab e observabilidade da trilha de entrada

- Status: Aceito
- Data: 2026-04-27
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

1. A injecao de `chartContext` no prompt de sistema podia ser truncada quando o prompt base ocupava quase todo o limite de 4000 caracteres.
2. O frontend enviava contexto do terminal mesmo fora da rota do Chart Lab, com risco de enviesar conversas nao relacionadas ao fluxo de grafico.
3. A trilha de auditoria do Copiloto nao persistia o `chartContext`, reduzindo capacidade forense para reproduzir defaults aplicados em runtime.

## Decisao

### 1. Priorizar sufixo de contexto no orçamento de prompt

Foi ajustada a composicao do `systemPrompt` para sempre reservar espaco ao bloco `Contexto de terminal atual`, truncando primeiro o prompt base quando necessario.

Implementacao principal em:

1. `apps/api/src/modules/copilot/application/copilot-chat-service.ts`

### 2. Restringir envio de chartContext ao Chart Lab

O payload de contexto no frontend passa a ser enviado apenas quando a rota ativa e o Chart Lab, evitando leak semantico para fluxos fora do modulo.

Implementacao principal em:

1. `apps/web/src/main.js`

### 3. Persistir chartContext na auditoria do Copiloto

A estrutura de input auditado foi expandida com schema opcional para `chartContext`, mantendo compatibilidade com registros legados.

Implementacao principal em:

1. `apps/api/src/shared/observability/copilot-chat-audit-store.ts`

### 4. Cobertura de contrato para nao regressao

Foi adicionado teste de rota garantindo que:

1. `chartContext` aparece no `system` message enviado ao OpenRouter;
2. o tamanho final do prompt permanece `<= 4000`.

Implementacao principal em:

1. `apps/api/src/modules/copilot/interface/copilot-routes.test.ts`

## Conformidade

1. Zero Budget: sem novas dependencias.
2. Validacao estrita: schemas Zod no controller/store e normalizacao defensiva no service.
3. Degradacao graciosa: `chartContext` segue opcional e retrocompativel.
4. Observabilidade: auditoria registra contexto operacional de entrada do Copiloto.

## Plano / DoD

- [x] Prompt composition garante preservacao do contexto de terminal.
- [x] Frontend limita envio de contexto a rota Chart Lab.
- [x] Auditoria persiste `chartContext` sem quebrar historico anterior.
- [x] Teste de contrato cobre injecao de contexto e teto de 4000 chars.
- [x] Lint, typecheck e suites focais em estado verde.

## Evidencias de validacao

1. `npm run lint -w @botfinanceiro/api` -> sucesso.
2. `npm run typecheck -w @botfinanceiro/api` -> sucesso.
3. `node --import tsx --test apps/api/src/modules/copilot/interface/copilot-routes.test.ts` -> sucesso (39 testes).
4. `npm run test -w @botfinanceiro/web -- tests/chart-asset-context-reset.test.mjs tests/chart-lab-quant.test.mjs` -> sucesso.

## Consequencias

### Positivas

1. O Copiloto passa a receber contexto operacional consistente mesmo em cenarios de prompt grande.
2. Menor risco de viés de contexto fora do Chart Lab.
3. Melhor rastreabilidade de decisao em auditoria para debug e compliance tecnico.

### Negativas / mitigadas

1. Prompt base pode ser truncado em cenarios limite para abrir espaco ao contexto; mitigado por preservacao do bloco institucional principal e teto de 4000.