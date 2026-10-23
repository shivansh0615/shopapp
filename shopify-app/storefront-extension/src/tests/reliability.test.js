import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  addGift,
  applySections,
  eligibleSubtotal,
  enforceGiftLimit,
  findTaggedLine,
  findTaggedLines,
  giftProperties,
  isTagged,
  markTaggedLines,
  normalizeCart,
  setLineQty,
} from "../core/cart-client.js";
import { runRemoveGiftFlow, syncGift } from "../core/gift-sync.js";
import { buildLocalEvaluation, buildWidgetState, cacheFromEvaluation } from "../core/widget-state.js";
import { getWidgets } from "../core/widget-renderer.js";
import { state } from "../core/state.js";
import { FREE_GIFT_KEY } from "../utils/util.js";

const GIFT = "12345";
const THRESHOLD = 500;

function reset() {
  state.campaign = {
    enabled: true,
    threshold: THRESHOLD,
    giftVariantId: GIFT,
    campaignId: 1,
    giftTitle: "Free Gift",
    currencySymbol: "₹",
  };
  state.knownGiftVariantId = GIFT;
  state.campaignLoaded = true;
  state.autoAddGift = true;
  state.mutating = false;
  state.giftAddInFlight = false;
  state.giftAddError = null;
  state.suppressCartRefresh = false;
  state.rewardType = null;
  state.sv = 0;
  state.se = 0;
  state.sr = 0;
  state.sp = 0;
}

function seedServerForCart(cart, threshold = state.campaign.threshold) {
  const amount = eligibleSubtotal(cart);
  const paidC = Math.round(amount * 100);
  const thC = Math.round(Math.max(0, threshold) * 100);
  const eligible = thC > 0 && paidC >= thC;
  cacheFromEvaluation({
    enabled: true,
    eligible,
    remaining: thC > 0 ? Math.max(0, thC - paidC) / 100 : 0,
    progress: thC > 0 ? Math.min(100, Math.max(0, (paidC / thC) * 100)) : 0,
    threshold,
    gift: { variantId: GIFT },
    campaign: { id: 1 },
  });
}

function evalCart(cart) {
  seedServerForCart(cart);
  return buildLocalEvaluation(cart);
}

async function syncFor(cart) {
  seedServerForCart(cart);
  return syncGift(cart);
}

function paid(amount, key = "paid") {
  return {
    subtotal: amount,
    currency: "INR",
    items: [{ variantId: "999", quantity: 1, price: amount, lineKey: key, properties: {} }],
  };
}

function tagged(qty = 1, key = "gift") {
  return {
    variantId: GIFT,
    quantity: qty,
    price: 0,
    lineKey: key,
    properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
  };
}

function paidAndGift(paidAmt, giftQty = 1) {
  return {
    subtotal: paidAmt,
    currency: "INR",
    items: [
      { variantId: "999", quantity: 1, price: paidAmt, lineKey: "paid", properties: {} },
      tagged(giftQty),
    ],
  };
}

function jsonRes(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe("addGift sections fallback", () => {
  beforeEach(reset);

  it("retries without sections when cart-drawer section request fails", async () => {
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (body.sections) {
        return jsonRes({ message: "section missing" }, false, 422);
      }
      assert.equal(body.items[0].properties[FREE_GIFT_KEY], "true");
      assert.equal(body.items[0].properties._fgpb_campaign_id, "1");
      return jsonRes({ items: [{ id: Number(GIFT) }] });
    };

    const res = await addGift(GIFT);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].sections);
    assert.equal(bodies[1].sections, undefined);
    assert.ok(res.items);
  });

  it("applies drawer section HTML when present", async () => {
    const drawer = { innerHTML: "old", querySelector: () => null };
    globalThis.document = {
      querySelector: (sel) => (sel === "cart-drawer" ? drawer : null),
    };
    globalThis.DOMParser = class {
      parseFromString() {
        return {
          querySelector: () => ({ innerHTML: "fresh-drawer" }),
        };
      }
    };
    globalThis.fetch = async () =>
      jsonRes({
        items: [],
        sections: { "cart-drawer": "<cart-drawer>fresh-drawer</cart-drawer>" },
      });

    await addGift(GIFT);
    assert.equal(drawer.innerHTML, "fresh-drawer");
    delete globalThis.document;
    delete globalThis.DOMParser;
  });
});

