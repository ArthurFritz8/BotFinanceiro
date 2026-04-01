# ADR 008 - Whitelist opcional de IP para rotas internas

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo

Adicionar uma segunda camada de protecao nas rotas internas de observabilidade, permitindo limitar acesso por IP alem do token interno.

## Contexto

A autenticacao por token ja estava ativa para endpoints internos, mas ainda era desejavel reforco de perimetro em ambientes com IP fixo conhecido.

## Solucao

1. Adicionada variavel de ambiente `INTERNAL_ALLOWED_IPS` (lista separada por virgula).
2. Guard de rota interna passou a validar se algum IP cliente coletado bate com a whitelist quando ela estiver configurada.
3. Em caso de bloqueio por IP, API retorna erro padronizado `INTERNAL_AUTH_IP_NOT_ALLOWED` com status 403.
4. Se `INTERNAL_ALLOWED_IPS` estiver vazio, comportamento permanece opcional (apenas validacao por token).

## Prevencao

1. Em producao com rede controlada, configurar whitelist para reduzir superficie de ataque.
2. Manter `INTERNAL_API_TOKEN` e whitelist fora do codigo, apenas em ambiente.
3. Revisar periodicamente IPs autorizados para evitar acessos antigos nao removidos.
4. Tratar alteracoes de infraestrutura proxy com cuidado para preservar origem real de IP.

## Impacto

1. Maior robustez na protecao de dados operacionais.
2. Camada adicional de seguranca sem custo de infraestrutura.
3. Compatibilidade com modo atual, pois a whitelist e opcional.