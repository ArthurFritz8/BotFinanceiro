# ADR 018 - Exportacao CSV da agregacao do historico operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir extração em CSV dos buckets agregados (hour/day) do historico operacional para analise rapida em planilhas e auditoria operacional.

## Contexto

Ja existe endpoint de agregacao em JSON e exportacao CSV do historico bruto. Faltava uma exportacao direta dos dados agregados para evitar pos-processamento manual fora da API.

## Solucao

1. Implementado metodo de exportacao CSV para agregacao no service do modulo system.
2. Novo endpoint interno protegido:
GET /internal/health/operational/history/aggregate.csv
3. Query params suportados:
- `granularity` (`hour` ou `day`)
- `bucketLimit`
- `from`
- `to`
4. Colunas do CSV agregado:
- `bucket_start`
- `bucket_end`
- `sample_count`
- `status_ok`
- `status_warning`
- `status_critical`
- `avg_budget_remaining_percent`
- `max_consecutive_open_cycles`
- `max_scope_failure_rate_percent`

## Prevencao

1. Reuso da mesma validacao de query do endpoint agregado em JSON, incluindo regra `from <= to`.
2. Limite de buckets respeita teto configurado para proteger free tier.
3. Endpoint permanece com autenticacao interna e whitelist opcional de IP.
4. Alteracoes futuras no contrato de colunas exigem novo ADR.

## Impacto

1. Reduz atrito de analise operacional em ferramentas externas.
2. Mantem consistencia entre visualizacao JSON agregada e exportacao tabular.
3. Melhora rastreabilidade de tendencia operacional sem custo adicional de infraestrutura.