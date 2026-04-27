# ADR-113 - Acessibilidade WCAG completa nas tabs principais do Chart Lab Pro

- Status: Aceito
- Data: 2026-04-26
- Personas ativas: Arquiteto Socratico, Frontend Engineer + Especialista em UX/UI.

## Contexto / Observacao

A auditoria do Chart Lab Pro confirmou que as 12 tabs principais (`Resumo`, `Tecnica`, `SMC`, `Harmonicos`, `WEGD`, `Probabilistica`, `Micro-Timing`, `Calculadora`, `Gestao de Risco`, `Timing`, `Visual IA`, `Noticias`) ja' tinham:

- `role="tablist"` no container (`#analysis-tabs`).
- `role="tab"` + `aria-selected` em cada botao (linha ~9136 de `apps/web/src/main.js`).

Faltavam, para conformidade total com **WAI-ARIA Authoring Practices 1.2 (Tabs Pattern)**:

1. `aria-controls` no botao apontando para o tabpanel renderizado.
2. `id` estavel por tab para permitir referencia bidirecional.
3. `tabindex` "roving" (active=0, demais=-1) — leitor de tela navega so' entre tabs com Tab; setas movem entre tabs adjacentes (comportamento ja' parcial via `aria-selected`).
4. `role="tabpanel"` + `aria-labelledby` no container `#analysis-tab-content` apontando para a tab ativa.

Sub-tabs WEGD (`renderWegdSubTabs`) e Fundi Hub (Noticias/Eventos) ja' implementam o padrao completo \u2014 a divergencia era apenas no nivel principal.

## Decisao

### 1. Cada botao de tab principal recebe atributos completos

```js
button.id = `analysis-tab-button-${tab.id}`;
button.setAttribute("role", "tab");
button.setAttribute("aria-selected", isActive ? "true" : "false");
button.setAttribute("aria-controls", "analysis-tab-content");
button.setAttribute("tabindex", isActive ? "0" : "-1");
```

- ID estavel por tab (`analysis-tab-button-resumo`, `analysis-tab-button-smc`, etc.).
- `aria-controls` aponta sempre para o mesmo `#analysis-tab-content` (single-panel implementation).
- `tabindex` roving evita que SR navegue por TODAS as tabs com Tab \u2014 so' entra na ativa, depois usa setas (comportamento padrao do browser para tabs com `role="tab"` + roving tabindex).

### 2. Container `#analysis-tab-content` ganha role + labelledby

`apps/web/index.html`:

```html
<div
  id="analysis-tab-content"
  class="analysis-tab-content"
  role="tabpanel"
  tabindex="0"
  aria-labelledby="analysis-tab-button-resumo"
></div>
```

- `role="tabpanel"` declara a regiao como painel de tab.
- `tabindex="0"` permite focar o painel para SR ler conteudo.
- `aria-labelledby` aponta para a tab ativa \u2014 SR anuncia "Tab Resumo, painel" ao focar.
- Valor inicial (`analysis-tab-button-resumo`) reflete o default `activeAnalysisTabId = "resumo"`.

### 3. Sincronizacao em tempo real

`renderAnalysisTabs()` agora atualiza `aria-labelledby` no painel apos popular os botoes:

```js
if (analysisTabContentElement instanceof HTMLElement) {
  analysisTabContentElement.setAttribute(
    "aria-labelledby",
    `analysis-tab-button-${activeAnalysisTabId}`,
  );
}
```

\u2014 garante que a referencia bidirecional acompanha mudancas de aba sem listener adicional (renderAnalysisTabs ja' e' chamado em todo switch).

## Conformidade

- **WCAG 2.1 AA**: criterio 4.1.2 (Name, Role, Value) \u2014 cada componente UI tem nome programatico, papel e estado expostos via ARIA.
- **WAI-ARIA 1.2 Tabs Pattern**: estrutura agora identica ao padrao de referencia.
- **Zero Budget**: nenhuma dependencia adicionada.
- **Backward compatible**: `data-tab`, `class`, `aria-selected` preservados; codigo que escuta clicks (`closest("[data-tab]")`) continua funcionando.
- **prefers-reduced-motion**: ja' coberto em `styles.css` (18+ media queries) \u2014 nada a alterar aqui.

## Plano / DoD

- [x] `renderAnalysisTabs` adiciona `id`, `aria-controls`, `tabindex` por botao.
- [x] `renderAnalysisTabs` sincroniza `aria-labelledby` no painel.
- [x] `apps/web/index.html` adiciona `role="tabpanel"`, `tabindex="0"`, `aria-labelledby` inicial.
- [x] ADR-113 documenta racional + estrutura.
- [ ] Build `apps/web` verde (sera validado no commit).

## Consequencias

### Positivas

- Operadores que dependem de leitor de tela (NVDA, JAWS, VoiceOver) recebem narracao correta: "Tab Resumo, painel" em vez de "regiao sem nome".
- Conformidade WCAG/ARIA elimina debito tecnico de a11y nas 12 abas do principal modulo (Chart Lab Pro).
- Padronizacao com sub-tabs (WEGD/Fundi Hub) que ja' implementam o padrao.
- Roving tabindex melhora navegacao por teclado: Tab entra/sai do tablist; setas movem entre tabs (comportamento browser padrao).

### Negativas / mitigadas

- IDs longos (`analysis-tab-button-${id}`) inflam levemente o DOM. Negligivel (~30 bytes por tab x 12 = ~360 bytes).
- `aria-controls` aponta sempre para o mesmo painel \u2014 nao cobre arquitetura multi-painel se um dia for adotada. Mitigacao: trivial atualizar quando/se essa arquitetura mudar.
