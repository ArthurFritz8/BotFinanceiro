# ADR 028 - Tool de comparativo multi-ativos no Copiloto

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Permitir consultas comparativas entre multiplos ativos cripto no Copiloto, com saida estruturada e tabela para melhorar clareza da resposta final.

## Contexto

Com o tool calling read-only habilitado, havia suporte para cotacao individual (`get_crypto_spot_price`), mas ainda faltava uma ferramenta dedicada para comparacao de varios ativos na mesma consulta.

## Solucao

1. Adicionada a tool `get_crypto_multi_spot_price` no `CopilotChatService`.
2. Entrada validada com Zod:
- `assetIds` obrigatorio (2 a 8 ativos, com deduplicacao)
- `currency` opcional
3. Execucao concorrente por ativo usando `CryptoSpotPriceService`.
4. Retorno estruturado com:
- ranking por preco
- linhas de sucesso/falha
- `tableMarkdown` para tabulacao no contexto do modelo
5. Teste de integracao cobrindo fluxo com tool call + fetch de CoinGecko mockado.

## Prevencao

1. Limites de tamanho para evitar payload excessivo (maximo de 8 ativos).
2. Falha por ativo nao interrompe comparativo inteiro: erros sao retornados por item.
3. Mantida politica read-only, sem operacoes de escrita.

## Impacto

1. Melhora a capacidade analitica do Copiloto em perguntas de comparacao direta.
2. Aumenta consistencia de resposta ao fornecer dados tabulares para o modelo.
3. Reforca rastreabilidade operacional via `toolCallsUsed` no contrato de resposta.
