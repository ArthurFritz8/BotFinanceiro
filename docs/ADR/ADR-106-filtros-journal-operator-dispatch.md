# ADR-106 - Filtros temporais e por acao no journal centralizado de operator dispatch

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Engenheiro de Dados Senior + Arquiteto HFT.

## Contexto / Observacao

A ADR-105 entregou o endpoint `GET /v1/paper-trading/operator/journal` com snapshot completo do ring buffer (default 100 entradas). Limitacoes na pratica institucional:

- Auditar uma janela especifica (ex: ultima 1h apos um incidente) exige paginar mentalmente 100 entradas no cliente.
- Nao ha como isolar apenas falhas (`action=error`) ou skips (`action=skipped`) para diagnostico de storms — o operador precisa baixar tudo e filtrar localmente.
- Em sessoes longas com varios ativos, focar a auditoria em um asset especifico (ex: `bitcoin`) tambem exige filtragem cliente.

O padrao ja estabelecido na casa para historico operacional (`/internal/health/operational/history`, ADR-016) usa exatamente `from`/`to` ISO 8601 + `action`/`asset`. Replicar mantem consistencia da plataforma.

## Decisao

Estender o snapshot do journal e a query Zod do controller com filtros opcionais:

### Infra — `InMemoryOperatorDispatchJournal.snapshot(...)`

Backwards-compatible via overload:

```ts
snapshot(): Snapshot;
snapshot(limit: number): Snapshot;       // ADR-105
snapshot(query: OperatorDispatchSnapshotQuery): Snapshot; // ADR-106
```

`OperatorDispatchSnapshotQuery` aceita:

- `limit?: number` — saturado em `maxEntries`.
- `fromMs?: number` / `toMs?: number` — janela inclusiva por timestamp.
- `action?: "opened" | "skipped" | "error"` — filtro exato.
- `asset?: string` — comparacao case-insensitive (mesmo padrao de `JsonlTradeStore.listOpenForAsset`).

Os contadores agregados (`total`/`opened`/`skipped`/`errors`) refletem o conjunto **filtrado**, nao o ring buffer completo — assim o cliente ja recebe a base de calculo correta para taxas observacionais.

### Interface — `journalQuerySchema`

Tres helpers Zod novos:

- `optionalIntegerFromQuery`: union string|number → integer ou undefined.
- `isoDateToMs`: parse ISO 8601 com `Date.parse`, falha 400 com mensagem clara `"must be a valid ISO 8601 date"`.
- `superRefine` valida `from <= to`, replicando a mensagem `"from must be less than or equal to to"` ja usada em ADR-016.

`action` reusa `operatorDispatchActionSchema` exportado do dominio (fonte unica de verdade — se um dia adicionarmos `"replayed"`, o filtro herda gratuitamente).

`asset` faz `trim().min(1).max(40)` espelhando o limite do `tradeSchema`.

## Conformidade

- **Zero Budget**: nada novo no package.json; reuso de Zod, `Date.parse`, array filter.
- **Validacao estrita**: superRefine para invariante `from <= to`, parse explicito de ISO, range [1,500] em `limit`.
- **Backward compatible**: assinatura antiga `snapshot(limit?: number)` segue valida — testes ADR-105 continuam verdes sem alteracao.
- **Reuso de schema**: `operatorDispatchActionSchema` exportado do dominio; nao ha duplicacao do enum.
- **Convencao de plataforma**: nomes (`from`, `to`, `action`, `asset`) e mensagens de erro identicas a `/internal/health/operational/history`.

## Plano / DoD

- [x] Infra: `OperatorDispatchSnapshotQuery` + overload de `snapshot`.
- [x] Controller: schema com `from`/`to`/`action`/`asset` + superRefine.
- [x] 2 testes unitarios novos no journal (janela temporal, action+asset case-insensitive).
- [x] 3 testes novos de rota (filtro action, rejeita from>to, rejeita data invalida).
- [x] Suite API: 316 pass / 0 fail.
- [x] `npm run build` verde.
- [x] ADR e README atualizados.

## Consequencias

- + Auditoria pos-incidente fica trivial: `?from=...&to=...&action=error` em uma chamada.
- + Reducao de payload em sessoes longas — cliente recebe so o que precisa.
- + Mantem consistencia com `/internal/health/operational/history` (mesmos param names).
- − Adiciona 4 parametros opcionais a documentar; mitigado pela uniformidade com endpoint similar ja documentado.
- − Filtragem in-memory continua O(N) por chamada. Aceitavel ate `maxEntries=500`; se evoluir para JSONL persistido (ADR futuro), mover filtros para indexacao por timestamp eh trivial.
- → Proxima ADR candidata: paginacao via `cursor`/`offset` quando o journal migrar para storage persistido (acompanhar volume real em producao antes de implementar).
