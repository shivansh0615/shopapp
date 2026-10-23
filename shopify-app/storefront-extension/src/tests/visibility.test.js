import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../core/state.js";
import { cacheFromWidgetState, buildWidgetState, fetchProxy } from "../core/widget-state.js";
import { updateWidget } from "../core/widget-renderer.js";

const emptyCart = { subtotal: 0, currency: "INR", items: [] };
const paidCart = {
  subtotal: 400,
  currency: "INR",
  items: [{ variantId: "9", quantity: 1, price: 400, lineKey: "a", properties: {} }],
};

function resetState() {
  state.campaign = {
    enabled: false,
    threshold: 0,
    giftVariantId: null,
    campaignId: null,
    giftTitle: "Free Gift",
    currencySymbol: "₹",
    template: null,
    colors: null,
  };
  state.knownGiftVariantId = null;
  state.campaignLoaded = false;
  state.mutating = false;
  state.giftAddInFlight = false;
  state.giftAddError = null;
  state.suppressCartRefresh = false;
  state.sv = 0;
  state.se = 0;
  state.sr = 0;
  state.sp = 0;
  state.rewardType = null;
}

function mockWidget() {
  const nodes = {};
  const el = () => ({ textContent: "", style: {}, setAttribute() {} });
  return {
    hidden: false,
    dataset: {},
    style: { setProperty() {} },
    querySelector(sel) {
      return (nodes[sel] = nodes[sel] || el());
    },
  };
}

function render(cart = emptyCart) {
  const w = mockWidget();
  updateWidget(w, cart, buildWidgetState(cart));
  return w;
}

function mockFetch(impl) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = prev;
  };
}

