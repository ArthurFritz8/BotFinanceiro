# Runbook - Scheduler e Politica de Cotas

## Objetivo
Evitar estouro de limite gratuito sem perder continuidade do servico.

## Classes de atualizacao
1. Quente: ativos em carteira/watchlist.
2. Morna: principais indices e pares relevantes.
3. Fria: metadados, historicos longos, airdrops.

## Frequencias iniciais
1. Quente: 2 a 3 minutos (adaptavel para 5 em baixa volatilidade).
2. Morna em pregao: 5 minutos.
3. Morna fora de pregao: 30 a 60 minutos.
4. Fria: 6 a 24 horas.

## Regras de cota
1. Consumir no maximo 70% da cota diaria de cada provider.
2. Aplicar token bucket por integracao.
3. Espalhar jobs com jitter aleatorio.
4. Priorizar ativos com usuario exposto (carteira/watchlist).

## Fallback e UX
1. Dentro do stale permitido: mostrar ultimo valor valido com selo desatualizado.
2. Acima do stale permitido: status indisponivel.
3. Sempre mostrar timestamp da ultima sincronizacao.

## Operacao em incidente
1. Abrir circuito para provider com falhas consecutivas.
2. Reduzir frequencia para modo economico automaticamente.
3. Reavaliar apos janela de cooldown.
4. Registrar incidente em ADR se houver mudanca estrutural.
