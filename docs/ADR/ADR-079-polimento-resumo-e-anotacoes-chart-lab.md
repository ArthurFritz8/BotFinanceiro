# ADR-079 - Polimento Final do Resumo e Anotacoes do Chart Lab

- Status: Aceito
- Data: 2026-04-24
- Escopo: apps/web (Intelligence Desk, aba Resumo e grafico Insights IA)
- Refs: ADR-068, ADR-069, ADR-070, ADR-077

## Contexto

O prompt de refinamento final solicitou duas entregas:

1. Melhorar densidade visual do Resumo sem aumentar scroll.
2. Reforcar camada de anotacoes no grafico (Entry/TP/SL + Position Tool R:R).

Peer review critico antes da implementacao:

- Item ja existente: o card de pesos do motor ja existia e era adaptativo por snapshot (nao hardcoded), com derivacao por modo operacional.
- Item ja existente: price labels no eixo Y (SUP, RES, ENT LO/ENT HI, STOP, TP1, TP2), caixas SMC/FVG e caixas R:R via Series Primitive ja estavam ativas.
- Veto: usar pesos fixos 35/30/20/15 como verdade absoluta seria anti-pattern e quebraria fail-honest institucional.
- Veto: reescrever arquitetura do chart para overlays DOM/SVG seria regressao de performance; manter primitive em canvas da propria serie.

## Decisao

Aplicar refinamento incremental (sem retrabalho redundante):

1. Renomear e reposicionar semanticamente o card para "Pesos do Motor Algoritmico".
2. Manter pesos efetivos adaptativos por snapshot e expor no UI o perfil-alvo institucional (SMC 35, HFT 30, Harmonica 20, Macro/Micro 15) como referencia visual, sem substituir o calculo real.
3. Incluir leitura de vies bull/bear nas barras do ensemble (`data-bias`) para refletir direcao do sinal no tema visual.
4. Preservar Ghost Tracker como camada de auditoria (extra), separado dos quatro motores nucleares.
5. Melhorar anotacoes no grafico:
   - adicionar linha ENTRY no eixo Y;
   - manter ENT LO/ENT HI para faixa de execucao;
   - centralizar label nas caixas de risco/retorno;
   - elevar opacidade das caixas R:R para 20% para leitura mais clara em dark premium.
6. Nao alterar opacidade baixa de OB/FVG (10%-15%) nem borda fina, mantendo foco no price action.

## Consequencias

Positivas:

- UX mais legivel e compacta no Resumo sem inflar DOM.
- Melhor alinhamento com o briefing visual institucional do prompt.
- Sem regressao de performance no chart (continuamos em primitive canvas).
- Auditoria ghost mantida como diferencial de confianca.

Trade-offs:

- O perfil 35/30/20/15 passa a ser referencia visual, nao regra fixa. Isso evita mentir para o operador em cenarios de baixa confianca.
- A duplicidade ENTRY + ENT LO/ENT HI aumenta densidade no eixo Y, mas melhora leitura de execucao para o usuario avancado.

## Definition of Done

- [x] Peer review aplicado (viabilidade, veto, aprimoramento, fusao).
- [x] Resumo com card de pesos refinado e sem quebra de logica adaptativa.
- [x] Anotacoes do chart com melhoria de leitura R:R e ENTRY.
- [x] ADR sequencial registrada.
- [x] Build validado no apps/web.
- [x] Commit + push com referencia ADR-079.
