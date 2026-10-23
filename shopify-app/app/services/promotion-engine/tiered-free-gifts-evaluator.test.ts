import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateWithRegistry, listRegisteredCampaignTypes } from "./evaluate";
import type { CanonicalCampaign, CanonicalCart, EvaluationInput } from "./types";

function campaign(overrides: Partial<CanonicalCampaign> = {}): CanonicalCampaign {
  return {
    id: "10",
    type: "Tiered Free Gifts",
    status: "ACTIVE",
    rules: [{ type: "CART_SUBTOTAL", minimumAmount: 50 }],
    rewards: [],
    rewardTiers: [
      { id: "t1", threshold: 50, giftVariantId: "101", giftProductId: "p1", position: 0 },
      { id: "t2", threshold: 100, giftVariantId: "102", giftProductId: "p2", position: 1 },
      { id: "t3", threshold: 150, giftVariantId: "103", giftProductId: "p3", position: 2 },
    ],
    ...overrides,
  };
}

function input(subtotal: number, lines: CanonicalCart["lines"] = []): EvaluationInput {
  return {
    campaign: campaign(),
    cart: { subtotal, lines },
    now: new Date("2026-07-01T00:00:00Z"),
  };
}

describe("tiered free gifts evaluator", () => {
  it("registers TIERED_FREE_GIFTS", () => {
    assert.ok(listRegisteredCampaignTypes().includes("TIERED_FREE_GIFTS"));
  });

  it("below first tier → no unlocked gifts", () => {
    const result = evaluateWithRegistry(input(49));
    const reward = result.rewards[0];
    assert.equal(reward?.type, "TIERED_FREE_GIFTS");
    if (reward?.type === "TIERED_FREE_GIFTS") {
      assert.equal(reward.unlockedGifts.length, 0);
      assert.equal(reward.nextTier?.threshold, 50);
      assert.ok((reward.nextTier?.remaining ?? 0) > 0);
    }
    assert.equal(result.eligible, false);
  });

  it("exact first threshold → unlocks tier 1", () => {
    const result = evaluateWithRegistry(input(50));
    const reward = result.rewards[0];
    assert.ok(reward?.type === "TIERED_FREE_GIFTS");
    if (reward?.type === "TIERED_FREE_GIFTS") {
      assert.equal(reward.unlockedGifts.length, 1);
      assert.equal(reward.unlockedGifts[0]?.tierId, "t1");
      assert.equal(reward.nextTier?.tierId, "t2");
    }
  });

  it("between tiers → unlocks lower only", () => {
    const result = evaluateWithRegistry(input(75));
    const reward = result.rewards[0];
    assert.ok(reward?.type === "TIERED_FREE_GIFTS");
    if (reward?.type === "TIERED_FREE_GIFTS") {
      assert.equal(reward.unlockedGifts.length, 1);
    }
  });

  it("exact second threshold → unlocks two", () => {
    const result = evaluateWithRegistry(input(100));
    const reward = result.rewards[0];
    assert.ok(reward?.type === "TIERED_FREE_GIFTS");
    if (reward?.type === "TIERED_FREE_GIFTS") {
      assert.equal(reward.unlockedGifts.length, 2);
      assert.equal(reward.nextTier?.threshold, 150);
    }
  });

  it("above final tier → all unlocked, nextTier null", () => {
    const result = evaluateWithRegistry(input(175));
    const reward = result.rewards[0];
    assert.ok(reward?.type === "TIERED_FREE_GIFTS");
    if (reward?.type === "TIERED_FREE_GIFTS") {
      assert.equal(reward.unlockedGifts.length, 3);
      assert.equal(reward.nextTier, null);
    }
    assert.equal(result.progress?.percentage, 100);
  });

  it("cart drop from high to mid removes higher gifts via actions", () => {
    const result = evaluateWithRegistry(
      input(80, [
        {
          lineKey: "a",
          variantId: "101",
          quantity: 1,
          properties: {
            _fgpb_free_gift: "true",
            _fgpb_campaign_id: "10",
            _fgpb_tier_id: "t1",
          },
        },
        {
          lineKey: "b",
          variantId: "102",
          quantity: 1,
          properties: {
            _fgpb_free_gift: "true",
            _fgpb_campaign_id: "10",
            _fgpb_tier_id: "t2",
          },
        },
        {
          lineKey: "c",
          variantId: "103",
          quantity: 1,
          properties: {
            _fgpb_free_gift: "true",
            _fgpb_campaign_id: "10",
            _fgpb_tier_id: "t3",
          },
        },
      ]),
    );
    assert.ok(result.actions.some((a) => a.type === "REMOVE_FREE_GIFT"));
    const remove = result.actions.find((a) => a.type === "REMOVE_FREE_GIFT");
    assert.ok(remove?.type === "REMOVE_FREE_GIFT");
    if (remove?.type === "REMOVE_FREE_GIFT") {
      assert.ok(remove.lineKeys?.includes("b"));
      assert.ok(remove.lineKeys?.includes("c"));
      assert.ok(!remove.lineKeys?.includes("a"));
    }
  });

  it("same variant in multiple tiers uses tier id identity", () => {
    const result = evaluateWithRegistry({
      campaign: campaign({
        rewardTiers: [
          { id: "t1", threshold: 50, giftVariantId: "999", position: 0 },
          { id: "t2", threshold: 100, giftVariantId: "999", position: 1 },
        ],
      }),
      cart: {
        subtotal: 100,
        lines: [
          {
            lineKey: "only-t1",
            variantId: "999",
            quantity: 1,
            properties: {
              _fgpb_free_gift: "true",
              _fgpb_campaign_id: "10",
              _fgpb_tier_id: "t1",
            },
          },
        ],
      },
      now: new Date("2026-07-01T00:00:00Z"),
    });
    assert.ok(
      result.actions.some(
        (a) => a.type === "ADD_FREE_GIFT" && a.tierId === "t2" && a.variantId === "999",
      ),
    );
  });

  it("invalid config → INVALID_CAMPAIGN_CONFIGURATION", () => {
    const result = evaluateWithRegistry({
      campaign: campaign({ rewardTiers: [] }),
      cart: { subtotal: 100, lines: [] },
      now: new Date("2026-07-01T00:00:00Z"),
    });
    assert.equal(result.diagnostic.code, "INVALID_CAMPAIGN_CONFIGURATION");
  });
});
