import { expect, test } from "@playwright/test";

const providerByExchange = {
  auto: "binance",
  binance: "binance",
  bybit: "bybit",
  coinbase: "coinbase",
  kraken: "kraken",
  okx: "okx",
};

const basePriceByAsset = {
  aave: 128.4,
  "avalanche-2": 37.8,
  binancecoin: 603.2,
  bitcoin: 74980.4,
  cardano: 0.74,
  chainlink: 19.6,
  dogecoin: 0.22,
  ethereum: 3610.8,
  solana: 176.9,
  uniswap: 11.8,
  xrp: 1.38,
};

function buildSyntheticPoints(basePrice, range) {
  const pointCount = range === "24h" ? 48 : range === "7d" ? 60 : 72;
  const now = Date.now();

  return Array.from({ length: pointCount }, (_, index) => {
    const oscillation = Math.sin(index / 4) * basePrice * 0.004;
    const drift = ((index - pointCount / 2) / pointCount) * basePrice * 0.006;
    const close = Number((basePrice + oscillation + drift).toFixed(4));
    const open = Number((close - basePrice * 0.0012).toFixed(4));
    const high = Number((Math.max(open, close) + basePrice * 0.0016).toFixed(4));
    const low = Number((Math.min(open, close) - basePrice * 0.0016).toFixed(4));

    return {
      close,
      high,
      low,
      open,
      timestamp: new Date(now - (pointCount - index) * 300000).toISOString(),
      volume: Number((420 + index * 3.2).toFixed(2)),
    };
  });
}

function buildInsights(points) {
  const currentPrice = points[points.length - 1]?.close ?? 0;
  const lowPrice = Math.min(...points.map((point) => point.low));
  const highPrice = Math.max(...points.map((point) => point.high));
  const supportLevel = Number((lowPrice + (highPrice - lowPrice) * 0.25).toFixed(4));
  const resistanceLevel = Number((lowPrice + (highPrice - lowPrice) * 0.75).toFixed(4));
  const entryLow = Number((supportLevel + (resistanceLevel - supportLevel) * 0.22).toFixed(4));
  const entryHigh = Number((entryLow + currentPrice * 0.004).toFixed(4));
  const stopLoss = Number((entryLow - currentPrice * 0.01).toFixed(4));
  const takeProfit1 = Number((entryHigh + currentPrice * 0.012).toFixed(4));
  const takeProfit2 = Number((takeProfit1 + currentPrice * 0.01).toFixed(4));

  return {
    atrPercent: 0.24,
    changePercent: 1.32,
    confidenceScore: 86,
    currentPrice,
    emaFast: Number((currentPrice * 0.998).toFixed(4)),
    emaSlow: Number((currentPrice * 0.993).toFixed(4)),
    highPrice,
    longMovingAverage: Number((currentPrice * 0.991).toFixed(4)),
    lowPrice,
    macdHistogram: 0.34,
    marketSession: {
      liquidityHeat: "high",
      session: "overlap",
      utcHour: 14,
      utcWindow: "13:00-16:00",
    },
    marketStructure: {
      bias: "bullish",
      bosSignal: "bullish",
      chochSignal: "none",
      lastSwingHigh: highPrice,
      lastSwingLow: supportLevel,
      previousSwingHigh: Number((highPrice * 0.992).toFixed(4)),
      previousSwingLow: Number((supportLevel * 0.992).toFixed(4)),
      swingRangePercent: 4.1,
    },
    momentumPercent: 0.58,
    resistanceLevel,
    rsi14: 61.8,
    shortMovingAverage: Number((currentPrice * 0.995).toFixed(4)),
    smcConfluence: {
      components: {
        marketStructure: 31,
        sessionLiquidity: 22,
        volatilityRegime: 14,
      },
      score: 67,
      tier: "high",
    },
    supportLevel,
    tradeAction: "buy",
    tradeLevels: {
      entryZoneHigh: entryHigh,
      entryZoneLow: entryLow,
      stopLoss,
      takeProfit1,
      takeProfit2,
    },
    trend: "bullish",
    volatilityPercent: 2.18,
  };
}

function buildStrategyChartResponse(input) {
  const provider = providerByExchange[input.exchange] ?? "binance";
  const basePrice = basePriceByAsset[input.assetId] ?? 100;
  const points = buildSyntheticPoints(basePrice, input.range);

  return {
    assetId: input.assetId,
    cache: {
      stale: false,
      state: "refreshed",
    },
    currency: "usd",
    fetchedAt: new Date().toISOString(),
    insights: buildInsights(points),
    live: {
      changePercent24h: 1.28,
      source: provider,
      symbol: "BTCUSDT",
      volume24h: 64321.4,
    },
    mode: input.mode,
    points,
    provider,
    range: input.range,
  };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status,
  });
}

