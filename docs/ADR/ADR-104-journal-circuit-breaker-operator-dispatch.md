# ADR-104 - Journal e Circuit Breaker do Operator Auto-Dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto de UI/UX + Staff Frontend Engineer, Arquiteto Socratico, Especialista em Trading Institucional, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

O ADR-103 entregou o disparo automatico para `/v1/paper-trading/operator/auto-signal`, mas deixou duas lacunas operacionais:

1. **Sem auditoria local**: o operador nao tinha como inspecionar quantos sinais ja foram enviados, qual a taxa de sucesso e que erros estavam ocorrendo. O unico feedback era a frase volatil em `paper-trading-operator-feedback`, que e sobrescrita ao proximo evento.
2. **Sem freio em falhas em cascata**: apenas o erro 401 desarmava o operador. Erros operacionais transitorios (5xx, NETWORK_ERROR, payload rejeitado) podiam reincidir indefinidamente, inundando o backend com chamadas autenticadas porem invalidas — anti-pattern para um terminal institucional.

Hedge funds exigem trilha de auditoria com timestamp, asset, score, status HTTP e codigo de erro para qualquer disparo automatico, alem de circuit breaker explicito desarmando a automacao apos N falhas seguidas.

## Decisao

Criar o modulo puro `apps/web/src/modules/chart-lab/quant/paper-trading-operator-journal.js`:

- `loadOperatorJournal/saveOperatorJournal/clearOperatorJournal`: persistencia em `localStorage` (`botfinanceiro:paper-trading-operator-journal:v1`) com schema-guard `sanitizePersistedOperatorJournal` e degradacao silenciosa para memoria em ambientes sem storage ou com quota estourada.
- `createOperatorJournalEntry`: deriva uma entrada minima e nao sensivel (`asset`, `side`, `tier`, `confluenceScore`, `outcome`, `status`, `errorCode`, `occurredAtMs`) do payload + resultado de `submitAutoSignal`; deliberadamente **nao** persiste tokens nem corpo completo para evitar vazamento via export/devtools.
- `appendOperatorJournalEntry`: aplica ring buffer com limite de 25 entradas para que o storage permaneca enxuto.
- `summarizeOperatorJournal`: calcula `total`, `successes`, `failures`, `successRate`, `consecutiveFailures` (medidas a partir do final) e `last`. Tudo em O(N).
- `shouldTripOperatorBreaker`: dispara quando `consecutiveFailures >= 3` (configuravel via `options.threshold`).

No `main.js`, `maybeDispatchOperatorAutoSignal` agora chama `recordOperatorJournalResult` apos o `then` da promise. Esse helper:

1. Persiste a entrada no journal local.
2. Calcula o resumo e, se o breaker tripar, desarma `operatorAutoPaperSettings.autoArmed` e renderiza feedback `error` explicando o motivo.
3. Invoca `renderOperatorJournalPanel` que atualiza o resumo, lista as 8 entradas mais recentes e exibe o banner de circuit breaker quando aplicavel.

A UI vive dentro do `<details id="paper-trading-operator-panel">` (mesma secao da ADR-103), com:

- Cabecalho `Auditoria local` exibindo `N disparos · X ok · Y falhas · taxa Z%`.
- Lista `<ol>` com classe `paper-trading-operator__journal-list` (max altura 220px com scroll), cada item exibindo timestamp local, ativo+lado, score e detalhe (`HTTP 201` para sucesso ou `CODE · HTTP 503` para falha), com borda colorida via `data-tone`.
- Banner `paper-trading-operator__journal-breaker` que aparece apenas quando o breaker dispara, recomendando revisar o token e rearmar manualmente.
- Botao `Limpar histórico` que zera o journal local sem afetar o token salvo.

## Conformidade

- **Zero Budget**: sem dependencia nova; tudo `localStorage`, `Date`, funcoes puras.
- **Seguranca**: nenhuma credencial ou payload completo persistido; nao loga em `console`.
- **Fail-honest**: circuit breaker desarma automacao explicitamente, sem mascarar a causa raiz.
- **Reuso**: o resumo deriva exclusivamente do array ja persistido; nao cria engine paralelo.
- **Acessibilidade**: container do journal mantem `aria-live="polite"`; banner do breaker usa cor `#fca5a5` sobre fundo escuro com contraste >= 4.5; respeita `prefers-reduced-motion` herdado do botao.

## Plano / DoD

- [x] Modulo puro `paper-trading-operator-journal.js` com 14 testes unitarios verdes (`tests/paper-trading-operator-journal.test.mjs`).
- [x] Dispatcher integrado: `maybeDispatchOperatorAutoSignal` chama `recordOperatorJournalResult`.
- [x] UI no painel Operator Desk: resumo, lista, banner de breaker e botao limpar.
- [x] CSS dedicado em `styles.css` com tokens `data-tone` para cada item.
- [x] Smoke test cobrindo `main.js` (imports + helpers), `index.html` (ids do journal) e `styles.css` (classes derivadas).
- [x] README e indice de ADRs atualizados.
- [x] `npm run build`/`test`/`guard:docs`/`diff:check` verdes.

## Consequencias

- + Operador ganha trilha local de auditoria sem dependencia de backend, util para conferencia rapida de quantos sinais foram disparados na sessao.
- + Circuit breaker reduz o risco de inundacao de erros 4xx/5xx contra a rota operador, protegendo a observabilidade e o rate-limit do backend.
- + Como o journal vive em `localStorage`, sobrevive a reload e troca de aba.
- − Limite de 25 entradas significa que disparos antigos sao perdidos; e proposital para nao crescer storage. Operadores que precisem de auditoria longa devem consumir o backend (futuro endpoint de listagem operador, nao escopo desta ADR).
- − O breaker conta tambem erros transitorios (NETWORK_ERROR). Caso isso se mostre agressivo demais em producao, basta passar `{ threshold: N, strict: true }` para futura distincao entre erros de credencial e erros operacionais.
- → Proxima ADR candidata: endpoint backend `GET /v1/paper-trading/operator/journal` para auditoria centralizada e cross-device.
