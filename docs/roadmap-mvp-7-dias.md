# Roadmap MVP - 7 dias

## Dia 1 - Fundacao tecnica
1. Configurar monorepo JS/TS.
2. Definir lint, formatacao e scripts de qualidade.
3. Padronizar variaveis de ambiente e politica de segredos.

## Dia 2 - Esqueleto backend
1. Criar bootstrap da API e camada shared.
2. Implementar middleware global de erro e logger centralizado.
3. Definir contrato de resposta padrao para APIs internas.

## Dia 3 - Integracoes externas com blindagem
1. Criar adapters para providers de mercado/cripto.
2. Aplicar validacao estrita de payload externo.
3. Ativar timeout, retry e circuit breaker.

## Dia 4 - Cache e scheduler
1. Implementar cache L1 em memoria com TTL e stale-while-revalidate.
2. Implementar orchestrator de jobs com cotas por provider.
3. Inserir politicas de prioridade por classe de ativo.

## Dia 5 - Modulos de dominio iniciais
1. Entregar modulo crypto e portfolios.
2. Entregar modulo equities com degradacao isolada.
3. Garantir independencia entre modulos em testes.

## Dia 6 - Frontend MVP
1. Criar dashboard com status de frescor por ativo.
2. Exibir estados: atualizado, desatualizado, indisponivel.
3. Implementar consumo resiliente da API.

## Dia 7 - Hardening e Go/No-Go
1. Testes de resiliencia e contratos de integracao.
2. Revisao DoD e checklist de seguranca.
3. Publicar ADRs finais da sprint e preparar deploy gratuito.

## Riscos e mitigacoes
1. Risco de exceder cota: ativar modo economico e reduzir polling.
2. Risco de payload quebrado: validar schema e descartar resposta invalida.
3. Risco de acoplamento indevido: reforcar limites por modulo e contratos.
