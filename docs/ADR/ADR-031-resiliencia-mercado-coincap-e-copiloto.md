# ADR 031 - Resiliencia de dados de mercado com CoinCap e evolucao do Copiloto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Elevar a qualidade das respostas do Copiloto para perguntas de mercado e reduzir falhas de disponibilidade percebidas no frontend em producao.

## Contexto

Em ambiente publico, foram observados dois problemas recorrentes:

1. respostas genericas do Copiloto para pedidos de resumo de mercado cripto
2. erros de disponibilidade em consultas spot quando o provider principal (CoinGecko) falhava ou abria circuito
3. erro 404 de asset no frontend publicado em subdiretorio (GitHub Pages)

O sistema ja possuia tool calling read-only e protecao de resiliencia para CoinGecko, mas faltavam:

1. provider alternativo para cotacao em fallback
2. ferramenta dedicada a panorama de mercado (24h, cap, volume)
3. orientacao sistemica para o modelo priorizar dados estruturados
4. carregamento de CSS compativel com base path de build estatico

## Solucao

1. Integrado provider secundario CoinCap via novo adapter `CoinCapMarketDataAdapter`.
2. Adicionado fallback no `CryptoSpotPriceService` para consultas em USD:
- tenta CoinGecko primeiro
- em falha de classe `COINGECKO_*`, tenta CoinCap
- mantem `provider` explicito no contrato de resposta (`coingecko|coincap`)
3. Adicionada tool `get_crypto_market_overview` no Copiloto com dados de:
- preco USD
- variacao 24h
- market cap
- volume 24h
4. Introduzido `systemPrompt` padrao no backend para orientar o modelo a:
- usar tools de mercado em pedidos de resumo/panorama
- evitar recusas genericas quando houver dados disponiveis
5. Evoluido fallback de resumo do Copiloto:
- tenta panorama CoinCap primeiro
- se falhar, cai para snapshot spot com saude operacional
6. Corrigido carregamento de CSS no frontend:
- removido link absoluto `/src/styles.css` do HTML
- adotado import `./styles.css` no entrypoint, permitindo build correto com `base`.
7. Adicionados testes de integracao para:
- fallback CoinCap em `/v1/crypto/spot-price`
- alias de ativo (`pi-network`)
- fallback de resumo de mercado no Copiloto

## Prevencao

1. Fallback para provider secundario e restrito a USD para evitar conversao implicita de moedas sem contrato.
2. Resposta da API preserva campo `provider` para observabilidade e troubleshooting.
3. Tool de panorama usa validacao de schema com Zod para reduzir risco de payload invalido de provider externo.
4. Prompt padrao no backend diminui dependencia de comportamento espontaneo do modelo.
5. Testes de integracao cobrem cenario de degradacao e evitam regressao do fluxo principal.
6. Frontend evita paths absolutos de assets de fonte para nao quebrar em deploy com subpath.

## Impacto

1. Menor incidencia de 503 percebido em consultas spot USD.
2. Melhoria de qualidade em respostas de "resuma o mercado" com dados quantitativos.
3. Maior robustez operacional no Copiloto em cenario de falha parcial de provider.
4. Eliminacao da causa principal de 404 de CSS no frontend publicado em GitHub Pages.
5. Evolucao alinhada ao padrao de governanca arquitetural por ADR sequencial.

## Aditivo (2026-04-02)

1. Ajustado fallback do Copiloto para cobrir respostas de falha operacional sem tool call (`toolCallsUsed=[]`), incluindo frases como:
- "falha ao obter dados do CoinCap"
- "falha ao obter o panorama do mercado"
2. Incluido fallback deterministico para pedido de plano de monitoramento com 3 checkpoints.
3. Adicionado retry com backoff no adapter OpenRouter para reduzir impacto de falhas transientes de rede/provider.
4. Cobertura de testes ampliada para os novos cenarios de fallback.
5. Adicionado retry com backoff no adapter CoinCap para reduzir falhas transientes de mercado em consultas spot e panorama.
6. Ajustada politica de logging do fallback CoinGecko -> CoinCap para classificar como `info` eventos retryable (ex.: `429`, circuito aberto), reduzindo ruido de logs em producao.
7. Ajustado scheduler para classificar falhas retryable de provider como `info`, mantendo `warn` para falhas nao transientes.
8. Fortalecida tipagem do guard de erro retryable no scheduler para manter conformidade com lint estrito sem alterar comportamento funcional.
