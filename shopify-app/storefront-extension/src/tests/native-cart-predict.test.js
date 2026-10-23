import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adoptMutationResponse,
  appendGiftsToAddPayload,
  cloneCart,
  createMutationQueue,
  emptyCart,
  hiddenGiftProperties,
  isFullCartJson,
  isGiftUnprocessable,
  mergeAddedItems,
  paidSubtotalCents,
  projectAfterAdd,
  projectAfterChange,
  shouldBatchGift,
  shouldApplyGiftCartSections,
  shouldAcceptPaintGen,
  shouldAcceptCartVersion,
  stripStaleCartSections,
  stampCartVersion,
  rewriteChangeLineToKey,
  isInvalidLineError,
  shouldRetryGiftAdd,
  visiblePropertyKeys,
} from "../utils/native-cart-predict.js";

describe("native cart prediction", () => {
  it("merges add.js line items into lastKnownCart without a full cart payload", () => {
    const cart = emptyCart();
    const added = {
      id: 11,
      key: "paid:1",
      variant_id: 11,
      quantity: 1,
      price: 200000,
      final_line_price: 200000,
      properties: {},
    };
    const next = mergeAddedItems(cart, added);
    assert.equal(next.item_count, 1);
    assert.equal(next.total_price, 200000);
    assert.equal(paidSubtotalCents(next), 200000);
    assert.equal(isFullCartJson(added), false);
  });

  it("adopts add.js items[] (no total_price) into local cart", () => {
    const prev = mergeAddedItems(emptyCart(), {
      key: "a",
      variant_id: 1,
      quantity: 1,
      price: 50000,
      final_line_price: 50000,
      properties: {},
    });
    const next = adoptMutationResponse(prev, {
      items: [
        {
          key: "b",
          variant_id: 2,
          quantity: 1,
          price: 50000,
          final_line_price: 50000,
          properties: {},
        },
      ],
    });
    assert.equal(next.items.length, 2);
    assert.equal(paidSubtotalCents(next), 100000);
  });

  it("batches a gift onto add.js when projected paid hits the threshold", () => {
    const cart = mergeAddedItems(emptyCart(), {
      key: "p",
      variant_id: 1,
      quantity: 1,
      price: 150000,
      final_line_price: 150000,
      properties: {},
    });
    const incoming = [{ id: 2, quantity: 1, price: 60000 }];
    const projected = projectAfterAdd(cart, incoming, () => 0);
    assert.equal(
      shouldBatchGift({
        paidCents: paidSubtotalCents(projected),
        thresholdMajor: 2000,
        giftAlreadyInCart: false,
        giftUnavailable: false,
        autoAddGift: true,
      }),
      true,
    );
    const payload = appendGiftsToAddPayload(
      { id: 2, quantity: 1 },
      [{ id: 555, quantity: 1, properties: hiddenGiftProperties("12", "classic") }],
    );
    assert.equal(payload.items.length, 2);
    assert.equal(payload.id, undefined);
    assert.equal(visiblePropertyKeys(payload.items[1].properties).length, 0);
  });

  it("does not batch when gift is already in the cart or 422-unavailable", () => {
    assert.equal(
      shouldBatchGift({
        paidCents: 250000,
        thresholdMajor: 2000,
        giftAlreadyInCart: true,
        giftUnavailable: false,
        autoAddGift: true,
      }),
      false,
    );
    assert.equal(
      shouldBatchGift({
        paidCents: 250000,
        thresholdMajor: 2000,
        giftAlreadyInCart: false,
        giftUnavailable: true,
        autoAddGift: true,
      }),
      false,
    );
  });

  it("treats Shopify 422 as unprocessable and never retries the gift", () => {
    assert.equal(isGiftUnprocessable(422), true);
    assert.equal(shouldRetryGiftAdd(422), false);
    assert.equal(shouldRetryGiftAdd(500), true);
  });

  it("queues rapid mutations in order and keeps a single tail", async () => {
    const enqueue = createMutationQueue();
    const seen = [];
    const p1 = enqueue(async () => {
      seen.push("a");
      return "a";
    });
    const p2 = enqueue(async () => {
      seen.push("b");
      return "b";
    });
    const p3 = enqueue(async () => {
      seen.push("c");
      return "c";
    });
    assert.deepEqual(await Promise.all([p1, p2, p3]), ["a", "b", "c"]);
    assert.deepEqual(seen, ["a", "b", "c"]);
  });

  it("clones lastKnownCart so a failed request can revert", () => {
    const cart = mergeAddedItems(emptyCart(), {
      key: "x",
      quantity: 1,
      price: 100,
      final_line_price: 100,
    });
    const snap = cloneCart(cart);
    cart.items.push({ key: "y" });
    assert.equal(snap.items.length, 1);
    assert.equal(cart.items.length, 2);
  });

  it("does not apply gift-sync cart HTML after a newer shopper qty/remove", () => {
    assert.equal(shouldApplyGiftCartSections(0, 0), true);
    assert.equal(shouldApplyGiftCartSections(3, 3), true);
    assert.equal(shouldApplyGiftCartSections(null, 4), true);
    assert.equal(shouldApplyGiftCartSections(2, 3), false);
    assert.equal(shouldApplyGiftCartSections(0, 1), false);
    assert.equal(shouldAcceptPaintGen(4, 5), false);
    assert.equal(shouldAcceptPaintGen(5, 5), true);
    assert.equal(shouldAcceptPaintGen(6, 5), true);
    assert.equal(shouldAcceptPaintGen(null, 5), true);
  });

  it("rewrites Dawn line indexes to line-item keys so remove/clear cannot 400", () => {
    const cart = {
      items: [
        { key: "paid:aaa", quantity: 2 },
        { key: "gift:bbb", quantity: 1 },
      ],
    };
    const next = rewriteChangeLineToKey({ line: 1, quantity: 0, sections: "cart-drawer" }, cart);
    assert.equal(next.id, "paid:aaa");
    assert.equal(next.line, undefined);
    assert.equal(next.quantity, 0);
    const stale = rewriteChangeLineToKey({ line: 3, quantity: 0 }, cart);
    assert.equal(stale.id, "gift:bbb");
    assert.equal(isInvalidLineError({ description: "Line parameter is invalid" }, 400), true);
    assert.equal(isInvalidLineError({ description: "ok" }, 200), false);
  });

  it("predicts rapid qty 1→6→0 and rejects out-of-order snapshots", () => {
    let cart = mergeAddedItems(emptyCart("USD"), {
      key: "paid:aaa",
      variant_id: 11,
      quantity: 1,
      price: 74995,
      final_line_price: 74995,
    });
    cart = projectAfterChange(cart, { id: "paid:aaa", quantity: 2 });
    stampCartVersion(cart, 2);
    assert.equal(paidSubtotalCents(cart), 74995 * 2);
    cart = projectAfterChange(cart, { id: "paid:aaa", quantity: 6 });
    stampCartVersion(cart, 6);
    assert.equal(paidSubtotalCents(cart), 74995 * 6);
    assert.equal(shouldAcceptCartVersion(2, 6), false);
    assert.equal(shouldAcceptCartVersion(6, 6), true);
    assert.equal(shouldAcceptCartVersion(null, 6), false);
    const stale = {
      item_count: 2,
      total_price: 74995 * 2,
      items: [],
      sections: { "cart-drawer": "<stale>" },
    };
    const stripped = stripStaleCartSections(stale, 2, 6);
    assert.equal(stripped.sections, undefined);
    assert.equal(stripStaleCartSections(stale, 6, 6).sections["cart-drawer"], "<stale>");
    cart = projectAfterChange(cart, { id: "paid:aaa", quantity: 0 });
    stampCartVersion(cart, 7);
    assert.equal(cart.item_count, 0);
    assert.equal(paidSubtotalCents(cart), 0);
  });
});
