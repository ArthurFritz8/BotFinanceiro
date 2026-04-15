# Checklist de Mudanca

## Identificacao

1. Titulo da mudanca:
Evolucao do Chart Lab com strategy routing (crypto x institucional), Macro Radar institucional e painel Risk & Prop Firm Desk.
2. Data:
2026-04-14.
3. Responsavel:
dougl (implementacao assistida por GitHub Copilot).
4. Tipo:
- [x] feature
- [ ] bugfix
- [ ] refactor
- [x] infra/deploy
- [x] observabilidade

## Escopo tecnico

1. Arquivos modificados:
- `apps/web/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/main.js`
- `apps/api/src/modules/forex/interface/forex-controller.ts`
- `apps/api/src/modules/forex/interface/forex-routes.ts`
- `apps/api/src/modules/forex/interface/forex-routes.test.ts`
- `apps/api/src/modules/crypto/interface/crypto-controller.ts`
- `apps/api/src/modules/crypto/interface/crypto-routes.ts`
- `apps/api/src/modules/crypto/interface/crypto-routes.test.ts`
- `apps/api/src/shared/config/env.ts`
- `.env.example`
- `README.md`
2. Arquivos novos:
- `apps/api/src/modules/forex/application/institutional-macro-service.ts`
- `docs/runbooks/checklist-deploy-macro-radar-institucional-2026-04-14.md`
- `docs/runbooks/checklist-mudanca-strategy-routing-macro-radar-2026-04-14.md`
3. Contratos/endpoints impactados:
- `GET /v1/crypto/strategy-chart`
- `GET /v1/forex/strategy-chart`
- `GET /v1/forex/institutional-macro/snapshot`
4. Variaveis de ambiente novas/alteradas:
- `FOREX_MACRO_CALENDAR_URL`
- `FOREX_MACRO_CALENDAR_API_KEY`

## Documentacao obrigatoria

1. README atualizado?
- [x] sim
- [ ] nao
- [ ] nao aplicavel

2. Runbook atualizado/criado?
- [x] sim
- [ ] nao
- [ ] nao aplicavel

3. ADR necessario?
- [ ] sim
- [x] nao

4. Se sim, ADR criado em `docs/ADR`?
- [ ] sim
- [ ] nao

## Validacao tecnica

1. `npm run check`
- [x] passou

2. Testes relevantes
- comando: `npm run test`
- resultado: passou (179 testes, 0 falhas)
- comando: `node --import tsx --test src/modules/forex/interface/forex-routes.test.ts src/modules/crypto/interface/crypto-routes.test.ts`
- resultado: passou (23 testes, 0 falhas)
- comando: `npm run test -w @botfinanceiro/web`
- resultado: passou (3 smoke tests, 0 falhas)

3. Build relevante
- comando: `npm run typecheck`
- resultado: passou (`tsc -b` sem erros)
- comando: `npm run build -w @botfinanceiro/web`
- resultado: passou (build Vite + PWA concluido)

## Riscos e rollback

1. Riscos conhecidos:
- Dependencia de provedor externo para calendario macro pode oscilar; fallback sintetico permanece necessario.
- Cobertura web atual e de nivel smoke (estrutural); ainda nao cobre fluxos de interacao em navegador.
2. Plano de rollback:
- Esvaziar `FOREX_MACRO_CALENDAR_URL` e `FOREX_MACRO_CALENDAR_API_KEY` para forcar fallback sintetico.
- Reiniciar API.
- Se necessario, rollback para build anterior da API e revalidacao com smoke tests de strategy-chart.
3. Monitoramento pos-deploy:
- Latencia e taxa de erro de `GET /v1/forex/strategy-chart` e `GET /v1/crypto/strategy-chart`.
- Logs de fallback de calendario macro.
- Saude geral via `GET /health` e `GET /ready`.

## Evidencias

1. Evidencia de qualidade anexada?
- [x] sim

2. Evidencia de deploy/health anexada?
- [ ] sim
- [x] nao aplicavel

## Pendencias abertas

1. Expandir testes web para interacao real de interface (ex.: Playwright/Vitest DOM).
2. Executar smoke de deploy em ambiente alvo com variaveis macro reais configuradas.