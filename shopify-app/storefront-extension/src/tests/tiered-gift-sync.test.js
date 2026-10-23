import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FREE_GIFT_KEY, TIER_KEY } from "../utils/util.js";
import { buildTierGiftProperties, isTaggedGift, planTieredGiftSync } from "../utils/tiered-gift-sync.js";

const CAMPAIGN = "40";
const V1 = "111";
const V2 = "222";
const V3 = "333";

function tagged(tierId, variantId, opts = {}) {
  return {
    variantId,
    quantity: opts.quantity ?? 1,
    lineKey: opts.lineKey ?? `gift-${tierId}`,
    properties: buildTierGiftProperties(CAMPAIGN, tierId),
  };
}

describe("tiered-gift-sync planner", () => {
  it("exports TIER_KEY", () => {
    assert.equal(TIER_KEY, "_fgpb_tier_id");
  });

  it("isTaggedGift requires _fgpb_free_gift true only", () => {
    assert.equal(isTaggedGift({ [FREE_GIFT_KEY]: "true" }), true);
    assert.equal(isTaggedGift({ "Free Gift": "UNLOCKED" }), false);
    assert.equal(isTaggedGift({ [TIER_KEY]: "t1" }), false);
    assert.equal(isTaggedGift({}), false);
  });

  it("adds missing unlocked gifts", () => {
    const actions = planTieredGiftSync({
      cart: { items: [{ variantId: "999", quantity: 1, lineKey: "paid", properties: {} }] },
      unlockedGifts: [
        { tierId: "t1", variantId: V1 },
        { tierId: "t2", variantId: V2 },
      ],
      campaignId: CAMPAIGN,
    });
    assert.equal(actions.filter((a) => a.type === "ADD").length, 2);
    assert.ok(actions.every((a) => a.type !== "ADD" || a.properties[TIER_KEY]));
  });

  it("unlocking three tiers plans three ADDs", () => {
    const actions = planTieredGiftSync({
      cart: { items: [{ variantId: "paid", quantity: 2, lineKey: "paid", properties: {} }] },
      unlockedGifts: [
        { tierId: "t1", variantId: V1 },
        { tierId: "t2", variantId: V2 },
        { tierId: "t3", variantId: V3 },
      ],
      campaignId: CAMPAIGN,
    });
    const adds = actions.filter((a) => a.type === "ADD");
    assert.equal(adds.length, 3);
    assert.deepEqual(
      adds.map((a) => a.tierId).sort(),
      ["t1", "t2", "t3"],
    );
  });

  it("dropping below mid tier removes higher gifts only", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [
          tagged("t1", V1, { lineKey: "g1" }),
          tagged("t2", V2, { lineKey: "g2" }),
          tagged("t3", V3, { lineKey: "g3" }),
        ],
      },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
    });
    const removes = actions.filter((a) => a.type === "REMOVE").map((a) => a.lineKey).sort();
    assert.deepEqual(removes, ["g2", "g3"]);
    assert.equal(actions.filter((a) => a.type === "ADD").length, 0);
  });

  it("removes locked / stale tagged gifts", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [tagged("t2", V2, { lineKey: "locked" })],
      },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
    });
    assert.deepEqual(
      actions.filter((a) => a.type === "REMOVE").map((a) => a.lineKey),
      ["locked"],
    );
    assert.ok(actions.some((a) => a.type === "ADD" && a.tierId === "t1"));
  });

  it("normalizes qty to 1 and removes duplicates per tier", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [
          tagged("t1", V1, { lineKey: "a", quantity: 3 }),
          tagged("t1", V1, { lineKey: "b", quantity: 1 }),
        ],
      },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
    });
    assert.ok(actions.some((a) => a.type === "NORMALIZE" && a.quantity === 1 && a.lineKey === "a"));
    assert.ok(actions.some((a) => a.type === "REMOVE" && a.lineKey === "b"));
  });

  it("preserves paid same-SKU lines", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [
          { variantId: V1, quantity: 1, lineKey: "paid", properties: {} },
          tagged("t1", V1, { lineKey: "gift" }),
        ],
      },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
    });
    assert.equal(actions.length, 0);
  });

  it("same-SKU paid + gift: remove gift independently when locked", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [
          { variantId: V1, quantity: 2, lineKey: "paid-snowboard", properties: {} },
          tagged("t1", V1, { lineKey: "gift-snowboard" }),
        ],
      },
      unlockedGifts: [],
      campaignId: CAMPAIGN,
    });
    assert.deepEqual(
      actions.filter((a) => a.type === "REMOVE").map((a) => a.lineKey),
      ["gift-snowboard"],
    );
    assert.ok(!actions.some((a) => a.lineKey === "paid-snowboard"));
  });

  it("never plans ADD using a paid line as coverage", () => {
    const actions = planTieredGiftSync({
      cart: {
        items: [{ variantId: V1, quantity: 2, lineKey: "paid", properties: {} }],
      },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
    });
    assert.equal(actions.filter((a) => a.type === "ADD").length, 1);
    assert.equal(actions[0].variantId, V1);
    assert.equal(actions[0].properties[FREE_GIFT_KEY], "true");
  });

  it("skips ADD when autoAddGift is false", () => {
    const actions = planTieredGiftSync({
      cart: { items: [] },
      unlockedGifts: [{ tierId: "t1", variantId: V1 }],
      campaignId: CAMPAIGN,
      autoAddGift: false,
    });
    assert.equal(actions.filter((a) => a.type === "ADD").length, 0);
  });
});


it("replaces a previous campaign's gift even when both use the same tier ID", () => {
  const actions = planTieredGiftSync({
    cart: { items: [tagged("t1", V1, { lineKey: "old-gift" }), { lineKey: "paid", variantId: V1, quantity: 1, properties: {} }] },
    unlockedGifts: [{ tierId: "t1", variantId: V2 }], campaignId: "new-campaign",
  });
  assert.deepEqual(actions.map(a => a.type), ["REMOVE", "ADD"]);
  assert.equal(actions[0].lineKey, "old-gift");
  assert.equal(actions[1].variantId, V2);
});
it("clears all app gifts for a confirmed no-reward cart without touching paid lines", () => {
  const actions = planTieredGiftSync({ cart: { items: [tagged("t1", V1), { lineKey: "paid", quantity: 1, properties: {} }] }, unlockedGifts: [], campaignId: null });
  assert.deepEqual(actions, [{ type: "REMOVE", lineKey: "gift-t1" }]);
});
