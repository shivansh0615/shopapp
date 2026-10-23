/**
 * Executable check of the shipped line rewrite.
 *
 * A hidden drawer and a visible cart page can both be `cart-items-component`
 * nodes, with different row orders after a gift is added or removed. The body
 * Shopify receives must name the line-item key of the surface the shopper used.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ASSET = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../extensions/free-gift-progress-bar/assets/tiered-gift-sync.js",
);

const GIFT_KEY = "50822538625271:gift-row";
const PAID_KEY = "51107811262711:paid-row";

function row(key) {
  return {
    dataset: { key },
    getAttribute(name) {
      return name === "data-key" ? key : null;
    },
  };
}

function component(sectionId, keys) {
  const rows = keys.map(row);
  return {
    tagName: "CART-ITEMS-COMPONENT",
    dataset: { sectionId },
    getAttribute(name) {
      return name === "data-section-id" ? sectionId : null;
    },
    refs: { cartItemRows: rows },
    querySelectorAll(sel) {
      return sel === '[ref="cartItemRows[]"]' ? rows : [];
    },
  };
}

function boot(components) {
  const sent = [];
  const listeners = new Map();
  const document = {
    readyState: "complete",
    documentElement: {},
    head: {},
    body: {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    dispatchEvent(evt) {
      for (const fn of listeners.get(evt && evt.type) || []) fn(evt);
      return true;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(sel) {
      return sel === "cart-items-component" ? components : [];
    },
    createElement() {
      return {};
    },
  };

  const window = {
    location: { pathname: "/cart", search: "", href: "https://shop.test/cart" },
    document,
    __FGPB_RT: { flags: { evaluateGifts: false, mutateGifts: false } },
    fetch(url, init) {
      const body = init && init.body ? JSON.parse(init.body) : null;
      sent.push({ url: String(url), body });
      const payload = { items: [], item_count: 0, total_price: 0 };
      return Promise.resolve({
        ok: true,
        status: 200,
        clone() {
          return this;
        },
        json() {
          return Promise.resolve(payload);
        },
        text() {
          return Promise.resolve(JSON.stringify(payload));
        },
      });
    },
    addEventListener() {},
    removeEventListener() {},
  };
  window.window = window;
  window.self = window;
  window.top = window;

  const sandbox = {
    window,
    document,
    location: window.location,
    fetch: window.fetch,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = (init && init.detail) || null;
      }
    },
    XMLHttpRequest: class XMLHttpRequest {
      open() {}
      send() {}
      addEventListener() {}
    },
    setTimeout: (...args) => {
      const timer = setTimeout(...args);
      timer.unref();
      return timer;
    },
    clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Error,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(ASSET, "utf8"), sandbox, { filename: "tiered-gift-sync.js" });
  return { window, sent };
}

async function change(window, body) {
  await window.fetch("/cart/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Savor line targeting when two cart surfaces disagree", () => {
  // Drawer is first in the DOM and hidden. The cart page is what the shopper sees.
  // Gift prepends on one surface and not the other, so line 1 is not the same item.
  const drawer = component("cart-drawer", [GIFT_KEY, PAID_KEY]);
  const page = component("cart-page", [PAID_KEY, GIFT_KEY]);

  it("sends the visible cart page key for quantity and remove, not the hidden drawer's row", async () => {
    const { window, sent } = boot([drawer, page]);
    await change(window, { line: 1, quantity: 2, sections: "cart-page,cart-drawer", sections_url: "/cart" });
    await change(window, { line: 2, quantity: 0, sections: "cart-page,cart-drawer", sections_url: "/cart" });

    assert.equal(sent[0].body.id, PAID_KEY);
    assert.equal(sent[0].body.line, undefined);
    assert.equal(sent[0].body.quantity, 2);
    assert.equal(sent[1].body.id, GIFT_KEY);
    assert.equal(sent[1].body.quantity, 0);
    assert.equal(sent[1].body.line, undefined);
  });

  it("sends the hidden drawer's own key when the action comes from the drawer", async () => {
    const { window, sent } = boot([drawer, page]);
    await change(window, { line: 1, quantity: 3, sections: "cart-drawer,cart-page", sections_url: "/" });
    await change(window, { line: 2, quantity: 0, sections: "cart-drawer,cart-page", sections_url: "/" });

    assert.equal(sent[0].body.id, GIFT_KEY);
    assert.equal(sent[0].body.quantity, 3);
    assert.equal(sent[1].body.id, PAID_KEY);
    assert.equal(sent[1].body.quantity, 0);
  });

  it("does not borrow a line key from the other surface when the request names neither", async () => {
    const { window, sent } = boot([drawer, page]);
    await change(window, { line: 1, quantity: 2 });
    assert.equal(sent[0].body.line, 1);
    assert.equal(sent[0].body.id, undefined);
  });

  it("uses the component that dispatched the cart event when both surfaces share a section id", async () => {
    const hidden = component("shared", [GIFT_KEY, PAID_KEY]);
    const visible = component("shared", [PAID_KEY, GIFT_KEY]);
    const { window, sent } = boot([hidden, visible]);
    window.document.dispatchEvent({
      type: "shopify:cart:lines-update",
      target: visible,
      lines: [{ id: PAID_KEY, quantity: 2 }],
    });
    await change(window, { line: 1, quantity: 2, sections: "shared", sections_url: "/cart" });
    assert.equal(sent[0].body.id, PAID_KEY);

    window.document.dispatchEvent({
      type: "shopify:cart:lines-update",
      target: hidden,
      lines: [{ id: GIFT_KEY, quantity: 0 }],
    });
    await change(window, { line: 1, quantity: 0, sections: "shared", sections_url: "/cart" });
    assert.equal(sent[1].body.id, GIFT_KEY);
  });

  it("keeps a single Savor drawer rewrite and leaves Dawn's line body unchanged", async () => {
    const onlyDrawer = boot([component("cart-drawer", [GIFT_KEY, PAID_KEY])]);
    await change(onlyDrawer.window, { line: 2, quantity: 4, sections: "cart-drawer", sections_url: "/" });
    assert.equal(onlyDrawer.sent[0].body.id, PAID_KEY);
    assert.equal(onlyDrawer.sent[0].body.quantity, 4);

    const dawn = boot([]);
    await change(dawn.window, { line: 1, quantity: 2 });
    assert.deepEqual(dawn.sent[0].body, { line: 1, quantity: 2 });
  });
});
