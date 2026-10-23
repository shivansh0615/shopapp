import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { eligibleSubtotal, findTaggedLine, findTaggedLines } from "../core/cart-client.js";
import { runAddGiftFlow, runRemoveGiftFlow } from "../core/gift-sync.js";
import { state } from "../core/state.js";
import { CART_DEBOUNCE_MS, isCartMutationUrl } from "../utils/util.js";
import { buildLocalEvaluation, buildWidgetState, cacheFromEvaluation } from "../core/widget-state.js";
import { mergeEvaluation } from "../core/merge-evaluation.js";

const GIFT_VARIANT = "12345";
const THRESHOLD = 500;

const PAID = (amount, key = "paid") => ({
  subtotal: amount,
  currency: "INR",
  items: [{ variantId: "999", quantity: 1, price: amount, lineKey: key, properties: {} }],
});

const TAGGED = () => ({
  subtotal: 0,
  currency: "INR",
  items: [
    {
      variantId: GIFT_VARIANT,
      quantity: 1,
      price: 0,
      lineKey: "gift",
      properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
    },
  ],
});

const PAID_AND_GIFT = (paid) => ({
  subtotal: paid,
  currency: "INR",
  items: [
    { variantId: "999", quantity: 1, price: paid, lineKey: "paid", properties: {} },
    {
      variantId: GIFT_VARIANT,
      quantity: 1,
      price: 0,
      lineKey: "gift",
      properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
    },
  ],
});

function createDebouncedScheduler(fn, ms = CART_DEBOUNCE_MS) {
  let timer = null;
  let calls = 0;
  return function schedule(reason, delay) {
    calls += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(reason);
    }, delay ?? ms);
    return { calls, pending: !!timer };
  };
}

function createRefreshQueue(runRefresh) {
  let inFlight = null;
  let queued = false;
  function refresh(cartOverride) {
    if (inFlight) {
      queued = true;
      return inFlight;
    }
    inFlight = Promise.resolve(runRefresh(cartOverride))
      .catch(() => {})
      .finally(() => {
        inFlight = null;
        if (queued) {
          queued = false;
          refresh();
        }
      });
    return inFlight;
  }
  return { refresh, getState: () => ({ inFlight: !!inFlight, queued }) };
}

function resetCampaign() {
  state.campaign = {
    enabled: true,
    threshold: THRESHOLD,
    giftVariantId: GIFT_VARIANT,
    campaignId: 1,
    giftTitle: "Free Gift",
    currencySymbol: "₹",
    template: null,
    colors: null,
  };
  state.knownGiftVariantId = GIFT_VARIANT;
  state.campaignLoaded = true;
  state.campaign.enabled = true;
  state.suppressCartRefresh = false;
  state.sv = 0;
  state.se = 0;
  state.sr = 0;
  state.sp = 0;
}

/** Simulate evaluate-cart for a cart (tests only). */
function seedServerForCart(cart, threshold = state.campaign.threshold) {
  const amount = eligibleSubtotal(cart);
  const paidC = Math.round(amount * 100);
  const thC = Math.round(Math.max(0, threshold) * 100);
  const eligible = thC > 0 && paidC >= thC;
  state.sv = 1;
  state.se = eligible ? 1 : 0;
  state.sr = thC > 0 ? Math.max(0, thC - paidC) / 100 : 0;
  state.sp = thC > 0 ? Math.min(100, Math.max(0, (paidC / thC) * 100)) : 0;
}

function evalCart(cart) {
  seedServerForCart(cart);
  return buildLocalEvaluation(cart);
}

describe("cart mutation detection", () => {
  it("detects add/remove/quantity/clear cart endpoints", () => {
    assert.equal(isCartMutationUrl("/cart/add.js"), true);
    assert.equal(isCartMutationUrl("/cart/change"), true);
    assert.equal(isCartMutationUrl("/cart/update.js?foo=1"), true);
    assert.equal(isCartMutationUrl("/cart/clear"), true);
    assert.equal(isCartMutationUrl("/cart.js"), false);
  });

  it("debounces multiple rapid mutations into one refresh", async () => {
    let runs = 0;
    const schedule = createDebouncedScheduler(() => {
      runs += 1;
    }, 30);

    schedule("add");
    schedule("change");
    schedule("remove");
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(runs, 1);
  });
});

