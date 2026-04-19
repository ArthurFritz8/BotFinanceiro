# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps\web\tests\e2e\intelligence-desk-360.spec.mjs >> intelligence desk 360 renderiza 4 KPIs institucionais e badge de confluencia (ADR-048/049)
- Location: apps\web\tests\e2e\intelligence-desk-360.spec.mjs:242:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  143 |   if (url.pathname === "/v1/crypto/intelligence-sync/telemetry") {
  144 |     return fulfillJson(route, {
  145 |       data: { accepted: true, alertLevel: "ok", generatedAt: new Date().toISOString() },
  146 |       status: "success",
  147 |     }, 202);
  148 |   }
  149 | 
  150 |   if (url.pathname === "/v1/binary-options/ghost-audit/history") {
  151 |     return fulfillJson(route, {
  152 |       data: { records: [], summary: { total: 0 } },
  153 |       status: "success",
  154 |     });
  155 |   }
  156 | 
  157 |   if (url.pathname === "/v1/crypto/news-intelligence") {
  158 |     return fulfillJson(route, {
  159 |       data: {
  160 |         fetchedAt: new Date().toISOString(),
  161 |         items: [],
  162 |         summary: { averageImpactScore: 0, averageRelevanceScore: 0, sourcesHealthy: 0, totalSources: 0 },
  163 |       },
  164 |       status: "success",
  165 |     });
  166 |   }
  167 | 
  168 |   if (url.pathname === "/v1/brokers/live-quote/batch" || url.pathname === "/v1/crypto/spot-price/batch") {
  169 |     const assetIdsRaw = url.searchParams.get("assetIds") ?? "";
  170 |     const assetIds = assetIdsRaw
  171 |       .split(",")
  172 |       .map((assetId) => assetId.trim().toLowerCase())
  173 |       .filter((assetId) => assetId.length > 0);
  174 | 
  175 |     return fulfillJson(route, {
  176 |       data: {
  177 |         quotes: assetIds.map((assetId) => ({
  178 |           assetId,
  179 |           quote: {
  180 |             fetchedAt: new Date().toISOString(),
  181 |             market: { changePercent24h: 0.82, price: basePriceByAsset[assetId] ?? 100 },
  182 |             price: basePriceByAsset[assetId] ?? 100,
  183 |             provider: "coingecko",
  184 |           },
  185 |           status: "ok",
  186 |         })),
  187 |         summary: { failed: 0, ok: assetIds.length, successRatePercent: 100, total: assetIds.length, unavailable: 0 },
  188 |       },
  189 |       status: "success",
  190 |     });
  191 |   }
  192 | 
  193 |   if (url.pathname === "/v1/brokers/live-quote/stream" || url.pathname === "/v1/crypto/live-stream") {
  194 |     await route.fulfill({ body: "", contentType: "text/plain", status: 204 });
  195 |     return;
  196 |   }
  197 | 
  198 |   return fulfillJson(route, { data: {}, status: "success" });
  199 | }
  200 | 
  201 | test.beforeEach(async ({ page }) => {
  202 |   await page.addInitScript(() => {
  203 |     const forceHideAuthGate = () => {
  204 |       const authGate = document.querySelector("#auth-gate");
  205 |       if (!(authGate instanceof HTMLElement)) {
  206 |         return;
  207 |       }
  208 |       authGate.classList.add("is-hidden");
  209 |       authGate.setAttribute("aria-hidden", "true");
  210 |       authGate.style.display = "none";
  211 |       authGate.style.pointerEvents = "none";
  212 |     };
  213 | 
  214 |     document.addEventListener("DOMContentLoaded", forceHideAuthGate);
  215 |     new MutationObserver(() => {
  216 |       forceHideAuthGate();
  217 |     }).observe(document.documentElement, {
  218 |       attributeFilter: ["class", "style"],
  219 |       attributes: true,
  220 |       childList: true,
  221 |       subtree: true,
  222 |     });
  223 | 
  224 |     class FakeEventSource {
  225 |       constructor(url) {
  226 |         this.url = url;
  227 |         this.readyState = 1;
  228 |       }
  229 |       addEventListener() {}
  230 |       close() {
  231 |         this.readyState = 2;
  232 |       }
  233 |     }
  234 | 
  235 |     window.EventSource = FakeEventSource;
  236 |     localStorage.setItem("botfinanceiro.app.route.v1", "chart-lab");
  237 |   });
  238 | 
  239 |   await page.route("**/v1/**", handleApiRoute);
  240 | });
  241 | 
  242 | test("intelligence desk 360 renderiza 4 KPIs institucionais e badge de confluencia (ADR-048/049)", async ({ page }) => {
> 243 |   await page.goto("/");
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  244 | 
  245 |   const chartLabRouteButton = page.locator('#app-route-nav button[data-route="chart-lab"]');
  246 |   if (await chartLabRouteButton.count()) {
  247 |     await chartLabRouteButton.first().click();
  248 |   }
  249 | 
  250 |   await expect(page.locator("#chart-controls")).toBeVisible();
  251 |   await expect(page.locator("#chart-status")).toContainText("Grafico", { timeout: 15000 });
  252 | 
  253 |   await page.click('#chart-view-switch .view-chip[data-view="copilot"]');
  254 |   await expect(page.locator("#chart-copilot-stage")).toBeVisible();
  255 | 
  256 |   const summaryGrid = page.locator("#institutional-summary-grid");
  257 |   const kpis = summaryGrid.locator(".institutional-kpi");
  258 | 
  259 |   await expect(kpis).toHaveCount(4, { timeout: 15000 });
  260 | 
  261 |   const expectedTitles = ["Assertividade real", "Estrutura SMC", "Edge probabilistico", "Risco base"];
  262 |   for (const title of expectedTitles) {
  263 |     await expect(summaryGrid.locator(`.institutional-kpi__title:has-text("${title}")`)).toHaveCount(1);
  264 |   }
  265 | 
  266 |   const validTones = ["bull", "bear", "neutral"];
  267 |   for (let index = 0; index < 4; index += 1) {
  268 |     const tone = await kpis.nth(index).getAttribute("data-tone");
  269 |     expect(validTones).toContain(tone);
  270 |   }
  271 | 
  272 |   for (let index = 0; index < 4; index += 1) {
  273 |     const kpi = kpis.nth(index);
  274 |     await expect(kpi.locator(".institutional-kpi__value")).not.toBeEmpty();
  275 |     await expect(kpi.locator(".institutional-kpi__hint")).not.toBeEmpty();
  276 |     const tooltip = await kpi.getAttribute("title");
  277 |     expect(tooltip).toBeTruthy();
  278 |     expect(tooltip?.length ?? 0).toBeGreaterThan(0);
  279 |   }
  280 | 
  281 |   const confluenceBadge = page.locator("#institutional-confluence-badge");
  282 |   await expect(confluenceBadge).toBeVisible();
  283 |   await expect(confluenceBadge.locator(".institutional-confluence-badge__score")).toHaveCount(1);
  284 |   await expect(confluenceBadge.locator(".institutional-confluence-badge__dot")).toHaveCount(5);
  285 | 
  286 |   const scoreAttribute = await confluenceBadge.getAttribute("data-score");
  287 |   expect(scoreAttribute).not.toBeNull();
  288 |   const score = Number(scoreAttribute);
  289 |   expect(Number.isFinite(score)).toBe(true);
  290 |   expect(score).toBeGreaterThanOrEqual(0);
  291 |   expect(score).toBeLessThanOrEqual(5);
  292 | 
  293 |   const badgeTone = await confluenceBadge.getAttribute("data-tone");
  294 |   expect(validTones).toContain(badgeTone);
  295 | });
  296 | 
  297 | test("intelligence desk 360 atualiza KPIs ao trocar de ativo (ADR-048)", async ({ page }) => {
  298 |   await page.goto("/");
  299 | 
  300 |   const chartLabRouteButton = page.locator('#app-route-nav button[data-route="chart-lab"]');
  301 |   if (await chartLabRouteButton.count()) {
  302 |     await chartLabRouteButton.first().click();
  303 |   }
  304 | 
  305 |   await expect(page.locator("#chart-controls")).toBeVisible();
  306 |   await page.click('#chart-view-switch .view-chip[data-view="copilot"]');
  307 | 
  308 |   const summaryGrid = page.locator("#institutional-summary-grid");
  309 |   await expect(summaryGrid.locator(".institutional-kpi")).toHaveCount(4, { timeout: 15000 });
  310 | 
  311 |   const initialFirstValue = await summaryGrid.locator(".institutional-kpi .institutional-kpi__value").first().textContent();
  312 | 
  313 |   await page.selectOption("#chart-asset", "ethereum");
  314 |   await expect(page.locator("#chart-status")).toContainText("ETHEREUM", { timeout: 15000 });
  315 | 
  316 |   await expect(summaryGrid.locator(".institutional-kpi")).toHaveCount(4);
  317 |   const ethFirstValue = await summaryGrid.locator(".institutional-kpi .institutional-kpi__value").first().textContent();
  318 |   expect(ethFirstValue).toBeTruthy();
  319 | 
  320 |   expect(typeof initialFirstValue).toBe("string");
  321 | });
  322 | 
```