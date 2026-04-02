# Relatorio Completo - Publicacao e Resiliencia do Copiloto (2026-04-01)

## Objetivo

Documentar de ponta a ponta todas as alteracoes tecnicas realizadas para:

1. melhorar qualidade de respostas do Copiloto
2. reduzir erros de disponibilidade (503) em cotacao spot
3. eliminar erro 404 de asset no frontend publicado
4. manter trilha de governanca por ADR

## Resumo executivo

1. Foi integrado provider secundario de mercado (CoinCap) para fallback de cotacao spot em USD.
2. O Copiloto recebeu tool de panorama de mercado e prompt de sistema padrao orientado a dados.
3. Foi implementado fallback de resumo de mercado para evitar resposta generica de recusa.
4. O frontend foi ajustado para build com base path correto em deploy estatico (GitHub Pages).
5. Testes, lint, typecheck e build foram executados com sucesso.
6. ADR sequencial foi criado para governanca da decisao arquitetural.

## Inventario completo de alteracoes

### Arquivos modificados

1. `.env.example`
- Adicionadas variaveis de provider secundario:
- `COINCAP_API_BASE_URL`
- `COINCAP_TIMEOUT_MS`

2. `README.md`
- Incluido ADR 031 na secao de documentacao de decisoes.
- Atualizada lista de tools do Copiloto com `get_crypto_market_overview`.

3. `apps/api/src/modules/copilot/application/copilot-chat-service.ts`
- Adicionado prompt de sistema padrao para guiar respostas do modelo.
- Adicionada tool `get_crypto_market_overview`.
- Implementado fallback de resumo de mercado com prioridade para CoinCap.
- Mantido fallback secundario por snapshot spot + saude operacional.
- Auditoria passou a registrar `preparedInput` com prompt efetivo.

4. `apps/api/src/modules/copilot/interface/copilot-routes.test.ts`
- Adicionado teste de fallback de resumo quando IA retorna recusa generica.
- Ajustado `beforeEach` para limpar cache em memoria e evitar flakiness.

5. `apps/api/src/modules/crypto/application/crypto-spot-price-service.ts`
- Integrado fallback para CoinCap quando CoinGecko falha em consultas USD.
- Atualizado contrato `provider` para `coingecko|coincap`.
- Centralizada estrategia em `fetchSpotPriceWithFallback`.

6. `apps/api/src/shared/cache/memory-cache.ts`
- Adicionado metodo `clear()` para isolamento de testes.

7. `apps/api/src/shared/config/env.ts`
- Adicionadas variaveis de ambiente para CoinCap.

8. `apps/web/index.html`
- Removido link absoluto de CSS de fonte (`/src/styles.css`).

9. `apps/web/src/main.js`
- CSS passou a ser importado no entrypoint (`import "./styles.css"`).

### Arquivos novos

1. `apps/api/src/integrations/market_data/coincap-market-data-adapter.ts`
- Novo adapter CoinCap com:
- `getMarketOverview()`
- `getSpotPriceUsd()`
- mapeamento de aliases (ex.: `pi-network -> pi`)
- validacao de schema com Zod
- tratamento de erros padronizado (`COINCAP_*`)

2. `apps/api/src/modules/crypto/interface/crypto-routes.test.ts`
- Teste de fallback CoinCap quando CoinGecko falha.
- Teste de alias `pi-network` via CoinCap.

3. `docs/ADR/ADR-031-resiliencia-mercado-coincap-e-copiloto.md`
- Decisao arquitetural no padrao O.C.S.P. cobrindo resiliencia de mercado, evolucao do Copiloto e correcao de deploy frontend.

## Impacto quantitativo do diff

1. 9 arquivos modificados + 3 arquivos novos.
2. Delta principal observado no working tree:
- 546 insercoes
- 11 remocoes

## Mudancas funcionais detalhadas

### 1. Resiliencia de cotacao spot

Antes:
1. fluxo dependia de CoinGecko
2. falha/circuito podia resultar em erro para usuario

Depois:
1. para moeda `usd`, tentativa primaria em CoinGecko
2. em falhas `COINGECKO_*`, tentativa automatica em CoinCap
3. resposta preserva `provider` para rastreabilidade

Resultado esperado:
1. queda de incidencia de erro percebido em consultas spot USD

### 2. Qualidade de resposta para resumo de mercado

Antes:
1. em alguns casos o modelo respondia com recusa generica

Depois:
1. prompt padrao orienta uso de tools de dados
2. nova tool `get_crypto_market_overview` entrega dados de mercado (preco, 24h, cap, volume)
3. fallback automatico gera resumo objetivo mesmo quando o modelo recusa

Resultado esperado:
1. respostas mais informativas para pedidos de "resuma o mercado"

### 3. Correcao de 404 no frontend publicado