describe("applySections", () => {
  it("no-ops when cart-drawer section is missing", () => {
    assert.doesNotThrow(() => applySections({}));
    assert.doesNotThrow(() => applySections(null));
  });

  it("no-ops when document has no cart-drawer element", () => {
    globalThis.document = { querySelector: () => null };
    globalThis.DOMParser = class {
      parseFromString() {
        return { querySelector: () => ({ innerHTML: "x" }) };
      }
    };
    assert.doesNotThrow(() =>
      applySections({ "cart-drawer": "<cart-drawer>x</cart-drawer>" }),
    );
    delete globalThis.document;
    delete globalThis.DOMParser;
  });

  it("replaces cart-drawer innerHTML from section payload", () => {
    const drawer = { innerHTML: "stale", querySelector: () => null };
    globalThis.document = {
      querySelector: (sel) => (sel === "cart-drawer" ? drawer : null),
    };
    globalThis.DOMParser = class {
      parseFromString() {
        return { querySelector: () => ({ innerHTML: "synced" }) };
      }
    };
    applySections({ "cart-drawer": "<cart-drawer><div>synced</div></cart-drawer>" });
    assert.equal(drawer.innerHTML, "synced");
    delete globalThis.document;
    delete globalThis.DOMParser;
  });

  it("preserves progress widget across cart-drawer section replace", () => {
    const footer = { parentNode: null };
    const widget = { className: "fgpb-progress-card" };
    const drawer = {
      innerHTML: "stale",
      firstElementChild: footer,
      querySelector: (sel) => {
        if (sel === ".fgpb-progress-card") return drawer.innerHTML === "stale" ? widget : null;
        if (sel === ".drawer__footer") return footer;
        return null;
      },
      insertBefore: (node, ref) => {
        drawer._placed = { node, ref };
      },
    };
    footer.parentNode = drawer;
    globalThis.document = {
      querySelector: (sel) => (sel === "cart-drawer" ? drawer : null),
      querySelectorAll: () => {
        const list = [];
        list.forEach = () => {};
        return list;
      },
      getElementById: () => null,
    };
    globalThis.DOMParser = class {
      parseFromString() {
        return { querySelector: () => ({ innerHTML: "synced" }) };
      }
    };
    applySections({ "cart-drawer": "<cart-drawer><div>synced</div></cart-drawer>" });
    assert.equal(drawer.innerHTML, "synced");
    assert.equal(drawer._placed.node, widget);
    assert.equal(drawer._placed.ref, footer);
    delete globalThis.document;
    delete globalThis.DOMParser;
  });

  it("does not remount classic progress into cart-drawer after theme wipe", () => {
    reset();
    state.campaign.threshold = 1000;
    state.campaign.giftVariantId = "111";
    const cart = {
      subtotal: 500,
      currency: "INR",
      items: [{ variantId: "9", quantity: 1, price: 500, lineKey: "a", properties: {} }],
    };
    state.lc = cart;
    let createCount = 0;
    const drawer = {
      querySelector: () => null,
      firstElementChild: { parentNode: null },
      insertBefore() {
        throw new Error("classic must not mount into cart-drawer");
      },
    };
    drawer.firstElementChild.parentNode = drawer;
    globalThis.document = {
      querySelector: (sel) => {
        if (sel === "cart-drawer") return drawer;
        return null;
      },
      querySelectorAll: () => {
        const list = [];
        list.forEach = Array.prototype.forEach;
        return list;
      },
      createElement: () => {
        createCount += 1;
        return { className: "", dataset: {}, innerHTML: "", style: {}, querySelector: () => null };
      },
      getElementById: () => null,
    };
    // Drawer wipe with no card: classic getWidgets must not create a drawer mount.
    assert.equal(document.querySelector(".fgpb-progress-card"), null);
    const widgets = getWidgets();
    assert.equal(widgets.length, 0);
    assert.equal(createCount, 0);
    assert.ok(buildWidgetState(cart, evalCart(cart)).progress >= 0);
    delete globalThis.document;
  });
});

describe("setLineQty sections fallback", () => {
  beforeEach(reset);

  it("retries update without sections when section request fails", async () => {
    const bodies = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      if (body.sections) return jsonRes({}, false, 400);
      return jsonRes({ ok: true });
    };
    await setLineQty("gift-key", 0);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].sections);
    assert.equal(bodies[1].sections, undefined);
    assert.equal(bodies[1].updates["gift-key"], 0);
  });
});

