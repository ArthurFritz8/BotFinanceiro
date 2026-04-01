# ADR 004 - Integracao CoinGecko com cache-first no modulo crypto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Implementar uma integracao externa real para cotacao cripto com estrategia cache-first, validacao estrita e degradacao graciosa sob falhas de provider.

## Contexto

O modulo crypto tinha apenas endpoint de politica de sincronizacao. Ainda nao havia fluxo de obtencao de preco em tempo real com isolamento de integracao e protecao contra rate limit.

## Solucao

1. Criado adapter isolado para CoinGecko na camada de integracao externa.
2. Todo payload da API externa passou por validacao Zod antes de uso.
3. Implementado cache em memoria com estados fresh, stale e miss.
4. Criado servico de spot price com estrategia cache-first.
5. Em falha do provider durante estado stale, sistema retorna dado stale em vez de indisponibilidade imediata.
6. Exposto endpoint `/v1/crypto/spot-price` com parametros validados por schema.

## Prevencao

1. Toda nova integracao externa deve usar adapter dedicado fora do controller.
2. Todo payload externo deve ter schema estrito e fallback controlado.
3. Toda chamada externa deve ter timeout configuravel por ambiente.
4. Erros de provider devem ser tratados pelo handler central e nunca por logs soltos.

## Impacto

1. Reducao de chamadas repetidas ao provider via cache-first.
2. Menor risco de indisponibilidade total por falha temporaria externa.
3. Base pronta para evoluir para cache distribuido mantendo mesma interface de servico.