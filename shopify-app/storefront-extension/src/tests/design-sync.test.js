import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../core/state.js";
import {
  cacheFromWidgetState,
  cacheFromEvaluation,
  buildWidgetState,
  buildLocalEvaluation,
} from "../core/widget-state.js";
import { updateWidget } from "../core/widget-renderer.js";

function reset() {
  state.campaign = {
    enabled: false,
    threshold: 0,
    giftVariantId: null,
    campaignId: null,
    giftTitle: "Gift",
    currencySymbol: "Rs",
  };
  state.knownGiftVariantId = null;
  state.campaignLoaded = false;
  state.giftAddInFlight = false;
  state.giftAddError = null;
  state.ht = null;
  state.ds = null;
  state.uh = null;
  state.ud = null;
  state.cl = null;
  state.cb = null;
  state.sv = 0;
  state.se = 0;
  state.sr = 0;
  state.sp = 0;
}

function mockWidget() {
  const nodes = {};
  const el = () => ({
    textContent: "",
    style: {},
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
  });
  return {
    hidden: false,
    dataset: {},
    style: {
      props: {},
      setProperty(k, v) {
        this.props[k] = v;
      },
    },
    querySelector(sel) {
      return (nodes[sel] = nodes[sel] || el());
    },
  };
}

const DESIGN = {
  enabled: true,
  campaignId: 9,
  threshold: 999,
  eligible: false,
  remaining: 499,
  progress: 50.05005005005005,
  heading: "You are Rs. 499.00 away from your free gift",
  description: "Add more to your cart to unlock your gift.",
  colors: {
    barColor: "#000000",
    backgroundColor: "#d97706",
    textColor: "#111111",
    borderRadius: 16,
    progressHeight: 12,
    widgetPadding: 16,
  },
  widgetSettings: {
    heading: "You are {remaining} away from your free gift",
    description: "Add more to your cart to unlock your gift.",
    unlockedHeading: "You've unlocked your free gift!",
    unlockedDescription: "Enjoy your free gift.",
    barColor: "#000000",
    backgroundColor: "#d97706",
    textColor: "#111111",
    borderRadius: 16,
    progressHeight: 12,
    buttonText: "Continue Shopping",
    template: "Premium",
  },
  gift: { variantId: "111", title: "Gift" },
  autoAddGift: true,
};

