# ADR 029 - Persistencia hibrida com Supabase/Postgres

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Resolver de forma definitiva a estrategia de persistencia da API, mantendo baixo custo e degradacao graciosa.

## Contexto

A API operava com persistencia local em arquivo para historico operacional, suficiente para execucao unica, mas com limitacoes para continuidade entre instancias e auditoria centralizada.

## Solucao

1. Introduzido modo de persistencia configuravel por ambiente:
- `DATABASE_PROVIDER=auto|file|postgres`
2. Em `auto`, usar Postgres quando `DATABASE_URL` estiver configurada; caso contrario, manter arquivo local.
3. Integrado suporte a Postgres com `pg`, compativel com Supabase (connection string Postgres).
4. Evoluido `OperationalHealthHistoryStore` para persistencia hibrida:
- tabela `operational_health_snapshots` em Postgres
- fallback automatico para arquivo local em falhas de banco
5. Adicionado `CopilotChatAuditStore` para trilha de auditoria do Copiloto:
- tabela `copilot_chat_audit_logs` em Postgres
- fallback para arquivo local (`COPILOT_CHAT_AUDIT_FILE_PATH`)
6. Pool de conexao compartilhado com encerramento gracioso no shutdown.

## Prevencao

1. Validacao de ambiente impede `DATABASE_PROVIDER=postgres` sem `DATABASE_URL`.
2. Validacao de `DATABASE_URL` exige prefixo `postgres://` ou `postgresql://`.
3. Falhas de persistencia em banco nao derrubam funcionalidade principal de consulta.
4. Mantido limite maximo de itens para evitar crescimento indefinido de historico local.

## Impacto

1. Persistencia duravel para observabilidade e auditoria, adequada para deploy em nuvem.
2. Continuidade operacional mesmo sem banco, via fallback local.
3. Base pronta para futuras funcionalidades de historico de conversas e analytics de Copiloto.
