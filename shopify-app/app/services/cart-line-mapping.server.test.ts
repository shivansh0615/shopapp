import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAutoAddGiftProperties,
  buildTaggedGiftCartAction,
  calculateEligibleSubtotal,
  findTaggedGiftLine,
  type TaggedGiftCart,
  type TaggedGiftCartItem,
} from "./tagged-gift-cart.server";
import {
  countPaidAndTaggedGiftVariantLines,
  injectLineKeysIntoSectionHtml,
  reorderCartItems,
  resolveTaggedLinesForDecoration,
  updateLineQuantity,
} from "./cart-line-mapping.server";

const GIFT_VARIANT = "54277124161902";
const CAMPAIGN_ID = 8;
const THRESHOLD = 999;

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

function paidGift(lineKey = "paid-gift", qty = 1, price = 885.95): TaggedGiftCartItem {
  return line({
    lineKey,
    variantId: GIFT_VARIANT,
    title: "The Minimal Snowboard",
    quantity: qty,
    price,
    isFreeGift: false,
  });
}

function taggedGift(lineKey = "tagged-gift", qty = 1): TaggedGiftCartItem {
  return line({
    lineKey,
    variantId: GIFT_VARIANT,
    title: "The Minimal Snowboard",
    quantity: qty,
    price: 885.95,
    isFreeGift: true,
    properties: buildAutoAddGiftProperties(CAMPAIGN_ID),
  });
}

function cart(items: TaggedGiftCartItem[]): TaggedGiftCart {
  const subtotal = items.reduce((total, item) => total + item.quantity * item.price, 0);
  return { subtotal, currency: "INR", items };
}

describe("cart line key mapping", () => {
  it("A. one paid line of gift variant stays paid", () => {
    const snapshot = cart([paidGift()]);

    assert.equal(findTaggedGiftLine(snapshot, CAMPAIGN_ID), null);
    assert.equal(calculateEligibleSubtotal(snapshot), 885.95);
    assert.deepEqual(countPaidAndTaggedGiftVariantLines(snapshot, GIFT_VARIANT, CAMPAIGN_ID), {
      paid: 1,
      tagged: 0,
    });
  });

  it("B. one tagged line of gift variant is the gift", () => {
    const snapshot = cart([taggedGift()]);

    assert.equal(findTaggedGiftLine(snapshot, CAMPAIGN_ID)?.lineKey, "tagged-gift");
    assert.equal(calculateEligibleSubtotal(snapshot), 0);
    assert.deepEqual(countPaidAndTaggedGiftVariantLines(snapshot, GIFT_VARIANT, CAMPAIGN_ID), {
      paid: 0,
      tagged: 1,
    });
  });

  it("C. paid + tagged same variant → exactly one paid and one gift", () => {
    const snapshot = cart([paidGift("paid-key"), taggedGift("tagged-key")]);

    assert.deepEqual(countPaidAndTaggedGiftVariantLines(snapshot, GIFT_VARIANT, CAMPAIGN_ID), {
      paid: 1,
      tagged: 1,
    });
    assert.equal(calculateEligibleSubtotal(snapshot), 885.95);
  });

  it("D. remove tagged line leaves paid line paid", () => {
    const afterRemoval = cart([paidGift("paid-key")]);

    assert.equal(findTaggedGiftLine(afterRemoval, CAMPAIGN_ID), null);
    assert.equal(calculateEligibleSubtotal(afterRemoval), 885.95);
    assert.equal(
      buildTaggedGiftCartAction({ cart: afterRemoval, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "NONE",
    );
  });

  it("E. remove paid line keeps tagged line until eligibility reevaluates", () => {
    const afterPaidRemoval = cart([taggedGift("tagged-key")]);

    assert.equal(findTaggedGiftLine(afterPaidRemoval, CAMPAIGN_ID)?.lineKey, "tagged-key");
    assert.equal(
      buildTaggedGiftCartAction({ cart: afterPaidRemoval, threshold: THRESHOLD, campaignId: CAMPAIGN_ID }),
      "REMOVE_GIFT",
    );
  });

  it("F. rerender/reorder lines keeps identity by line key", () => {
    const original = cart([paidGift("paid-key"), taggedGift("tagged-key")]);
    const reordered = reorderCartItems(original, ["tagged-key", "paid-key"]);

    assert.equal(reordered.items[0].lineKey, "tagged-key");
    assert.equal(reordered.items[1].lineKey, "paid-key");
    assert.equal(findTaggedGiftLine(reordered, CAMPAIGN_ID)?.lineKey, "tagged-key");
    assert.equal(calculateEligibleSubtotal(reordered), 885.95);

    const stamped = resolveTaggedLinesForDecoration(
      reordered,
      new Set(["tagged-key"]),
      CAMPAIGN_ID,
    );
    assert.equal(stamped.length, 1);
    assert.equal(stamped[0].lineKey, "tagged-key");
  });

  it("G. quantity changes on paid line do not affect tagged line", () => {
    const snapshot = cart([paidGift("paid-key", 1), taggedGift("tagged-key", 1)]);
    const updated = updateLineQuantity(snapshot, "paid-key", 3);

    assert.equal(updated.items.find((item) => item.lineKey === "paid-key")?.quantity, 3);
    assert.equal(updated.items.find((item) => item.lineKey === "tagged-key")?.quantity, 1);
    assert.equal(calculateEligibleSubtotal(updated), 885.95 * 3);
  });

  it("injects line keys only when section row count matches cart items", () => {
    const html =
      '<div class="cart-item"><span>Paid</span></div><div class="cart-item"><span>Gift</span></div>';
    const stamped = injectLineKeysIntoSectionHtml(html, [
      { lineKey: "paid-key" },
      { lineKey: "tagged-key" },
    ]);

    assert.equal(stamped.stamped, true);
    assert.match(stamped.html, /data-fgpb-line-key="paid-key"/);
    assert.match(stamped.html, /data-fgpb-line-key="tagged-key"/);

    const mismatch = injectLineKeysIntoSectionHtml(
      '<div class="cart-item"></div>',
      [{ lineKey: "paid-key" }, { lineKey: "tagged-key" }],
    );
    assert.equal(mismatch.stamped, false);

    const drawerHtml =
      '<div class="drawer__cart-item"><span>Paid</span></div><div class="drawer__cart-item"><span>Gift</span></div>';
    const drawerStamped = injectLineKeysIntoSectionHtml(drawerHtml, [
      { lineKey: "paid-key" },
      { lineKey: "tagged-key" },
    ]);
    assert.equal(drawerStamped.stamped, true);
    assert.match(drawerStamped.html, /data-fgpb-line-key="tagged-key"/);
  });

  it("does not decorate tagged lines without a stamped row key", () => {
    const snapshot = cart([paidGift("paid-key"), taggedGift("tagged-key")]);
    const decorated = resolveTaggedLinesForDecoration(
      snapshot,
      new Set(["paid-key"]),
      CAMPAIGN_ID,
    );

    assert.equal(decorated.length, 0);
  });
});
