import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAutoAddGiftProperties,
  buildTaggedGiftCartAction,
  calculateEligibleSubtotal,
  findTaggedGiftLine,
  needsTaggedGiftQuantityEnforcement,
  type TaggedGiftCart,
  type TaggedGiftCartItem,
} from "./tagged-gift-cart.server";

const GIFT_VARIANT = "54277124161902";
const PAID_VARIANT = "11111111111";
const CAMPAIGN_ID = 8;
const THRESHOLD = 999;

function line(input: Partial<TaggedGiftCartItem> & Pick<TaggedGiftCartItem, "lineKey" | "variantId" | "price">): TaggedGiftCartItem {
  const properties = input.properties ?? null;
  return {
    productId: input.productId ?? "product",
    variantId: input.variantId,
    title: input.title ?? "Item",
    quantity: input.quantity ?? 1,
    price: input.price,
    lineKey: input.lineKey,
    properties,
    isFreeGift: input.isFreeGift ?? false,
  };
}

function paidGiftManual(qty = 1, price = 885.95): TaggedGiftCartItem {
  return line({
    lineKey: "paid-gift",
    variantId: GIFT_VARIANT,
    title: "The Minimal Snowboard",
    quantity: qty,
    price,
    isFreeGift: false,
  });
}

function taggedGift(qty = 1): TaggedGiftCartItem {
  return line({
    lineKey: "tagged-gift",
    variantId: GIFT_VARIANT,
    title: "The Minimal Snowboard",
    quantity: qty,
    price: 885.95,
    isFreeGift: true,
    properties: buildAutoAddGiftProperties(CAMPAIGN_ID),
  });
}

function paidHydrogen(qty = 1, price = 600): TaggedGiftCartItem {
  return line({
    lineKey: "hydrogen",
    variantId: PAID_VARIANT,
    title: "Hydrogen",
    quantity: qty,
    price,
    isFreeGift: false,
  });
}

function cart(items: TaggedGiftCartItem[]): TaggedGiftCart {
  const subtotal = items.reduce((total, item) => total + item.quantity * item.price, 0);
  return { subtotal, currency: "INR", items };
}

describe("tagged gift cart architecture", () => {
  it("A. manual gift purchase below threshold stays paid and counts toward progress", () => {
    const snapshot = cart([paidGiftManual(1, 600)]);

    assert.equal(calculateEligibleSubtotal(snapshot), 600);
    assert.equal(buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "NONE");
    assert.equal(findTaggedGiftLine(snapshot, CAMPAIGN_ID), null);
  });

  it("B. manual gift plus threshold unlock allows one paid line and one tagged gift line", () => {
    const snapshot = cart([paidGiftManual(1, 600), paidHydrogen(1, 500)]);

    assert.equal(calculateEligibleSubtotal(snapshot), 1100);
    assert.equal(buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "ADD_GIFT");

    const withTaggedGift = cart([paidGiftManual(1, 600), paidHydrogen(1, 500), taggedGift(1)]);
    assert.equal(calculateEligibleSubtotal(withTaggedGift), 1100);
    assert.equal(findTaggedGiftLine(withTaggedGift, CAMPAIGN_ID)?.lineKey, "tagged-gift");
    assert.equal(buildTaggedGiftCartAction({ cart: withTaggedGift, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "NONE");
  });

  it("C. cart refresh does not require duplicate tagged gift when one already exists", () => {
    const snapshot = cart([paidHydrogen(2, 600), taggedGift(1)]);

    assert.equal(findTaggedGiftLine(snapshot, CAMPAIGN_ID)?.quantity, 1);
    assert.equal(buildTaggedGiftCartAction({ cart: snapshot, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "NONE");
    assert.equal(needsTaggedGiftQuantityEnforcement(snapshot, CAMPAIGN_ID), false);
  });

  it("D. dropping below threshold removes only the tagged gift, paid line remains", () => {
    const belowThreshold = cart([paidGiftManual(1, 600), taggedGift(1)]);

    assert.equal(calculateEligibleSubtotal(belowThreshold), 600);
    assert.equal(buildTaggedGiftCartAction({ cart: belowThreshold, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "REMOVE_GIFT");
    assert.equal(findTaggedGiftLine(belowThreshold, CAMPAIGN_ID)?.lineKey, "tagged-gift");
  });

  it("E. removing paid line reevaluates safely without deleting manual gift purchase", () => {
    const afterPaidRemoval = cart([paidGiftManual(1, 600)]);

    assert.equal(calculateEligibleSubtotal(afterPaidRemoval), 600);
    assert.equal(buildTaggedGiftCartAction({ cart: afterPaidRemoval, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }), "NONE");
    assert.equal(findTaggedGiftLine(afterPaidRemoval, CAMPAIGN_ID), null);
  });

  it("manual lines with the gift variant are never treated as tagged free gifts", () => {
    const snapshot = cart([paidGiftManual(2, 885.95)]);

    assert.equal(findTaggedGiftLine(snapshot, CAMPAIGN_ID), null);
    assert.equal(calculateEligibleSubtotal(snapshot), 1771.9);
    assert.equal(needsTaggedGiftQuantityEnforcement(snapshot, CAMPAIGN_ID), false);
  });
});
