import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RULE_TYPES,
  countMatchingLines,
  evaluateRuleProgress,
  sumCollectionSubtotal,
} from "./cart-rules.server";

describe("cart rules", () => {
  it("evaluates spend threshold by cart subtotal", () => {
    const result = evaluateRuleProgress({
      campaign: {
        ruleType: RULE_TYPES.SPEND_THRESHOLD,
        threshold: 500,
        triggerQuantity: 1,
        triggerProductIds: [],
        triggerCollectionIds: [],
      },
      cartSubtotal: 300,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.remaining, 200);
    assert.equal(result.progress, 60);
  });

  it("evaluates buy X get Y by matching variant quantity", () => {
    const result = evaluateRuleProgress({
      campaign: {
        ruleType: RULE_TYPES.BUY_X_GET_Y,
        threshold: 0,
        triggerQuantity: 2,
        triggerProductIds: ["111"],
        triggerCollectionIds: [],
      },
      cartSubtotal: 0,
      cartLines: [
        { variantId: "111", quantity: 1, price: 100 },
        { variantId: "111", quantity: 1, price: 100 },
      ],
    });
    assert.equal(result.metric, 2);
    assert.equal(result.eligible, true);
  });

  it("evaluates collection spend subtotal", () => {
    const total = sumCollectionSubtotal(
      [
        { variantId: "1", quantity: 1, price: 200, collectionIds: ["c1"] },
        { variantId: "2", quantity: 1, price: 100, collectionIds: ["c2"] },
      ],
      ["c1"],
    );
    assert.equal(total, 200);
    assert.equal(countMatchingLines([{ variantId: "111", quantity: 2, price: 10 }], ["111"]), 2);
  });
});
