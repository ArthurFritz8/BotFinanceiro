# Padrao Obrigatorio de Documentacao e Verificacao

## Objetivo

Garantir que toda mudanca tecnica tenha rastreabilidade completa, validacao minima obrigatoria e prevencao de erros recorrentes.

## Regra principal

Toda alteracao em codigo, configuracao, infraestrutura de build/deploy ou contrato de API deve vir acompanhada de documentacao adequada.

## Matriz de documentacao obrigatoria

1. Mudanca estrutural de arquitetura, provider, contrato publico ou comportamento de modulo:
- ADR sequencial em `docs/ADR/`
- atualizacao no `README.md` quando impactar uso publico

2. Mudanca operacional (deploy, incidentes, troubleshooting, rollback, monitoramento):
- runbook em `docs/runbooks/`

3. Mudanca de feature/release com multiplos arquivos:
- relatorio tecnico de entrega em `docs/runbooks/`
- inventario de arquivos modificados/novos
- evidencias de validacao

4. Mudanca pequena sem impacto estrutural:
- atualizar ao menos um documento de contexto (README ou runbook relevante)

## Checklist obrigatorio antes de finalizar entrega

1. Documentacao
- [ ] existe registro da mudanca (README/runbook/ADR)
- [ ] arquivos e impacto estao descritos
- [ ] plano de rollback foi registrado (quando aplicavel)

2. Qualidade tecnica
- [ ] `npm run check` passou
- [ ] testes relevantes passaram
- [ ] build dos pacotes afetados passou

3. Rastreabilidade
- [ ] lista de variaveis de ambiente alteradas
- [ ] endpoints e contratos impactados
- [ ] riscos e limitacoes conhecidas

4. Prevencao de repeticao de erro
- [ ] licoes aprendidas incorporadas em runbook/checklist
- [ ] se houve mudanca estrutural, ADR criado

## Erros recorrentes a prevenir

1. Modelo OpenRouter invalido em producao
- sempre validar `OPENROUTER_MODEL` com IDs suportados antes de deploy

2. Queda de cotacao por indisponibilidade de provider
- manter fallback de provider e log explicito de origem (`provider`)

3. 404 de asset no frontend publicado em subdiretorio
- evitar paths absolutos de fonte para CSS/JS; usar pipeline de build

4. Flakiness de teste por cache compartilhado
- limpar cache entre testes de integracao

## Evidencias minimas para anexar na entrega

1. saida resumida de:
- `npm run check`
- testes do modulo afetado (ou suite completa)
- build do frontend/backend afetado

2. lista de arquivos alterados (ex.: `git status --short` ou `git diff --name-status`)

## Automacao de prevencao

1. Comando local de guarda:
- `npm run guard:docs`
2. CI executa a mesma regra antes de lint/testes.
3. Se houver mudanca tecnica sem update em `docs/` ou `README.md`, o pipeline falha.

## Template recomendado

Usar o template em `docs/templates/checklist-mudanca.md` para padronizar registro de cada entrega.
