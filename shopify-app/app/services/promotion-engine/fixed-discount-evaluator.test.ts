import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULE_TYPES } from "../cart-rules.server";
import { toEvaluationInput } from "./adapters";
import { evaluateWithRegistry, listRegisteredCampaignTypes } from "./evaluate";
import { evaluateFixedDiscount } from "./fixed-discount-evaluator";
import type { PromotionCampaignSnapshot } from "../promotion-engine.server";

const THRESHOLD = 1000;

function campaign(
  overrides: Partial<PromotionCampaignSnapshot> = {},
): PromotionCampaignSnapshot {
  return {
    id: 42,
    name: "Spend & Save Fixed",
    campaignType: "Spend X -> Fixed Discount",
    threshold: THRESHOLD,
    status: "ACTIVE",
    giftProductId: "",
    giftProductTitle: null,
    giftProductImage: null,
    giftVariantId: null,
    giftQuantity: 1,
    discountPercentage: null,
    fixedDiscountAmount: 100,
    ruleType: RULE_TYPES.SPEND_THRESHOLD,
    triggerQuantity: 1,
    triggerProductIds: [],
    triggerCollectionIds: [],
    allowCustomerChoice: false,
    widgetSettings: null,
    ...overrides,
  };
}

describe("Phase 3B — fixedDiscountEvaluator", () => {
  it("registers FIXED_DISCOUNT alongside FREE_GIFT and PERCENTAGE_DISCOUNT", () => {
    const types = listRegisteredCampaignTypes();
    assert.ok(types.includes("FREE_GIFT"));
    assert.ok(types.includes("PERCENTAGE_DISCOUNT"));
    assert.ok(types.includes("FIXED_DISCOUNT"));
  });

  it("eligible at threshold → APPLY_FIXED_DISCOUNT", () => {
    const result = evaluateFixedDiscount(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
    assert.equal(result.diagnostic.code, "ELIGIBLE");
    assert.equal(result.rewards[0]?.type, "FIXED_DISCOUNT");
    if (result.rewards[0]?.type === "FIXED_DISCOUNT") {
      assert.equal(result.rewards[0].amount, 100);
    }
    assert.equal(result.actions[0]?.type, "APPLY_FIXED_DISCOUNT");
  });

  it("not eligible below threshold", () => {
    const result = evaluateFixedDiscount(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD - 0.01,
      }),
    );
    assert.equal(result.eligible, false);
    assert.equal(result.diagnostic.code, "THRESHOLD_NOT_MET");
    assert.equal(result.actions[0]?.type, "NO_ACTION");
    assert.ok((result.progress?.remaining ?? 0) > 0);
  });

  it("threshold edge: exact cents match unlocks", () => {
    const result = evaluateFixedDiscount(
      toEvaluationInput({
        campaign: campaign({ threshold: 100 }),
        cartSubtotal: 99.995,
      }),
    );
    assert.equal(result.eligible, true);
  });

  it("invalid amount (0) → INVALID_CAMPAIGN_CONFIGURATION", () => {
    const result = evaluateFixedDiscount(
      toEvaluationInput({
        campaign: campaign({ fixedDiscountAmount: 0 }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.diagnostic.code, "INVALID_CAMPAIGN_CONFIGURATION");
    assert.equal(result.eligible, false);
  });

  it("invalid amount (negative) → INVALID_CAMPAIGN_CONFIGURATION", () => {
    const result = evaluateFixedDiscount(
      toEvaluationInput({
        campaign: campaign({ fixedDiscountAmount: -10 }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.diagnostic.code, "INVALID_CAMPAIGN_CONFIGURATION");
    assert.equal(result.eligible, false);
  });

  it("evaluateWithRegistry routes Fixed Discount campaigns", () => {
    const result = evaluateWithRegistry(
      toEvaluationInput({
        campaign: campaign({ fixedDiscountAmount: 50 }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
    assert.equal(result.rewards[0]?.type, "FIXED_DISCOUNT");
    if (result.rewards[0]?.type === "FIXED_DISCOUNT") {
      assert.equal(result.rewards[0].amount, 50);
    }
  });

  it("unsupported campaigns still return UNSUPPORTED_CAMPAIGN_TYPE", () => {
    const result = evaluateWithRegistry(
      toEvaluationInput({
        campaign: campaign({ campaignType: "Mystery Gift" }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, false);
    assert.equal(result.diagnostic.code, "UNSUPPORTED_CAMPAIGN_TYPE");
  });
});
