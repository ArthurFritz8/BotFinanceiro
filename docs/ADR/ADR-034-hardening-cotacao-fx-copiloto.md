# ADR 034 - Hardening de cotacao FX no Copiloto com fallback deterministico

- Data: 2026-04-10
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Eliminar respostas alucinadas de cambio/FX no Copiloto, forcar rastreabilidade de fonte e manter continuidade operacional quando o modelo nao usar tool de mercado.

## Contexto

Mesmo com tool calling read-only ja habilitado, havia risco em perguntas como "quanto esta o dolar agora" quando:

1. o modelo respondia valor direto sem usar tool de FX
2. a resposta nao trazia fonte e timestamp
3. o fallback por intencao podia cair em fluxo generico em vez de cotacao de cambio

O impacto principal era perda de confianca na resposta em cenario de cotacao em tempo real.

## Solucao

1. Prompt padrao do Copiloto reforcado para FX:
- perguntas de dolar/euro/libra/iene e pares cambiais devem usar tool de FX antes da resposta final
- resposta de cotacao deve explicitar fonte e timestamp
2. Detector dedicado de intencao fiat/FX no backend:
- identifica pares explicitos (`USDBRL`, `EURUSD`, `USDJPY`, `USDBRL=X`)
- resolve par padrao por contexto quando o usuario nao informa codigo completo
3. Guarda de qualidade para cotacao de cambio:
- se a pergunta for FX e nao houver tool de FX usada, ativa fallback deterministico
4. Novo fallback local de FX no Copiloto:
- consulta direta por `ForexMarketService.getSpotRate(pair)`
- fallback secundario para `getMarketOverview` quando o par principal falhar
- resposta final sempre com fonte/timestamp e transparencia de indisponibilidade
5. Ajuste de descricoes de tools para orientar uso correto:
- `get_forex_market_snapshot` marcada como tool obrigatoria para cambio
- `search_web_realtime` explicitamente nao prioritaria para cotacao FX quando tool de forex estiver disponivel
6. Cobertura de regressao adicionada:
- novo teste de rota valida que pergunta de dolar sem tool de FX e substituida por fallback deterministico com Yahoo/Forex

## Prevencao

1. Perguntas de cambio nao dependem de comportamento espontaneo do modelo para chamar tool correta.
2. Resposta FX passa a ter trilha minima de auditoria funcional (fonte + horario).
3. Falha de par especifico nao bloqueia completamente a entrega (degrada para panorama).
4. Teste automatizado reduz risco de regressao em prompts futuros.

## Impacto

1. Reducao de alucinacao em cotacao de dolar/FX no chat.
2. Melhora de confianca para uso operacional de respostas de cambio.
3. Maior consistencia entre intencao do usuario, tool usada e fallback aplicado.
4. Evolucao alinhada ao padrao de resiliencia e governanca O.C.S.P. do projeto.
