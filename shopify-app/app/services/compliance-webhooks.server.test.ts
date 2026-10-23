import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleCustomerComplianceTopic,
  handleShopRedact,
  normalizeComplianceTopic,
  type ShopRedactDb,
} from "./webhooks.server";

describe("compliance topic normalization", () => {
  it("normalizes slash and underscore topic forms", () => {
    assert.equal(normalizeComplianceTopic("customers/data_request"), "CUSTOMERS_DATA_REQUEST");
    assert.equal(normalizeComplianceTopic("CUSTOMERS_REDACT"), "CUSTOMERS_REDACT");
    assert.equal(normalizeComplianceTopic("shop/redact"), "SHOP_REDACT");
  });
});

describe("customer compliance handlers", () => {
  it("acknowledges data_request without requiring buyer records", async () => {
    const result = await handleCustomerComplianceTopic({
      shop: "demo.myshopify.com",
      topic: "customers/data_request",
    });
    assert.equal(result.acknowledged, true);
    assert.equal(result.buyerRecordsFound, false);
  });

  it("acknowledges customers/redact when no buyer records exist", async () => {
    const result = await handleCustomerComplianceTopic({
      shop: "demo.myshopify.com",
      topic: "customers/redact",
    });
    assert.equal(result.acknowledged, true);
    assert.equal(result.buyerRecordsFound, false);
  });

  it("handles missing shop on customer topics", async () => {
    const result = await handleCustomerComplianceTopic({
      shop: "   ",
      topic: "customers/redact",
    });
    assert.equal(result.shop, "");
    assert.equal(result.acknowledged, true);
  });
});

type DeleteManyArgs = { where: { shop: string } };

function createRecordingRedactDb(options?: { failOn?: "campaign" | null }) {
  const shopsSeen: string[] = [];
  const callOrder: string[] = [];
  const state = { committed: false };

  const track = async (label: string, args: DeleteManyArgs) => {
    callOrder.push(label);
    shopsSeen.push(args.where.shop);
    if (options?.failOn && label === options.failOn) {
      throw new Error(`simulated ${label} failure`);
    }
    return { count: 1 };
  };

  const client: ShopRedactDb = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        session: { deleteMany: (args: DeleteManyArgs) => track("session", args) },
        campaign: { deleteMany: (args: DeleteManyArgs) => track("campaign", args) },
        appSettings: { deleteMany: (args: DeleteManyArgs) => track("appSettings", args) },
        analyticsEvent: {
          deleteMany: (args: DeleteManyArgs) => track("analyticsEvent", args),
        },
        shopIntegrationStatus: {
          deleteMany: (args: DeleteManyArgs) => track("shopIntegrationStatus", args),
        },
        shopDiscount: {
          deleteMany: (args: DeleteManyArgs) => track("shopDiscount", args),
        },
        discountSyncJob: {
          deleteMany: (args: DeleteManyArgs) => track("discountSyncJob", args),
        },
      };
      const value = await fn(tx);
      state.committed = true;
      return value;
    },
  } as ShopRedactDb;

  return { client, shopsSeen, callOrder, state };
}

describe("shop/redact idempotency", () => {
  it("returns success-shaped zeros for empty shop identifier (no DB writes)", async () => {
    const first = await handleShopRedact("");
    const second = await handleShopRedact("   ");
    assert.equal(first.shop, "");
    assert.equal(second.shop, "");
    assert.equal(first.sessionsDeleted, 0);
    assert.equal(second.campaignsDeleted, 0);
  });

  it("duplicate delivery remains safe (second wipe succeeds)", async () => {
    const recorder = createRecordingRedactDb();
    const shop = "dup-shop.myshopify.com";
    const first = await handleShopRedact(shop, recorder.client);
    const second = await handleShopRedact(shop, recorder.client);
    assert.equal(first.shop, shop);
    assert.equal(second.shop, shop);
    assert.equal(first.sessionsDeleted, 1);
    assert.equal(second.sessionsDeleted, 1);
    assert.equal(recorder.state.committed, true);
  });

  it("uses one database round trip on the production cleanup path", async () => {
    let rawCalls = 0;
    let sql = "";
    const client = {
      $queryRaw: async (query: { text?: string }) => {
        rawCalls += 1;
        sql = String(query.text || "");
        return [{
          sessionsDeleted: 1,
          campaignsDeleted: 2,
          settingsDeleted: 1,
          shopDiscountRecordsDeleted: 1,
          analyticsDeleted: 4,
          integrationStatusDeleted: 1,
        }];
      },
      $transaction: async () => {
        throw new Error("slow transaction path should not run");
      },
    } as unknown as ShopRedactDb;

    const result = await handleShopRedact("fast.myshopify.com", client);
    assert.equal(rawCalls, 1);
    assert.equal(result.campaignsDeleted, 2);
    assert.equal(result.analyticsDeleted, 4);
    assert.match(sql, /DELETE FROM "Campaign"/);
    assert.match(sql, /DELETE FROM "AppSettings"/);
    assert.match(sql, /DELETE FROM "AnalyticsEvent"/);
    assert.doesNotMatch(sql, /SET "status" = 'PAUSED'/);
  });
});

describe("shop/redact transaction + shop isolation", () => {
  it("scopes every deleteMany to the authenticated shop only", async () => {
    const recorder = createRecordingRedactDb();
    const shopA = "shop-a.myshopify.com";
    await handleShopRedact(shopA, recorder.client);
    assert.ok(recorder.shopsSeen.length > 0);
    assert.deepEqual(
      [...new Set(recorder.shopsSeen)],
      [shopA],
      "every deleteMany must target only the authenticated shop",
    );
  });

  it("does not commit when a mid-transaction delete fails", async () => {
    const recorder = createRecordingRedactDb({ failOn: "campaign" });
    await assert.rejects(
      () => handleShopRedact("partial-fail.myshopify.com", recorder.client),
      /simulated campaign failure/,
    );
    assert.equal(recorder.state.committed, false);
    assert.deepEqual(recorder.callOrder, ["session", "campaign"]);
  });
});
