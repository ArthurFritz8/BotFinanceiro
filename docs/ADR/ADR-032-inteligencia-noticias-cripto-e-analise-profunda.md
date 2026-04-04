# ADR 032 - Inteligencia de noticias cripto e analise profunda sem bloqueio de plano

- Data: 2026-04-04
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Elevar a confiabilidade analitica do workspace de trading, substituindo blocos superficiais de "noticias" por sinais reais multi-fonte e consolidando uma experiencia de analise profunda, completa e sem restricao de plano.

## Contexto

Foi identificado um gap entre UX premium e profundidade real de analise:

1. a UI entregava sinal tecnico e metricas, mas a camada de noticias operava apenas com proxy quantitativo local
2. dashboards de mercado concorrentes exibem muitas secoes "PRO" com pouca rastreabilidade de dados
3. havia demanda explicita por um produto com leitura realmente profissional, sem bloqueio artificial de funcionalidades

O backend ja possuia resiliencia, cache e integracoes de mercado (CoinGecko/Binance/CoinCap/Yahoo), o que permitia expandir para noticias estruturadas sem romper arquitetura.

## Solucao

1. Criado novo servico de backend `CryptoNewsIntelligenceService` com agregacao RSS multi-fonte:
- CoinDesk
- Cointelegraph
- Decrypt
2. Exposto endpoint publico `GET /v1/crypto/news-intelligence` com:
- filtro por `assetId`
- limite configuravel (`limit`)
- contrato estruturado de `items` + `summary`
- scores de relevancia e impacto
- classificacao de sentimento (`positive|neutral|negative`)
- cache com estados (`fresh|refreshed|stale|miss`) usando `memoryCache`
3. Adicionada tolerancia a falha parcial por fonte:
- queda de uma fonte nao derruba resposta total
- resumo informa `sourcesHealthy/totalSources`
4. Frontend do Chart Lab evoluiu com painel `Analise Profunda 360` totalmente desbloqueado, incluindo:
- Resumo
- Tecnica
- SMC
- Harmonicos
- WEGD
- Probabilistica
- Calculadora
- Timing
- Visual IA
- Noticias
5. Aba `Noticias` passou a consumir feed real do novo endpoint e renderizar cards com:
- titulo
- fonte
- horario
- impacto
- relevancia
- sentimento
- tags
- link da fonte
6. Mantido fallback quantitativo local para noticias quando feed externo estiver indisponivel.
7. Cobertura de testes ampliada para o novo endpoint (`crypto-routes.test.ts`), incluindo:
- agregacao com sucesso parcial
- validacao de payload invalido

## Prevencao

1. Endpoint de noticias adota cache e degradacao graciosa para evitar dependencia forte de fontes externas.
2. Parsing RSS sanitiza HTML e normaliza texto para reduzir ruido de formatação e risco de payload sujo.
3. Contrato tipado no backend e testes de integracao evitam regressao silenciosa de schema.
4. Frontend aplica refresh de noticias com janela temporal (throttle) para evitar excesso de requisicoes.
5. Se feed real nao estiver disponivel, o sistema preserva continuidade operacional com leitura quantitativa local, sem "tela vazia".

## Impacto

1. A analise deixa de depender de "informacao decorativa" e passa a combinar tecnica + contexto + eventos reais.
2. Melhora a qualidade da decisao com visao integrada de:
- estrutura tecnica
- probabilidade de cenarios
- risco/retorno
- contexto de noticias
3. UX premium permanece, mas agora com maior rastreabilidade e transparencia de origem de informacao.
4. Plataforma avanca para um padrao mais profissional sem lock de funcionalidades por tier.
