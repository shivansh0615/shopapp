import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { findTaggedLine } from "../core/cart-client.js";
import {
  beginGiftMutation,
  clearGiftMutationState,
  confirmTaggedGiftInCart,
  runAddGiftFlow,
} from "../core/gift-sync.js";
import { state } from "../core/state.js";
import { GIFT_ADD_ERROR_MESSAGE } from "../utils/util.js";

const GIFT_VARIANT = "12345";

const TAGGED_CART = {
  subtotal: 1000,
  currency: "INR",
  items: [
    {
      variantId: GIFT_VARIANT,
      quantity: 1,
      price: 0,
      lineKey: "line-gift",
      properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
    },
  ],
};

const PAID_CART = {
  subtotal: 1000,
  currency: "INR",
  items: [
    {
      variantId: "999",
      quantity: 1,
      price: 1000,
      lineKey: "line-paid",
      properties: {},
    },
  ],
};

function baseDeps(overrides = {}) {
  return {
    addGift: async () => ({ items: [] }),
    loadCart: async () => PAID_CART,
    findTaggedLine,
    removeGift: async () => ({}),
    ...overrides,
  };
}

function resetState() {
  state.campaign = {
    enabled: true,
    threshold: 500,
    giftVariantId: GIFT_VARIANT,
    campaignId: 1,
    giftTitle: "Free Gift",
    currencySymbol: "₹",
    template: null,
    colors: null,
  };
  state.knownGiftVariantId = GIFT_VARIANT;
  clearGiftMutationState();
}

function assertLoadingCleared() {
  assert.equal(state.giftAddInFlight, false);
  assert.equal(state.mutating, false);
}

describe("gift add flow", () => {
  beforeEach(() => {
    resetState();
  });

  it("clears loading after successful add and confirmation", async () => {
    const deps = baseDeps({
      loadCart: async () => TAGGED_CART,
    });

    const cart = await runAddGiftFlow(PAID_CART, GIFT_VARIANT, deps);

    assertLoadingCleared();
    assert.equal(state.giftAddError, null);
    assert.ok(findTaggedLine(cart));
  });

  it("clears loading when add fails", async () => {
    const deps = baseDeps({
      addGift: async () => {
        const err = new Error("HTTP 422");
        err.body = '{"description":"cannot add"}';
        throw err;
      },
    });

    await runAddGiftFlow(PAID_CART, GIFT_VARIANT, deps);

    assertLoadingCleared();
    assert.equal(state.giftAddError, GIFT_ADD_ERROR_MESSAGE);
  });

  it("clears loading when confirmation never finds tagged gift", async () => {
    const deps = baseDeps({
      loadCart: async () => PAID_CART,
    });

    const confirmed = await confirmTaggedGiftInCart(PAID_CART, deps);
    assert.equal(confirmed.confirmed, false);

    await runAddGiftFlow(PAID_CART, GIFT_VARIANT, deps);

    assertLoadingCleared();
    assert.equal(state.giftAddError, GIFT_ADD_ERROR_MESSAGE);
  });

  it("clears loading on add timeout", async () => {
    const deps = baseDeps({
      addGift: () => new Promise(() => {}),
    });

    await runAddGiftFlow(PAID_CART, GIFT_VARIANT, deps, 50);

    assertLoadingCleared();
    assert.equal(state.giftAddError, GIFT_ADD_ERROR_MESSAGE);
  });

  it("clears loading immediately when tagged gift already exists", async () => {
    let addCalls = 0;
    const deps = baseDeps({
      addGift: async () => {
        addCalls += 1;
        return { items: [] };
      },
    });

    const cart = await runAddGiftFlow(TAGGED_CART, GIFT_VARIANT, deps);

    assert.equal(addCalls, 0);
    assertLoadingCleared();
    assert.equal(state.giftAddError, null);
    assert.equal(cart, TAGGED_CART);
  });

  it("prevents duplicate add when gift already exists", async () => {
    let addCalls = 0;
    const deps = baseDeps({
      addGift: async () => {
        addCalls += 1;
        return { items: [] };
      },
    });

    await runAddGiftFlow(TAGGED_CART, GIFT_VARIANT, deps);
    await runAddGiftFlow(TAGGED_CART, GIFT_VARIANT, deps);

    assert.equal(addCalls, 0);
    assertLoadingCleared();
  });

  it("clears loading when the widget is hidden", () => {
    beginGiftMutation();
    clearGiftMutationState();

    assertLoadingCleared();
  });
});
