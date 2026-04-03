import assert from "node:assert/strict";
import { after, beforeEach, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { buildApp } = await import("../../../main/app.js");

const app = buildApp();
await app.ready();

const originalFetch = globalThis.fetch;

void beforeEach(() => {
  globalThis.fetch = originalFetch;
});

void after(async () => {
  globalThis.fetch = originalFetch;
  await app.close();
});

void it("GET /v1/brokers/catalog retorna status de conectores", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/catalog",
  });

  assert.equal(response.statusCode, 200);

  const body = response.json<{
    data: {
      brokers: Array<{
        broker: "binance" | "bybit" | "coinbase" | "kraken" | "okx" | "iqoption";
        mode: "proxy" | "public" | "unavailable";
        notes: string;
        status: "active" | "requires_configuration";
      }>;
      fetchedAt: string;
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(Array.isArray(body.data.brokers), true);
  assert.equal(body.data.brokers.length, 6);

  const binanceBroker = body.data.brokers.find((item) => item.broker === "binance");
  const bybitBroker = body.data.brokers.find((item) => item.broker === "bybit");
  const iqOptionBroker = body.data.brokers.find((item) => item.broker === "iqoption");

  assert.equal(binanceBroker?.status, "active");
  assert.equal(binanceBroker?.mode, "public");
  assert.equal(bybitBroker?.status, "active");
  assert.equal(bybitBroker?.mode, "public");
  assert.equal(iqOptionBroker?.status, "requires_configuration");
  assert.equal(iqOptionBroker?.mode, "unavailable");
});

void it("GET /v1/brokers/live-quote retorna cotacao nativa para OKX", async () => {
  let okxCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("www.okx.com/api/v5/market/ticker") && requestUrl.includes("instId=ETH-USDT")) {
      okxCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                instId: "ETH-USDT",
                last: "3200.10",
                open24h: "3130.00",
                volCcy24h: "22000000000",
              },
            ],
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote?broker=okx&assetId=ethereum",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(okxCalls, 1);

  const body = response.json<{
    data: {
      broker: "okx";
      market: {
        changePercent24h: number | null;
        price: number | null;
        symbol: string | null;
      };
      mode: "public";
      status: "active";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.broker, "okx");
  assert.equal(body.data.mode, "public");
  assert.equal(body.data.status, "active");
  assert.equal(body.data.market.symbol, "ETHUSDT");
  assert.equal(body.data.market.price, 3200.1);
  assert.equal(body.data.market.changePercent24h, 2.2396);
});

