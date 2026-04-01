# ADR 001 - Politica de Degradacao Graciosa e Controle de Rate Limit

- Data: 2026-04-01
- Status: Aprovado
- Tipo: O.C.S.P. (Objetivo, Contexto, Solucao, Prevencao)

## Objetivo
Definir uma politica unica para manter disponibilidade de dados de mercado e cripto, mesmo com limites gratuitos de APIs externas, sem comprometer estabilidade do ecossistema.

## Contexto
O produto depende de provedores externos com cotas e rate limits variaveis (acoes, B3, Wall Street, Forex, FIIs, cripto, airdrops e DeFi). Em cenarios de estouro de limite, indisponibilidade ou resposta invalida, o sistema nao pode cair em cascata.

## Solucao
1. Adotar degradacao graciosa com fail-open controlado.
2. Servir ultimo valor valido com indicador de desatualizado dentro de uma janela de stale por classe de ativo.
3. Acima da janela de stale, exibir indisponivel sem inventar precos.
4. Isolar modulos por dominio para impedir impacto cruzado.
5. Implementar scheduler com orcamento diario por provedor, token bucket, jitter e backoff exponencial.
6. Validar todo payload externo com schema estrito antes de persistir/processar.

## Prevencao
1. Testes automatizados para cenarios de rate limit, timeout e payload invalido.
2. Circuit breaker por integracao externa.
3. Monitoramento de consumo de cota com alertas em 60%, 80% e 95%.
4. Revisao trimestral das janelas de sincronizacao, TTLs e cotas.
5. Proibicao de dados sensiveis hardcoded; uso estrito de variaveis de ambiente.

## Parametros iniciais aprovados
1. Cripto em carteira: stale ate 10 minutos.
2. B3/Wall Street/FIIs em pregao: stale ate 15 minutos.
3. Forex fora de pico: stale ate 20 minutos.
4. Airdrops e metadados DeFi: stale ate 24 horas.

## Consequencias
- Beneficio: alta disponibilidade percebida com custo zero.
- Risco: usuarios podem operar com dado desatualizado se nao houver UX clara.
- Mitigacao: badges de frescor e timestamp de ultima sincronizacao em toda view de cotacao.
