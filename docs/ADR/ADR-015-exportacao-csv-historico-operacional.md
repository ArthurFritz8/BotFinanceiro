# ADR 015 - Exportacao CSV do historico operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir exportacao rapida do historico de health operacional para analise externa sem depender de transformacoes manuais do JSON.

## Contexto

O historico operacional ja podia ser consultado em JSON e limpo por rota interna. Faltava uma forma direta de exportar para planilhas e fluxo de analise de incidentes.

## Solucao

1. Implementada geracao CSV no service de status do sistema.
2. Criado endpoint interno protegido para exportacao:
GET /internal/health/operational/history.csv
3. Reaproveitado filtro por `limit` da rota de historico.
4. Incluidas colunas de status, budget, circuito, motivos e taxa de falha por escopo.

## Prevencao

1. Endpoint de export permanece protegido por token interno e whitelist opcional de IP.
2. Escapamento de CSV aplicado para evitar quebra de formato em mensagens com virgulas/aspas.
3. Limite de registros respeita maximo configurado para evitar exportacao excessiva.
4. Manter contrato de colunas estavel; mudancas estruturais exigem novo ADR.

## Impacto

1. Diagnostico operacional mais rapido em planilhas e relatorios.
2. Menor esforço para auditoria de incidentes.
3. Nenhum custo adicional de infraestrutura.
