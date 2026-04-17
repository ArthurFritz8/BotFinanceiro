# ADR 040 - Fundacao @botfinanceiro/shared-utils e semente smc-core

- Data: 2026-04-17
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Transformar o pacote `@botfinanceiro/shared-utils` (ate entao vazio) em um pacote util real, dual-runtime (Node e browser), com utilitarios minimos e zero dependencias, e iniciar um "smc-core" na camada shared do backend extraindo a primeira primitiva Smart Money Concepts (`resolveInstitutionalZone`) ja duplicada conceitualmente entre modulos.

## Contexto

1. Durante auditoria 360 graus identificamos que `packages/shared_utils`, `packages/shared_types` e `packages/shared_schemas` existiam como esqueletos vazios. Isso consumia overhead do monorepo sem entregar reuso.

2. No backend, a funcao `resolveInstitutionalZone(currentPrice, supportLevel, resistanceLevel)` vivia inline em `apps/api/src/modules/crypto/application/crypto-chart-service.ts`, com logica trivial mas conceitualmente compartilhavel (binary options e futuros modulos SMC precisarao da mesma classificacao `discount`/`equilibrium`/`premium`).

3. O frontend (`apps/web/src/main.js`) ja tinha padroes repetitivos de `try { JSON.parse } catch` em handlers SSE e contadores ad-hoc de falhas - candidatos naturais a um helper compartilhado com o backend a partir de `shared-utils`.

## Solucao

### packages/shared_utils (fundacao)

1. Arquivo `packages/shared_utils/src/safe-json-parse.js`:
- `safeJsonParse(input): { ok:true, value } | { ok:false, reason:"not_string"|"parse_error", error? }`.
- Nunca lanca.

2. Arquivo `packages/shared_utils/src/counter.js`:
- `createCounter(): { increment(label?), get(label?), snapshot(), reset() }`.
- Contador por label, zero dependencias.

3. Arquivo `packages/shared_utils/src/index.js` reexportando ambos.

4. `packages/shared_utils/package.json` com:
- `"main":"src/index.js"`
- `"exports":{".":"./src/index.js","./safe-json-parse":"./src/safe-json-parse.js","./counter":"./src/counter.js"}`
- `"scripts":{"test":"node --test tests/*.test.mjs"}`

5. Cobertura em `packages/shared_utils/tests/safe-json-parse.test.mjs` e `counter.test.mjs` (6 testes, todos verdes).

### smc-core (semente)

1. Arquivo `apps/api/src/shared/smc/institutional-zone.ts`:
- `resolveInstitutionalZone(currentPrice, supportLevel, resistanceLevel, thresholds?)`.
- `resolveZonePosition(currentPrice, supportLevel, resistanceLevel)` - posicao clamped `[0,1]`.
- Types `InstitutionalZone`, `InstitutionalZoneThresholds`.
- Limiares default `discountMax:0.35`, `premiumMin:0.65` (alinhado a implementacao previa em crypto-chart-service).

2. Adocao em `apps/api/src/modules/crypto/application/crypto-chart-service.ts`:
- A funcao local `resolveInstitutionalZone` agora delega para a shared.
- Mantida a assinatura para nao alterar o grafo de chamadas (refactor de superficie minima).

3. Cobertura em `apps/api/src/shared/smc/institutional-zone.test.ts` (7 testes, todos verdes):
- Classificacao em cada zona.
- Suporte igual a resistencia sem divisao por zero.
- Limiares customizados.
- Clamp de `resolveZonePosition`.

## Prevencao

1. `shared_utils` passa a ser o ponto oficial para utilitarios puramente funcionais sem dependencia. Duplicar `JSON.parse com catch` ou contador de falhas no frontend ou backend passa a ser considerado regressao.
2. `apps/api/src/shared/smc/` e o ponto canonico para primitivas SMC (institutional zone, FVG detection, BOS/CHoCH, liquidity sweeps). Futuros extracoes devem seguir o mesmo padrao: tipos explicitos, limiares parametrizaveis com defaults documentados, cobertura unitaria obrigatoria antes de adocao por services.
3. `crypto-chart-service.ts` nao teve sua API publica alterada, garantindo compatibilidade com `binary_options` e demais consumidores.
4. Qualquer novo arquivo em `packages/shared_utils/src/` deve ter export declarado explicitamente em `package.json#exports` para evitar dependencia acidental em caminhos internos.
