# ADR-062 — Alertas de degradacao de regime do backtesting (Wave 22)

## Status

Aceito — 2026-04-20

## Contexto

A Wave 21 (ADR-061) introduziu persistencia JSONL do historico de comparacoes
e leaderboard agregado. Conforme novas rodadas vao sendo executadas em
janelas de mercado distintas, e necessario detectar **mudanca de regime**:
estrategias que historicamente performavam bem podem comecar a degradar
quando o regime de volatilidade/tendencia muda. Sem deteccao automatizada,
o operador depende de inspecao visual do leaderboard.

## Decisao

Implementamos `BacktestingService.computeRegimeAlerts(options?)` que:

- Agrupa rodadas historicas por chave `(asset, strategy)`.
- Ordena rodadas por `ranAtMs` ascendente em cada bucket.
- Separa as **ultimas N rodadas** (`recentWindow`, default 3) como janela
  recente; o restante e o baseline.
- Calcula `delta = recentAvgPnl - baselineAvgPnl` em pontos percentuais.
- Emite alerta se `delta <= -warningThresholdPercent` (default 5).
- `severity = "critical"` se `delta <= -2 * warningThresholdPercent`,
  caso contrario `"warning"`.
- Ignora buckets com menos rodadas que `minTotalRounds`
  (default `recentWindow * 2 = 6`), evitando falso-positivos em buckets
  pequenos.
- Saida ordenada por `deltaPnlPercent` ascendente (piores quedas primeiro).

Exposto em `GET /v1/backtesting/regime-alerts` (publico, rate-limited)
com query opcional `recentWindow`, `warningThresholdPercent`,
`minTotalRounds`. Frontend renderiza nova secao no painel de backtesting
com cores distintas por severidade (warning amarelo, critical vermelho)
e atualiza junto com history+leaderboard.

## Consequencias

Positivas:

- Sinal automatizado de degradacao sem custo de exchange (apenas leitura
  in-memory do JSONL ja carregado).
- Limites configuraveis via query string permitem tuning sem deploy.
- Severidade binaria (warning/critical) simplifica triagem operacional.

Limitadas / aceitas:

- Sensivel a `recentWindow`: window pequeno aumenta volatilidade do alerta.
  Mitigacao: default 3 + minTotalRounds = 6.
- Nao distingue degradacao por regime de mercado vs alteracao de
  parametros (ex.: cooldown diferente). Aceitavel para v1.
- Nao persiste histograma de alertas; cada GET recomputa do JSONL.

## Alternativas rejeitadas

- **Janela movel exponencial (EWMA)**: complica explicacao do delta sem
  ganho material para volume atual de rodadas (~dezenas).
- **Persistir alertas em store separado**: viola simplicidade zero-cost;
  alertas sao derivados puros do historico ja persistido.

## Validacao

- 287/287 testes node:test pass (4 novos cobrindo: warning, critical,
  abaixo de minTotalRounds, sem store).
- `npm run lint` exit 0.