Antes:
1. CSS referenciado por caminho absoluto de fonte (`/src/styles.css`)
2. em deploy com subdiretorio, podia gerar 404

Depois:
1. CSS empacotado via Vite no build
2. paths respeitam base path configurada

Resultado esperado:
1. eliminacao da principal causa de 404 de asset no web app publicado

## Variaveis de ambiente envolvidas

Novas variaveis:

1. `COINCAP_API_BASE_URL` (default: `https://api.coincap.io/v2`)
2. `COINCAP_TIMEOUT_MS` (default: `5000`)

Variaveis criticas ja existentes para producao publica:

1. `OPENROUTER_API_KEY`
2. `OPENROUTER_MODEL`
3. `CORS_ALLOWED_ORIGINS`
4. `VITE_API_BASE_URL` (frontend)
5. `VITE_BASE_PATH` (frontend em subdiretorio)

## Novas capacidades do Copiloto

Tools disponiveis apos esta entrega:

1. `get_crypto_spot_price`
2. `get_crypto_multi_spot_price`
3. `get_crypto_market_overview`
4. `get_operational_health`
5. `get_crypto_sync_policy`

## Evidencias de validacao

### Testes API

Comando:

```bash
npm run test -w @botfinanceiro/api
```

Resultado:

1. `tests: 35`
2. `pass: 35`
3. `fail: 0`

### Qualidade estatica

Comando:

```bash
npm run check
```

Resultado:

1. lint sem erros
2. typecheck sem erros

### Build frontend

Comando:

```bash
npm run build -w @botfinanceiro/web
```

Resultado:

1. build concluido com sucesso
2. assets gerados em `apps/web/dist/assets`

## Troubleshooting dos erros reportados

### Erro 503

Diagnostico:
1. indisponibilidade/falha de provider de mercado podia impactar cotacao spot

Mitigacao implementada:
1. fallback automatico para CoinCap em USD

Checklist rapido:

```bash
curl -sS -L -m 25 "https://SEU_BACKEND/health"
curl -sS -L -m 25 "https://SEU_BACKEND/v1/crypto/spot-price?assetId=bitcoin&currency=usd"
```

### Erro 404 no frontend

Diagnostico:
1. referenciamento absoluto de asset de fonte em deploy com subpath

Mitigacao implementada:
1. CSS importado no entrypoint do Vite para path final correto no build

Checklist rapido:

```bash
npm run build -w @botfinanceiro/web
```

Verificar em `apps/web/dist/index.html` se CSS/JS apontam para `assets/...`.

## Procedimento de deploy recomendado

