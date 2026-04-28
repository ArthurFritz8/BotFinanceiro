# ADR-126 — Onda 10: Acessibilidade institucional (aria-live + role status)

**Status:** aceito
**Data:** 2026-04-28
**Contexto:** Onda 10 do plano "tudo nivel empresarial". Premissa de mesa
profissional senior: o desk de inteligencia precisa atender padroes de
acessibilidade WCAG 2.1 AA tanto para conformidade institucional quanto
para operadores que usam tecnologias assistivas (leitores de tela,
ampliadores) durante longas sessoes de tape reading.

## Decisao

Promover o card institucional de derivativos (`institutional-derivatives-card.js`)
e a pill de gate macro (`macro-gate-pill.js`) a regioes acessiveis com
anuncios automaticos para tecnologias assistivas, sem alterar layout
visual nem comportamento existente.

Frontend:

- `institutional-derivatives-card.js`:
  - Card root recebe `role="region"` + `aria-label="Fluxo institucional
    de perpetuos: funding, open interest, CVD e orderbook"` programaticamente
    em `mountInstitutionalDerivativesCard` (preserva idempotencia via
    `hasAttribute` guard).
  - Footer (`data-field="footer"`) recebe `role="status" aria-live="polite"
    aria-atomic="true"`. Mensagens de "sincronizando", "feeds offline",
    "selecione um ativo cripto" passam a ser anunciadas sem interromper
    leitura em curso (polite, nao assertive).
  - Funding-bps recebe `aria-label` dinamico humano composto a partir do
    valor formatado + interpretacao (ex.: "Funding rate +6.00 bps,
    pressao moderadamente comprada"). Quando valor ausente, atributo eh
    removido para nao poluir leitura.

- `macro-gate-pill.js`:
  - Root recebe `role="region"` + `aria-label="Pill de gate macro:
    proximo evento de alto impacto"`.
  - Detail (`data-field="detail"`) recebe `role="status" aria-live="polite"
    aria-atomic="true"`. Countdown caindo de 1h30 para "agora" passa a
    ser anunciado.

Smoke test em `apps/web/tests/smoke.test.mjs` ("ADR-126: institutional-
derivatives card e macro-gate-pill expoem aria-live polite + role status")
valida presenca dos atributos no markup gerado para evitar regressao.

Backend (correlato): durante a Onda 10 detectamos flakiness em
`paper-trading-routes.test.ts:333` ("GET /v1/paper-trading/operator/journal
lista disparos recentes"), causada por dois `record()` no mesmo
`Date.now()` produzindo ordem instavel no `sort` por `occurredAtMs DESC`.
Fix em `in-memory-operator-dispatch-journal.ts`: introducao de
`nextSeq` monotonico por instancia + `seqByEntryId: Map<string,number>`
servindo como tiebreaker estavel (`occurredAtMs DESC, seq DESC`). Mapa
limpa em `clear()` e em despejo do ring buffer; tambem populado em
`loadFromDisk()`.

## Justificativa

- **Compliance institucional**: WCAG 2.1 AA exige feedback dinamico
  perceptivel via tecnologia assistiva (criterio 4.1.3 — Status
  Messages). `role="status"` + `aria-live="polite"` cumpre exatamente
  esse criterio para mudancas de feed/countdown sem necessidade de
  toast separado.
- **Zero impacto visual**: atributos ARIA nao alteram pixel-perfect do
  layout atual. Risco de regressao visual = zero.
- **Senior trader UX**: mesa profissional valoriza canal auditivo redundante
  para nao perder mudancas em telas secundarias enquanto foca no chart
  principal.
- **Determinismo de testes**: tiebreaker monotonico no journal elimina
  flakiness causada por colisao de timestamp em ms — pre-requisito para
  confianca em CI corporativo.

## Alternativas consideradas

- **Live region global no body**: rejeitada — diluir anuncios em uma
  unica regiao quebra contexto semantico (operador nao saberia se o
  anuncio eh do macro pill ou do card de derivativos).
- **`aria-live="assertive"`**: rejeitada — interromperia leitura em
  curso a cada poll de 60s do macro pill, gerando fadiga auditiva.
- **Usar `time.toISOString()` como tiebreaker**: rejeitada — colide
  identicamente quando dois `Date.now()` retornam o mesmo ms; sequencer
  monotonico eh o unico tiebreaker garantido.

## Consequencias

- Operadores com leitor de tela passam a receber anuncios automaticos
  de mudanca em funding rate, countdown macro e status do feed.
- Footer e pill ganham semantica `role="status"` aceita por todos os
  leitores de tela majores (NVDA, JAWS, VoiceOver, Narrator).
- Journal do operador tem ordem deterministica em qualquer carga,
  tornando o test 333 estavel (validado 5/5 runs apos fix).

## Validacao

- API: 347/347 PASS, lint OK, typecheck OK.
- Web: 160/160 PASS (incluindo novo smoke "ADR-126: ... aria-live polite
  + role status").
- Smoke a11y verifica via regex: `setAttribute("role","region")`,
  `role="status" aria-live="polite" aria-atomic="true"`, e composicao
  do `aria-label` dinamico do funding-bps.

## Referencias

- WCAG 2.1 AA — Criterio 4.1.3 (Status Messages).
- ARIA Authoring Practices Guide — Live Regions.
- ADR-119: cache server-side derivativos (contexto da rota afetada).
- ADR-105: operator dispatch journal (origem do journal afetado pelo
  tiebreaker).
- ADR-125: sparkline de funding (Onda anterior, mesmo card alvo da a11y).
