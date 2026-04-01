# ADR 030 - Governanca de migracoes, auditoria e retencao

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Consolidar uma base de operacao de producao com governanca de schema, auditoria acessivel por rota interna e politica de retencao de dados.

## Contexto

A API ja operava com persistencia hibrida (Postgres/arquivo), mas ainda faltavam:

1. fluxo versionado de migracoes SQL
2. endpoint interno para consulta de auditoria do Copiloto
3. regras explicitas de retencao para evitar crescimento indefinido
4. historico visivel na interface web para fechar ciclo de uso
5. monitoramento minimo automatizado para detectar indisponibilidade cedo

## Solucao

1. Criado diretório de migracoes SQL versionadas em `apps/api/migrations`.
2. Implementado migrator Postgres com tabela `schema_migrations` e validacao por checksum.
3. Startup da API passou a aplicar migracoes automaticamente quando:
- modo de persistencia resolve para Postgres
- `DATABASE_AUTO_MIGRATE=true`
4. Expandida auditoria do Copiloto com consulta paginada/filtrada e limpeza:
- `GET /internal/copilot/audit/history`
- `DELETE /internal/copilot/audit/history?confirm=true`
5. Aplicada retencao por dias para stores operacional e de auditoria.
6. Frontend passou a manter historico local de conversa com limpeza manual.
7. Copiloto ganhou historico por sessao (`sessionId`) com endpoint publico:
- `GET /v1/copilot/history?sessionId=...&limit=...`
8. Frontend passou a priorizar historico remoto por sessao e manter fallback local.
9. Criado workflow de smoke monitorado no GitHub Actions (`monitoring-smoke.yml`) com checks de disponibilidade e latencia.

## Prevencao

1. Migrações ja aplicadas nao sao reaplicadas; divergencia de checksum falha explicitamente.
2. Rotas de auditoria permanecem internas e protegidas por token.
3. Retencao combinada por janela temporal e limite de itens reduz risco de crescimento de storage.
4. Falhas em banco continuam com fallback para arquivo local quando aplicavel.
5. Workflow de monitoramento falha cedo quando status HTTP/payload/latencia saem do esperado.

## Impacto

1. Maior previsibilidade para evolucao de schema em ambientes diferentes.
2. Melhora de observabilidade operacional do Copiloto para suporte e auditoria.
3. Experiencia web com continuidade de conversa entre recargas do app via historico remoto por sessao.
4. Alertas basicos de disponibilidade por job agendado reduzem tempo medio para deteccao.
5. Base pronta para proximos recursos de analytics e relatorios historicos.