describe("enforceGiftLimit", () => {
  beforeEach(reset);

  it("removes duplicate tagged gift lines and keeps one free gift", async () => {
    let cartRaw = {
      currency: "INR",
      items: [
        {
          variant_id: "999",
          quantity: 1,
          price: "600.00",
          key: "paid",
          properties: {},
        },
        {
          variant_id: GIFT,
          quantity: 1,
          price: "0.00",
          key: "gift-a",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
        {
          variant_id: GIFT,
          quantity: 1,
          price: "0.00",
          key: "gift-b",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
      ],
    };
    const removed = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/cart.js")) return jsonRes(cartRaw);
      if (String(url).includes("/cart/update")) {
        const body = JSON.parse(init.body);
        for (const [key, qty] of Object.entries(body.updates)) {
          removed.push(key);
          cartRaw = {
            ...cartRaw,
            items: cartRaw.items
              .map((i) => (i.key === key ? { ...i, quantity: qty } : i))
              .filter((i) => i.quantity > 0),
          };
        }
        return jsonRes({});
      }
      throw new Error("unexpected " + url);
    };

    const next = await enforceGiftLimit(normalizeCart(cartRaw));
    assert.ok(removed.includes("gift-b"));
    assert.equal(findTaggedLines(next).length, 1);
    assert.equal(findTaggedLine(next).lineKey, "gift-a");
  });

  it("cart + on tagged gift clamps qty to 1 and never deletes the tagged line", async () => {
    let cartRaw = {
      currency: "INR",
      items: [
        {
          variant_id: "999",
          quantity: 1,
          price: "600.00",
          key: "paid",
          properties: {},
        },
        {
          variant_id: GIFT,
          quantity: 2,
          price: "0.00",
          key: "gift",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
      ],
    };
    const updates = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/cart.js")) return jsonRes(cartRaw);
      if (String(url).includes("/cart/update")) {
        const body = JSON.parse(init.body);
        updates.push(body.updates);
        cartRaw = {
          ...cartRaw,
          items: cartRaw.items.map((i) =>
            i.key in body.updates ? { ...i, quantity: body.updates[i.key] } : i,
          ),
        };
        return jsonRes({});
      }
      if (String(url).includes("/cart/add")) throw new Error("must not add after cart + clamp");
      throw new Error("unexpected");
    };

    const before = normalizeCart(cartRaw);
    assert.equal(findTaggedLine(before).quantity, 2);
    const next = await enforceGiftLimit(before);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].gift, 1);
    assert.ok(findTaggedLine(next));
    assert.equal(findTaggedLine(next).lineKey, "gift");
    assert.equal(findTaggedLine(next).quantity, 1);
    assert.equal(next.items.find((i) => i.lineKey === "paid").quantity, 1);
  });

  it("tagged gift + untagged same variant → BOTH remain untouched", async () => {
    const cart = {
      subtotal: 800,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 1,
          price: 200,
          lineKey: "paid-gift-sku",
          properties: {},
        },
        tagged(1, "free-gift"),
      ],
    };
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return jsonRes({});
    };
    const next = await enforceGiftLimit(cart);
    assert.equal(fetchCalled, false);
    assert.equal(next.items.length, 2);
    assert.equal(isTagged(next.items[0].properties), false);
    assert.equal(next.items[0].quantity, 1);
    assert.equal(findTaggedLine(next).quantity, 1);
  });

  it("tagged qty 1 + untagged same variant qty 2 → paid line remains quantity 2", async () => {
    const cart = {
      subtotal: 1000,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 2,
          price: 200,
          lineKey: "paid-manual",
          properties: {},
        },
        tagged(1, "free-gift"),
      ],
    };
    globalThis.fetch = async () => {
      throw new Error("enforce must not mutate cart");
    };
    const next = await enforceGiftLimit(cart);
    assert.equal(next.items.find((i) => i.lineKey === "paid-manual").quantity, 2);
    assert.equal(findTaggedLine(next).quantity, 1);
  });

  it("increasing paid same-variant qty leaves tagged gift untouched", async () => {
    const cart = {
      subtotal: 1200,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 5,
          price: 200,
          lineKey: "paid-manual",
          properties: {},
        },
        tagged(1, "free-gift"),
      ],
    };
    globalThis.fetch = async () => {
      throw new Error("enforce must not mutate cart");
    };
    const next = await enforceGiftLimit(cart);
    assert.equal(next.items.find((i) => i.lineKey === "paid-manual").quantity, 5);
    assert.equal(findTaggedLine(next).quantity, 1);
  });

  it("untagged same variant alone → remains completely untouched", async () => {
    const cart = {
      subtotal: 400,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 3,
          price: 200,
          lineKey: "manual-only",
          properties: {},
        },
      ],
    };
    globalThis.fetch = async () => {
      throw new Error("enforce must not mutate cart");
    };
    const next = await enforceGiftLimit(cart);
    assert.equal(next.items.length, 1);
    assert.equal(next.items[0].quantity, 3);
    assert.equal(findTaggedLine(next), null);
  });
});

