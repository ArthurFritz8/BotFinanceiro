# ADR-103 - Operador Auto Paper Trading no Frontend

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto de UI/UX + Staff Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional.

## Contexto / Observacao

O ADR-102 expos o contrato backend `POST /v1/paper-trading/operator/auto-signal` autenticado por header dedicado `x-paper-trading-operator-token`. O frontend precisava agora consumir essa rota respeitando duas restricoes inegociaveis:

1. O token nao pode entrar no bundle nem trafegar para terceiros: deve ficar restrito ao navegador do operador humano.
2. O disparo automatico so deve ocorrer quando o Auto Guard (ADR-101) sinalizar `canAutoPaper === true`, mantendo a fail-honest cadeia das ADRs 095 (Gate), 096 (Plano), 099 (Quality) e 101 (Auto Guard).

Antes desta ADR, mesmo com Auto Guard armado, o usuario precisava clicar manualmente em "Abrir Paper" no painel do journal.

## Decisao

Criar o modulo puro `apps/web/src/modules/chart-lab/quant/paper-trading-operator-client.js` com:

- `loadOperatorSettings/saveOperatorSettings/clearOperatorSettings`: persistencia em `localStorage` sob a chave versionada `botfinanceiro:paper-trading-operator:v1`, com schema-guard (`sanitizePersistedOperatorSettings`) que descarta campos invalidos e zera `autoArmed` quando token < 16 caracteres.
- `buildAutoSignalPayload`: normaliza o contexto do Chart Lab no payload exato aceito pelo `confluenceSignalSchema` do backend.
- `canSubmitAutoSignal`: combina Auto Guard + preferencias do operador + payload completo.
- `submitAutoSignal`: POST com header `x-paper-trading-operator-token`, parsing do envelope `{ ok, data }` ou `{ ok, error }` e degradacao silenciosa em rede/timeout.

No `main.js`, foi adicionado o orquestrador `maybeDispatchOperatorAutoSignal` chamado dentro de `renderTimingDeskHtml` apos o build do Auto Guard. O dispatcher aplica cooldown idempotente de 60s por chave `asset|side|entry|stop|target` para nao reenviar o mesmo plano em rajada quando o pipeline reroda.

A UI vive embutida no `paper-trading-panel` (HTML `<details id="paper-trading-operator-panel">`) com input `password`, toggle `autoArmed`, botoes "Salvar"/"Limpar" e feedback acessivel `aria-live="polite"`. O toggle so liga quando ha token salvo valido. Em resposta 401 do backend, o frontend desarma automaticamente para forcar revisao manual.

## Conformidade

- Zero Budget: sem dependencia nova; reutiliza `fetch` nativo e `localStorage`.
- Seguranca: token nunca eh logado, nao entra no bundle e cai silenciosamente quando `localStorage` nao esta disponivel (modo privado, quota cheia).
- Fail-honest: o disparo so ocorre se Auto Guard estiver `armed`; em 401, o frontend desarma e exibe motivo.
- Reuso: aproveita `executionPlan` ja calculado, sem duplicar engine de sinal.
- Acessibilidade: feedback `aria-live`, foco visivel no input, suporte a `prefers-reduced-motion` na transicao do botao.

## Plano / DoD

- [x] Modulo puro com testes unitarios (13 casos).
- [x] UI integrada no painel Paper Trading existente.
- [x] Dispatcher idempotente integrado ao pipeline do Timing Desk.
- [x] Smoke test cobrindo modulo, dispatcher e elementos DOM.
- [x] README e indice de ADRs atualizados.
- [x] `npm run build`/`test`/`guard:docs`/`diff:check` verdes.

## Consequencias

- + Operador autorizado pode armar auto-paper de qualquer maquina com o token; revoga limpando ou rotacionando `PAPER_TRADING_OPERATOR_TOKEN` no backend.
- + A logica de envio fica testavel sem JSDOM (modulo puro com `fetchImpl` injetavel).
- − Persistencia em `localStorage` significa que outro processo malicioso com acesso ao mesmo perfil pode ler o token; mitigado pela escolha de armazenamento explicito do operador e pelo header dedicado (nao reaproveita credencial interna).
- → Proxima ADR: hidratar a UI com indicador "ultimo auto-paper enviado / motivo" diretamente no Auto Guard panel.
