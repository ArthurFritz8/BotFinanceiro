# ADR-112 - Badge "Sinal Quantitativo" no fallback de noticias

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A aba "Noticias" do Chart Lab Pro tem dois caminhos de render:

1. **Caminho rico** (`renderFundamentalistHubHtml`): quando `newsIntelligencePayload` traz items reais do agregador multi-RSS — mostra sentimento, keywords, narrativa AI, eventos.
2. **Caminho fallback** (linha ~12846 de `apps/web/src/main.js`): quando o feed externo nao retornou itens — exibe apenas `<h4>Noticias e eventos (proxy quantitativo)</h4>` + paragrafo explicativo + lista derivada de `analysis.newsProxy`.

A auditoria identificou um gap fail-honest: o **paragrafo** dizia "Bloco abaixo usa sinais quantitativos reais", mas o bloco visualmente parecia identico a uma lista de noticias normais. Operador apressado podia confundir "sinais derivados" com "manchetes editorial". Em UI premium institucional, indicacao visual semantica (badge) e' superior a explicacao textual longa.

## Decisao

Adicionar badge `Sinal Quantitativo` no header do article de fallback, com estilo destacado (border + fundo ciano translucido) coerente com o sistema de tags ja' existente (`fundi-hub-news-tags`, `fundi-hub-impact-badge`).

### Estrutura

```html
<article class="analysis-block fundi-hub-quant-fallback">
  <header class="fundi-hub-quant-fallback-head">
    <h4>Noticias e eventos (proxy quantitativo)</h4>
    <span class="fundi-hub-quant-badge"
          role="status"
          aria-label="Conteudo derivado de sinais quantitativos, sem feed editorial externo"
          title="Sem feed editorial externo: este bloco lista alertas derivados dos sinais quantitativos calculados para o ativo (ADR-112).">
      Sinal Quantitativo
    </span>
  </header>
  <p>Sem feed externo oficial...</p>
  <ul class="analysis-list">...</ul>
</article>
```

### CSS

Novo bloco em `apps/web/src/styles.css` apos `.fundi-hub-impact-badge`:

- `.fundi-hub-quant-fallback-head`: flex/space-between para alinhar h4 + badge.
- `.fundi-hub-quant-badge`: pill ciano (`rgba(56, 189, 248, 0.14)` + border `0.32`), uppercase, `cursor: help` para indicar tooltip.

Tooltip via `title` expoe contexto ADR sem poluir UI.

### ARIA

- `role="status"` + `aria-label` descritivo: SR anuncia "Conteudo derivado de sinais quantitativos" assim que o bloco entra em foco.
- Mantem semantica fail-honest acessivel — usuario com leitor de tela tem mesma informacao que o visual.

## Conformidade

- **Zero Budget**: nenhuma dependencia adicionada. CSS reusa paleta ciana ja' presente (`#7dd3fc`).
- **Fail-honest**: o badge **nao** infla a percepcao do conteudo (nao diz "AI premium" ou "live"); declara honestamente "este NAO e' feed editorial".
- **Backward compatible**: estrutura externa do article preservada; quem busca por `analysis-block` continua encontrando.
- **Acessibilidade**: ARIA explicito, contraste ciano/fundo escuro >= 4.5:1, sem animacao (zero conflito com `prefers-reduced-motion`).
- **Observancia ao prompt-base**: contradiz o anti-pattern "default 50% generico" (Visual IA, Item 2) — aqui declaramos explicitamente a natureza do conteudo em vez de mascara-lo.

## Plano / DoD

- [x] Adicionar `<header>` + `<span class="fundi-hub-quant-badge">` no fallback de news em `main.js`.
- [x] Adicionar CSS `.fundi-hub-quant-fallback-head` e `.fundi-hub-quant-badge` em `styles.css`.
- [x] ARIA `role="status"` + `aria-label` + `title` tooltip.
- [x] ADR-112 documenta racional + estrutura.
- [ ] Build `apps/web` verde (sera validado no commit).

## Consequencias

### Positivas

- Operador identifica em <1s que o bloco nao e' feed editorial, evitando interpretacao errada de "ausencia de noticias = sem catalisador" como "noticias filtradas".
- Padronizacao: o componente de badge fica disponivel para futuros estados fail-honest similares (ex.: ADR-114 podera reusar mesma classe para Visual IA "insufficient-signal").
- Tooltip + ARIA preservam auditabilidade (mostra ADR-112 ao hover).

### Negativas / mitigadas

- Pequeno aumento de DOM (1 header + 1 span + 1 attribute set). Negligivel.
- Risco de "inflacao de badges" — se cada modulo ganhar seu badge, vira ruido. Mitigacao: badge so em estados de FALLBACK/DEGRADACAO; estado normal nao recebe badge.
