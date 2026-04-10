# ADR 036 - Resiliencia de market overview e Chart Lab para simbolo externo

- Data: 2026-04-10
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Eliminar falhas recorrentes de experiencia no Market Navigator e no Chart Lab quando provedores oscilam (rate limit/indisponibilidade) e quando o usuario abre simbolos externos (ex.: EURUSD) no terminal.

## Contexto

Durante validacao operacional foram observados sintomas de producao:

1. Cripto podia ficar sem ativos quando CoinCap/CoinGecko/Binance oscilavam simultaneamente no ciclo.
2. Futuros podia retornar listas vazias em alguns presets quando premium index/open interest falhavam, mesmo com ticker disponivel.
3. O botao "Levar ao chart" para simbolos externos acionava pipeline cripto em cenarios indevidos e podia exibir erro de Binance.
4. Overviews de equities/forex podiam perder dados em janela curta apos expirar TTL fresco, sem reaproveitar ultimo snapshot valido.

## Solucao

1. Stale fallback em market overview/snapshot:
- `crypto`, `equities`, `forex` e `futures` reaproveitam cache stale por janela controlada (`CACHE_STALE_SECONDS`) quando upstream falha.

2. Hardening do adapter de futures:
- `premiumIndex` e `openInterest` passam a degradar para `null` quando indisponiveis, sem derrubar snapshot inteiro.
- ticker usa fallback para cache stale quando stream/REST falham temporariamente.

3. Protecao do Chart Lab para simbolo externo:
- simbolos nao-cripto (forex/indices/commodities/equities) nao disparam pipeline de chart cripto.
- UI entra em modo explicito de Terminal PRO para simbolo externo, evitando erro indevido de provider cripto.

4. Cobertura automatizada:
- novo teste de integracao para futures valida degradacao de derivativos para `null` em falha de upstream.

## Prevencao

1. Reduzir telas vazias em oscilacoes temporarias de provedores publicos.
2. Evitar regressao de UX no fluxo "Levar ao chart" para ativos fora do dominio cripto.
3. Preservar continuidade operacional com degradacao graciosa em vez de erro total.
4. Manter governanca de resiliencia com teste de comportamento em falha.

## Impacto

1. Menos incidentes de "sem moedas" em cripto/futuros durante instabilidade externa.
2. Menos erros falsos no Chart Lab ao navegar por simbolos externos.
3. Melhor robustez enterprise no consumo de dados multi-provedor em tempo real.
4. Entrega alinhada ao padrao O.C.S.P. de arquitetura do projeto.
