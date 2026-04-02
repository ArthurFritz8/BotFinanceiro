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
9. Integrado provider Yahoo Finance no backend para snapshot de mercado global (indices, cambio, juros, commodities e simbolos customizados).
10. Adicionada tool `get_financial_market_snapshot` no Copiloto para perguntas de contexto macro e mercado tradicional.
11. Evoluido prompt padrao para orientar uso de tools alem de cripto e evitar recusa generica em analise de risco de curto prazo.
12. Adicionado fallback por intencao para perguntas de risco (ex.: BTC/ETH curto prazo), com resposta por fatores: volatilidade, liquidez, sinais macro e saude operacional.
13. Cobertura de testes ampliada para novo fallback de risco e para fluxo de tool calling do snapshot financeiro global.
14. Adicionado novo endpoint tecnico `GET /v1/crypto/chart` com historico de preco (CoinGecko) e insights tecnicos calculados no backend (trend, volatilidade, momentum, suporte e resistencia).
15. Integrada tool `get_crypto_chart_insights` no Copiloto para analise de grafico com base em dados estruturados e sem recomendacao de investimento.
16. Adicionado fallback por intencao para perguntas de grafico/tendencia quando o modelo retorna resposta limitante, mantendo resposta util e objetiva.
17. Frontend evoluido com modulo "Chart Lab" (canvas, selecao de ativo/faixa e metricas tecnicas) integrado ao chat via acao "Pedir analise tecnica".
18. Cobertura de testes ampliada para rota de grafico, fallback de analise tecnica e tool calling de insights de grafico.
19. Integrado provider Binance para dados de grafico com klines e ticker 24h, com retry/backoff e mapeamento de simbolos.
20. `CryptoChartService` evoluiu para suportar dois modos: `delayed` e `live`, com fallback CoinGecko -> Binance em `delayed` (USD).
21. Introduzido endpoint `GET /v1/crypto/live-chart` para snapshot quase em tempo real com cache curto (`fresh=8s`, `stale=20s`).
22. Indicadores tecnicos ampliados no backend: EMA (9/21), RSI14, MACD histogram, ATR, confianca e plano tatico (`buy|sell|wait`) com niveis operacionais (entrada, stop, TP1, TP2).
23. Tool `get_crypto_chart_insights` passou a aceitar `mode` (`delayed|live`) e retornar resumo textual com acao tatica e confianca, mantendo carater informativo sem recomendacao de investimento.
24. Frontend Chart Lab passou a oferecer modo `Ao vivo` com polling automatico, metricas tecnicas avancadas e fluxo de pergunta orientado a sinal tatico no chat.
25. Criado modulo de corretoras (`brokers`) com interface padronizada para catalogo e cotacao ao vivo por broker.
26. Introduzidos endpoints `GET /v1/brokers/catalog` e `GET /v1/brokers/live-quote`.
27. Binance passou a ser exposta como broker ativo para cotacao ao vivo (`ticker 24h`) no contrato unificado de corretoras.
28. IQ Option passou a constar no catalogo como conector registrado (`requires_configuration`), com resposta estruturada para evolucao por bridge privada autenticada.
29. Copiloto ganhou nova tool `get_broker_live_quote` para perguntas sobre corretoras e conectividade.
30. Fallback por intencao do Copiloto foi expandido para consultas de corretora (ex.: Binance/IQ Option), reduzindo respostas vazias quando nao houver tool call.
31. Cobertura de testes ampliada para rotas de corretora e fluxo de tool calling/fallback de corretoras no Copiloto.
32. Chart Lab evoluiu para persistir preferencias locais (ativo, modo, range, estilo, exchange, simbolo, overlays, intervalo e view mode) via localStorage, mantendo continuidade de uso entre sessoes.
33. Watchlist passou a sincronizar cotacao live por `GET /v1/brokers/live-quote` com fallback automatico para `GET /v1/crypto/spot-price` quando necessario.
34. Introduzido fallback resiliente no frontend para o grafico: quando `live-chart` falha, o workspace alterna automaticamente para snapshot `delayed` sem interromper a leitura tecnica.
35. Operacao do terminal ganhou atalhos de produtividade (Ctrl+K, Alt+1..6, Alt+V, Alt+R, Alt+F) para reduzir friccao em fluxo profissional.
36. Auto-refresh da watchlist foi desacoplado e calibrado com intervalo minimo para evitar burst de requisicoes, mantendo responsividade sem degradar estabilidade.
37. Interface da watchlist foi refinada com status de sincronizacao, indicador de fonte (live/fallback) e variacao visual por direcao de mercado.
38. Adicionado endpoint batch de corretora `GET /v1/brokers/live-quote/batch` com resposta por ativo (`ok|error|unavailable`) e resumo agregado, evitando falha total em cenarios parciais.
39. Adicionado endpoint batch de spot `GET /v1/crypto/spot-price/batch` com contrato resiliente por ativo e metrica de taxa de sucesso para consumo de UI e observabilidade operacional.
40. Adicionado endpoint `GET /v1/crypto/market-overview` com sintese de mercado (advancers/decliners, media 24h, strongest/weakest, market cap e volume agregados).
41. Frontend da watchlist migrou de chamadas unitarias para pipeline batch-first (broker batch + fallback spot batch), reduzindo fan-out de requisicoes e latencia percebida em sincronizacao.
42. UI da watchlist ganhou estado operacional adicional `config/unavailable`, diferenciando indisponibilidade estrutural de erro transitorio para melhorar triagem em producao.
43. Cobertura de testes ampliada para novos endpoints batch e overview, incluindo validacao de payload e cenario de sucesso parcial.
44. Build, lint/typecheck e suite completa da API foram revalidados apos a mudanca, mantendo baseline de estabilidade para release.
