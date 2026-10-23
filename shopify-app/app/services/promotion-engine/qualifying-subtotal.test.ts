import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAutoAddGiftProperties } from "../tagged-gift-cart.server";
import {
  calculateQualifyingSubtotal,
  calculateQualifyingSubtotalFromLines,
} from "./qualifying-subtotal";

describe("Phase 2B — calculateQualifyingSubtotal", () => {
  it("excludes tagged free-gift lines", () => {
    const subtotal = calculateQualifyingSubtotalFromLines([
      { quantity: 1, price: 600, properties: null },
      {
        quantity: 1,
        price: 100,
        properties: buildAutoAddGiftProperties(1),
      },
    ]);
    assert.equal(subtotal, 600);
  });

  it("includes same-SKU paid lines without gift properties", () => {
    const giftVariantPrice = 885.95;
    const subtotal = calculateQualifyingSubtotalFromLines([
      { quantity: 1, price: giftVariantPrice, properties: null },
    ]);
    assert.equal(subtotal, giftVariantPrice);
  });

  it("tagged + paid same variant: only paid counts", () => {
    const subtotal = calculateQualifyingSubtotal({
      subtotal: 0,
      lines: [
        { variantId: "11", quantity: 1, price: 600 },
        {
          variantId: "11",
          quantity: 1,
          price: 100,
          properties: buildAutoAddGiftProperties(8),
        },
      ],
    });
    assert.equal(subtotal, 600);
  });

  it("empty cart is 0", () => {
    assert.equal(calculateQualifyingSubtotalFromLines([]), 0);
  });
});
