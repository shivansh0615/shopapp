import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RULE_TYPES } from "../cart-rules.server";
import { toEvaluationInput } from "./adapters";
import { evaluateWithRegistry, listRegisteredCampaignTypes } from "./evaluate";
import { evaluatePercentageDiscount } from "./percentage-discount-evaluator";
import type { PromotionCampaignSnapshot } from "../promotion-engine.server";

const THRESHOLD = 1000;

function campaign(
  overrides: Partial<PromotionCampaignSnapshot> = {},
): PromotionCampaignSnapshot {
  return {
    id: 42,
    name: "Spend & Save",
    campaignType: "Spend X -> Percentage Discount",
    threshold: THRESHOLD,
    status: "ACTIVE",
    giftProductId: "",
    giftProductTitle: null,
    giftProductImage: null,
    giftVariantId: null,
    giftQuantity: 1,
    discountPercentage: 10,
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

describe("Phase 3A — percentageDiscountEvaluator", () => {
  it("registers PERCENTAGE_DISCOUNT alongside FREE_GIFT", () => {
    const types = listRegisteredCampaignTypes();
    assert.ok(types.includes("FREE_GIFT"));
    assert.ok(types.includes("PERCENTAGE_DISCOUNT"));
  });

  it("eligible at threshold → APPLY_PERCENTAGE_DISCOUNT", () => {
    const result = evaluatePercentageDiscount(
      toEvaluationInput({
        campaign: campaign(),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
    assert.equal(result.diagnostic.code, "ELIGIBLE");
    assert.equal(result.rewards[0]?.type, "PERCENTAGE_DISCOUNT");
    if (result.rewards[0]?.type === "PERCENTAGE_DISCOUNT") {
      assert.equal(result.rewards[0].percentage, 10);
    }
    assert.equal(result.actions[0]?.type, "APPLY_PERCENTAGE_DISCOUNT");
  });

  it("not eligible below threshold", () => {
    const result = evaluatePercentageDiscount(
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
    const result = evaluatePercentageDiscount(
      toEvaluationInput({
        campaign: campaign({ threshold: 100 }),
        cartSubtotal: 99.995,
      }),
    );
    assert.equal(result.eligible, true);
  });

  it("invalid percentage → INVALID_CAMPAIGN_CONFIGURATION", () => {
    const result = evaluatePercentageDiscount(
      toEvaluationInput({
        campaign: campaign({ discountPercentage: 0 }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.diagnostic.code, "INVALID_CAMPAIGN_CONFIGURATION");
    assert.equal(result.eligible, false);
  });

  it("evaluateWithRegistry routes Percentage Discount campaigns", () => {
    const result = evaluateWithRegistry(
      toEvaluationInput({
        campaign: campaign({ discountPercentage: 15 }),
        cartSubtotal: THRESHOLD,
      }),
    );
    assert.equal(result.supported, true);
    assert.equal(result.eligible, true);
    assert.equal(result.rewards[0]?.type, "PERCENTAGE_DISCOUNT");
    if (result.rewards[0]?.type === "PERCENTAGE_DISCOUNT") {
      assert.equal(result.rewards[0].percentage, 15);
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
