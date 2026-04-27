# ADR-111 - Remocao do template morto `technical-gauge.html`

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Arquiteto de UI/UX + Staff Frontend Engineer.

## Contexto / Observacao

Auditoria do Chart Lab Pro identificou `apps/web/src/technical-gauge.html` como candidato a codigo morto. Verificacao por `grep` em `apps/web/**` confirmou:

- Zero `import`/`require`/`fetch`/`<link>` apontando para o arquivo em codigo de producao.
- Match de `technical-gauge` em `main.js` aponta para `data-section="technical-gauge"` no template literal dentro de `renderInstitutionalTechnicalTab()` (linha ~10961) — implementacao real e independente.
- Match em `apps/web/dist/assets/*.js` e o build do mesmo template literal de `main.js`, nao do HTML.

O arquivo era um **drop-in blueprint** (Tailwind + SVG inline) deixado pelo prompt-base do Gemini para referencia visual. A implementacao oficial vive em `main.js` (`renderInstitutionalTechnicalTab`), com IDs e estrutura ja' divergentes do template (renderizacao dinamica via template strings + `analysis.smc/hft/timing` em vez de HTML estatico).

## Decisao

Remover `apps/web/src/technical-gauge.html` do repositorio.

### Justificativa

1. **Clean Architecture**: codigo morto polui descoberta — leitor novo pode assumir que o HTML estatico e' fonte da aba "Tecnica" e tentar editar o arquivo errado.
2. **Single source of truth**: a implementacao real ja' esta em `main.js#L10898+`. Manter dois "sources" (HTML drop-in + JS template literal) abre porta para drift silencioso (alguem edita um, outro fica desatualizado).
3. **Zero Budget cognitivo**: 200+ linhas de HTML que nao executam custam atencao em todo `find`/`grep`/IDE search.
4. **Historico preservado**: o blueprint permanece acessivel via `git show <sha>:apps/web/src/technical-gauge.html` (commit `f9b82bc` e anteriores). Nao ha perda informacional.

### Nao-decisao deliberada

- **NAO** removemos `liquidity-heatmap.js`: auditoria identificou como candidato, mas `grep` confirma 3 chamadas reais em `main.js` (L9576, L13601, L17752) + teste verde em `chart-lab-quant.test.mjs#L340`. Modulo ativo, fica.
- **NAO** removemos a aba "Tecnica" nem `renderInstitutionalTechnicalTab()`: e' a implementacao real, com testes.

## Conformidade

- **Zero Budget**: nenhuma dependencia removida ou adicionada.
- **Reversibilidade**: `git revert` ou `git checkout <sha> -- apps/web/src/technical-gauge.html` recupera o arquivo se houver intencao futura de transformar o blueprint em modulo standalone.
- **Sem impacto runtime**: arquivo nunca era servido pelo Vite (`apps/web/index.html` nao referencia).
- **Build/test**: nenhuma mudanca esperada em `apps/web` build/test (template nao participava).

## Plano / DoD

- [x] `git rm apps/web/src/technical-gauge.html`.
- [x] ADR-111 documenta remocao + justificativa + caminho de recuperacao.
- [x] Sem alteracoes em `main.js`/`styles.css` necessarias (implementacao real intacta).

## Consequencias

### Positivas

- Reduz superficie de busca/IDE em ~250 linhas de HTML morto.
- Elimina risco de divergencia entre blueprint e implementacao.
- Sinaliza convencao: blueprints/drafts vivem em ADR ou branches, nao no source tree de producao.

### Negativas / mitigadas

- Perda de referencia visual rapida do velocimetro institucional. Mitigacao: blueprint preservado em historico Git; se a aba "Tecnica" for redesenhada, o snapshot continua acessivel via `git show`.
