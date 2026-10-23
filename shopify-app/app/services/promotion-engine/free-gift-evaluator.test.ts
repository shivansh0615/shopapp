import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULE_TYPES } from "../cart-rules.server";
import { buildAutoAddGiftProperties } from "../tagged-gift-cart.server";
import { toEvaluationInput } from "./adapters";
import { evaluateWithRegistry } from "./evaluate";
import { evaluateFreeGift } from "./free-gift-evaluator";
import type { PromotionCampaignSnapshot } from "../promotion-engine.server";

const GIFT_VARIANT = "gid://shopify/ProductVariant/11";
const PAID_VARIANT = "gid://shopify/ProductVariant/22";
const THRESHOLD = 999;

function campaign(
  overrides: Partial<PromotionCampaignSnapshot> = {},
): PromotionCampaignSnapshot {
  return {
    id: 1,
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

describe("Phase 2B — freeGiftEvaluator", () => {
  it("eligible and gift absent → ADD_FREE_GIFT with exact properties", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        lines: [
          { variantId: PAID_VARIANT, quantity: 1, price: THRESHOLD },
        ],
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
    assert.equal(result.diagnostic.code, "GIFT_SHOULD_BE_ADDED");
    assert.equal(result.actions[0]?.type, "ADD_FREE_GIFT");
    if (result.actions[0]?.type === "ADD_FREE_GIFT") {
      assert.deepEqual(result.actions[0].properties, {
        _fgpb_free_gift: "true",
        _fgpb_campaign_id: "1",
      });
      assert.equal(result.actions[0].variantId, GIFT_VARIANT);
      assert.equal(result.actions[0].quantity, 1);
    }
  });

  it("eligible and tagged gift present → GIFT_ALREADY_PRESENT / NO_ACTION", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        lines: [
          { variantId: PAID_VARIANT, quantity: 1, price: THRESHOLD },
          {
            lineKey: "g1",
            variantId: GIFT_VARIANT,
            quantity: 1,
            price: 100,
            properties: buildAutoAddGiftProperties(1),
          },
        ],
      }),
    );
    assert.equal(result.eligible, true);
    assert.equal(result.diagnostic.code, "ELIGIBLE");
    assert.equal(result.actions[0]?.type, "NO_ACTION");
  });

  it("ineligible and tagged gift present → REMOVE_FREE_GIFT", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: 500,
        lines: [
          { variantId: PAID_VARIANT, quantity: 1, price: 500 },
          {
            lineKey: "g1",
            variantId: GIFT_VARIANT,
            quantity: 1,
            price: 100,
            properties: buildAutoAddGiftProperties(1),
          },
        ],
      }),
    );
    assert.equal(result.eligible, false);
    assert.equal(result.diagnostic.code, "GIFT_SHOULD_BE_REMOVED");
    assert.equal(result.actions[0]?.type, "REMOVE_FREE_GIFT");
  });

  it("same SKU paid without tags is not a free gift", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        lines: [{ variantId: GIFT_VARIANT, quantity: 1, price: THRESHOLD }],
      }),
    );
    assert.equal(result.eligible, true);
    assert.equal(result.diagnostic.code, "GIFT_SHOULD_BE_ADDED");
    assert.equal(result.actions[0]?.type, "ADD_FREE_GIFT");
  });

  it("tagged + paid same variant: paid does not satisfy gift presence", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: 1100,
        lines: [
          { variantId: GIFT_VARIANT, quantity: 1, price: 600 },
          { variantId: PAID_VARIANT, quantity: 1, price: 500 },
          {
            lineKey: "g1",
            variantId: GIFT_VARIANT,
            quantity: 1,
            price: 100,
            properties: buildAutoAddGiftProperties(1),
          },
        ],
      }),
    );
    assert.equal(result.eligible, true);
    assert.equal(result.actions[0]?.type, "NO_ACTION");
  });

  it("duplicate tagged gifts → DUPLICATE_GIFT_LINES", () => {
    const props = buildAutoAddGiftProperties(1);
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        lines: [
          { variantId: PAID_VARIANT, quantity: 1, price: THRESHOLD },
          { lineKey: "g1", variantId: GIFT_VARIANT, quantity: 1, price: 100, properties: props },
          { lineKey: "g2", variantId: GIFT_VARIANT, quantity: 1, price: 100, properties: props },
        ],
      }),
    );
    assert.equal(result.diagnostic.code, "DUPLICATE_GIFT_LINES");
    assert.ok(result.actions.some((a) => a.type === "REMOVE_FREE_GIFT"));
  });

  it("tagged quantity > 1 → GIFT_QUANTITY_INVALID", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        lines: [
          { variantId: PAID_VARIANT, quantity: 1, price: THRESHOLD },
          {
            lineKey: "g1",
            variantId: GIFT_VARIANT,
            quantity: 3,
            price: 100,
            properties: buildAutoAddGiftProperties(1),
          },
        ],
      }),
    );
    assert.equal(result.diagnostic.code, "GIFT_QUANTITY_INVALID");
    assert.equal(result.actions[0]?.type, "NORMALIZE_FREE_GIFT_QUANTITY");
  });

  it("disabled campaign → CAMPAIGN_DISABLED", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign({ status: "PAUSED" }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.active, false);
    assert.equal(result.eligible, false);
    assert.equal(result.diagnostic.code, "CAMPAIGN_DISABLED");
  });

  it("not started / expired schedule diagnostics", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const notStarted = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        now,
        startDate: new Date("2026-08-01T00:00:00Z"),
      }),
    );
    assert.equal(notStarted.diagnostic.code, "NOT_STARTED");

    const expired = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
        now,
        endDate: new Date("2026-07-01T00:00:00Z"),
      }),
    );
    assert.equal(expired.diagnostic.code, "EXPIRED");
  });

  it("invalid configuration without gift variant", () => {
    const result = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign({ giftVariantId: null }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.diagnostic.code, "INVALID_CAMPAIGN_CONFIGURATION");
  });

  it("progress clamps and remaining never below zero", () => {
    const above = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: 5000,
      }),
    );
    assert.equal(above.progress?.percentage, 100);
    assert.equal(above.progress?.remaining, 0);

    const below = evaluateFreeGift(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: 100,
      }),
    );
    assert.ok((below.progress?.remaining ?? -1) >= 0);
    assert.ok((below.progress?.percentage ?? -1) >= 0);
    assert.ok((below.progress?.percentage ?? 101) <= 100);
  });
});

describe("Phase 2B — registry", () => {
  it("unsupported campaign types return UNSUPPORTED_CAMPAIGN_TYPE", () => {
    const result = evaluateWithRegistry(
      toEvaluationInput({
        campaign: campaign({ campaignType: "Mystery Gift" }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, false);
    assert.equal(result.eligible, false);
    assert.equal(result.diagnostic.code, "UNSUPPORTED_CAMPAIGN_TYPE");
    assert.equal(result.actions[0]?.type, "NO_ACTION");
  });

  it("Spend X -> Free Gift routes to freeGiftEvaluator", () => {
    const result = evaluateWithRegistry(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
  });
});