describe("refresh queue", () => {
  it("runs only one refresh at a time and queues one follow-up", async () => {
    let runs = 0;
    const queue = createRefreshQueue(async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const first = queue.refresh();
    const second = queue.refresh();
    assert.equal(queue.getState().queued, true);
    await first;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await second;
    assert.equal(runs, 2);
    assert.deepEqual(queue.getState(), { inFlight: false, queued: false });
  });

  it("does not loop when cart refresh is suppressed during gift mutation", async () => {
    let scheduled = 0;
    state.suppressCartRefresh = true;
    const schedule = createDebouncedScheduler(() => {
      scheduled += 1;
    }, 10);
    if (!state.suppressCartRefresh) schedule("mutation");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(scheduled, 0);
    state.suppressCartRefresh = false;
  });
});

describe("gift sync from cart changes", () => {
  beforeEach(resetCampaign);

  it("adds gift above threshold", async () => {
    let added = false;
    const deps = {
      addGift: async () => {
        added = true;
        return {};
      },
      loadCart: async () => TAGGED(),
      findTaggedLine,
      removeGift: async () => ({}),
    };

    const cart = await runAddGiftFlow(PAID(600), GIFT_VARIANT, deps);
    assert.equal(added, true);
    assert.ok(findTaggedLine(cart));
  });

  it("removes gift below threshold", async () => {
    let removed = false;
    const deps = {
      addGift: async () => ({}),
      loadCart: async () => PAID(100),
      findTaggedLine,
      removeGift: async () => {
        removed = true;
        return {};
      },
    };

    const cart = await runRemoveGiftFlow(PAID_AND_GIFT(100), deps);
    assert.equal(removed, true);
    assert.equal(findTaggedLine(cart), null);
  });

  it("does not request another gift when tagged gift already exists", () => {
    const dual = {
      subtotal: 600,
      currency: "INR",
      items: [
        { variantId: "999", quantity: 1, price: 600, lineKey: "paid", properties: {} },
        {
          variantId: GIFT_VARIANT,
          quantity: 2,
          price: 0,
          lineKey: "gift-a",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
        {
          variantId: GIFT_VARIANT,
          quantity: 1,
          price: 0,
          lineKey: "gift-b",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
      ],
    };
    assert.equal(findTaggedLines(dual).length, 2);
    assert.equal(evalCart(dual).eligible, true);
    assert.equal(evalCart(dual).action, "NONE");
  });
});

describe("widget state freshness", () => {
  beforeEach(resetCampaign);

  it("applies fresh evaluate-cart snapshot after subtotal drops", () => {
    const cart = PAID(100);
    const evaluation = mergeEvaluation(
      {
        enabled: true,
        eligible: false,
        action: "NONE",
        progress: 20,
        remaining: 400,
        threshold: THRESHOLD,
      },
      cart,
    );
    const display = buildWidgetState(cart, evaluation);

    assert.equal(evaluation.eligible, false);
    assert.equal(evaluation.action, "NONE");
    assert.ok(display.progress < 100);
    assert.ok(evaluation.remaining > 0);
  });

  it("removes gift action when tagged gift exists below threshold", () => {
    const evaluation = mergeEvaluation(
      {
        enabled: true,
        eligible: false,
        action: "REMOVE_GIFT",
        progress: 20,
        remaining: 400,
        threshold: THRESHOLD,
      },
      PAID_AND_GIFT(100),
    );
    assert.equal(evaluation.eligible, false);
    assert.equal(evaluation.action, "REMOVE_GIFT");
  });

  it("strict threshold: 998 is not eligible for 999", () => {
    state.campaign.threshold = 999;
    const below = evalCart(PAID(998));
    const at = evalCart(PAID(999));
    assert.equal(below.eligible, false);
    assert.equal(below.action, "NONE");
    assert.equal(at.eligible, true);
    assert.equal(at.action, "ADD_GIFT");
  });

  it("uses backend evaluation eligibility for the requested cart", () => {
    const evaluation = mergeEvaluation(
      { enabled: true, eligible: true, action: "ADD_GIFT", progress: 100, remaining: 0, threshold: THRESHOLD },
      PAID(700),
    );
    assert.equal(evaluation.action, "ADD_GIFT");
    assert.equal(evaluation.eligible, true);
  });

  it("hydrates campaign state from evaluate-cart when widget-state is missing", () => {
    state.campaignLoaded = false;
    state.campaign.threshold = 0;
    cacheFromEvaluation({
      enabled: true,
      eligible: false,
      action: "NONE",
      threshold: 1000,
      progress: 40,
      remaining: 600,
      campaign: { id: 1 },
      gift: { variantId: GIFT_VARIANT, title: "Gift" },
    });
    const display = buildWidgetState(PAID(400));
    assert.equal(state.campaignLoaded, true);
    assert.equal(display.progress, 40);
    assert.equal(buildLocalEvaluation(PAID(400)).eligible, false);
  });
});
