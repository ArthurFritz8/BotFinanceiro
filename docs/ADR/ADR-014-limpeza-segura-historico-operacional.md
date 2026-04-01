# ADR 014 - Limpeza segura do historico operacional

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir reset controlado do historico local de health operacional para cenarios de teste, manutencao e recuperacao de estado sem apagar dados acidentalmente.

## Contexto

Com o ring buffer local ativo, o historico cresce de forma controlada, mas faltava uma operacao interna para limpeza imediata quando necessario.

## Solucao

1. Adicionado metodo de limpeza no store de observabilidade com persistencia atomica.
2. Adicionado metodo de limpeza no service do modulo system.
3. Exposto endpoint interno protegido para limpeza:
DELETE /internal/health/operational/history?confirm=true
4. Exigida confirmacao explicita via query para reduzir risco de execucao acidental.

## Prevencao

1. Endpoint continua sob autenticacao interna por token e whitelist opcional de IP.
2. Sem confirmacao explicita, a operacao nao executa.
3. Toda limpeza retorna quantidade removida e timestamp para rastreabilidade.
4. Operacao mantida apenas em rota interna, sem exposicao publica.

## Impacto

1. Melhor controle operacional em homologacao e testes de incidentes.
2. Reducao de risco de estado historico contaminado durante diagnostico.
3. Mantida simplicidade de infraestrutura com custo zero.
