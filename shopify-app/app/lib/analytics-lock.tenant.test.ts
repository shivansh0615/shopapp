import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "./errors.server";
import { createKeyedMutex } from "./shop-lock.server";
import {
  createAnalyticsEvent,
  countEventsByType,
  sumRevenueFromOrders,
  type AnalyticsDb,
} from "../repositories/analytics.repository";
import {
  getAnalyticsSummary,
  trackWidgetImpression,
} from "../services/analytics.server";

function createAnalyticsFake() {
  const campaigns = new Map<number, { id: number; shop: string }>();
  const events: Array<{
    id: number;
    shop: string;
    campaignId: number | null;
    eventType: string;
    payload: unknown;
    createdAt: Date;
  }> = [];

  const client = {
    campaign: {
      findFirst: async ({ where }: { where: { id: number; shop: string } }) => {
        const row = campaigns.get(where.id);
        if (!row || row.shop !== where.shop) return null;
        return { id: row.id };
      },
    },
    analyticsEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: events.length + 1,
          shop: String(data.shop),
          campaignId: (data.campaignId as number | null) ?? null,
          eventType: String(data.eventType),
          payload: data.payload ?? null,
          createdAt: new Date(),
        };
        events.push(row);
        return row as never;
      },
      count: async ({
        where,
      }: {
        where: { shop: string; eventType: string };
      }) =>
        events.filter(
          (e) => e.shop === where.shop && e.eventType === where.eventType,
        ).length,
      findMany: async ({
        where,
      }: {
        where: { shop: string; eventType?: string };
      }) =>
        events.filter((e) => {
          if (e.shop !== where.shop) return false;
          if (where.eventType && e.eventType !== where.eventType) return false;
          return true;
        }) as never,
    },
  } as AnalyticsDb;

  return {
    client,
    seedCampaign(id: number, shop: string) {
      campaigns.set(id, { id, shop });
    },
    events,
  };
}

describe("analytics tenant isolation", () => {
  it("writes when campaign belongs to authenticated shop", async () => {
    const fake = createAnalyticsFake();
    fake.seedCampaign(10, "a.myshopify.com");
    const event = await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 10 },
      fake.client,
    );
    assert.equal(event.persisted, true);
    assert.equal(fake.events.length, 1);
    assert.equal(fake.events[0].shop, "a.myshopify.com");
  });

  it("rejects cross-shop campaign references", async () => {
    const fake = createAnalyticsFake();
    fake.seedCampaign(10, "owner.myshopify.com");
    await assert.rejects(
      () =>
        trackWidgetImpression(
          { shop: "attacker.myshopify.com", campaignId: 10 },
          fake.client,
        ),
      (error) =>
        error instanceof AppError && error.code === "CAMPAIGN_NOT_OWNED",
    );
    assert.equal(fake.events.length, 0);
  });

  it("rejects missing campaign", async () => {
    const fake = createAnalyticsFake();
    await assert.rejects(
      () =>
        createAnalyticsEvent(
          {
            shop: "a.myshopify.com",
            campaignId: 999,
            eventType: "widget_impression",
          },
          fake.client,
        ),
      /Campaign not found/,
    );
  });

  it("ignores forged empty shop", async () => {
    const fake = createAnalyticsFake();
    await assert.rejects(
      () =>
        trackWidgetImpression({ shop: "   ", campaignId: 1 }, fake.client),
      (error) => error instanceof AppError && error.code === "SHOP_REQUIRED",
    );
  });

  it("keeps aggregation isolated per shop", async () => {
    const fake = createAnalyticsFake();
    fake.seedCampaign(1, "a.myshopify.com");
    fake.seedCampaign(2, "b.myshopify.com");
    await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 1 },
      fake.client,
    );
    await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 1 },
      fake.client,
    );
    await createAnalyticsEvent(
      {
        shop: "b.myshopify.com",
        campaignId: 2,
        eventType: "order_influenced",
        payload: { revenue: 50 },
      },
      fake.client,
    );

    const summaryA = await getAnalyticsSummary("a.myshopify.com", fake.client);
    const summaryB = await getAnalyticsSummary("b.myshopify.com", fake.client);
    assert.equal(summaryA.giftsUnlocked, 0);
    assert.equal(
      await countEventsByType("a.myshopify.com", "widget_impression", fake.client),
      2,
    );
    assert.equal(summaryB.influencedOrders, 1);
    assert.equal(await sumRevenueFromOrders("b.myshopify.com", fake.client), 50);
    assert.equal(await sumRevenueFromOrders("a.myshopify.com", fake.client), 0);
  });

  it("allows duplicate impression events (no silent drop)", async () => {
    const fake = createAnalyticsFake();
    fake.seedCampaign(3, "a.myshopify.com");
    await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 3 },
      fake.client,
    );
    await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 3 },
      fake.client,
    );
    assert.equal(fake.events.length, 2);
  });

  it("prevents cross-shop reads via shop-scoped queries", async () => {
    const fake = createAnalyticsFake();
    fake.seedCampaign(1, "a.myshopify.com");
    await trackWidgetImpression(
      { shop: "a.myshopify.com", campaignId: 1 },
      fake.client,
    );
    assert.equal(
      await countEventsByType("b.myshopify.com", "widget_impression", fake.client),
      0,
    );
  });
});

describe("keyed mutex concurrency", () => {
  it("serializes same-shop work and releases after success", async () => {
    const lock = createKeyedMutex();
    const order: string[] = [];
    await Promise.all([
      lock.withLock("shop-a", async () => {
        order.push("a1-start");
        await new Promise((r) => setTimeout(r, 30));
        order.push("a1-end");
      }),
      lock.withLock("shop-a", async () => {
        order.push("a2-start");
        order.push("a2-end");
      }),
    ]);
    assert.deepEqual(order, ["a1-start", "a1-end", "a2-start", "a2-end"]);
  });

  it("allows different shops concurrently", async () => {
    const lock = createKeyedMutex();
    let concurrent = 0;
    let maxConcurrent = 0;
    await Promise.all([
      lock.withLock("shop-a", async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      }),
      lock.withLock("shop-b", async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      }),
    ]);
    assert.ok(maxConcurrent >= 2);
  });

  it("releases lock after failure", async () => {
    const lock = createKeyedMutex();
    await assert.rejects(() =>
      lock.withLock("shop-a", async () => {
        throw new Error("boom");
      }),
    );
    let ran = false;
    await lock.withLock("shop-a", async () => {
      ran = true;
    });
    assert.equal(ran, true);
  });
});
