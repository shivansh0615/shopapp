import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { CampaignWithTiers, CreateCampaignInput } from "./campaign.server";
import { LIVE_FREE_GIFT_CAMPAIGN_TYPE as CLASSIC, LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE as TIERED } from "./promotion-engine/campaign-types";

let rows: CampaignWithTiers[] = [];
let nextId = 1;
let tierWrites = 0;
const locks = new Map<string, Promise<void>>();
const matches = (row: CampaignWithTiers, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => {
    if (key === "id" && value && typeof value === "object" && "not" in (value as object)) {
      return row.id !== (value as { not: number }).not;
    }
    return row[key as keyof CampaignWithTiers] === value;
  });
const campaign = {
  findMany: async ({ where }: { where: Record<string, unknown> }) => {
    assert.ok(Object.keys(where).every((key) => ["shop", "status", "id"].includes(key)));
    return rows.filter((row) => matches(row, where));
  },
  findFirst: async ({ where }: { where: Record<string, unknown> }) =>
    rows.find((row) => matches(row, where)) ?? null,
  create: async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: nextId++, rewardTiers: [], ...data } as unknown as CampaignWithTiers;
    rows.push(row);
    return row;
  },
  update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
    const row = rows.find((entry) => entry.id === where.id)!;
    for (const [key, value] of Object.entries(data)) {
      Object.assign(row, { [key]: value && typeof value === "object" && "set" in value ? value.set : value });
    }
    return row;
  },
  updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const matched = rows.filter((row) => matches(row, where));
    for (const row of matched) {
      Object.assign(row, data);
    }
    return { count: matched.length };
  },
};
const fakeDb = {
  campaign,
  $transaction: async (
    callback: (tx: unknown) => Promise<unknown>,
    options: { isolationLevel: string },
  ) => {
    assert.equal(options.isolationLevel, "ReadCommitted");
    let unlock: (() => void) | undefined;
    let locked = false;
    const tx = {
      $executeRaw: async (query: TemplateStringsArray, key: string) => {
        assert.match(query.join(""), /pg_advisory_xact_lock/);
        assert.match(key, /^campaign-capacity:/);
        const prior = locks.get(key) ?? Promise.resolve();
        const held = new Promise<void>((resolve) => { unlock = resolve; });
        locks.set(key, prior.then(() => held));
        await prior;
        locked = true;
        return 1;
      },
      campaign: Object.fromEntries(Object.entries(campaign).map(([name, fn]) => [
        name, async (args: never) => { assert.ok(locked, "lock before database reads/writes"); return fn(args); },
      ])),
      campaignRewardTier: {
        deleteMany: async () => { tierWrites++; return { count: 0 }; },
        createMany: async () => { tierWrites++; return { count: 0 }; },
      },
    };
    try { return await callback(tx); } finally { unlock?.(); }
  },
};
const originalDb = globalThis.prismaGlobal;
globalThis.prismaGlobal = fakeDb as never;
const service = await import("./campaign.server");
const repository = await import("../repositories/campaign.repository");
after(() => { globalThis.prismaGlobal = originalDb; });
beforeEach(() => { rows = []; nextId = 1; tierWrites = 0; locks.clear(); });

function input(overrides: Partial<CreateCampaignInput> = {}): CreateCampaignInput {
  return {
    shop: "a.myshopify.com", name: "Gift", campaignType: CLASSIC,
    threshold: "100", currencyCode: "USD", giftProductId: "gid://shopify/Product/1",
    giftVariantId: "gid://shopify/ProductVariant/2", giftQuantity: 1,
    placements: [], status: "ACTIVE", ...overrides,
  };
}
function seed(overrides: Partial<CampaignWithTiers> = {}) {
  const row = {
    ...input(), id: nextId++, threshold: 100, rewardTiers: [],
    startDate: null, endDate: null, ...overrides,
  } as unknown as CampaignWithTiers;
  rows.push(row);
  return row;
}