void it("GET /v1/brokers/live-quote retorna cotacao live da Binance", async () => {
  let tickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      tickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "65432.10",
            priceChangePercent: "1.84",
            symbol: "BTCUSDT",
            volume: "70234.50",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote?broker=binance&assetId=bitcoin",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(tickerCalls, 1);

  const body = response.json<{
    data: {
      assetId: string;
      broker: "binance";
      currency: "usd";
      market: {
        changePercent24h: number | null;
        price: number | null;
        symbol: string | null;
        volume24h: number | null;
      };
      mode: "public";
      status: "active";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.broker, "binance");
  assert.equal(body.data.assetId, "bitcoin");
  assert.equal(body.data.currency, "usd");
  assert.equal(body.data.status, "active");
  assert.equal(body.data.market.symbol, "BTCUSDT");
  assert.equal(body.data.market.price, 65432.1);
});

void it("GET /v1/brokers/live-quote retorna placeholder para IQ Option", async () => {
  let fetchCalls = 0;

  globalThis.fetch = ((input) => {
    fetchCalls += 1;
    return Promise.reject(new Error(`Unexpected fetch URL: ${String(input)}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote?broker=iqoption&assetId=bitcoin",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(fetchCalls, 0);

  const body = response.json<{
    data: {
      broker: "iqoption";
      market: {
        price: null;
        symbol: null;
      };
      mode: "unavailable";
      notes: string;
      status: "requires_configuration";
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.broker, "iqoption");
  assert.equal(body.data.status, "requires_configuration");
  assert.equal(body.data.mode, "unavailable");
  assert.equal(body.data.market.price, null);
  assert.equal(body.data.market.symbol, null);
  assert.match(body.data.notes, /IQ Option/);
});

void it("GET /v1/brokers/live-quote retorna erro quando Binance esta indisponivel", async () => {
  let fetchCalls = 0;

  globalThis.fetch = ((input) => {
    fetchCalls += 1;
    return Promise.reject(new Error(`Binance unavailable for ${String(input)}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote?broker=binance&assetId=bitcoin",
  });

  assert.equal(response.statusCode, 503);
  assert.ok(fetchCalls >= 1);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "BINANCE_UNAVAILABLE");
  assert.equal(body.error.message, "Binance request failed");
});

void it("GET /v1/brokers/live-quote valida broker invalido", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote?broker=bitstamp&assetId=bitcoin",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});

void it("GET /v1/brokers/live-quote/batch retorna sucesso parcial por ativo", async () => {
  let btcTickerCalls = 0;
  let ethTickerCalls = 0;

  globalThis.fetch = ((input) => {
    const requestUrl = String(input);

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=BTCUSDT")) {
      btcTickerCalls += 1;

      return Promise.resolve(
        new Response(
          JSON.stringify({
            lastPrice: "66123.42",
            priceChangePercent: "1.02",
            symbol: "BTCUSDT",
            volume: "54001.10",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );
    }

    if (requestUrl.includes("api.binance.com/api/v3/ticker/24hr") && requestUrl.includes("symbol=ETHUSDT")) {
      ethTickerCalls += 1;

      return Promise.resolve(
        new Response(JSON.stringify({ code: -1001, msg: "Internal error" }), {
          headers: {
            "content-type": "application/json",
          },
          status: 503,
        }),
      );
    }

    return Promise.reject(new Error(`Unexpected fetch URL: ${requestUrl}`));
  }) as typeof fetch;

  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote/batch?broker=binance&assetIds=bitcoin,ethereum",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(btcTickerCalls, 1);
  assert.ok(ethTickerCalls >= 1);

  const body = response.json<{
    data: {
      broker: "binance";
      quotes: Array<{
        assetId: string;
        error: {
          code: string;
          message: string;
        } | null;
        quote: {
          market: {
            symbol: string | null;
          };
        } | null;
        status: "error" | "ok" | "unavailable";
      }>;
      summary: {
        failed: number;
        ok: number;
        successRatePercent: number;
        total: number;
      };
    };
    status: "success";
  }>();

  assert.equal(body.status, "success");
  assert.equal(body.data.broker, "binance");
  assert.equal(body.data.summary.total, 2);
  assert.equal(body.data.summary.ok, 1);
  assert.equal(body.data.summary.failed, 1);
  assert.equal(body.data.summary.successRatePercent, 50);

  const bitcoinQuote = body.data.quotes.find((item) => item.assetId === "bitcoin");
  const ethereumQuote = body.data.quotes.find((item) => item.assetId === "ethereum");

  assert.equal(bitcoinQuote?.status, "ok");
  assert.equal(bitcoinQuote?.quote?.market.symbol, "BTCUSDT");
  assert.equal(bitcoinQuote?.error, null);

  assert.equal(ethereumQuote?.status, "error");
  assert.equal(ethereumQuote?.quote, null);
  assert.equal(ethereumQuote?.error?.code, "BINANCE_BAD_STATUS");
});

void it("GET /v1/brokers/live-quote/batch valida assetIds obrigatorio", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/v1/brokers/live-quote/batch?broker=binance",
  });

  assert.equal(response.statusCode, 400);

  const body = response.json<{
    error: {
      code: string;
      message: string;
    };
    status: "error";
  }>();

  assert.equal(body.status, "error");
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.equal(body.error.message, "Invalid payload");
});