1. Publicar backend no Render com as alteracoes.
2. Validar variaveis:
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `COINCAP_API_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
3. Publicar frontend no GitHub Pages/host estatico com `VITE_API_BASE_URL` correto.
4. Validar manualmente prompts:
- "Resuma o mercado cripto de hoje em 5 linhas"
- "Qual o preco do bitcoin em usd agora?"
- "Qual o preco da PI NETWORK no momento?"

## Plano de rollback

1. Backend:
- reverter commit de integracao CoinCap e fallback no spot price
- manter apenas caminho CoinGecko original

2. Copiloto:
- remover tool `get_crypto_market_overview`
- remover prompt padrao e fallback de resumo

3. Frontend:
- manter import de CSS no entrypoint (nao reverter para link absoluto)

## Riscos e limitacoes conhecidas

1. Fallback CoinCap atualmente cobre consultas em USD.
2. Panorama de mercado depende da disponibilidade do endpoint publico CoinCap.
3. Resumo de mercado continua sem camada de noticias/sentimento; foco atual e dados quantitativos de mercado.

## Governanca

1. Decisao arquitetural registrada em ADR sequencial:
- `docs/ADR/ADR-031-resiliencia-mercado-coincap-e-copiloto.md`
2. Este documento funciona como trilha operacional detalhada da entrega.

## Aditivo de governanca documental (2026-04-01)

Para evitar repeticao de falhas de processo (mudanca sem documentacao completa), foi incorporado um padrao obrigatorio de documentacao e auto-verificacao no proprio repositorio.

Artefatos adicionados/atualizados:

1. Runbook oficial de regra obrigatoria:
- `docs/runbooks/padrao-obrigatorio-documentacao-e-verificacao.md`
2. Template padrao de checklist por mudanca:
- `docs/templates/checklist-mudanca.md`
3. Template de Pull Request com checklist obrigatorio:
- `.github/pull_request_template.md`
4. Atualizacao da definicao de pronto arquitetural:
- `docs/architecture/modular-monolith-clean-architecture.md`
5. Atualizacao do README com links para o padrao e templates:
- `README.md`
6. Guard automatico em pipeline para bloquear mudanca tecnica sem documentacao:
- `scripts/guard-documentation.mjs`
- `package.json` (script `guard:docs`)
- `.github/workflows/ci.yml` (step `Documentation guard`)

Objetivo do aditivo:

1. padronizar registro de mudancas em toda entrega
2. forcar evidencias de validacao tecnica antes de publicar
3. reduzir erros reincidentes de deploy/configuracao/documentacao

## Aditivo de correcao operacional (2026-04-02)

### Contexto observado em producao

1. `GET /v1/crypto/spot-price` estava funcional para BTC/PI.
2. Para prompts de resumo/plano, o modelo retornava mensagens de falha do tipo:
- "Ocorreu uma falha ao obter dados do CoinCap..."
- "Ocorreu uma falha ao obter o panorama do mercado..."
3. Em varios casos, `toolCallsUsed` vinha vazio (sem chamada de tool), degradando a experiencia.
4. O frontend tambem apresentou erro eventual "OpenRouter request failed" (falha transiente de rede/provider).

### Correcao aplicada

1. Hotfix de fallback por intencao no Copiloto:
- se resposta vier com assinatura de falha generica e sem tool call:
	- para intencao de resumo de mercado: gera fallback deterministico de resumo
	- para intencao de plano de monitoramento: gera plano deterministico com 3 checkpoints
2. Ampliada deteccao de respostas de falha para incluir frases de erro operacional (CoinCap/panorama/tente novamente).
3. Adicionado retry com backoff no adapter OpenRouter para reduzir falhas transientes de request.
4. Cobertura de testes ampliada para:
- fallback de resumo com frase real de falha CoinCap
- fallback de plano de monitoramento com checkpoints

### Evidencias da correcao

1. `npm run test -w @botfinanceiro/api`: `tests: 36`, `pass: 36`, `fail: 0`.
2. `npm run check`: concluido sem erros.
3. `npm run guard:docs`: validado apos atualizar este documento.

## Aditivo de resiliencia de scheduler e logs operacionais (2026-04-02)

### Contexto observado em producao

1. O servico estava Live e funcional, mas com logs em vermelho durante ciclos de scheduler.
2. Ocorrencias principais:
- CoinGecko com `429` (rate limit)
- CoinCap com indisponibilidade transitoria (`COINCAP_UNAVAILABLE`)
3. Esses cenarios sao esperados em integracoes externas e nao devem ser tratados como erro operacional critico quando classificados como retryable.

### Correcao aplicada

1. `CoinCapMarketDataAdapter` passou a usar retry com backoff exponencial para chamadas HTTP transientes.
2. `CryptoSpotPriceService` passou a registrar fallback CoinGecko -> CoinCap como `info` quando a falha de origem e retryable (ex.: 429/circuit open), mantendo `warn` para falhas nao transientes.
3. `CryptoSyncJobRunner` passou a registrar como `info` falhas retryable de providers durante refresh do scheduler, reduzindo ruído de logs sem mascarar erro real.
4. Tipagem do guard de erro retryable no scheduler foi fortalecida para remover uso inseguro de erro desconhecido em lint (`no-unsafe-assignment`).

### Evidencias da correcao

1. `npm run check`: concluido com sucesso (lint + typecheck).
2. `npm run guard:docs`: concluido com sucesso apos este aditivo.

### Resultado esperado

1. Menos alertas falsos em observabilidade de producao para falhas transientes de provider.
2. Preservacao da telemetria util para troubleshooting com menor ruido visual em operacao diaria.

## Aditivo de cobertura de mercado global e fallback de risco (2026-04-02)

### Contexto observado em uso real

1. Perguntas de risco de curto prazo (ex.: Bitcoin/Ethereum) ainda podiam receber resposta limitante do tipo "nao posso fornecer analise de risco".
2. A capacidade do Copiloto estava concentrada em cripto, com baixa cobertura para mercado tradicional (indices, cambio, juros e commodities).

### Correcao aplicada

1. Novo adapter `YahooMarketDataAdapter` com retry/backoff para snapshot de mercado global.
2. Nova tool `get_financial_market_snapshot` para consultas de:
- indices globais e locais
- cambio
- juros
- commodities
- simbolos customizados do Yahoo Finance
3. Prompt padrao do Copiloto evoluido para priorizar a nova tool em perguntas macro e de mercado tradicional.
4. Fallback por intencao para analise de risco de curto prazo:
- aciona quando o modelo retorna resposta limitante
- produz resposta objetiva por fatores (volatilidade, liquidez, sinais macro e saude operacional)
5. Ambiente atualizado com timeout dedicado para Yahoo (`YAHOO_FINANCE_TIMEOUT_MS`).

### Evidencias da correcao

1. Teste de fallback de risco adicionado e validado em `POST /v1/copilot/chat`.
2. Teste de tool calling para snapshot financeiro global adicionado e validado em `POST /v1/copilot/chat`.
3. Validacao final executada com sucesso: testes da API, check (lint/typecheck) e guard de documentacao.

### Resultado esperado

1. Reducao significativa de respostas "nao pode" em perguntas analiticas de risco.
2. Cobertura mais ampla de mercado financeiro (alem de cripto) no fluxo normal do Copiloto.
3. Maior utilidade pratica para tomada de decisao informada, mantendo neutralidade e sem recomendacao de investimento.

## Aditivo de analise grafica profissional e UX inovadora (2026-04-02)

### Objetivo

1. Evoluir o produto de chat para uma experiencia de analise tecnica acionavel, com visualizacao de grafico e interpretacao automatica por IA.

### Correcao aplicada

1. Novo adapter `CoinGeckoMarketChartAdapter` para historico de preco com retry/backoff.
2. Novo service `CryptoChartService` com cache e indicadores objetivos:
- trend
- volatilidade
- momentum
- suporte/resistencia
3. Novo endpoint tecnico:
- `GET /v1/crypto/chart?assetId=bitcoin&currency=usd&range=7d`
4. Nova tool do Copiloto:
- `get_crypto_chart_insights`
5. Fallback por intencao para perguntas de grafico quando o modelo retorna resposta limitante.
6. Frontend evoluido com modulo `Chart Lab`:
- grafico em canvas
- seletor de ativo e faixa temporal (24h, 7d, 30d, 90d, 1y)
- metricas tecnicas em cards
- botao "Pedir analise tecnica" integrado ao chat

### Evidencias da correcao

1. Teste novo da rota `GET /v1/crypto/chart` validado.
2. Teste novo de fallback local para analise de grafico no Copiloto validado.
3. Teste novo de tool calling `get_crypto_chart_insights` validado.
4. Suite da API validada com sucesso apos ampliacao: `tests: 41`, `pass: 41`, `fail: 0`.
5. `npm run check` e `npm run guard:docs` concluidos com sucesso.

### Resultado esperado

1. Usuario consegue visualizar contexto tecnico sem sair da plataforma.
2. Chat deixa de responder apenas com limitacao e passa a entregar leitura tecnica estruturada para perguntas de grafico.
3. A experiencia combina analise qualitativa (IA) e quantitativa (indicadores), elevando maturidade profissional do produto.

## Aditivo de grafico ao vivo, sinal tatico e integracao Binance (2026-04-02)

### Objetivo

1. Entregar experiencia real de grafico ao vivo no produto, com analise tecnica mais profunda e resposta operacional para perguntas "comprar ou vender" em formato informativo.

### Correcao aplicada

1. Novo adapter `BinanceMarketDataAdapter` com:
- klines para historico
- ticker 24h para mudanca/volume
- retry com backoff e tratamento de erros `BINANCE_*`
2. `CryptoChartService` reescrito para:
- `mode=delayed` (CoinGecko com fallback para Binance em USD)
- `mode=live` (Binance)
- indicadores adicionais: EMA, RSI14, MACD histogram, ATR
- sinal tatico `tradeAction` (`buy|sell|wait`) com `confidenceScore`
- niveis operacionais: `entryZone`, `stopLoss`, `takeProfit1`, `takeProfit2`
3. Novo endpoint:
- `GET /v1/crypto/live-chart?assetId=bitcoin&range=24h`
4. Copiloto evoluido:
- tool `get_crypto_chart_insights` passou a aceitar `mode` (`delayed|live`)
- fallback por intencao para grafico/compra-venda agora inclui sinal tatico, confianca e niveis
5. Frontend Chart Lab evoluido:
- seletor de modo `Delay`/`Ao vivo`
- polling automatico em modo live
- exibicao de metricas avancadas (EMA/RSI/MACD/ATR, acao, confianca e niveis)

### Evidencias da correcao

1. API tests atualizados e validados com novos cenarios:
- fallback CoinGecko -> Binance em `GET /v1/crypto/chart`
- novo endpoint `GET /v1/crypto/live-chart`
- fallback do Copiloto para pergunta de comprar/vender em modo live
2. Resultado da suite API apos atualizacao:
- `tests: 44`
- `pass: 44`
- `fail: 0`
3. `npm run check` concluido com sucesso (lint + typecheck).
4. `npm run build -w @botfinanceiro/web` concluido com sucesso apos evolucao do Chart Lab.

### Resultado esperado

1. Melhor aderencia ao pedido de uso "ao vivo" com pipeline dedicado e resiliente.
2. Respostas mais acionaveis no chat para perguntas de direcao de mercado, mantendo neutralidade e sem recomendacao financeira.
3. Menor fragilidade em ativos sujeitos a indisponibilidade temporaria de provider unico.
