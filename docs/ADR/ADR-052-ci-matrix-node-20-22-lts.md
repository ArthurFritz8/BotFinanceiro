# ADR-052: Matriz de CI Node.js 20 + 22 LTS

- Status: Aceito
- Data: 2026-04-22
- Wave: 12

## Contexto

Ate a Wave 11, o pipeline CI (`.github/workflows/ci.yml`) executava lint,
typecheck, testes e guard de documentacao em uma unica versao do Node.js
(`node-version: 20`). Node.js 22 entrou em LTS ("Active LTS") em outubro de
2024 e Node.js 20 permanece em LTS ate abril de 2026 ("Maintenance LTS"
depois). O time de runtime do projeto pode atualizar a versao alvo a qualquer
momento (Render, Railway, etc. ja oferecem Node 22) e e prudente garantir que
o monorepo continue verde nas duas linhas estaveis suportadas antes que a
migracao se torne urgente.

Sem matriz de CI nao temos como detectar regressoes induzidas por:

- Mudancas de comportamento em APIs nativas (`node:test`, `fetch`, `crypto`,
  `setTimeout.unref`).
- Diferencas de tratamento de loaders ESM / CommonJS interop entre 20 e 22.
- Atualizacoes de dependencias (Fastify 5, Zod, Vite, Playwright) que podem
  passar a depender de features apenas disponiveis em Node 22.

## Decisao

Converter o job `quality` do workflow de CI principal em uma matriz de duas
versoes: `[20, 22]`. As demais etapas (`npm ci`, `npm run guard:docs`,
`npm run check`, `npm test`) sao reaproveitadas integralmente em ambas as
versoes via `${{ matrix.node-version }}`.

A matriz utiliza `fail-fast: false` para que uma quebra em uma versao nao
suprima informacao da outra, facilitando o diagnostico de regressoes
especificas de runtime.

## Consequencias

Positivas:

- Cobertura continua nas duas linhas LTS suportadas, antecipando regressoes
  antes de qualquer migracao do runtime de producao.
- Nenhum custo adicional de manutencao: o mesmo conjunto de scripts npm e
  reutilizado nas duas execucoes.
- Diagnostico independente por versao via `fail-fast: false`.

Neutras:

- Tempo total de feedback do CI dobra em walltime (duas execucoes paralelas
  ocupando minutos GitHub Actions). Aceitavel dado que ja temos
  `concurrency.cancel-in-progress: true`.

Negativas:

- Cada PR consome o dobro de minutos do plano de Actions. Mitigado pelo fato
  de o repositorio ser privado e de baixo volume.

## Alternativas consideradas

1. Manter apenas Node 20: simples, mas atrasaria a deteccao de regressoes em
   Node 22 ate a janela de migracao real.
2. Migrar direto para Node 22 unico: prematuro enquanto Node 20 ainda e LTS
   e enquanto provedores podem ainda nao default para 22.
3. Adicionar Node 24 (Current) na matriz: descartado por ainda nao ser LTS;
   ruido de regressoes nao acionaveis.

## Referencias

- Node.js Release Schedule: https://github.com/nodejs/release#release-schedule
- ADR-019 (CI Check + Test branch principal)
- ADR-002 (Fundacao tecnica monorepo TypeScript)
