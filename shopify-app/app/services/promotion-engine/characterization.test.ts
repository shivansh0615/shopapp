/**
 * Characterization tests — lock CURRENT production semantics before Phase 2B moves
 * Free Gift decision-making into the canonical evaluator.
 *
 * Sources under test:
 * - promotion-engine.server (progress / evaluatePromotion / reward type)
 * - tagged-gift-cart.server (gift line identity + ADD/REMOVE intent)
 * - campaign-schedule.server (schedule window)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateProgress,
  evaluatePromotion,
  resolveRewardType,
  toPromotionCampaignSnapshot,
  type PromotionCampaignSnapshot,
} from "../promotion-engine.server";
import { evaluateRuleProgress, RULE_TYPES } from "../cart-rules.server";
import { isCampaignWithinSchedule } from "../campaign-schedule.server";
import {
  buildAutoAddGiftProperties,
  buildTaggedGiftCartAction,
  calculateEligibleSubtotal,
  findTaggedGiftLines,
  needsTaggedGiftQuantityEnforcement,
  type TaggedGiftCart,
  type TaggedGiftCartItem,
} from "../tagged-gift-cart.server";

const GIFT_VARIANT = "gid://shopify/ProductVariant/11";
const PAID_VARIANT = "gid://shopify/ProductVariant/22";
const CAMPAIGN_ID = 1;
const THRESHOLD = 999;

function baseCampaign(
  overrides: Partial<PromotionCampaignSnapshot> = {},
): PromotionCampaignSnapshot {
  return {
    id: CAMPAIGN_ID,
    name: "Test",
    campaignType: "Spend X -> Free Gift",
    threshold: THRESHOLD,
    status: "ACTIVE",
    giftProductId: "gid://shopify/Product/1",
    giftProductTitle: "Gift",
    giftProductImage: null,
    giftVariantId: GIFT_VARIANT,
    giftQuantity: 1,
    discountPercentage: null,
    fixedDiscountAmount: null,
    ruleType: RULE_TYPES.SPEND_THRESHOLD,
    triggerQuantity: 1,
    triggerProductIds: [],
    triggerCollectionIds: [],
    allowCustomerChoice: false,
    widgetSettings: null,
    ...overrides,
  };
}

function line(
  input: Partial<TaggedGiftCartItem> & Pick<TaggedGiftCartItem, "lineKey" | "variantId" | "price">,
): TaggedGiftCartItem {
  return {
    productId: input.productId ?? "product",
    variantId: input.variantId,
    title: input.title ?? "Item",
    quantity: input.quantity ?? 1,
    price: input.price,
    lineKey: input.lineKey,
    properties: input.properties ?? null,
    isFreeGift: input.isFreeGift ?? false,
  };
}

function paid(amount: number, qty = 1): TaggedGiftCartItem {
  return line({
    lineKey: `paid-${amount}`,
    variantId: PAID_VARIANT,
    quantity: qty,
    price: amount,
  });
}

function taggedGift(qty = 1, campaignId: number | string = CAMPAIGN_ID): TaggedGiftCartItem {
  return line({
    lineKey: `tagged-${qty}-${campaignId}`,
    variantId: GIFT_VARIANT,
    quantity: qty,
    price: 100,
    isFreeGift: true,
    properties: buildAutoAddGiftProperties(campaignId),
  });
}

function paidSameSku(qty = 1, price = 100): TaggedGiftCartItem {
  return line({
    lineKey: "paid-same-sku",
    variantId: GIFT_VARIANT,
    quantity: qty,
    price,
  });
}

function cart(items: TaggedGiftCartItem[]): TaggedGiftCart {
  return {
    subtotal: items.reduce((t, i) => t + i.quantity * i.price, 0),
    currency: "INR",
    items,
  };
}

describe("Phase 2 characterization — calculateProgress / threshold", () => {
  it("below threshold is not eligible", () => {
    const r = calculateProgress(500, THRESHOLD);
    assert.equal(r.eligible, false);
    assert.ok(r.remaining > 0);
    assert.ok(r.progress < 100);
  });

  it("exact threshold is eligible via cent rounding", () => {
    const r = calculateProgress(THRESHOLD, THRESHOLD);
    assert.equal(r.eligible, true);
    assert.equal(r.remaining, 0);
    assert.equal(r.progress, 100);
  });

  it("above threshold clamps progress to 100 and remaining to 0", () => {
    const r = calculateProgress(2000, THRESHOLD);
    assert.equal(r.eligible, true);
    assert.equal(r.progress, 100);
    assert.equal(r.remaining, 0);
  });

  it("zero/invalid threshold is not eligible", () => {
    assert.equal(calculateProgress(100, 0).eligible, false);
    assert.equal(calculateProgress(100, -5).eligible, false);
  });

  it("empty cart (0 subtotal) is not eligible", () => {
    const r = calculateProgress(0, THRESHOLD);
    assert.equal(r.eligible, false);
    assert.equal(r.remaining, THRESHOLD);
    assert.equal(r.progress, 0);
  });

  it("decimal prices use cent rounding at exact boundary", () => {
    const r = calculateProgress(99.994, 100);
    assert.equal(r.eligible, false);
    const at = calculateProgress(99.995, 100);
    assert.equal(at.eligible, true);
  });
});

describe("Phase 2 characterization — evaluatePromotion campaign state", () => {
  it("ACTIVE spend campaign unlocks at threshold (eligible)", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign(),
      cartSubtotal: THRESHOLD,
      currency: "₹",
    });
    assert.equal(ev.eligible, true);
    assert.equal(ev.status, "UNLOCKED");
    assert.equal(ev.rewardType, "FREE_GIFT");
  });

  it("ACTIVE spend campaign stays locked below threshold (ineligible)", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign(),
      cartSubtotal: 500,
      currency: "₹",
    });
    assert.equal(ev.eligible, false);
    assert.equal(ev.status, "LOCKED");
  });

  it("PAUSED / disabled campaign stays locked even when subtotal meets threshold", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign({ status: "PAUSED" }),
      cartSubtotal: THRESHOLD,
      currency: "₹",
    });
    assert.equal(ev.eligible, false);
    assert.equal(ev.status, "LOCKED");
  });

  it("evaluatePromotion does not apply schedule dates (selection layer owns schedule)", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign({ status: "ACTIVE" }),
      cartSubtotal: THRESHOLD,
      currency: "₹",
    });
    assert.equal(ev.eligible, true);
  });
  it("unsupported campaign type never unlocks as FREE_GIFT", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign({ campaignType: "Mystery Gift" }),
      cartSubtotal: THRESHOLD,
      currency: "₹",
    });
    assert.equal(ev.rewardType, "UNSUPPORTED");
    assert.equal(ev.eligible, false);
    assert.equal(ev.status, "LOCKED");
  });
});

describe("Phase 2 characterization — schedule helpers (selection uses these)", () => {
  it("not started when now is before startDate", () => {
    const now = new Date("2026-07-01T00:00:00Z");
    assert.equal(
      isCampaignWithinSchedule(
        { startDate: new Date("2026-08-01T00:00:00Z"), endDate: null },
        now,
      ),
      false,
    );
  });

  it("expired when now is after endDate", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    assert.equal(
      isCampaignWithinSchedule(
        { startDate: null, endDate: new Date("2026-08-01T00:00:00Z") },
        now,
      ),
      false,
    );
  });

  it("active scheduled window returns true", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    assert.equal(
      isCampaignWithinSchedule(
        {
          startDate: new Date("2026-07-01T00:00:00Z"),
          endDate: new Date("2026-08-01T00:00:00Z"),
        },
        now,
      ),
      true,
    );
  });
});

describe("Phase 2 characterization — gift line actions (tagged-gift-cart)", () => {
  it("eligible and gift absent → ADD_GIFT", () => {
    const snapshot = cart([paid(THRESHOLD)]);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "ADD_GIFT",
    );
  });

  it("eligible and tagged gift present → NONE (gift already present)", () => {
    const snapshot = cart([paid(THRESHOLD), taggedGift(1)]);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "NONE",
    );
  });

  it("ineligible and tagged gift absent → NONE", () => {
    const snapshot = cart([paid(500)]);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "NONE",
    );
  });

  it("ineligible and tagged gift present → REMOVE_GIFT", () => {
    const snapshot = cart([paid(500), taggedGift(1)]);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "REMOVE_GIFT",
    );
  });

  it("tagged gift quantity > 1 needs quantity enforcement", () => {
    const snapshot = cart([paid(THRESHOLD), taggedGift(2)]);
    assert.equal(needsTaggedGiftQuantityEnforcement(snapshot, CAMPAIGN_ID), true);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "NONE",
    );
  });

  it("duplicate tagged gift lines need quantity enforcement", () => {
    const snapshot = cart([
      paid(THRESHOLD),
      taggedGift(1),
      line({
        lineKey: "tagged-dup",
        variantId: GIFT_VARIANT,
        quantity: 1,
        price: 100,
        isFreeGift: true,
        properties: buildAutoAddGiftProperties(CAMPAIGN_ID),
      }),
    ]);
    assert.equal(findTaggedGiftLines(snapshot, CAMPAIGN_ID).length, 2);
    assert.equal(needsTaggedGiftQuantityEnforcement(snapshot, CAMPAIGN_ID), true);
  });

  it("tagged gift for a different campaign is not the active campaign gift", () => {
    const snapshot = cart([paid(THRESHOLD), taggedGift(1, 99)]);
    assert.equal(findTaggedGiftLines(snapshot, CAMPAIGN_ID).length, 0);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "ADD_GIFT",
    );
  });

  it("same SKU paid (untagged) never counts as free gift", () => {
    const snapshot = cart([paidSameSku(1, THRESHOLD)]);
    assert.equal(findTaggedGiftLines(snapshot, CAMPAIGN_ID).length, 0);
    assert.equal(calculateEligibleSubtotal(snapshot), THRESHOLD);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "ADD_GIFT",
    );
  });

  it("tagged + paid same variant together: paid counts, tagged excluded from subtotal", () => {
    const snapshot = cart([paidSameSku(1, 600), paid(500), taggedGift(1)]);
    assert.equal(calculateEligibleSubtotal(snapshot), 1100);
    assert.equal(findTaggedGiftLines(snapshot, CAMPAIGN_ID).length, 1);
    assert.equal(
      buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "NONE",
    );
  });

  it("gift properties are exactly _fgpb_free_gift + _fgpb_campaign_id", () => {
    const props = buildAutoAddGiftProperties(CAMPAIGN_ID);
    assert.deepEqual(props, {
      _fgpb_free_gift: "true",
      _fgpb_campaign_id: String(CAMPAIGN_ID),
    });
  });
});

describe("Phase 2 characterization — evaluateRuleProgress SPEND_THRESHOLD", () => {
  it("uses cartSubtotal as metric for SPEND_THRESHOLD", () => {
    const r = evaluateRuleProgress({
      campaign: {
        ruleType: RULE_TYPES.SPEND_THRESHOLD,
        threshold: 100,
        triggerQuantity: 1,
        triggerProductIds: [],
        triggerCollectionIds: [],
      },
      cartSubtotal: 40,
    });
    assert.equal(r.metric, 40);
    assert.equal(r.eligible, false);
    assert.equal(r.remaining, 60);
  });

  it("evaluatePromotion progress path uses evaluateRuleProgress (metric >= target, no cent round)", () => {
    const ev = evaluatePromotion({
      campaign: baseCampaign({ threshold: 100 }),
      cartSubtotal: 99.994,
      currency: "₹",
    });
    // cart-rules: 99.994 >= 100 → false (unlike calculateProgress cent rounding)
    assert.equal(ev.eligible, false);
  });
});

describe("Phase 2 characterization — snapshot mapping", () => {
  it("toPromotionCampaignSnapshot preserves gift + threshold fields", () => {
    const snapshot = toPromotionCampaignSnapshot({
      id: 9,
      shop: "test.myshopify.com",
      name: "Monsoon",
      campaignType: "Spend X -> Free Gift",
      threshold: 999,
      status: "ACTIVE",
      giftProductId: "p1",
      giftProductTitle: "Board",
      giftProductImage: null,
      giftVariantId: "v1",
      giftQuantity: 1,
      discountPercentage: null,
      placements: [],
      widgetSettings: { heading: "Hi" },
      ruleType: "SPEND_THRESHOLD",
      triggerQuantity: 1,
      triggerProductIds: [],
      triggerCollectionIds: [],
      allowCustomerChoice: false,
      startDate: null,
      endDate: null,
      priority: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    assert.equal(snapshot.id, 9);
    assert.equal(snapshot.threshold, 999);
    assert.equal(snapshot.giftVariantId, "v1");
    assert.equal(snapshot.widgetSettings?.heading, "Hi");
  });
});

describe("Phase 2 characterization — resolveRewardType (pre-fix baseline documented)", () => {
  it("Spend X -> Free Gift maps to FREE_GIFT", () => {
    assert.equal(resolveRewardType("Spend X -> Free Gift"), "FREE_GIFT");
  });

  it("Spend X -> Percentage Discount maps to PERCENTAGE_DISCOUNT", () => {
    assert.equal(resolveRewardType("Spend X -> Percentage Discount"), "PERCENTAGE_DISCOUNT");
  });

  it("Spend X -> Fixed Discount maps to FIXED_DISCOUNT", () => {
    assert.equal(resolveRewardType("Spend X -> Fixed Discount"), "FIXED_DISCOUNT");
  });

  /**
   * Phase 2B removes silent FREE_GIFT coercion for Mystery Gift / unknown types.
   * This suite is updated in the same change that lands the fix.
   */
  it("unsupported types are NOT coerced to FREE_GIFT", () => {
    assert.notEqual(resolveRewardType("Spend X -> Discount"), "FREE_GIFT");
    assert.notEqual(resolveRewardType("Mystery Gift"), "FREE_GIFT");
    assert.equal(resolveRewardType("Mystery Gift"), "UNSUPPORTED");
    assert.equal(resolveRewardType("Spend X -> Discount"), "UNSUPPORTED");
  });
});