describe("markTaggedLines qty controls", () => {
  beforeEach(reset);

  it("adds fgpb-gift-line only on tagged rows; untagged same variant stays unmarked", () => {
    const giftRow = {
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") giftRow.marked = true;
        },
        remove() {},
      },
      querySelector(sel) {
        if (sel.includes("data-line-key")) {
          return { getAttribute: () => "gift-key" };
        }
        return null;
      },
      querySelectorAll: () => [],
    };
    const paidRow = {
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") paidRow.marked = true;
        },
        remove() {},
      },
      querySelector(sel) {
        if (sel.includes("data-line-key")) {
          return { getAttribute: () => "paid-key" };
        }
        return null;
      },
      querySelectorAll: () => [],
    };
    globalThis.document = {
      createElement: () => ({
        className: "",
        setAttribute() {},
        textContent: "",
      }),
      querySelectorAll: (sel) => {
        if (sel === ".fgpb-gift-line") {
          const list = [];
          list.forEach = () => {};
          return list;
        }
        if (typeof sel === "string" && sel.includes("CartDrawer-Item")) {
          const list = [paidRow, giftRow];
          list.forEach = Array.prototype.forEach.bind(list);
          return list;
        }
        const list = [];
        list.forEach = () => {};
        return list;
      },
      getElementById: () => null,
    };

    markTaggedLines({
      items: [
        { variantId: GIFT, quantity: 1, lineKey: "paid-key", properties: {} },
        { ...tagged(1, "gift"), lineKey: "gift-key" },
      ],
    });
    assert.equal(paidRow.marked, undefined);
    assert.equal(giftRow.marked, true);
    delete globalThis.document;
  });

  it("does not highlight by CartItem-N index when line keys are missing", () => {
    const paidAtIndex1 = {
      marked: false,
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") paidAtIndex1.marked = true;
        },
        remove() {},
      },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    globalThis.document = {
      querySelectorAll: (sel) => {
        if (typeof sel === "string" && sel.includes("cart-item")) {
          const list = [paidAtIndex1];
          list.forEach = Array.prototype.forEach.bind(list);
          return list;
        }
        const list = [];
        list.forEach = () => {};
        return list;
      },
      getElementById: (id) => (id === "CartItem-1" ? paidAtIndex1 : null),
    };
    markTaggedLines({
      items: [{ variantId: GIFT, quantity: 1, lineKey: "gift-only", properties: { _fgpb_free_gift: "true" } }],
    });
    assert.equal(paidAtIndex1.marked, false);
    delete globalThis.document;
  });
});

describe("manual same-SKU purchase", () => {
  beforeEach(reset);

  it("treats untagged gift SKU as paid and still requests ADD_GIFT when eligible", () => {
    const cart = {
      subtotal: 600,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 1,
          price: 600,
          lineKey: "manual",
          properties: {},
        },
      ],
    };
    assert.equal(isTagged(cart.items[0].properties), false);
    assert.equal(eligibleSubtotal(cart), 600);
    assert.equal(findTaggedLine(cart), null);
    const ev = evalCart(cart);
    assert.equal(ev.eligible, true);
    assert.equal(ev.action, "ADD_GIFT");
  });

  it("eligible + tagged gift + manually purchased same variant → action NONE", () => {
    const cart = {
      subtotal: 600,
      currency: "INR",
      items: [
        {
          variantId: GIFT,
          quantity: 1,
          price: 600,
          lineKey: "manual",
          properties: {},
        },
        tagged(1, "free"),
      ],
    };
    assert.equal(eligibleSubtotal(cart), 600);
    assert.equal(evalCart(cart).action, "NONE");
    assert.equal(findTaggedLines(cart).length, 1);
  });

  it("below threshold + tagged + manual same variant → REMOVE_GIFT only targets tagged", async () => {
    let cartRaw = {
      currency: "INR",
      items: [
        {
          variant_id: GIFT,
          quantity: 2,
          price: "200.00",
          key: "manual",
          properties: {},
        },
        {
          variant_id: GIFT,
          quantity: 1,
          price: "0.00",
          key: "gift",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
      ],
    };
    const removed = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/cart.js")) return jsonRes(cartRaw);
      if (String(url).includes("/cart/update")) {
        const body = JSON.parse(init.body);
        for (const [key, qty] of Object.entries(body.updates)) {
          removed.push({ key, qty });
          cartRaw = {
            ...cartRaw,
            items: cartRaw.items
              .map((i) => (i.key === key ? { ...i, quantity: qty } : i))
              .filter((i) => i.quantity > 0),
          };
        }
        return jsonRes({});
      }
      throw new Error("unexpected");
    };

    const cart = normalizeCart(cartRaw);
    assert.equal(evalCart(cart).action, "REMOVE_GIFT");
    const next = await syncFor(cart);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].key, "gift");
    assert.equal(removed[0].qty, 0);
    assert.equal(findTaggedLine(next), null);
    assert.equal(next.items.find((i) => i.lineKey === "manual").quantity, 2);
  });
});