test("design sync from widget-state", async (t) => {
  t.beforeEach(reset);

  await t.test("applies campaign colors and merchant copy when locked", () => {
    cacheFromWidgetState(DESIGN);
    const cart = {
      subtotal: 500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 500, lineKey: "a", properties: {} }],
    };
    const display = buildWidgetState(cart, buildLocalEvaluation(cart));
    assert.equal(display.colors.barColor, "#000000");
    assert.equal(display.colors.backgroundColor, "#d97706");
    assert.equal(display.heading, "You are 499 away from your free gift");
    assert.doesNotMatch(display.heading, /Rs\.|₹|\$|INR|USD/);
    assert.equal(display.description, "Add more to your cart to unlock your gift.");
    assert.doesNotMatch(display.heading, /^Unlocked!$/);
    assert.doesNotMatch(display.description, /^Enjoy$/);
  });

  await t.test("replaces leftover currency remaining copy with a live number", () => {
    cacheFromWidgetState({
      ...DESIGN,
      widgetSettings: {
        ...DESIGN.widgetSettings,
        heading: "You are Rs. 499.00 away from your free gift",
      },
    });
    const cart = {
      subtotal: 837,
      currency: "USD",
      items: [{ variantId: "9", quantity: 1, price: 837, lineKey: "a", properties: {} }],
    };
    const display = buildWidgetState(cart, buildLocalEvaluation(cart));
    assert.equal(display.heading, "You are 162 away");
    assert.doesNotMatch(display.heading, /Rs\.|₹|\$|INR|USD/);
  });

  await t.test("shows unlocked copy when eligible", () => {
    cacheFromWidgetState({ ...DESIGN, eligible: true, remaining: 0, progress: 100 });
    const cart = {
      subtotal: 1500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 1500, lineKey: "a", properties: {} }],
    };
    const display = buildWidgetState(cart, buildLocalEvaluation(cart));
    assert.equal(buildLocalEvaluation(cart).eligible, true);
    assert.equal(display.heading, "You've unlocked your free gift!");
    assert.equal(display.description, "Enjoy your free gift.");
    assert.equal(display.colors.barColor, "#000000");
  });

  await t.test("empty cart never shows unlocked copy from a stale remaining snapshot", () => {
    cacheFromWidgetState(DESIGN);
    const display = buildWidgetState(
      { subtotal: 0, currency: "INR", items: [] },
      { enabled: true, eligible: false, progress: 100, remaining: 0, action: "NONE" },
    );
    assert.doesNotMatch(display.heading, /unlocked/i);
    assert.equal(display.progress, 0);
  });

  await t.test("shows unlocked copy when remaining is zero", () => {
    cacheFromWidgetState(DESIGN);
    const display = buildWidgetState(
      { subtotal: 999, currency: "INR", items: [{ variantId: "9", quantity: 1, price: 999, lineKey: "a", properties: {} }] },
      { enabled: true, eligible: false, progress: 100, remaining: 0, action: "NONE" },
    );
    assert.equal(display.heading, "You've unlocked your free gift!");
    assert.equal(display.description, "Enjoy your free gift.");
  });

  await t.test("falls back to unlocked default when unlocked copy missing", () => {
    cacheFromWidgetState({
      ...DESIGN,
      widgetSettings: {
        heading: DESIGN.widgetSettings.heading,
        description: DESIGN.widgetSettings.description,
        colors: DESIGN.colors,
      },
    });
    state.uh = null;
    state.ud = null;
    const display = buildWidgetState(
      { subtotal: 1500, currency: "INR", items: [{ variantId: "9", quantity: 1, price: 1500, lineKey: "a", properties: {} }] },
      { enabled: true, eligible: true, progress: 100, remaining: 0, action: "NONE" },
    );
    assert.equal(display.heading, "Unlocked!");
  });

  await t.test("treats sub-cent remaining as unlocked", () => {
    cacheFromWidgetState(DESIGN);
    const display = buildWidgetState(
      { subtotal: 999, currency: "INR", items: [{ variantId: "9", quantity: 1, price: 999, lineKey: "a", properties: {} }] },
      { enabled: true, eligible: false, progress: 99.9, remaining: 0.004, action: "NONE" },
    );
    assert.equal(display.heading, "You've unlocked your free gift!");
    assert.equal(display.description, "Enjoy your free gift.");
  });

  await t.test("preserves design when widget-state fails after success", () => {
    cacheFromWidgetState(DESIGN);
    cacheFromWidgetState(null);
    assert.equal(state.cl.barColor, "#000000");
    assert.ok(state.ht);
  });

  await t.test("evaluate-cart can hydrate design if widget-state missing", () => {
    cacheFromWidgetState(null);
    cacheFromEvaluation({
      enabled: true,
      eligible: false,
      remaining: 499,
      progress: 50,
      threshold: 999,
      campaign: { id: 9 },
      gift: { variantId: "111", title: "Gift" },
      colors: DESIGN.colors,
      widgetSettings: DESIGN.widgetSettings,
      heading: DESIGN.heading,
      description: DESIGN.description,
    });
    assert.equal(state.cl.barColor, "#000000");
    assert.equal(state.uh, "You've unlocked your free gift!");
  });

  await t.test("applies cartProgressBar overrides into state.cb", () => {
    cacheFromWidgetState({
      ...DESIGN,
      widgetSettings: {
        ...DESIGN.widgetSettings,
        cartProgressBar: { height: 8, borderRadius: 4, compact: true },
      },
    });
    assert.equal(state.cb.h, 8);
    assert.equal(state.cb.r, 4);
  });

  await t.test("updateWidget uses Display progressHeight over cartProgressBar height", () => {
    cacheFromWidgetState({
      ...DESIGN,
      colors: { ...DESIGN.colors, progressHeight: 18 },
      widgetSettings: {
        ...DESIGN.widgetSettings,
        progressHeight: 18,
        cartProgressBar: { height: 4, borderRadius: 8, compact: true },
      },
    });
    const w = mockWidget();
    const cart = {
      subtotal: 500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 500, lineKey: "a", properties: {} }],
    };
    updateWidget(w, cart, buildWidgetState(cart, buildLocalEvaluation(cart)));
    assert.equal(w.style.props["--fg-h"], "18px");
    assert.equal(w.querySelector(".fgpb-progress-track").style.height, "18px");
    assert.equal(w.style.props["--fg-r"], "16px");
  });

  await t.test("updateWidget prefers widgetSettings.progressHeight when colors omit it", () => {
    cacheFromWidgetState({
      ...DESIGN,
      colors: {
        barColor: "#000",
        backgroundColor: "#fff",
        textColor: "#111",
        borderRadius: 8,
        progressHeight: 14,
      },
      widgetSettings: {
        ...DESIGN.widgetSettings,
        progressHeight: 14,
        cartProgressBar: { height: 4, borderRadius: 2, compact: true },
      },
    });
    const w = mockWidget();
    const cart = {
      subtotal: 500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 500, lineKey: "a", properties: {} }],
    };
    updateWidget(w, cart, buildWidgetState(cart, buildLocalEvaluation(cart)));
    assert.equal(w.style.props["--fg-h"], "14px");
    assert.equal(w.querySelector(".fgpb-progress-track").style.height, "14px");
  });

  await t.test("updateWidget writes CSS vars and progress height", () => {
    reset();
    cacheFromWidgetState(DESIGN);
    const w = mockWidget();
    const cart = {
      subtotal: 500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 500, lineKey: "a", properties: {} }],
    };
    updateWidget(w, cart, buildWidgetState(cart, buildLocalEvaluation(cart)));
    assert.equal(w.style.props["--fg-b"], "#000000");
    assert.equal(w.style.props["--fg-bg"], "#d97706");
    assert.equal(w.style.props["--fg-t"], "#111111");
    assert.equal(w.style.props["--fg-r"], "16px");
    assert.equal(w.style.props["--fg-h"], "12px");
    assert.equal(w.querySelector(".fgpb-progress-fill").style.background, "#000000");
    assert.equal(w.querySelector(".fgpb-progress-track").attrs["aria-valuenow"], "50");
    assert.equal(w.querySelector(".fgpb-progress-heading").textContent, "You are 499 away from your free gift");
  });
});
