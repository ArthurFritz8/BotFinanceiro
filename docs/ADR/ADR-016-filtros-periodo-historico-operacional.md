# ADR 016 - Filtros de periodo no historico operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir consultas e exportacoes focadas por janela temporal no historico de health operacional para reduzir volume e acelerar diagnostico.

## Contexto

O historico JSON e CSV suportava apenas limit. Em periodos com muitos snapshots, investigar um intervalo especifico exigia filtro manual externo.

## Solucao

1. Adicionados parametros opcionais `from` e `to` nas rotas internas de historico JSON e CSV.
2. Implementada validacao de datas no controller com regra `from <= to`.
3. Implementado filtro temporal no service antes de aplicar `limit`.
4. Respostas passaram a incluir metadados de filtros aplicados e total de registros filtrados (`totalMatched`).

## Prevencao

1. Em caso de data invalida ou intervalo invertido, request falha na validacao.
2. `limit` continua limitado por configuracao para evitar carga excessiva.
3. Filtro ocorre apenas em rota interna protegida por token e whitelist opcional de IP.
4. Alteracoes futuras na semantica de filtro exigem novo ADR.

## Impacto

1. Exportacoes menores e mais relevantes para incidentes pontuais.
2. Menor esforco operacional para analise historica.
3. Maior previsibilidade de volume processado sem custo adicional.
