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
45. Corrigida indisponibilidade do Terminal PRO no frontend por substituicao de inicializacao JS fragil por embed estavel, eliminando erro runtime recorrente (`this.create is not a function`) em cenarios de refresh/troca rapida de contexto.
46. Trading Workspace passou a aplicar simbolo por corretora (ex.: conversao USDT->USD em exchanges selecionadas), tornando a troca de corretora funcional no terminal e na watchlist.
47. Catalogo de brokers foi expandido para `bybit`, `coinbase`, `kraken` e `okx`, com contrato unificado e modo `proxy` resiliente para cotacao publica quando feed nativo nao estiver disponivel.
48. Endpoint de corretora (`live-quote` e `live-quote/batch`) passou a suportar as novas corretoras e resposta resiliente por ativo, reduzindo indisponibilidade total em regioes com bloqueio de provider.
49. Chart Lab passou a tratar modo `live` por capacidade de exchange: quando live nativo nao for suportado, aplica fallback delayed automatico com mensagem operacional clara.
50. Auto-refresh de watchlist e grafico foi desacoplado da dependencia estrita de `live`, evitando percepcao de congelamento quando a sessao opera em delayed resiliente.
51. Visual do grafico interativo foi corrigido para estilos `bars` e `heikin` com renderizacao real (incluindo transformacao Heikin-Ashi), removendo inconsistencias de modo/visual.
52. Fluxo de erro do grafico ganhou contingencia: em falha de historico, o frontend preserva ultimo snapshot valido e/ou exibe snapshot de contingencia baseado em spot para nao deixar tela vazia.
53. Copiloto recebeu guarda de qualidade para intencao de grafico: quando resposta vier desalinhada (ex.: risco generico sem leitura tecnica), o fallback tecnico estruturado e forçado automaticamente.
54. Prompt de acao "Pedir analise tecnica" foi reforcado com contexto de corretora, exigencia de fallback explicito e foco em sinais tecnicos completos (RSI, MACD, ATR, suporte/resistencia e plano tatico).
55. Modulo de corretoras evoluiu para cotacao nativa por exchange (`bybit`, `coinbase`, `kraken`, `okx`) via novo adapter multi-provider, reduzindo dependencia exclusiva de feed proxy.
56. Fluxo de cotacao nativa ganhou fallback automatico para CoinCap no backend quando endpoint da exchange falha, preservando continuidade operacional sem interromper a watchlist.
57. Catalogo de corretoras foi atualizado para refletir modo `public` nas exchanges com feed nativo ativo, mantendo `iqoption` como `requires_configuration`.
58. Endpoint de stream em tempo real foi adicionado em `GET /v1/brokers/live-quote/stream` (SSE) com snapshots periodicos, keepalive e payload sequenciado para consumo resiliente no frontend.
59. Watchlist do frontend passou a operar em modo stream-first (SSE) com fallback automatico para polling quando necessario, reduzindo latencia percebida e burst de requisicoes em sincronizacao.
60. Adicionado painel operacional em tempo real na watchlist com diagnostico visual de transporte, latencia, modo de provider, taxa de fallback e taxa de falhas.
61. Pipeline de sincronizacao da watchlist foi refatorado para reaproveitar processamento batch/fallback tanto em polling quanto em stream, mantendo consistencia de status e renderizacao.
62. Testes de brokers foram atualizados para validar cotacao nativa OKX e novo estado de catalogo (`public`) nas exchanges com integracao ativa.
63. Adicionada instrumentacao dedicada do stream SSE de corretoras com store in-memory de metricas (conexoes abertas/ativas/fechadas, snapshots publicados, erros e keepalive) por broker e consolidado global.
64. Exposto endpoint interno autenticado `GET /internal/health/streams/brokers` para observabilidade operacional do stream, incluindo timestamps de ultimo snapshot/erro/keepalive por corretora.
65. Adapter multi-exchange evoluiu para candles nativos (`market chart`) em `bybit`, `coinbase`, `kraken` e `okx`, com normalizacao OHLCV e retry resiliente para falhas transientes.
66. Endpoint `GET /v1/crypto/live-chart` passou a aceitar `exchange` (`binance|bybit|coinbase|kraken|okx`) e a servir snapshot live nativo por corretora, com cache segmentado por broker.
67. Frontend Chart Lab passou a enviar `exchange` no fluxo live e habilitar live nativo para as corretoras suportadas; cobertura de testes foi ampliada para `exchange=okx` e validacao de exchange invalida.
68. Adicionado store de observabilidade para live-chart com agregacao de latencia por corretora (requests, sucesso/erro, taxa de sucesso, media e p95), instrumentado no refresh live do backend.
69. Exposto endpoint interno autenticado `GET /internal/health/live-chart/crypto` para diagnostico operacional do live-chart por exchange.
70. Cobertura de integracao ampliada para simular troca rapida de exchange no live-chart e validar isolamento de cache por broker, evitando contaminacao entre Binance e exchanges nativas.
71. Corrigido fluxo do Copiloto para propagar `exchange/broker` no tool `get_crypto_chart_insights` em modo `live`, eliminando divergencia entre contexto do usuario (ex.: Bybit) e resposta analitica baseada em Binance.
72. Fallback tecnico de grafico no Copiloto foi ajustado para resolver corretora a partir da mensagem e consultar `live-chart` no broker correto antes de compor insights.
73. Adicionado modulo de inteligencia de airdrops com agregacao multi-fonte (`airdrops.io`, `airdropalert`, `DefiLlama`, `CoinGecko trending`), scoring (0-100), nivel de confianca e tarefas sugeridas por oportunidade.
74. Exposto endpoint `GET /v1/airdrops/opportunities` com filtro por `query`, `minScore`, `limit` e controle de oportunidades especulativas (`includeSpeculative`), mantendo resposta resiliente em sucesso parcial por fonte.
75. Copiloto recebeu nova tool read-only `get_airdrop_opportunities` e fallback por intencao para perguntas de airdrop, reduzindo respostas vazias quando o modelo nao usa tool call.
76. Frontend foi ajustado para posicionar o card "Atalhos Inteligentes" na lateral direita em desktop e incluir atalho rapido para radar de airdrops; texto do modo live passou a refletir operacao por corretora.
77. Adicionado store de observabilidade dedicado a inteligencia de airdrops com metricas por fonte (requests, sucesso/erro, latencia media/p95, ultimo erro e volume de itens).
78. Exposto endpoint interno autenticado `GET /internal/health/airdrops` para diagnostico operacional do pipeline de discovery de airdrops, incluindo fontes premium quando configuradas.
79. Modulo de airdrops evoluiu para suportar fontes premium com API key (`drops_tab`, `earnifi`) em modo opcional, mantendo degradacao graciosa e sem quebrar o fluxo base quando desativadas.
80. Frontend ganhou painel dedicado "Radar de oportunidades" dentro do Chart Lab com filtros de chain, confianca, score minimo e busca textual, consumindo o endpoint de airdrops e exibindo cards operacionais com tarefas acionaveis.
81. Exposto endpoint interno autenticado `GET /internal/health/airdrops.csv` para exportacao operacional do estado de airdrops (linha global + fontes), facilitando auditoria e ingestao por ferramentas externas.
82. Frontend do radar de airdrops recebeu acao direta por card ("Levar ao chat"), preenchendo prompt contextual no composer para acelerar analise de elegibilidade, risco operacional e red flags.
83. Endpoint `GET /v1/airdrops/opportunities` foi ampliado com filtros avancados (`chain`, `confidence`, `sources`) e ordenacao configuravel (`sortBy=score|recent`), reduzindo pos-processamento externo e melhorando consultas operacionais segmentadas.
84. Observabilidade interna evoluiu com exportacoes CSV adicionais: `GET /internal/health/streams/brokers.csv` e `GET /internal/health/live-chart/crypto.csv`, padronizando ingestao em pipelines de auditoria e monitoramento.
85. Radar de airdrops no frontend passou a persistir filtros em storage local e ganhou acao "Copiar prompt" por card, acelerando fluxos de analise fora do composer sem perda de contexto.
86. Plataforma recebeu modulo dedicado de Forex com endpoints `GET /v1/forex/spot-rate`, `GET /v1/forex/spot-rate/batch` e `GET /v1/forex/market-overview`, incluindo suporte a presets regionais e resposta resiliente em sucesso parcial.
87. Plataforma recebeu modulo dedicado de Futuros com adapter Binance Futures e endpoints `GET /v1/futures/snapshot`, `GET /v1/futures/snapshot/batch` e `GET /v1/futures/market-overview`, expondo preco, funding, mark/index price e open interest por contrato.
88. Copiloto IA foi expandido com novas tools read-only `get_forex_market_snapshot` e `get_futures_market_snapshot`, habilitando analise multi-mercado (spot FX + derivativos) no mesmo fluxo conversacional.
89. Frontend ganhou atalhos inteligentes para prompts de Forex e Futuros, reduzindo tempo de operacao para consultas multi-classe sem alterar o fluxo principal do chat.
90. Plataforma recebeu modulo dedicado de B3 com endpoints `GET /v1/b3/snapshot`, `GET /v1/b3/snapshot/batch` e `GET /v1/b3/market-overview`, com presets para blue chips, indices, dividendos e mid caps.
91. Plataforma recebeu modulo dedicado de FIIs com endpoints `GET /v1/fiis/snapshot`, `GET /v1/fiis/snapshot/batch` e `GET /v1/fiis/market-overview`, incluindo cestas de liquidez, tijolo e papel.
92. Plataforma recebeu modulo dedicado de equities globais com endpoints `GET /v1/equities/snapshot`, `GET /v1/equities/snapshot/batch` e `GET /v1/equities/market-overview`, ampliando cobertura para mercado acionario internacional.
93. Plataforma recebeu modulo dedicado de Wall Street com endpoints `GET /v1/wall-street/snapshot`, `GET /v1/wall-street/snapshot/batch` e `GET /v1/wall-street/market-overview`, cobrindo indices, setores, curva de juros e fatores de risco.
94. Plataforma recebeu modulo dedicado de DeFi com endpoints `GET /v1/defi/spot-rate`, `GET /v1/defi/spot-rate/batch` e `GET /v1/defi/market-overview`, consolidando tokens de DEX, lending e infraestrutura.
95. Copiloto IA foi expandido com cinco novas tools read-only (`get_b3_market_snapshot`, `get_fiis_market_snapshot`, `get_equities_market_snapshot`, `get_wall_street_market_snapshot` e `get_defi_market_snapshot`) para analise multi-mercado no mesmo fluxo conversacional.
96. Frontend ganhou novos atalhos inteligentes para B3, FIIs, equities globais, Wall Street e DeFi, reduzindo friccao operacional para consultas entre classes de ativos sem alterar o fluxo principal do chat.
97. Plataforma recebeu modulo dedicado de Opcoes com endpoints `GET /v1/options/snapshot`, `GET /v1/options/snapshot/batch` e `GET /v1/options/market-overview`, incluindo proxy de volatilidade implicita via VIX e estimativa de move esperado por vencimento.
98. Plataforma recebeu modulo dedicado de Commodities com endpoints `GET /v1/commodities/snapshot`, `GET /v1/commodities/snapshot/batch` e `GET /v1/commodities/market-overview`, cobrindo metais, energia e agro por cestas tematicas.
99. Plataforma recebeu modulo dedicado de Renda Fixa com endpoints `GET /v1/fixed-income/snapshot`, `GET /v1/fixed-income/snapshot/batch` e `GET /v1/fixed-income/market-overview`, incluindo buckets de duration e inclinação de curva `10y-5y`.
100. Copiloto IA foi expandido com novas tools read-only (`get_options_market_snapshot`, `get_commodities_market_snapshot` e `get_fixed_income_market_snapshot`), elevando a cobertura multi-mercado para derivativos e macro rates no mesmo fluxo conversacional.
101. Frontend ganhou novos atalhos inteligentes para Opcoes, Commodities e Renda Fixa, reduzindo tempo operacional para consultas interclasse sem alterar o fluxo principal do chat.
