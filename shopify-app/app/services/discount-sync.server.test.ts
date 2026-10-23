import { getCampaignOverlapSummaries, parseCampaignPriority } from "../lib/campaign-overlaps";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Campaign } from "@prisma/client";
import { type DiscountCampaignConfig, parseDiscountConfig } from "./discount-engine/discount-config.schema";
import { buildDiscountSyncPlan } from "./discount-sync.server";
import { chooseCartCampaign } from "../../shared/campaign-policy";
import { selectCartCampaignForProxy } from "./proxy-evaluation.server";
import { selectWinningCampaign } from "./promotion-engine/campaign-selection";

const NOW = new Date("2026-07-15T00:00:00.000Z");
const FREE_GIFT = "Spend X -> Free Gift";
const TIERED = "Tiered Free Gifts";
const PERCENTAGE = "Spend X -> Percentage Discount";
const FIXED = "Spend X -> Fixed Discount";
const MYSTERY = "Mystery Gift";
const GIFT_VARIANT = "gid://shopify/ProductVariant/54277124161902";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    shop: "example.myshopify.com",
    name: "Test campaign",
    campaignType: FREE_GIFT,
    threshold: 999,
    thresholdMinor: null,
    currencyCode: "INR",
    giftProductId: "123",
    giftProductTitle: "Gift",
    giftProductImage: null,
    giftVariantId: GIFT_VARIANT,
    giftQuantity: 1,
    discountPercentage: null,
    fixedDiscountAmount: null,
    fixedDiscountAmountMinor: null,
    placements: [],
    widgetSettings: null,
    status: "ACTIVE",
    ruleType: "SPEND_THRESHOLD",
    triggerQuantity: 1,
    triggerProductIds: [],
    triggerCollectionIds: [],
    startDate: null,
    endDate: null,
    priority: 0,
    allowCustomerChoice: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function pctCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return campaign({
    campaignType: PERCENTAGE,
    giftProductId: "",
    giftVariantId: null,
    giftProductTitle: null,
    discountPercentage: 10,
    ...overrides,
  });
}

function fixedCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return campaign({
    campaignType: FIXED,
    giftProductId: "",
    giftVariantId: null,
    giftProductTitle: null,
    fixedDiscountAmount: 100,
    ...overrides,
  });
}

