# ADR 011 - Alerta de circuito aberto por ciclos consecutivos

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Disparar alerta operacional quando o circuit breaker da CoinGecko permanecer aberto por ciclos consecutivos do scheduler, reduzindo tempo de deteccao de indisponibilidade externa.

## Contexto

O estado do circuito ja estava exposto no endpoint interno de metricas, mas sem alerta ativo para incidentes recorrentes. Isso exigia observacao manual continua.

## Solucao

1. Adicionados parametros de ambiente para threshold e cooldown do alerta de circuito aberto.
2. Implementado contador de ciclos consecutivos com estado `open` no scheduler.
3. Implementado log de alerta em nivel `error` quando o threshold e atingido e fora do cooldown.
4. Exposto no snapshot interno o contador atual, threshold e timestamp do ultimo alerta.

## Prevencao

1. Ajustar threshold e cooldown por ambiente sem mudar codigo.
2. Monitorar logs de alerta para acionar modo economia e investigacao de provider.
3. Reaplicar padrao para outros provedores quando forem integrados.
4. Revisar periodicamente os limites para evitar alerta excessivo (alert fatigue).

## Impacto

1. Deteccao automatica de degradacao persistente do provider.
2. Melhor resposta operacional com baixo custo de infraestrutura.
3. Maior previsibilidade do comportamento da sincronizacao em incidentes.
