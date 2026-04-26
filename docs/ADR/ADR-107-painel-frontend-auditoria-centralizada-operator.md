# ADR-107 - Painel frontend de auditoria centralizada do operator dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Frontend Engineer + Especialista em UX/UI, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-105 entregou o ring buffer in-memory `GET /v1/paper-trading/operator/journal` e a ADR-106 adicionou filtros (`from`/`to`/`action`/`asset`). Ate aqui o frontend so consumia o journal LOCAL (ADR-104), confinado ao navegador do operador — auditoria cross-device exigia abrir devtools e rodar `curl` manualmente.

Para fechar o ciclo backend↔frontend e dar ao operador uma UI institucional para investigar disparos cross-session, falta:

- Cliente HTTP puro (testavel via `node --test`) que sanitize filtros, monte querystring, autentique com `x-paper-trading-operator-token` e parseie o envelope `{ ok, data }`.
- Painel UI dentro do `paper-trading-operator-panel` com filtros (action/asset/from/to), botoes Atualizar/Limpar e lista colorida por outcome (opened/skipped/error), reusando o estilo `paper-trading-operator__journal-item`.

## Decisao

### Cliente — `paper-trading-operator-central-journal.js`

Modulo puro (sem DOM) com 4 helpers exportados:

- `sanitizeCentralJournalFilters(input)` — descarta valores invalidos, normaliza `asset` para lowercase, satura `limit` em `[1, 500]`, valida ISO 8601 com `Date.parse`.
- `buildCentralJournalUrl(baseUrl, filters)` — serializa querystring estavel em ordem alfabetica (facilita cache/debug). Retorna `${endpoint}` puro quando todos os filtros sao nulos.
- `summarizeCentralJournalSnapshot(snapshot)` — sanitiza payload e calcula `successRate`/`errorRate` inteiros [0,100]; retorna `null` quando `total === 0` para evitar leitura de "0% sucesso" como falha.
- `fetchCentralOperatorJournal({ baseUrl, fetchImpl, filters, token })` — submete GET autenticado, NUNCA lanca, retorna `{ ok, data | error, status }`. Reusa `PAPER_TRADING_OPERATOR_HEADER` e `PAPER_TRADING_OPERATOR_MIN_TOKEN_LENGTH` de `paper-trading-operator-client.js` (single source of truth do header/limite).

### UI — `paper-trading-operator-panel`

Nova secao `paper-trading-operator__central` dentro do mesmo `<details>` do operator desk:

- Filtros: `<select>` action, `<input>` asset, `<input type="datetime-local">` from/to, botoes Atualizar/Limpar.
- Sumario `total · opened · skipped · error · sucesso N%`.
- Lista colorida (data-tone ok/warn/error) reusando `paper-trading-operator__journal-item` para nao multiplicar CSS.
- Conversao `datetime-local` → ISO 8601 UTC via `new Date(value).toISOString()` no boundary, garantindo que o backend interprete sempre como UTC determinístico.

### Test scope

`apps/web/tests/paper-trading-operator-central-journal.test.mjs` cobre 15 casos (sanitizacao, URL build, sumarizacao, fetch happy/401/network-error). Smoke tests do `index.html`, `styles.css` e `main.js` sao estendidos para garantir presenca dos novos IDs/estilos/funcoes.

## Conformidade

- **Zero Budget**: nada novo no `package.json`; reuso de `URLSearchParams`, `Date.parse`, `Response`.
- **Validacao estrita**: filtros invalidos viram `null` antes de virar querystring (evita 400 desnecessario no backend).
- **Sem token no bundle**: o operador cola o token em runtime; o cliente apenas le o que ja esta em memoria do `paper-trading-operator-client.js`.
- **Backend-mediated**: nada de WebSocket direto, nada de polling agressivo — a UI dispara fetch APENAS quando o operador clica Atualizar.
- **A11y/UX**: labels `<label for>` em todos os inputs, `aria-live="polite"` no sumario e feedback, botoes `<button type="button">`.
- **Reuso de estilo**: lista compartilha `.paper-trading-operator__journal-item` com a auditoria local — se mudarmos o tom de cor, ambos refletem.

## Plano / DoD

- [x] Cliente puro `paper-trading-operator-central-journal.js`.
- [x] 15 testes node:test cobrindo sanitizacao/URL/summary/fetch.
- [x] HTML + CSS do painel central (filtros + lista + feedback).
- [x] Wire em `main.js`: refs, bind, render, refresh.
- [x] Smoke tests atualizados (HTML/CSS/main.js).
- [x] `npm run test -w @botfinanceiro/web` verde (131 pass).
- [x] `npm run build -w @botfinanceiro/web` verde.
- [x] ADR + README atualizados.

## Consequencias

- + Operador audita disparos centralizados sem sair da UI: filtra incidentes por janela temporal, asset ou apenas falhas.
- + Reuso maximo de estilo (journal-item) e helpers (header/min length) — divida tecnica zero.
- + Cliente puro 100% testavel sem JSDOM.
- − Adiciona ~120 linhas em `main.js` (sob orcamento — sem lint/build warning de chunk novo).
- − Conversao `datetime-local` assume fuso do navegador; aceitavel pois o operador interpreta o resultado tambem em fuso local. ISO no envio mantem determinismo.
- → Proxima ADR candidata: persistencia durável do journal (JSONL espelhando `jsonl-trade-store.ts`) ou métricas Prometheus dos disparos.