async function handleApiRoute(route) {
  const url = new URL(route.request().url());

  if (url.pathname === "/v1/crypto/strategy-chart") {
    const assetId = (url.searchParams.get("assetId") ?? "bitcoin").toLowerCase();
    const range = url.searchParams.get("range") ?? "7d";
    const exchange = (url.searchParams.get("exchange") ?? "auto").toLowerCase();
    const mode = url.searchParams.get("mode") === "live" ? "live" : "delayed";

    return fulfillJson(route, {
      data: buildStrategyChartResponse({
        assetId,
        exchange,
        mode,
        range,
      }),
      status: "success",
    });
  }

  if (url.pathname === "/v1/crypto/news-intelligence") {
    return fulfillJson(route, {
      data: {
        fetchedAt: new Date().toISOString(),
        items: [
          {
            impactScore: 72,
            publishedAt: new Date().toISOString(),
            relevanceScore: 81,
            sentiment: "bullish",
            source: "Market Feed",
            summary: "Fluxo comprador segue dominante no intraday com volatilidade controlada.",
            tags: ["macro", "crypto"],
            title: "Desk synthetic headline",
            url: "https://example.com/news/desk-synthetic",
          },
        ],
        summary: {
          averageImpactScore: 72,
          averageRelevanceScore: 81,
          sourcesHealthy: 5,
          totalSources: 6,
        },
      },
      status: "success",
    });
  }

  if (url.pathname === "/v1/brokers/live-quote/batch") {
    const assetIdsRaw = url.searchParams.get("assetIds") ?? "";
    const assetIds = assetIdsRaw
      .split(",")
      .map((assetId) => assetId.trim().toLowerCase())
      .filter((assetId) => assetId.length > 0);

    return fulfillJson(route, {
      data: {
        quotes: assetIds.map((assetId) => ({
          assetId,
          quote: {
            fetchedAt: new Date().toISOString(),
            market: {
              changePercent24h: 0.82,
              price: basePriceByAsset[assetId] ?? 100,
            },
          },
          status: "ok",
        })),
        summary: {
          failed: 0,
          ok: assetIds.length,
          total: assetIds.length,
          unavailable: 0,
        },
      },
      status: "success",
    });
  }

  if (url.pathname === "/v1/crypto/spot-price/batch") {
    const assetIdsRaw = url.searchParams.get("assetIds") ?? "";
    const assetIds = assetIdsRaw
      .split(",")
      .map((assetId) => assetId.trim().toLowerCase())
      .filter((assetId) => assetId.length > 0);

    return fulfillJson(route, {
      data: {
        quotes: assetIds.map((assetId) => ({
          assetId,
          quote: {
            fetchedAt: new Date().toISOString(),
            price: basePriceByAsset[assetId] ?? 100,
            provider: "coingecko",
          },
          status: "ok",
        })),
        summary: {
          failed: 0,
          ok: assetIds.length,
          successRatePercent: 100,
          total: assetIds.length,
        },
      },
      status: "success",
    });
  }

  if (url.pathname === "/v1/brokers/live-quote/stream" || url.pathname === "/v1/crypto/live-stream") {
    await route.fulfill({
      body: "",
      contentType: "text/plain",
      status: 204,
    });
    return;
  }

  return fulfillJson(route, {
    data: {},
    status: "success",
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const forceHideAuthGate = () => {
      const authGate = document.querySelector("#auth-gate");

      if (!(authGate instanceof HTMLElement)) {
        return;
      }

      authGate.classList.add("is-hidden");
      authGate.setAttribute("aria-hidden", "true");
      authGate.style.display = "none";
      authGate.style.pointerEvents = "none";
    };

    document.addEventListener("DOMContentLoaded", forceHideAuthGate);
    new MutationObserver(() => {
      forceHideAuthGate();
    }).observe(document.documentElement, {
      attributeFilter: ["class", "style"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
      }

      addEventListener() {}

      close() {
        this.readyState = 2;
      }
    }

    window.EventSource = FakeEventSource;
    localStorage.setItem("botfinanceiro.app.route.v1", "chart-lab");
  });

  await page.route("**/v1/**", handleApiRoute);
});

test("intelligence desk acompanha moeda, janela e simbolo com telemetria", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    const authGate = document.querySelector("#auth-gate");

    if (!(authGate instanceof HTMLElement)) {
      return;
    }

    authGate.classList.add("is-hidden");
    authGate.setAttribute("aria-hidden", "true");
    authGate.style.display = "none";
    authGate.style.pointerEvents = "none";
  });

  const chartLabRouteButton = page.locator('#app-route-nav button[data-route="chart-lab"]');

  if (await chartLabRouteButton.count()) {
    await chartLabRouteButton.first().click();
  }

  await expect(page.locator("#chart-controls")).toBeVisible();
  await expect(page.locator("#analysis-panel")).toBeVisible();
  await expect(page.locator("#chart-status")).toContainText("Grafico", {
    timeout: 15000,
  });

  await page.selectOption("#chart-asset", "ethereum");
  await expect(page.locator("#chart-status")).toContainText("ETHEREUM");

  await page.selectOption("#chart-range", "30d");
  await expect(page.locator("#chart-status")).toContainText("30 dias");

  await page.locator('#chart-interval-switch .interval-chip[data-interval="1D"]').click();
  await expect(page.locator("#chart-range")).toHaveValue("90d");
  await expect(page.locator("#chart-status")).toContainText("90 dias");

  await page.fill("#chart-symbol", "AAPL");
  await page.press("#chart-symbol", "Enter");
  await expect(page.locator("#chart-status")).toContainText("Modo simbolo externo ativo no Terminal PRO.");
  await expect(page.locator("#analysis-status")).toContainText("Aguardando dados de grafico");

  const telemetry = await page.evaluate(() => window.__botfinanceiroIntelligenceSyncTelemetry ?? null);

  expect(telemetry).toBeTruthy();
  expect(telemetry.requests).toBeGreaterThan(0);
  expect(telemetry.successRatePercent).toBeGreaterThanOrEqual(0);
  expect(telemetry.p95LatencyMs).toBeGreaterThanOrEqual(0);
});
