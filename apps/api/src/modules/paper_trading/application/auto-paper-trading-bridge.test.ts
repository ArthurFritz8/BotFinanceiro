import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

process.env.NODE_ENV ??= "test";
process.env.COINGECKO_API_BASE_URL ??= "https://api.coingecko.com/api/v3";
process.env.YAHOO_FINANCE_API_BASE_URL ??= "https://query1.finance.yahoo.com";
process.env.INTERNAL_API_TOKEN ??= "test_internal_token_12345";

const { JsonlTradeStore } = await import(
  "../infrastructure/jsonl-trade-store.js"
);
const { PaperTradingService } = await import("./paper-trading-service.js");
const { AutoPaperTradingBridge } = await import("./auto-paper-trading-bridge.js");

interface BroadcastCall {
  readonly title: string;
  readonly body: string;
}

function buildHarness(
  options: { minTier?: "high" | "medium"; price?: number } = {},
) {
  const tmpDir = mkdtempSync(join(tmpdir(), "auto-bridge-test-"));
  const store = new JsonlTradeStore(join(tmpDir, "trades.jsonl"));
  const service = new PaperTradingService({ store });
  const broadcasts: BroadcastCall[] = [];
  const fakeNotifications = {
    isEnabled: (): boolean => true,
    broadcast: (payload: { title: string; body: string }): Promise<{
      attempted: number;
      delivered: number;
      removed: number;
      failed: number;
    }> => {
      broadcasts.push({ title: payload.title, body: payload.body });
      return Promise.resolve({ attempted: 0, delivered: 0, removed: 0, failed: 0 });
    },
  };
  let lastAssetRequested: string | null = null;
  const bridge = new AutoPaperTradingBridge({
    paperTradingService: service,
    notificationService: fakeNotifications as unknown as never,
    minTier: options.minTier ?? "high",
    priceProvider: (asset: string): Promise<number> => {
      lastAssetRequested = asset;
      return Promise.resolve(options.price ?? 100);
    },
  });
  return {
    bridge,
    service,
    broadcasts,
    cleanup: (): void => rmSync(tmpDir, { recursive: true, force: true }),
    getLastAssetRequested: (): string | null => lastAssetRequested,
  };
}

void describe("AutoPaperTradingBridge", () => {
  void it("abre trade quando tier=high e nao ha duplicado", () => {
    const h = buildHarness();
    try {
      const result = h.bridge.tryOpenFromConfluence({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
        confluenceScore: 80,
        tier: "high",
      });
      assert.equal(result.action, "opened");
      assert.equal(result.trade?.status, "open");
      assert.equal(h.service.listTrades().length, 1);
      assert.equal(h.broadcasts.length, 1);
      assert.match(h.broadcasts[0]!.title, /Trade aberto/);
    } finally {
      h.cleanup();
    }
  });

  void it("rejeita sinal abaixo do tier minimo", () => {
    const h = buildHarness({ minTier: "high" });
    try {
      const result = h.bridge.tryOpenFromConfluence({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
        confluenceScore: 50,
        tier: "medium",
      });
      assert.equal(result.action, "skipped");
      assert.equal(result.reason, "below_min_tier");
      assert.equal(h.service.listTrades().length, 0);
    } finally {
      h.cleanup();
    }
  });

  void it("idempotente: nao abre 2o trade do mesmo ativo", () => {
    const h = buildHarness();
    try {
      h.bridge.tryOpenFromConfluence({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
        confluenceScore: 80,
        tier: "high",
      });
      const second = h.bridge.tryOpenFromConfluence({
        asset: "bitcoin",
        side: "long",
        entryPrice: 101,
        stopPrice: 96,
        targetPrice: 111,
        confluenceScore: 90,
        tier: "high",
      });
      assert.equal(second.action, "skipped");
      assert.equal(second.reason, "duplicate_open_trade");
      assert.equal(h.service.listTrades().length, 1);
    } finally {
      h.cleanup();
    }
  });

  void it("evaluateOpenTrades fecha trade no target e dispara broadcast", async () => {
    const h = buildHarness({ price: 110 });
    try {
      h.bridge.tryOpenFromConfluence({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
        confluenceScore: 80,
        tier: "high",
      });
      const initialBroadcasts = h.broadcasts.length;
      const run = await h.bridge.evaluateOpenTrades();
      assert.equal(run.evaluated, 1);
      assert.equal(run.closed, 1);
      assert.equal(run.errors, 0);
      assert.ok(h.broadcasts.length > initialBroadcasts);
      const closeBroadcast = h.broadcasts[h.broadcasts.length - 1]!;
      assert.match(closeBroadcast.title, /WIN/);
    } finally {
      h.cleanup();
    }
  });

  void it("evaluateOpenTrades captura erro do priceProvider sem propagar", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "auto-bridge-err-"));
    try {
      const store = new JsonlTradeStore(join(tmpDir, "trades.jsonl"));
      const service = new PaperTradingService({ store });
      service.openTrade({
        asset: "bitcoin",
        side: "long",
        entryPrice: 100,
        stopPrice: 95,
        targetPrice: 110,
      });
      const bridge = new AutoPaperTradingBridge({
        paperTradingService: service,
        notificationService: null,
        priceProvider: (): Promise<number> => {
          throw new Error("network down");
        },
      });
      const run = await bridge.evaluateOpenTrades();
      assert.equal(run.errors, 1);
      assert.equal(run.closed, 0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  void it("rejeita payload invalido (zod)", () => {
    const h = buildHarness();
    try {
      assert.throws(() =>
        h.bridge.tryOpenFromConfluence({
          asset: "bitcoin",
          side: "long",
          entryPrice: -100,
          stopPrice: 95,
          targetPrice: 110,
          confluenceScore: 80,
          tier: "high",
        }),
      );
    } finally {
      h.cleanup();
    }
  });
});
