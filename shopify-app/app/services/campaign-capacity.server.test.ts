import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { CampaignWithTiers, CreateCampaignInput } from "./campaign.server";
import { LIVE_FREE_GIFT_CAMPAIGN_TYPE as CLASSIC, LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE as TIERED } from "./promotion-engine/campaign-types";

let rows: CampaignWithTiers[] = [];
let nextId = 1;
let tierWrites = 0;
const locks = new Map<string, Promise<void>>();
const matches = (row: CampaignWithTiers, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => row[key as keyof CampaignWithTiers] === value);
const campaign = {
  findMany: async ({ where }: { where: Record<string, unknown> }) => {
    // In particular, capacity must not be filtered by start/end dates.
    assert.ok(Object.keys(where).every((key) => ["shop", "status"].includes(key)));
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
  it("rejects a second classic campaign created ACTIVE without a route precheck", async () => {
    await service.createCampaign(input());
    await assert.rejects(service.createCampaign(input()), /Only one campaign can be active/);
    assert.equal(rows.length, 1);
  });
  it("counts future and expired ACTIVE schedules in both precheck and save", async () => {
    for (const dates of [
      { startDate: new Date("2099-01-01") }, { endDate: new Date("2000-01-01") },
    ]) {
      rows = [];
      seed(dates);
      assert.match((await service.validateActivationCapacity("a.myshopify.com", CLASSIC))!, /Only one campaign can be active/);
      await assert.rejects(service.createCampaign(input()), /Only one campaign can be active/);
    }
  });
  it("rejects a classic while a tiered campaign is active", async () => {
    seed({ campaignType: TIERED });
    await assert.rejects(service.createCampaign(input()), /Only one campaign can be active/);
    const draft = seed({ status: "DRAFT", campaignType: TIERED });
    await assert.rejects(service.activateCampaign(draft.id, draft.shop), /Only one campaign can be active/);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
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
  });
  it("enforces the limit through the general edit path", async () => {
    seed();
    const draft = seed({ status: "DRAFT" });
    await assert.rejects(service.updateCampaign(draft.id, draft.shop, { status: "ACTIVE" }), /Only one campaign can be active/);
    assert.equal(draft.status, "DRAFT");
  });
  it("rejects changing an active type into an occupied slot before altering tiers", async () => {
    seed();
    const tiered = seed({ campaignType: TIERED });
    await assert.rejects(repository.updateOwnedCampaign(tiered.id, tiered.shop, {
      data: { campaignType: { set: CLASSIC } }, replaceTiers: [],
    }), /Only one campaign can be active/);
    assert.equal(tiered.campaignType, TIERED);
    assert.equal(tierWrites, 0);
  });
  it("pausing frees a slot even if old data already violates the limit", async () => {
    const first = seed();
    const second = seed();
    await service.pauseCampaign(first.id, first.shop);
    await service.pauseCampaign(second.id, second.shop);
    await service.createCampaign(input());
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
  });
  it("two concurrent ACTIVE creations cannot occupy the same slot", async () => {
    const result = await Promise.allSettled([service.createCampaign(input()), service.createCampaign(input())]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(rows.length, 1);
  });
  it("two concurrent activations cannot occupy the same slot", async () => {
    const a = seed({ status: "DRAFT" });
    const b = seed({ status: "DRAFT" });
    const result = await Promise.allSettled([
      service.activateCampaign(a.id, a.shop), service.activateCampaign(b.id, b.shop),
    ]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(rows.filter((row) => row.status === "ACTIVE").length, 1);
  });
  it("serializes a create racing an edit-to-ACTIVE", async () => {
    const draft = seed({ status: "DRAFT" });
    const result = await Promise.allSettled([
      service.createCampaign(input()), service.updateCampaign(draft.id, draft.shop, { status: "ACTIVE" }),
    ]);
    assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
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
  it("enforces total capacity when legacy ACTIVE types occupy both slots", async () => {
    seed({ campaignType: "legacy one" });
    seed({ campaignType: "legacy two" });
    await assert.rejects(service.createCampaign(input()), /Only one campaign can be active/);
  });
});