describe("syncGift cold load / refresh decisions", () => {
  beforeEach(reset);

  it("eligible + no gift → ADD_GIFT path runs once", async () => {
    let addCalls = 0;
    // Patch via syncGift's use of cartClient by mocking fetch for add + cart
    let phase = "eval";
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/cart/add")) {
        addCalls += 1;
        const body = JSON.parse(init.body);
        assert.equal(body.items[0].properties[FREE_GIFT_KEY], "true");
        phase = "added";
        return jsonRes({ items: [] });
      }
      if (String(url).includes("/cart.js")) {
        return jsonRes({
          currency: "INR",
          items:
            phase === "added"
              ? [
                  {
                    variant_id: "999",
                    quantity: 1,
                    price: "600.00",
                    key: "paid",
                    properties: {},
                  },
                  {
                    variant_id: GIFT,
                    quantity: 1,
                    price: "0.00",
                    key: "gift",
                    properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
                  },
                ]
              : [
                  {
                    variant_id: "999",
                    quantity: 1,
                    price: "600.00",
                    key: "paid",
                    properties: {},
                  },
                ],
        });
      }
      return jsonRes({});
    };

    const first = await syncFor(paid(600));
    assert.equal(addCalls, 1);
    assert.ok(findTaggedLine(first));

    const second = await syncFor(first);
    assert.equal(addCalls, 1);
    assert.equal(evalCart(second).action, "NONE");
  });

  it("eligible + tagged gift → NONE and does not add", async () => {
    let addCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes("/cart/add")) {
        addCalls += 1;
        return jsonRes({});
      }
      return jsonRes({});
    };
    const cart = await syncFor(paidAndGift(600));
    assert.equal(addCalls, 0);
    assert.equal(evalCart(cart).action, "NONE");
  });

  it("ineligible + tagged gift → REMOVE_GIFT", async () => {
    let removed = false;
    let cartRaw = {
      currency: "INR",
      items: [
        {
          variant_id: "999",
          quantity: 1,
          price: "100.00",
          key: "paid",
          properties: {},
        },
        {
          variant_id: GIFT,
          quantity: 1,
          price: "0.00",
          key: "gift",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "1" },
        },
      ],
    };
    globalThis.fetch = async (url) => {
      if (String(url).includes("/cart/update")) {
        removed = true;
        cartRaw.items = cartRaw.items.filter((i) => i.key !== "gift");
        return jsonRes({});
      }
      if (String(url).includes("/cart.js")) return jsonRes(cartRaw);
      return jsonRes({});
    };
    const next = await syncFor(normalizeCart(cartRaw));
    assert.equal(removed, true);
    assert.equal(findTaggedLine(next), null);
    const display = buildWidgetState(next, evalCart(next));
    assert.equal(evalCart(next).eligible, false);
    assert.ok(display.progress < 100);
  });

  it("ineligible + no gift → NONE", async () => {
    let mut = 0;
    globalThis.fetch = async () => {
      mut += 1;
      return jsonRes({});
    };
    const cart = await syncFor(paid(100));
    assert.equal(evalCart(cart).action, "NONE");
    assert.equal(mut, 0);
  });
});

describe("below-threshold removal UI state", () => {
  beforeEach(reset);

  it("locked UI after tagged gift is removed", async () => {
    const below = paid(100);
    const deps = {
      addGift: async () => ({}),
      loadCart: async () => below,
      findTaggedLine,
      removeGift: async () => ({}),
    };
    const next = await runRemoveGiftFlow(paidAndGift(100), deps);
    const display = buildWidgetState(next, evalCart(next));
    assert.equal(evalCart(next).eligible, false);
    assert.ok(display.progress < 100);
  });
});

describe("giftProperties", () => {
  beforeEach(reset);

  it("always stamps free-gift tags used by the discount function", () => {
    const p = giftProperties();
    assert.equal(p._fgpb_free_gift, "true");
    assert.equal(p._fgpb_campaign_id, "1");
    assert.equal(p["Free Gift"], "UNLOCKED");
    assert.equal(p._fgpb_tier_id, "classic");
  });
});