test("widget visibility", async (t) => {
  t.beforeEach(resetState);

  await t.test("empty cart keeps product progress visible when campaign is enabled", () => {
    cacheFromWidgetState({
      enabled: true,
      threshold: 1999,
      eligible: false,
      remaining: 1999,
      progress: 0,
      gift: { variantId: "111", title: "Gift" },
    });
    assert.equal(render(emptyCart).hidden, false);
  });

  await t.test("loading keeps widget visible when cart has items", () => {
    const w = render(paidCart);
    assert.equal(w.hidden, false);
  });

  await t.test("HTTP 500 keeps widget visible when cart has items", async () => {
    const restore = mockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    try {
      const res = await fetchProxy("/apps/free-gift/widget-state", 100, "INR", "widget-state");
      assert.equal(res, null);
      cacheFromWidgetState(res);
    } finally {
      restore();
    }
    assert.equal(state.campaignLoaded, false);
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("timeout keeps widget visible when cart has items", async () => {
    const restore = mockFetch(async () => {
      throw new Error("network timeout");
    });
    try {
      const res = await fetchProxy("/apps/free-gift/widget-state", 100, "INR", "widget-state");
      assert.equal(res, null);
      cacheFromWidgetState(res);
    } finally {
      restore();
    }
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("malformed response keeps widget visible when cart has items", async () => {
    const restore = mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));
    try {
      const res = await fetchProxy("/apps/free-gift/widget-state", 100, "INR", "widget-state");
      assert.equal(res, null);
      cacheFromWidgetState(res);
    } finally {
      restore();
    }
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("explicit enabled:false (HTTP 200) hides widget", () => {
    cacheFromWidgetState({ enabled: false });
    assert.equal(state.campaignLoaded, true);
    assert.equal(render(paidCart).hidden, true);
  });

  await t.test("explicit enabled:true shows widget when cart has items", () => {
    cacheFromWidgetState({
      enabled: true,
      threshold: 1000,
      eligible: false,
      remaining: 500,
      progress: 50,
      gift: { variantId: "111", title: "Gift" },
    });
    assert.equal(state.campaign.enabled, true);
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("last successful state survives a later failed refresh", () => {
    cacheFromWidgetState({
      enabled: true,
      threshold: 1000,
      eligible: false,
      remaining: 500,
      progress: 50,
      gift: { variantId: "111", title: "Gift" },
    });
    assert.equal(render(paidCart).hidden, false);
    // later refresh fails (null from 500/timeout/malformed)
    cacheFromWidgetState(null);
    assert.equal(state.campaignLoaded, true);
    assert.equal(state.campaign.enabled, true);
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("disabled state survives a later failed refresh", () => {
    cacheFromWidgetState({ enabled: false });
    assert.equal(render(paidCart).hidden, true);
    cacheFromWidgetState(null);
    assert.equal(render(paidCart).hidden, true);
  });

  await t.test("cart change keeps widget visible and recomputes remaining from the live cart", () => {
    cacheFromWidgetState({
      enabled: true,
      threshold: 1000,
      eligible: false,
      remaining: 600,
      progress: 40,
      gift: { variantId: "111", title: "Gift" },
      widgetSettings: { heading: "You are {remaining} away", description: "Keep going" },
      colors: { barColor: "#111" },
    });
    const before = buildWidgetState({
      subtotal: 400,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 400, lineKey: "a", properties: {} }],
    });
    assert.equal(before.enabled, true);
    assert.equal(before.progress, 40);

    const afterAdd = buildWidgetState({
      subtotal: 800,
      currency: "INR",
      items: [{ variantId: "9", quantity: 2, price: 400, lineKey: "a", properties: {} }],
    });
    assert.equal(afterAdd.progress, 80);
    assert.equal(afterAdd.heading, "You are 200 away");
    assert.doesNotMatch(afterAdd.heading, /\$|₹|Rs\.|INR|USD/);

    cacheFromWidgetState({
      enabled: true,
      threshold: 1000,
      eligible: false,
      remaining: 200,
      progress: 80,
      gift: { variantId: "111", title: "Gift" },
      widgetSettings: { heading: "You are {remaining} away", description: "Keep going" },
      colors: { barColor: "#111" },
    });
    const refreshed = buildWidgetState({
      subtotal: 800,
      currency: "INR",
      items: [{ variantId: "9", quantity: 2, price: 400, lineKey: "a", properties: {} }],
    });
    const w = mockWidget();
    updateWidget(w, {
      subtotal: 800,
      currency: "INR",
      items: [{ variantId: "9", quantity: 2, price: 400, lineKey: "a", properties: {} }],
    }, refreshed);
    assert.equal(w.hidden, false);
    assert.ok(refreshed.progress > before.progress);
    assert.match(refreshed.heading, /away/i);

    // pending/failed proxy must not hide
    cacheFromWidgetState(null);
    assert.equal(render(paidCart).hidden, false);
  });

  await t.test("design and visibility survive pending proxy during refresh paint", () => {
    cacheFromWidgetState({
      enabled: true,
      threshold: 1000,
      eligible: false,
      remaining: 800,
      progress: 20,
      gift: { variantId: "111", title: "Gift" },
      widgetSettings: { heading: "Spend {remaining} more", description: "Keep going" },
      colors: { barColor: "#abc", backgroundColor: "#fff" },
    });
    const cartLow = {
      subtotal: 200,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 200, lineKey: "a", properties: {} }],
    };
    const cartHigh = {
      subtotal: 700,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 700, lineKey: "a", properties: {} }],
    };
    const w = mockWidget();
    // early paint after loadCart (before proxy returns) — remaining follows the live cart
    updateWidget(w, cartLow, buildWidgetState(cartLow));
    assert.equal(w.hidden, false);
    assert.equal(state.cl.barColor, "#abc");
    updateWidget(w, cartHigh, buildWidgetState(cartHigh));
    assert.equal(w.hidden, false);
    assert.ok(buildWidgetState(cartHigh).progress > buildWidgetState(cartLow).progress);
    assert.equal(state.ht, "Spend {remaining} more");
    // temporary proxy failure must keep last valid campaign + design
    cacheFromWidgetState(null);
    assert.equal(render(paidCart).hidden, false);
    assert.equal(state.cl.barColor, "#abc");
  });

  await t.test("widget hides when campaign disabled; empty cart still shows when enabled", () => {
    cacheFromWidgetState({ enabled: true, threshold: 1000, eligible: false, remaining: 500, progress: 50, gift: { variantId: "111", title: "Gift" } });
    assert.equal(render(paidCart).hidden, false);
    assert.equal(render(emptyCart).hidden, false);
    cacheFromWidgetState({ enabled: false });
    assert.equal(render(paidCart).hidden, true);
  });
});
