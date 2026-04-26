# ADR-110 - Calibracao explicita das constantes do Micro-Timing binario

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Especialista em Trading Institucional, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A aba **Micro-Timing** (binary options) do Intelligence Desk concentra a heuristica de probabilidade CALL/PUT/NEUTRO + classificacao de gatilho HOT/WARM/COLD. O codigo, originado nas ADR-076 (Timing Desk) e ADR-049 (Ghost Tracker), acumulou uma quantidade relevante de **constantes magicas inline** em tres funcoes de `apps/web/src/main.js`:

- `resolveBinaryOptionsInstitutionalDirectionalBias` (bias por tipo de POI: previous_low/high, midnight_open, cluster).
- `buildBinaryOptionsInstitutionalKineticContext` (escalas de aceleracao, clamps direcionais, boost de momentum, ajustes de probabilidade neutra).
- `resolveBinaryOptionsTriggerHeat` (pesos do score 0-100 e thresholds HOT/WARM).
- `buildMicroTimingAnalysis` (blend backend/local de momentum, escala `* 1400`, clamps, thresholds de label).

Auditoria do dia 2026-04-26 (peer-review com persona "Arquiteto Socratico + Trading Institucional") apontou que essas constantes nao tinham rastreabilidade — nao havia ADR justificando, por exemplo, por que o `momentumStrengthBase` multiplica `Math.abs(momentumPerSecondPercent) * 1400` ou por que o threshold HOT exige `directionalProbability >= 79 && momentumStrength >= 68 && neutralProbability <= 18`. Qualquer ajuste futuro arriscava regressao silenciosa no `binaryOptionsGhostTracker` (ADR-049) sem conseguirmos reproduzir a calibracao original.

## Decisao

Extrair, **sem alteracao numerica**, todas as constantes magicas das tres funcoes acima para um modulo dedicado `apps/web/src/modules/chart-lab/quant/micro-timing-config.js`, seguindo dois principios:

1. **Auditoria por nome**: cada constante recebe identificador semantico (`MOMENTUM_STRENGTH_SCALE`, `TRIGGER_HEAT_HOT_DIRECTIONAL_MIN`, `KINETIC_EXPLOSIVE_BIAS`, etc.) e comentario de origem heuristica (ADR-049/ADR-076 ghost tracker).
2. **Imutabilidade documental**: o cabecalho do arquivo declara que qualquer mudanca nos coeficientes exige nova ADR (ou complemento a esta) descrevendo o backtest/ghost tracker que justifica o ajuste. Isso vale especialmente para os pesos do `triggerHeat` e os thresholds HOT/WARM, cuja mudanca afeta diretamente a contagem `wins/losses/pushes` exibida ao operador.

`main.js` passa a importar todas as constantes nomeadas. A operacao nao introduz comportamento novo: o teste suite do `@botfinanceiro/web` (131 testes) e o build Vite continuam verdes apos o refator.

## Consequencias

### Positivas

- Qualquer trader/auditor pode abrir `micro-timing-config.js` e enxergar **toda** a calibracao do Micro-Timing num unico arquivo de ~110 linhas, com origem documentada — fim da arqueologia em `main.js` (~21.5K linhas).
- Mudanca futura por backtest fica explicita no diff (`MOMENTUM_STRENGTH_SCALE` 1400 → 1600 aparece como linha unica no commit), facilitando review e bisect.
- Reduz risco de **drift silencioso**: hoje, dois desenvolvedores poderiam calibrar `* 1400` em locais diferentes sem perceber. Com constante unica exportada, qualquer divergencia futura exige fork explicito.
- Alinha o modulo com o padrao ja' praticado em `position-calculator.js` (`POSITION_CALC_PROFILES`, `INDEX_ASSET_SPECS`, `COMMODITY_ASSET_SPECS`) e `probabilistic.js` (`PROBABILISTIC_MIN_RETURNS_FOR_STATS`).

### Custos / Trade-offs

- Adiciona um arquivo (~110 linhas) ao bundle. Impacto desprezivel: tree-shaking do Vite mantem apenas as constantes importadas, e todas estao em uso.
- Aumenta o numero de imports no topo de `main.js`. Considerado aceitavel — preferimos o ruido visual no header a literais inline em hot-path de UI.

### Nao-decisoes (escopo deliberadamente fora desta ADR)

- **Recalibracao** dos coeficientes: nao ha mudanca numerica nesta ADR. A proposta era exclusivamente de auditabilidade.
- **Substituicao por config externa** (JSON em `data/`, ou env vars): rejeitado por hora. Esses valores sao **regras quantitativas estaveis** validadas por ghost tracker — nao devem mudar entre ambientes (dev/prod). Externalizar abriria caminho para "tuning silencioso em producao", anti-pattern explicito no prompt-base do projeto.
- **Outras areas do chart-lab** com magic numbers (ex.: `harmonic-confidence blend 0.6/0.4` em `main.js#L11134`): mapeadas na auditoria, ficam para ADR futura conforme demanda.

## Validacao

- `npm run test -w @botfinanceiro/web` → 131/131 verde (sem nova suite, refator preserva comportamento).
- `npm run build -w @botfinanceiro/web` → bundle gerado.
- Lint: workspace `@botfinanceiro/web` nao expoe script `lint` no `package.json` (verificado durante a entrega — nao introduzido por esta ADR).

## Observabilidade

Sem nova metrica/contador. ADR puramente estrutural sobre legibilidade do codigo.
