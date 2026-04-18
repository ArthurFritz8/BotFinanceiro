import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { JsonlTradeStore } = await import(
  "../infrastructure/jsonl-trade-store.js"
);
const { PaperTradingService } = await import("./paper-trading-service.js");

void describe("PaperTradingService", () => {
  let tmpDir: string;
  let store: InstanceType<typeof JsonlTradeStore>;
  let service: InstanceType<typeof PaperTradingService>;
  let now: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "paper-trading-test-"));
    store = new JsonlTradeStore(join(tmpDir, "trades.jsonl"));
    now = 1_700_000_000_000;
    service = new PaperTradingService({ store, clock: () => now });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  void it("openTrade: cria trade aberto e persiste", () => {
    const trade = service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
      confluenceScore: 4,
    });
    assert.equal(trade.status, "open");
    assert.equal(trade.pnlPercent, null);
    assert.equal(store.size(), 1);
  });

  void it("evaluatePrice: long bate target -> win com pnl positivo", () => {
    const trade = service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    now += 60_000;
    const results = service.evaluatePrice({ asset: "bitcoin", price: 110 });
    assert.equal(results.length, 1);
    assert.equal(results[0]?.outcome, "win");
    assert.equal(results[0]?.trade.id, trade.id);
    assert.equal(results[0]?.trade.status, "win");
    assert.equal(results[0]?.trade.pnlPercent, 10);
    assert.equal(results[0]?.trade.exitPrice, 110);
  });

  void it("evaluatePrice: long bate stop -> loss com pnl negativo", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    const [result] = service.evaluatePrice({ asset: "bitcoin", price: 95 });
    assert.equal(result?.outcome, "loss");
    assert.equal(result?.trade.pnlPercent, -5);
  });

  void it("evaluatePrice: short bate target (preco cai) -> win", () => {
    service.openTrade({
      asset: "ethereum",
      side: "short",
      entryPrice: 200,
      stopPrice: 210,
      targetPrice: 180,
    });
    const [result] = service.evaluatePrice({ asset: "ethereum", price: 180 });
    assert.equal(result?.outcome, "win");
    assert.equal(result?.trade.pnlPercent, 10);
  });

  void it("evaluatePrice: preco entre stop e target -> trade segue aberto", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    const [result] = service.evaluatePrice({ asset: "bitcoin", price: 102 });
    assert.equal(result?.outcome, "open");
    assert.equal(result?.closed, false);
  });

  void it("evaluatePrice: ignora trades de outros ativos", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    const results = service.evaluatePrice({ asset: "ethereum", price: 110 });
    assert.equal(results.length, 0);
  });

  void it("computeStats: vazio retorna zeros", () => {
    const stats = service.computeStats();
    assert.equal(stats.totalTrades, 0);
    assert.equal(stats.winRatePercent, 0);
    assert.equal(stats.profitFactor, 0);
  });

  void it("computeStats: 2 wins + 1 loss calcula winRate 66.6 e PF correto", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 110 });

    now += 1000;
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 110 });

    now += 1000;
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 95 });

    const stats = service.computeStats();
    assert.equal(stats.closedTrades, 3);
    assert.equal(stats.wins, 2);
    assert.equal(stats.losses, 1);
    assert.ok(Math.abs(stats.winRatePercent - 66.6666) < 0.01);
    assert.equal(stats.profitFactor, 4); // (10+10) / 5
    assert.equal(stats.totalPnlPercent, 15);
    assert.equal(stats.equityCurve.length, 3);
  });

  void it("computeStats: maxDrawdown captura pico->vale", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 110 });
    now += 1000;
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 90 });
    now += 1000;
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 90,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 90 });

    const stats = service.computeStats();
    // equity: +10, 0, -10. peak=10, vale=-10 => DD = 20
    assert.equal(stats.maxDrawdownPercent, 20);
  });

  void it("openTrade: rejeita configuracao invalida (stop > entry em long)", () => {
    assert.throws(() =>
      service.openTrade({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 105,
        targetPrice: 110,
      }),
    );
  });

  void it("JsonlTradeStore: persiste e recarrega trades em nova instancia", () => {
    service.openTrade({
      asset: "bitcoin",
      side: "long",
      entryPrice: 100,
      stopPrice: 95,
      targetPrice: 110,
    });
    service.evaluatePrice({ asset: "bitcoin", price: 110 });

    const reopened = new JsonlTradeStore(join(tmpDir, "trades.jsonl"));
    assert.equal(reopened.size(), 1);
    assert.equal(reopened.list()[0]?.status, "win");
  });
});