function tieredCampaign(overrides: Partial<Campaign> & { rewardTiers?: Array<{
  id: string;
  campaignId: number;
  threshold: number;
  giftVariantId: string;
  position: number;
}> } = {}) {
  const id = Number(overrides.id ?? 25);
  const threshold = Number(overrides.threshold ?? 1500);
  const giftVariantId = String(overrides.giftVariantId ?? "444");
  const { rewardTiers: suppliedTiers, ...campaignOverrides } = overrides;
  return {
    ...campaign({
      id,
      campaignType: TIERED,
      threshold,
      giftProductId: "tier-product",
      giftVariantId,
      ...campaignOverrides,
    }),
    rewardTiers: suppliedTiers ?? [
      {
        id: `tier-${id}`,
        campaignId: id,
        threshold,
        thresholdMinor: null,
        giftProductId: "tier-product",
        giftProductTitle: "Tier gift",
        giftProductImage: null,
        giftVariantId,
        position: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
  };
}

function planFor(campaigns: Campaign[]) {
  return buildDiscountSyncPlan({
    shop: "example.myshopify.com",
    campaigns,
    currencyCode: "INR",
    now: NOW,
  });
}

function parsedPlan(campaigns: Campaign[]) {
  const plan = planFor(campaigns);
  return { plan, config: parseDiscountConfig(JSON.parse(plan.configJson)) };
}


describe("eligibility-first discount synchronization", () => {
  it("syncs all supported scheduled candidates with priorities, not a global winner", () => {
    const { plan, config } = parsedPlan([campaign({ id: 1, priority: 20 }), pctCampaign({ id: 2, priority: 10 })]);
    assert.equal(plan.mode, "active");
    assert.equal(plan.winningCampaignId, null);
    assert.equal(config?.selectionPolicy, "ELIGIBILITY_FIRST");
    assert.deepEqual(config?.activeCampaigns.map(c => [c.campaignId, c.priority]), [["1", 20], ["2", 10]]);
  });
  it("keeps single free gift, percentage, and fixed campaigns supported", () => {
    for (const candidate of [campaign(), pctCampaign(), fixedCampaign()]) {
      const { plan, config } = parsedPlan([candidate]);
      assert.equal(plan.mode, "active");
      assert.equal(plan.winningCampaignId, "1");
      assert.equal(config?.activeCampaigns.length, 1);
    }
  });
  it("excludes unsupported, draft, paused, expired and future campaigns", () => {
    const { config } = parsedPlan([
      campaign({ id: 1, campaignType: MYSTERY }), campaign({ id: 2, status: "DRAFT" }),
      campaign({ id: 3, status: "PAUSED" }), campaign({ id: 4, endDate: new Date("2020-01-01") }),
      campaign({ id: 5, startDate: new Date("2099-01-01") }), campaign({ id: 6 }),
    ]);
    assert.deepEqual(config?.activeCampaigns.map(c => c.campaignId), ["6"]);
  });
  it("empty, unsupported-only and invalid-only sets deactivate discounts", () => {
    for (const candidates of [[], [campaign({ campaignType: MYSTERY })], [campaign({ giftVariantId: null })]]) {
      const { plan, config } = parsedPlan(candidates);
      assert.equal(plan.mode, "inactive");
      assert.equal(config?.activeCampaigns.length, 0);
    }
  });
  it("invalid high-priority offers do not hide valid candidates", () => {
    const { config } = parsedPlan([campaign({ id: 1, priority: 100, giftVariantId: null }), campaign({ id: 2 })]);
    assert.deepEqual(config?.activeCampaigns.map(c => c.campaignId), ["2"]);
  });
  for (const reverse of [false, true]) {
    for (const rate of [1, 0.012]) {
      it("matches proxy and shared selection policy across thresholds, priorities and cart changes; reverse=" + reverse + "; rate=" + rate, () => {
        let campaigns = [
          campaign({ id: 1, threshold: 500, giftVariantId: "111", createdAt: new Date("2025-01-01") }),
          campaign({ id: 2, threshold: 1000, giftVariantId: "222", createdAt: new Date("2026-10-01") }),
          campaign({ id: 3, threshold: 2000, priority: 10, giftVariantId: "333" }),
        ];
        if (reverse) campaigns = campaigns.reverse();
        const { config } = parsedPlan(campaigns);
        assert.ok(config);
        for (const [subtotal, expected] of [[0, null], [499.99, null], [500, "1"], [999.99, "1"], [1000, "2"], [1999.99, "2"], [2000, "3"], [700, "1"], [0, null]] as const) {
          const paid = Math.round(subtotal * rate * 100) / 100;
          // FX amounts round to cents; compare the converted thresholds themselves.
          const selected: DiscountCampaignConfig | null = chooseCartCampaign(config.activeCampaigns, paid, rate);
          const expectedAtRate: string | null = rate === 1 ? expected : selected?.campaignId ?? null;
          if (rate === 1) assert.equal(selected?.campaignId ?? null, expectedAtRate);
          const proxy = selectCartCampaignForProxy(selectWinningCampaign(campaigns, { now: NOW }).candidates,
            { shop: "example.myshopify.com", subtotal: paid, presentmentRate: rate });
          if (selected) assert.equal(String(proxy?.id), selected.campaignId);

        }
      });
    }
  }
  it("equal priority/threshold uses stable ID regardless of newer creation date", () => {
    const campaigns = [campaign({ id: 10 }), campaign({ id: 2, createdAt: new Date("2020-01-01") })];
    const { config } = parsedPlan(campaigns);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 1000)?.campaignId, "2");
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 1000 })?.id, 2);
  });
  it("no eligible offer gives progress toward the nearest equal-priority goal, without a checkout reward", () => {
    const campaigns = [campaign({ id: 1, threshold: 1000 }), campaign({ id: 2, threshold: 500 })];
    const { config } = parsedPlan(campaigns);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 100), null);
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 100 })?.id, 2);
  });
  it("classic plus tiered: only classic between thresholds; highest reached threshold wins when both qualify", () => {
    const campaigns = [
      campaign({ id: 24, threshold: 999, giftVariantId: "snow" }),
      tieredCampaign({ id: 25, threshold: 1500, giftVariantId: "rose" }),
    ];
    const { plan, config } = parsedPlan(campaigns);
    assert.equal(plan.mode, "active");
    assert.equal(plan.winningCampaignId, null);
    assert.deepEqual(config?.activeCampaigns.map((row) => row.campaignId).sort(), ["24", "25"]);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 837), null);
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 837 })?.id, 24);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 1116)?.campaignId, "24");
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 1116 })?.id, 24);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 1500)?.campaignId, "25");
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 1500 })?.id, 25);
  });
  it("higher-priority classic still wins after the tiered threshold is reached", () => {
    const campaigns = [
      campaign({ id: 24, threshold: 999, priority: 10, giftVariantId: "snow" }),
      tieredCampaign({ id: 25, threshold: 1500, priority: 0, giftVariantId: "rose" }),
    ];
    const { config } = parsedPlan(campaigns);
    assert.equal(chooseCartCampaign(config!.activeCampaigns, 2000)?.campaignId, "24");
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 2000 })?.id, 24);
  });
  it("a tiered campaign without reward tiers does not hide the classic offer", () => {
    const campaigns = [
      campaign({ id: 24, threshold: 999, giftVariantId: "snow" }),
      { ...campaign({ id: 25, campaignType: TIERED, threshold: 1500, giftVariantId: "rose" }), rewardTiers: [] },
    ];
    const { config } = parsedPlan(campaigns);
    assert.deepEqual(config?.activeCampaigns.map((row) => row.campaignId), ["24"]);
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 1500 })?.id, 24);
  });
});

 describe("campaign selection currency boundaries", () => {
  it("uses the shop amount when the requested currency already matches", () => {
    const campaigns = [campaign({ id: 1, threshold: 500 }), campaign({ id: 2, threshold: 1000 })];
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 700, currency: "INR", presentmentRate: 0.012 })?.id, 1);
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 11.99, currency: "USD", presentmentRate: 0.012 })?.id, 1);
    assert.equal(selectCartCampaignForProxy(campaigns, { shop: "example", subtotal: 12, currency: "USD", presentmentRate: 0.012 })?.id, 2);
  });
});

describe("campaign competition controls", () => {
 it("validates priorities without accepting blanks or fractions", () => {
  assert.equal(parseCampaignPriority(null, 7), 7);
  assert.equal(parseCampaignPriority("1000"), 1000);
  for (const value of ["", " ", "-1", "1.2", "1001", "Infinity"]) assert.throws(() => parseCampaignPriority(value));
 });
 it("excludes self, paused and expired offers from the overlap notice", () => {
  const rows = [campaign({id: 1}), campaign({id: 2, priority: 10}), campaign({id: 3, status: "PAUSED"}), campaign({id: 4, endDate: new Date("2025-01-01")})].map(row => ({...row, rewardTiers: []}));
  assert.deepEqual(getCampaignOverlapSummaries(rows, {id:1}, NOW).map(row => row.id), [2]);
 });
});
