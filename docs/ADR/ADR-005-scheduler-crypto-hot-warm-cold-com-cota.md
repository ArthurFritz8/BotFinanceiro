# ADR 005 - Scheduler crypto hot/warm/cold com protecao de cota

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Automatizar a sincronizacao de cotacoes cripto por prioridade (hot, warm, cold) sem sobrecarregar servidor ou estourar limite gratuito de API.

## Contexto

A API ja possuia endpoint de cotacao spot e cache-first, mas faltava job periodico para aquecer cache por prioridade e reduzir latencia para ativos mais relevantes.

## Solucao

1. Criado job runner de sincronizacao com ciclos independentes por escopo hot/warm/cold.
2. Implementado jitter no agendamento para evitar picos sincronizados.
3. Adicionado guard de orcamento diario para chamadas CoinGecko.
4. Adicionado rate limiter em token bucket para limitar requisicoes por minuto.
5. Integrado start/stop do scheduler ao ciclo de vida do servidor.
6. Exposta configuracao por ambiente para listas de ativos, moeda alvo, cota diaria e limite por minuto.

## Prevencao

1. Todo novo job deve declarar limite de cota e mecanismo de jitter.
2. Sem cota disponivel, job deve degradar para skip com log estruturado, sem crash.
3. Toda chamada externa em job deve ser roteada por service/adapter, nunca direto no controller.
4. Ajustes de frequencia e listas devem ocorrer por env sem alterar codigo.

## Impacto

1. Cache aquecido de forma previsivel para ativos prioritarios.
2. Menor risco de burst e bloqueio por rate limit.
3. Base pronta para evoluir de cron in-process para orquestrador externo mantendo contratos.