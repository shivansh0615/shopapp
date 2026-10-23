import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectActiveCampaign } from "./promotion-engine/campaign-selection";
import { handleAppUninstalled } from "./webhooks.server";

type StoredCampaign = {
  id: number;
  shop: string;
  status: string;
  tiers: number;
  giftOptions: number;
};

type UninstallDb = {
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  discountSyncJob: {
    findUnique: (args: {
      where: { id?: string; dedupeKey?: string };
    }) => Promise<Record<string, unknown> | null>;
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

function createUninstallDb() {
  const state = {
    sessions: [] as string[],
    discounts: [] as string[],
    campaigns: [] as StoredCampaign[],
    settings: {} as Record<string, number>,
    analytics: {} as Record<string, number>,
    jobs: [] as Array<Record<string, unknown>>,
  };

  const client: UninstallDb = {
    $transaction: async (fn) => {
      const tx = {
        session: {
          deleteMany: async ({ where }: { where: { shop: string } }) => {
            const before = state.sessions.filter((s) => s === where.shop).length;
            state.sessions = state.sessions.filter((s) => s !== where.shop);
            return { count: before };
          },
        },
        shopDiscount: {
          deleteMany: async ({ where }: { where: { shop: string } }) => {
            const before = state.discounts.filter((s) => s === where.shop).length;
            state.discounts = state.discounts.filter((s) => s !== where.shop);
            return { count: before };
          },
        },
        campaign: {
          count: async ({ where }: { where: { shop: string } }) =>
            state.campaigns.filter((campaign) => campaign.shop === where.shop).length,
          updateMany: async ({
            where,
            data,
          }: {
            where: { shop: string; status?: { not?: string } };
            data: { status: string };
          }) => {
            let count = 0;
            for (const campaign of state.campaigns) {
              if (campaign.shop !== where.shop) continue;
              if (where.status?.not && campaign.status === where.status.not) continue;
              if (campaign.status === data.status) continue;
              campaign.status = data.status;
              count += 1;
            }
            return { count };
          },
        },
        appSettings: {
          count: async ({ where }: { where: { shop: string } }) =>
            state.settings[where.shop] ?? 0,
        },
      };
      return fn(tx);
    },
    discountSyncJob: {
      findUnique: async ({ where }) => {
        if (where.dedupeKey) {
          return state.jobs.find((j) => j.dedupeKey === where.dedupeKey) ?? null;
        }
        if (where.id) {
          return state.jobs.find((j) => j.id === where.id) ?? null;
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { id: `j${state.jobs.length + 1}`, ...data };
        state.jobs.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const existing = state.jobs.find((j) => j.id === where.id);
        if (!existing) throw new Error("missing job");
        Object.assign(existing, data);
        return existing;
      },
      updateMany: async ({ where, data }) => {
        const shop = where.shop as string | undefined;
        const statuses = (where.status as { in?: string[] } | undefined)?.in;
        let count = 0;
        for (const job of state.jobs) {
          if (shop && job.shop !== shop) continue;
          if (statuses && !statuses.includes(String(job.status))) continue;
          Object.assign(job, data);
          count += 1;
        }
        return { count };
      },
    },
  };

  return { client, state };
}

describe("uninstall deactivation", () => {
  it("records terminal failure and still cleans up when Shopify deactivate fails", async () => {
    const { client, state } = createUninstallDb();
    state.sessions.push("a.myshopify.com");
    state.discounts.push("a.myshopify.com");
    state.jobs.push({
      id: "pending1",
      shop: "a.myshopify.com",
      status: "pending",
      desiredAction: "SYNC",
      dedupeKey: "SYNC:a.myshopify.com",
    });

    const admin = {
      graphql: async () => {
        throw new Error("503 upstream");
      },
    };

    const result = await handleAppUninstalled("a.myshopify.com", {
      admin: admin as never,
      db: client as never,
    });

    assert.equal(result.discountDeactivated, false);
    assert.equal(result.discountDeactivateTerminalRecorded, true);
    assert.equal(result.sessionsDeleted, 1);
    assert.equal(state.jobs.find((j) => j.id === "pending1")?.status, "cancelled");
    assert.ok(state.jobs.some((j) => j.status === "failed" && j.desiredAction === "DEACTIVATE"));
  });

  it("cancels pending jobs even when admin is missing", async () => {
    const { client, state } = createUninstallDb();
    state.sessions.push("a.myshopify.com");
    state.jobs.push({
      id: "pending1",
      shop: "a.myshopify.com",
      status: "pending",
      desiredAction: "SYNC",
      dedupeKey: "SYNC:a.myshopify.com",
    });
    const result = await handleAppUninstalled("a.myshopify.com", {
      db: client as never,
    });
    assert.equal(result.sessionsDeleted, 1);
    assert.equal(state.jobs[0]?.status, "cancelled");
  });

  it("handles missing discount mapping / missing admin and still cleans local rows", async () => {
    const { client, state } = createUninstallDb();
    state.sessions.push("a.myshopify.com");
    const result = await handleAppUninstalled("a.myshopify.com", {
      db: client as never,
    });
    assert.equal(result.discountDeactivated, false);
    assert.equal(result.discountDeactivateTerminalRecorded, false);
    assert.equal(result.sessionsDeleted, 1);
  });

  it("duplicate uninstall remains safe", async () => {
    const { client } = createUninstallDb();
    await handleAppUninstalled("a.myshopify.com", { db: client as never });
    const second = await handleAppUninstalled("a.myshopify.com", {
      db: client as never,
    });
    assert.equal(second.sessionsDeleted, 0);
    assert.equal(second.cleanupPrepared, true);
  });

  it("does not touch another shop", async () => {
    const { client, state } = createUninstallDb();
    state.sessions.push("a.myshopify.com", "b.myshopify.com");
    state.discounts.push("a.myshopify.com", "b.myshopify.com");
    await handleAppUninstalled("a.myshopify.com", { db: client as never });
    assert.ok(state.sessions.includes("b.myshopify.com"));
    assert.ok(state.discounts.includes("b.myshopify.com"));
  });

  it("uses one database round trip when Prisma raw cleanup is available", async () => {
    let rawCalls = 0;
    let sql = "";
    const client = {
      $queryRaw: async (query: { text?: string }) => {
        rawCalls += 1;
        sql = String(query.text || "");
        return [{
          sessionsDeleted: 1,
          campaignsPreserved: 2,
          campaignsPaused: 2,
          settingsPreserved: 1,
          shopDiscountRecordsDeleted: 1,
        }];
      },
      $transaction: async () => {
        throw new Error("slow transaction path should not run");
      },
      discountSyncJob: {
        findUnique: async () => null,
        create: async () => ({}),
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
    };

    const result = await handleAppUninstalled("fast.myshopify.com", {
      db: client as never,
    });
    assert.equal(rawCalls, 1);
    assert.equal(result.sessionsDeleted, 1);
    assert.equal(result.campaignsPreserved, 2);
    assert.equal(result.campaignsPaused, 2);
    assert.match(sql, /SET "status" = 'PAUSED'/);
    assert.match(sql, /AND "status" <> 'PAUSED'/);
    assert.doesNotMatch(sql, /DELETE FROM "Campaign"/);
    assert.doesNotMatch(sql, /DELETE FROM "AppSettings"/);
    assert.doesNotMatch(sql, /DELETE FROM "AnalyticsEvent"/);
  });

  it("pauses every campaign for only the uninstalled shop", async () => {
    const { client, state } = createUninstallDb();
    state.campaigns.push(
      { id: 1, shop: "a.myshopify.com", status: "ACTIVE", tiers: 2, giftOptions: 1 },
      { id: 2, shop: "a.myshopify.com", status: "DRAFT", tiers: 1, giftOptions: 0 },
      { id: 3, shop: "b.myshopify.com", status: "ACTIVE", tiers: 3, giftOptions: 2 },
    );
    state.settings["a.myshopify.com"] = 1;
    state.analytics["a.myshopify.com"] = 4;

    const result = await handleAppUninstalled("a.myshopify.com", { db: client as never });

    assert.equal(result.campaignsPaused, 2);
    assert.equal(result.campaignsPreserved, 2);
    assert.equal(result.settingsPreserved, 1);
    assert.deepEqual(
      state.campaigns.filter((campaign) => campaign.shop === "a.myshopify.com").map((campaign) => campaign.status),
      ["PAUSED", "PAUSED"],
    );
    assert.equal(state.campaigns.find((campaign) => campaign.id === 3)?.status, "ACTIVE");
    assert.equal(state.analytics["a.myshopify.com"], 4);
    assert.equal(state.campaigns.find((campaign) => campaign.id === 1)?.tiers, 2);
    assert.equal(state.campaigns.find((campaign) => campaign.id === 1)?.giftOptions, 1);
  });

  it("is idempotent and does not delete retained merchant data", async () => {
    const { client, state } = createUninstallDb();
    state.campaigns.push({
      id: 1,
      shop: "a.myshopify.com",
      status: "ACTIVE",
      tiers: 2,
      giftOptions: 1,
    });
    state.settings["a.myshopify.com"] = 1;
    state.analytics["a.myshopify.com"] = 3;

    const first = await handleAppUninstalled("a.myshopify.com", { db: client as never });
    const second = await handleAppUninstalled("a.myshopify.com", { db: client as never });

    assert.equal(first.campaignsPaused, 1);
    assert.equal(second.campaignsPaused, 0);
    assert.equal(second.campaignsPreserved, 1);
    assert.equal(second.settingsPreserved, 1);
    assert.equal(state.campaigns.length, 1);
    assert.equal(state.campaigns[0]?.status, "PAUSED");
    assert.equal(state.analytics["a.myshopify.com"], 3);
  });

  it("keeps paused campaigns off the storefront after reinstall", async () => {
    const { client, state } = createUninstallDb();
    state.campaigns.push(
      { id: 1, shop: "a.myshopify.com", status: "ACTIVE", tiers: 1, giftOptions: 1 },
      { id: 2, shop: "b.myshopify.com", status: "ACTIVE", tiers: 1, giftOptions: 0 },
    );

    await handleAppUninstalled("a.myshopify.com", { db: client as never });

    const retained = state.campaigns.filter((campaign) => campaign.shop === "a.myshopify.com");
    const selected = selectActiveCampaign(
      retained.map((campaign) => ({
        id: campaign.id,
        status: campaign.status,
        campaignType: "FREE_GIFT",
        priority: 10,
      })),
    );
    assert.equal(selected.campaign, null);
    assert.equal(selected.diagnostic.code, "NO_ACTIVE_CAMPAIGN");
    assert.equal(state.campaigns.find((campaign) => campaign.id === 2)?.status, "ACTIVE");

    const again = await handleAppUninstalled("a.myshopify.com", { db: client as never });
    assert.equal(again.campaignsPaused, 0);
    assert.equal(again.campaignsPreserved, 1);
    assert.equal(state.campaigns.find((campaign) => campaign.id === 1)?.status, "PAUSED");
  });
});