describe("campaign capacity through service and repository", () => {
  it("pauses the previous active campaign when a second classic is created ACTIVE", async () => {
    await service.createCampaign(input({ name: "First" }));
    await service.createCampaign(input({ name: "Second" }));
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
    assert.equal(rows.find((row) => row.name === "First")?.status, "PAUSED");
    assert.equal(rows.find((row) => row.name === "Second")?.status, "ACTIVE");
  });

  it("pauses future and expired ACTIVE schedules when another campaign activates", async () => {
    for (const dates of [
      { startDate: new Date("2099-01-01") }, { endDate: new Date("2000-01-01") },
    ]) {
      rows = [];
      seed({ name: "Scheduled", ...dates });
      assert.equal(await service.validateActivationCapacity("a.myshopify.com", CLASSIC), null);
      await service.createCampaign(input({ name: "Next" }));
      assert.equal(rows.find((row) => row.name === "Scheduled")?.status, "PAUSED");
      assert.equal(rows.find((row) => row.name === "Next")?.status, "ACTIVE");
    }
  });

  it("pauses an active tiered campaign when a classic is activated", async () => {
    seed({ campaignType: TIERED, name: "Tiered" });
    const draft = seed({ status: "DRAFT", campaignType: CLASSIC, name: "Classic" });
    await service.activateCampaign(draft.id, draft.shop);
    assert.equal(rows.find((row) => row.name === "Tiered")?.status, "PAUSED");
    assert.equal(rows.find((row) => row.name === "Classic")?.status, "ACTIVE");
  });

  it("does not count drafts or paused campaigns; another shop has its own slots", async () => {
    seed({ status: "DRAFT" });
    seed({ status: "PAUSED" });
    seed({ shop: "b.myshopify.com" });
    await service.createCampaign(input());
    assert.equal(rows.length, 4);
  });

  it("permits editing the active campaign itself", async () => {
    const active = seed();
    await service.updateCampaign(active.id, active.shop, { name: "Renamed" });
    assert.equal(active.name, "Renamed");
    assert.equal(active.status, "ACTIVE");
  });

  it("activates through the general edit path by pausing the previous active campaign", async () => {
    seed({ name: "Live" });
    const draft = seed({ status: "DRAFT", name: "Draft" });
    await service.updateCampaign(draft.id, draft.shop, { status: "ACTIVE" });
    assert.equal(rows.find((row) => row.name === "Live")?.status, "PAUSED");
    assert.equal(draft.status, "ACTIVE");
  });

  it("pauses the other active campaign when changing type while staying ACTIVE", async () => {
    seed({ name: "Classic" });
    const tiered = seed({ campaignType: TIERED, name: "Tiered" });
    await repository.updateOwnedCampaign(tiered.id, tiered.shop, {
      data: { campaignType: { set: CLASSIC } }, replaceTiers: [],
    });
    assert.equal(tiered.campaignType, CLASSIC);
    assert.equal(tiered.status, "ACTIVE");
    assert.equal(rows.find((row) => row.name === "Classic")?.status, "PAUSED");
    assert.ok(tierWrites >= 1);
  });

  it("pausing frees a slot even if old data already violates the limit", async () => {
    const first = seed();
    const second = seed();
    await service.pauseCampaign(first.id, first.shop);
    await service.pauseCampaign(second.id, second.shop);
    await service.createCampaign(input());
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
  });

  it("two concurrent ACTIVE creations leave exactly one active", async () => {
    const result = await Promise.allSettled([service.createCampaign(input()), service.createCampaign(input())]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 2);
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
    assert.equal(rows.filter((row) => row.status === "PAUSED").length, 1);
  });

  it("two concurrent activations leave exactly one active", async () => {
    const a = seed({ status: "DRAFT" });
    const b = seed({ status: "DRAFT" });
    const result = await Promise.allSettled([
      service.activateCampaign(a.id, a.shop), service.activateCampaign(b.id, b.shop),
    ]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 2);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
    assert.equal(rows.filter((row) => row.status === "PAUSED").length, 1);
  });

  it("serializes a create racing an edit-to-ACTIVE", async () => {
    const draft = seed({ status: "DRAFT" });
    const result = await Promise.allSettled([
      service.createCampaign(input()), service.updateCampaign(draft.id, draft.shop, { status: "ACTIVE" }),
    ]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 2);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
  });

  it("rejects another store's activation and cross-store moves", async () => {
    const draft = seed({ status: "DRAFT" });
    assert.equal(await service.activateCampaign(draft.id, "b.myshopify.com"), null);
    await assert.rejects(repository.updateOwnedCampaign(draft.id, draft.shop, {
      data: { shop: "b.myshopify.com" },
    }), /cannot be moved/);
    assert.equal(draft.shop, "a.myshopify.com");
  });

  it("pauses legacy ACTIVE campaigns when a gift campaign is created", async () => {
    seed({ campaignType: "legacy one", name: "Legacy A" });
    seed({ campaignType: "legacy two", name: "Legacy B" });
    await service.createCampaign(input({ name: "Gift" }));
    assert.equal(rows.find((row) => row.name === "Gift")?.status, "ACTIVE");
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
    assert.equal(rows.find((row) => row.name === "Legacy A")?.status, "PAUSED");
    assert.equal(rows.find((row) => row.name === "Legacy B")?.status, "PAUSED");
  });
});
