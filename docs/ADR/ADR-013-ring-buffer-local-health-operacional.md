# ADR 013 - Ring buffer local para historico de health operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Persistir snapshots de health operacional em disco local com baixo custo para manter historico curto de incidentes sem depender de infraestrutura paga.

## Contexto

O endpoint de health operacional sintetico fornecia apenas o estado atual. Em incidentes intermitentes, faltava contexto historico imediato para diagnosticar quando e como o status degradou.

## Solucao

1. Criado store local de observabilidade com persistencia em JSON e escrita atomica.
2. Implementado ring buffer com tamanho maximo configuravel por ambiente.
3. Criado job leve periodico para coletar snapshots e gravar no store.
4. Exposta rota interna protegida para consulta do historico recente:
`/internal/health/operational/history`.
5. Configuracao por ambiente para habilitar/desabilitar coleta, intervalo, tamanho e caminho do arquivo.

## Prevencao

1. Limitar tamanho do historico para evitar crescimento descontrolado em disco.
2. Validar payload persistido ao carregar do disco para blindar corrupcao de arquivo.
3. Manter endpoint historico protegido por token e whitelist opcional de IP.
4. Em falha de persistencia, registrar warn sem derrubar API.

## Impacto

1. Maior capacidade de analise pos-incidente sem custo adicional.
2. Diagnostico mais rapido de degradacoes intermitentes.
3. Base pronta para migracao futura para armazenamento centralizado sem quebra de contrato.
