# ADR 033 - MemeCoin Radar e Social Sentiment com notification wall resiliente

- Data: 2026-04-05
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Entregar um modulo de descoberta de memes em Solana e Base com priorizacao operacional, sinal de hype com IA e painel de notificacoes acionavel no frontend.

## Contexto

O workspace evoluiu para cobertura multi-mercado e inteligencia de airdrops, mas ainda faltava um fluxo dedicado para memecoins:

1. sem monitoramento de novos pares em Solana/Base
2. sem score tatico de hype para ordenar sinais
3. sem notification wall com pinning para acompanhamento continuo
4. sem endpoint dedicado para UX de radar social

A implementacao precisava manter politica de custo zero e resiliencia em falha parcial de provedores.

## Solucao

1. Criado novo modulo backend `meme_radar` com rotas:
- `GET /v1/meme-radar/notifications`
- `POST /v1/meme-radar/notifications/:notificationId/pin`
2. Discovery de novos pares por chain com GeckoTerminal (`new_pools`) para:
- `solana`
- `base`
3. Enriquecimento de pares com DexScreener para melhorar contexto de:
- liquidez
- volume
- variacao de preco
- links sociais e website
4. Scoring em duas camadas:
- heuristico deterministico (hype/confidence/classification)
- IA opcional via OpenRouter (fallback automatico para heuristica)
5. Notification wall com prioridades (`critical|high|watch`) e suporte a pin por notificacao.
6. Persistencia Postgres adicionada via migration `003_create_meme_radar_tables.sql`:
- `meme_radar_pairs`
- `meme_radar_sentiment_snapshots`
- `meme_radar_notifications`
7. Scheduler dedicado (`meme-radar-sync-job-runner`) integrado ao ciclo de vida da API para refresh periodico.
8. Frontend recebeu painel novo `MemeCoin Radar & Social Sentiment` com:
- filtros por chain/prioridade/pinned
- colunas por prioridade
- botoes de pin/unpin
- acao "Levar ao chat" com prompt contextual

## Prevencao

1. Falha de provider nao interrompe o modulo:
- erros de fonte geram snapshots de status
- fallback para dados armazenados quando refresh falha
2. IA nao obrigatoria:
- sem chave OpenRouter, o fluxo continua com scoring heuristico
3. Persistencia hibrida:
- em erro de Postgres, o modulo degrada para memoria sem derrubar endpoint
4. Cache em memoria com stale strategy reduz burst de chamadas externas.
5. Testes de integracao cobrindo refresh e pinning para reduzir regressao funcional.

## Impacto

1. Workspace passa a ter radar dedicado para discovery de memecoins de curto prazo.
2. Operador ganha priorizacao pratica de sinais em formato de wall acionavel.
3. Chat copiloto passa a receber contexto pronto do card com um clique.
4. Arquitetura permanece alinhada ao padrao modular e ao governanca O.C.S.P.
