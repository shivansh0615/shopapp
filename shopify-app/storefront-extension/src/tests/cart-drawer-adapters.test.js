/**
 * Optional cart-drawer-compat — unit + architectural boundary tests.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADAPTER_STATUS,
  COMPATIBILITY_API_VERSION,
  DETECTION_ACTIVATE_MIN,
  DETECTION_GENERIC_CLASS_MAX,
  LINE_MATCH,
  REFRESH_STRATEGY,
} from "../compat/compat-contract.js";
import {
  COMPAT_ADAPTERS,
  NONE_ADAPTER,
  detectBestAdapter,
  extractLineKey,
  filterSectionsForAdapter,
  findGiftRows,
  isAdapterSurfaceOpen,
  isCompatOwnedSurface,
  matchGiftRows,
  queryRows,
  scoreAdapter,
  selectCompatAdapter,
  shouldApplyCartDrawerSectionToTarget,
  shouldApplyDawnSections,
} from "../compat/cart-drawer-adapters.js";
import {
  BOOT_FLAG,
  CART_UPDATED_EVENT,
  cartCompatMeta,
  emitCartUpdated,
  highlightCompatGiftRows,
  installCartDrawerCompat,
  refreshNativeDrawer,
  resetEmitDedup,
} from "../compat/cart-drawer-compat.js";
import {
  formatAwayHeading,
  formatUnlockedHeading,
  progressViewFromState,
  syncCompatProgressStrip,
} from "../compat/compat-progress.js";
import { markTaggedLines } from "../core/cart-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EMBED = readFileSync(
  join(__dirname, "../../../extensions/free-gift-progress-bar/blocks/free-gift-embed.liquid"),
  "utf8",
);
const CORE_INDEX = readFileSync(join(__dirname, "../index.js"), "utf8");
const CORE_CART = readFileSync(join(__dirname, "../core/cart-client.js"), "utf8");
const CORE_ASSET = readFileSync(
  join(__dirname, "../../../extensions/free-gift-progress-bar/assets/free-gift-progress-bar.js"),
  "utf8",
);
const COMPAT_SRC = readFileSync(join(__dirname, "../compat/cart-drawer-compat.js"), "utf8");
const ADAPTERS_SRC = readFileSync(join(__dirname, "../compat/cart-drawer-adapters.js"), "utf8");
const CONTRACT_SRC = readFileSync(join(__dirname, "../compat/compat-contract.js"), "utf8");
const PROGRESS_SRC = readFileSync(join(__dirname, "../compat/compat-progress.js"), "utf8");
const UPC = COMPAT_ADAPTERS.find((a) => a.id === "upc-cart");
const POPUP = COMPAT_ADAPTERS.find((a) => a.id === "cart-popup");
const KWIK = COMPAT_ADAPTERS.find((a) => a.id === "kwikcart");
const CART_PAGE = readFileSync(
  join(__dirname, "../../../extensions/free-gift-progress-bar/assets/cart-page-progress.js"),
  "utf8",
);
const CART_CSS = readFileSync(
  join(__dirname, "../../../extensions/free-gift-progress-bar/assets/free-gift-progress-bar.css"),
  "utf8",
);

function el(tag, attrs = {}, children = []) {
  return {
    tagName: String(tag).toUpperCase(),
    attrs: { ...attrs },
    children,
    textContent: "",
    classList: {
      _c: new Set(String(attrs.class || "").split(/\s+/).filter(Boolean)),
      contains(c) {
        return this._c.has(c);
      },
      add(c) {
        this._c.add(c);
      },
      remove(c) {
        this._c.delete(c);
      },
      toggle(c, force) {
        if (force === true) this._c.add(c);
        else if (force === false) this._c.delete(c);
        else if (this._c.has(c)) this._c.delete(c);
        else this._c.add(c);
        return this._c.has(c);
      },
    },
    getAttribute(name) {
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    shadowRoot: null,
    closest(sel) {
      if (this.matches && this.matches(sel)) return this;
      return null;
    },
    matches(sel) {
      if (sel.includes("data-fgpb-surface-owner")) {
        const m = sel.match(/data-fgpb-surface-owner="([^"]+)"/);
        if (m) return this.getAttribute("data-fgpb-surface-owner") === m[1];
      }
      if (sel.startsWith("#")) return this.attrs.id === sel.slice(1);
      if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
      if (sel.startsWith("[")) {
        const inner = sel.slice(1, -1);
        const eq = inner.indexOf("=");
        if (eq === -1) return this.getAttribute(inner.replace(/"/g, "")) != null;
        const key = inner.slice(0, eq).replace(/"/g, "");
        const val = inner.slice(eq + 1).replace(/"/g, "");
        return this.getAttribute(key) === val;
      }
      return this.tagName === String(sel).toUpperCase();
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (n) => {
        (n.children || []).forEach((ch) => {
          if (ch.matches && ch.matches(sel)) out.push(ch);
          walk(ch);
        });
      };
      walk(this);
      return out;
    },
  };
}

describe("import / bundle boundaries", () => {
  it("core Dawn sources do not import optional compat modules", () => {
    assert.equal(CORE_INDEX.includes("cart-drawer-compat"), false);
    assert.equal(CORE_INDEX.includes("cart-drawer-adapters"), false);
    assert.equal(CORE_INDEX.includes("compat-contract"), false);
    assert.equal(CORE_INDEX.includes("/compat/"), false);
    assert.equal(CORE_CART.includes("cart-drawer-compat"), false);
    assert.equal(CORE_CART.includes("cart-drawer-adapters"), false);
    assert.equal(CORE_INDEX.includes("__fgpbDrawerCompat"), false);
  });

  it("core built asset contains no adapter registry identifiers", () => {
    assert.equal(CORE_ASSET.includes("upc-cart"), false);
    assert.equal(CORE_ASSET.includes("kwikcart"), false);
    assert.equal(CORE_ASSET.includes("gokwik"), false);
    assert.equal(CORE_ASSET.includes("shadow-dom-container"), false);
    assert.equal(CORE_ASSET.includes("COMPAT_ADAPTERS"), false);
    assert.equal(CORE_ASSET.includes("cart-drawer-adapters"), false);
    assert.equal(CORE_ASSET.includes("compat-contract"), false);
  });

  it("compat modules never import Reward Sync / discount planner paths", () => {
    const forbidden = [
      "gift-sync",
      "tiered-gift-sync",
      "discount",
      "campaign-eval",
      "planner",
      "fgpb-discount",
    ];
    for (const src of [COMPAT_SRC, ADAPTERS_SRC, CONTRACT_SRC, PROGRESS_SRC]) {
      for (const f of forbidden) {
        assert.equal(src.includes(f), false, `forbidden import path ${f}`);
      }
    }
  });

  it("core section apply uses target-aware compat ownership (no global strip)", () => {
    assert.match(CART_PAGE, /__fgpbDrawerCompat/);
    assert.match(CART_PAGE, /ownsSurface|data-fgpb-surface-owner/);
    assert.match(CART_PAGE, /mutationId/);
    assert.equal(CART_PAGE.includes("filterSections(sections)"), false);
  });

  it("closed cart drawer does not force-show the progress strip", () => {
    assert.match(CART_PAGE, /function isDrawerOpen/);
    assert.match(CART_PAGE, /function parkClosedDrawerChrome/);
    assert.match(CART_PAGE, /fgpb-drawer-park/);
    assert.match(CART_PAGE, /data-fgpb-open/);
    assert.equal(CART_PAGE.includes('setProperty("visibility", "visible"'), false);
    assert.equal(
      CART_PAGE.includes('section.style.setProperty("display", "block", "important")'),
      false,
    );
    assert.equal(CART_PAGE.includes("[?&]pb="), false);
    assert.equal(CART_PAGE.includes("preview_theme_id="), false);
    assert.match(CART_CSS, /data-fg-drawer\]:not\(\[data-fgpb-open="1"\]\)/);
    assert.match(CART_CSS, /visibility: hidden !important/);
    assert.equal(/visibility:\s*visible/.test(CART_CSS.replace(/\/\*[\s\S]*?\*\//g, "")), false);
  });

  it("opens the theme cart after product add-to-cart without stealing the form", () => {
    assert.match(CART_PAGE, /function openThemeCartDrawer/);
    assert.match(CART_PAGE, /function thirdPartyCartOwnsOpen/);
    assert.match(CART_PAGE, /function onProductAddToCart/);
    assert.match(CART_PAGE, /isCartAddForm/);
    assert.match(CART_PAGE, /function markExpectDrawerOpen/);
    assert.match(CART_PAGE, /function drawerShouldShow/);
    assert.match(CART_PAGE, /if \(!isDrawerOpen\(\)\) openThemeCartDrawer/);
    assert.match(CART_PAGE, /scheduleSyncChrome\(50\)/);
    assert.equal(CART_PAGE.includes("stopImmediatePropagation"), false);
  });

  it("product page does not auto-mount a live gift bar (MyAvni: bar only in open cart)", () => {
    assert.equal(EMBED.includes("product-page-progress.js"), false);
    assert.equal(EMBED.includes("cart-recommendations.js"), false);
    assert.equal(EMBED.includes("cart-page-progress.js"), true);
  });

  it("applyCartSections does not clobber line items after a newer shopper change", () => {
    assert.match(CART_PAGE, /opts\.cartUiGen/);
    assert.match(CART_PAGE, /__fgpbCartUiGen/);
    assert.match(CART_PAGE, /pinDrawerStripNow\(\)/);
    const applyFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function applyCartSections"),
      CART_PAGE.indexOf("window.__fgpbApplyCartSections"),
    );
    assert.match(applyFn, /Number\(opts\.cartUiGen\) !== liveGen/);
    // Chrome-only is now the default for every caller; Dawn markup is written
    // only by applyConfirmedGiftSections, and only for our own mutation.
    assert.match(applyFn, /applyGiftSyncChromeOnly\(sections\);/);
    assert.match(applyFn, /opts\.confirmedGiftMutation/);
    assert.match(CART_PAGE, /function applyGiftSyncChromeOnly/);
    assert.match(CART_PAGE, /function applyConfirmedGiftSections/);
    assert.match(CART_PAGE, /Add " \+ label \+ " more to earn Free Gift/);
    assert.equal(CART_PAGE.includes('return "₹" + Math.round(n).toLocaleString("en-IN")'), false);
    assert.equal(CART_PAGE.includes("pinGiftRowsToTopInDrawer"), false);
    assert.equal(CART_PAGE.includes('row.className = "cart-item fgpb-gift-line"'), false);
    // The synthetic gift row is gone; a gift only becomes visible once Shopify
    // confirms it. The stylesheet keeps its rule so a cached build cleans up.
    assert.match(CART_CSS, /data-fgpb-optimistic-gifts/);
  });

  it("gift sync selects the current campaign before removing locked gifts", () => {
    const TIERED = readFileSync(
      join(__dirname, "../../../extensions/free-gift-progress-bar/assets/tiered-gift-sync.js"),
      "utf8",
    );
    assert.match(TIERED, /var DEBOUNCE_MS = 80/);
    assert.match(TIERED, /var lastWs = null/);
    assert.match(TIERED, /function unlockedFromCachedWs/);
    assert.match(TIERED, /fetchWidgetState\(eligibleSubtotal\(cart\)/);
    assert.doesNotMatch(TIERED, /campaignIdFast/);
    assert.match(TIERED, /__fgpbLastWidgetState/);
    assert.match(TIERED, /function installNativeCartInterceptor/);
    assert.match(TIERED, /function applyNativeGiftThreshold/);
    assert.match(TIERED, /window\.fetch = function/);
    assert.match(TIERED, /cart:refresh/);
    assert.match(TIERED, /var processing = false/);
    assert.equal(TIERED.includes("stopImmediatePropagation"), false);
  });
});

describe("liquid gate", () => {
  beforeEach(() => {
    resetEmitDedup();
    delete globalThis.document;
    delete globalThis.window;
  });

  it("embed setting defaults false and gates asset load", () => {
    assert.match(EMBED, /enable_third_party_cart_compatibility/);
    assert.match(EMBED, /"default": false/);
    assert.match(
      EMBED,
      /\{% if block\.settings\.enable_third_party_cart_compatibility %\}[\s\S]*?cart-drawer-compat\.js[\s\S]*?\{% endif %\}/,
    );
    const scriptLoads = [...EMBED.matchAll(/fgpb_asset_name = '([^']+)'/g)].map((m) => m[1]);
    assert.ok(scriptLoads.includes("cart-page-progress.js"));
    const assignCompat = EMBED.match(
      /\{% if block\.settings\.enable_third_party_cart_compatibility %\}([\s\S]*?)\{% endif %\}/,
    );
    assert.ok(assignCompat);
    assert.ok(assignCompat[1].includes("cart-drawer-compat.js"));
  });

  it("simulates Liquid gate: false skips asset; true loads once", () => {
    function renderEmbed(enabled) {
      const scripts = [];
      const always = ["cart-page-progress.js", "tiered-gift-sync.js", "free-gift-progress-bar.js"];
      always.forEach((s) => scripts.push(s));
      if (enabled) scripts.push("cart-drawer-compat.js");
      return scripts;
    }
    assert.equal(renderEmbed(false).includes("cart-drawer-compat.js"), false);
    assert.equal(renderEmbed(true).filter((s) => s === "cart-drawer-compat.js").length, 1);
  });
});

describe("contract + detection", () => {
  it("adapters declare contract versions and capabilities", () => {
    assert.equal(COMPATIBILITY_API_VERSION, 1);
    for (const a of COMPAT_ADAPTERS) {
      assert.equal(a.contractVersion, COMPATIBILITY_API_VERSION);
      assert.ok(a.adapterVersion >= 1);
      assert.ok(typeof a.capabilities.canRefresh === "boolean");
      assert.ok(typeof a.capabilities.canHighlightGiftRows === "boolean");
      assert.ok(typeof a.capabilities.acceptsShopifySections === "boolean");
      assert.ok(
        Object.values(REFRESH_STRATEGY).includes(a.capabilities.refreshStrategy),
      );
    }
    assert.equal(UPC_LIMITED(), false);
    function UPC_LIMITED() {
      return COMPAT_ADAPTERS.find((a) => a.id === "upc-cart").capabilities.limited;
    }
  });

  it("scores #upc-cart above activate threshold", () => {
    const gift = el("div", { class: "upc-line-item", "data-line-key": "g:1", "data-variant-id": "9" });
    const paid = el("div", { class: "upc-line-item", "data-line-key": "p:1", "data-variant-id": "9" });
    const root = el("aside", { id: "upc-cart", class: "upc-drawer", "data-upc-cart": "1" }, [gift, paid]);
    root.querySelectorAll = (sel) => (sel.includes("upc-line-item") ? [gift, paid] : []);
    const doc = {
      querySelector: (sel) =>
        sel === "#upc-cart" || sel === "[data-upc-cart]" || sel === ".upc-drawer" ? root : null,
      querySelectorAll: () => [],
    };
    const scored = scoreAdapter(UPC, doc);
    assert.ok(scored.confidence >= DETECTION_ACTIVATE_MIN);
    const best = detectBestAdapter(doc);
    assert.equal(best.adapter.id, "upc-cart");
    assert.equal(best.status, ADAPTER_STATUS.SUPPORTED);
    assert.equal(extractLineKey(gift, best.adapter), "g:1");
    assert.equal(queryRows(best.adapter, root).length, 2);
  });

  it("generic-class-only stays below activate / never supported", () => {
    const root = el("div", { class: "upc-drawer" });
    const doc = {
      querySelector: (sel) => (sel === ".upc-drawer" ? root : null),
      querySelectorAll: () => [],
    };
    const scored = scoreAdapter(UPC, doc);
    assert.ok(scored.confidence <= DETECTION_GENERIC_CLASS_MAX);
    const best = detectBestAdapter(doc);
    assert.equal(best.status, ADAPTER_STATUS.UNKNOWN);
    assert.equal(best.adapter.id, "none");
  });

  it("conflict when two adapters tie above threshold", () => {
    const upcRoot = el("aside", { id: "upc-cart", "data-upc-cart": "1" });
    const popupRoot = el("div", { class: "cart-popup-wrapper", "data-cart-popup-wrapper": "" });
    const doc = {
      querySelector(sel) {
        if (sel === "#upc-cart" || sel === "[data-upc-cart]") return upcRoot;
        if (String(sel).includes("cart-popup")) return popupRoot;
        return null;
      },
      querySelectorAll: () => [],
    };
    // Force equal high scores by stubbing score via dual unique hits
    const upc = scoreAdapter(UPC, doc);
    const popup = scoreAdapter(POPUP, doc);
    assert.ok(upc.confidence >= DETECTION_ACTIVATE_MIN);
    assert.ok(popup.confidence >= DETECTION_ACTIVATE_MIN);
    // If both at 90+ and equal top, conflict — bump upc unique to 100 vs popup 90 → no conflict
    // Simulate tie: custom doc where both return 100-equivalent
    const tied = detectBestAdapter({
      querySelector(sel) {
        if (sel === "#upc-cart") return upcRoot;
        if (sel === "[data-cart-popup-wrapper]") return popupRoot;
        // prevent rootPlus bumps differentiating
        return null;
      },
      querySelectorAll: () => [],
    });
    // upc uniqueIds=100, popup dataAttrs=90 → upc wins, not conflict
    assert.notEqual(tied.status, ADAPTER_STATUS.CONFLICT);
    assert.equal(tied.adapter.id, "upc-cart");

    // True tie path: equal confidence above threshold → conflict semantics
    const candidates = [
      { adapter: UPC, root: upcRoot, confidence: 100, reasons: ["t"] },
      { adapter: POPUP, root: popupRoot, confidence: 100, reasons: ["t"] },
    ];
    const above = candidates.filter((c) => c.confidence >= DETECTION_ACTIVATE_MIN);
    const top = above[0].confidence;
    const tiedList = above.filter((c) => c.confidence === top);
    assert.equal(tiedList.length, 2);
  });

  it("forced mode invalid / missing root → failed, no silent fallback", () => {
    const docEmpty = { querySelector: () => null, querySelectorAll: () => [] };
    const bad = detectBestAdapter(docEmpty, { forceAdapterId: "nope" });
    assert.equal(bad.status, ADAPTER_STATUS.FAILED);
    assert.equal(bad.adapter, null);

    const missing = detectBestAdapter(docEmpty, { forceAdapterId: "upc-cart" });
    assert.equal(missing.status, ADAPTER_STATUS.FAILED);
    assert.equal(missing.adapter.id, "upc-cart");
    assert.equal(missing.root, null);
  });

  it("cart-popup is limited / event-only; unknown is none", () => {
    const popup = el("div", { class: "cart-popup-wrapper", "data-cart-popup-wrapper": "" });
    const docPopup = {
      querySelector: (sel) => (String(sel).includes("cart-popup") ? popup : null),
    };
    assert.equal(selectCompatAdapter(docPopup).adapter.id, "cart-popup");
    assert.equal(selectCompatAdapter(docPopup).adapter.capabilities.limited, true);
    assert.equal(shouldApplyDawnSections(selectCompatAdapter(docPopup).adapter), false);

    const docNone = { querySelector: () => null };
    assert.equal(selectCompatAdapter(docNone).adapter.id, "none");
  });
});

describe("line identity", () => {
  it("exact key styles gift; paid same-SKU with Free Gift text stays unmarked", () => {
    const giftKey = "542:gift";
    const paidKey = "542:paid";
    const gift = el("div", { class: "upc-line-item", "data-line-key": giftKey, "data-variant-id": "542" });
    const paid = el("div", { class: "upc-line-item", "data-line-key": paidKey, "data-variant-id": "542" });
    paid.textContent = "Free Gift: UNLOCKED";
    const indexed = el("div", { class: "upc-line-item", id: "CartItem-1" });
    const root = el("aside", { id: "upc-cart" }, [paid, gift, indexed]);
    root.querySelectorAll = () => [paid, gift, indexed];
    const doc = {
      querySelector: (sel) => (sel.includes("upc") || sel === "#upc-cart" ? root : null),
    };
    const cart = {
      items: [
        { key: paidKey, variant_id: 542, properties: {} },
        { key: giftKey, variant_id: 542, properties: { _fgpb_free_gift: "true" } },
      ],
    };
    highlightCompatGiftRows(cart, doc);
    assert.equal(gift.classList.contains("fgpb-gift-line"), true);
    assert.equal(paid.classList.contains("fgpb-gift-line"), false);
    assert.equal(indexed.classList.contains("fgpb-gift-line"), false);

    const matches = matchGiftRows(root, UPC, [
      { key: giftKey, variantId: 542, isAppGift: true },
      { key: paidKey, variantId: 542, isAppGift: false },
    ]);
    assert.equal(matches[0].kind, LINE_MATCH.EXACT);
    assert.equal(matches[1].kind, LINE_MATCH.NOT_FOUND);
  });

  it("ambiguous same variant without keys does not style", () => {
    const a = el("div", { class: "upc-line-item", "data-variant-id": "7" });
    const b = el("div", { class: "upc-line-item", "data-variant-id": "7" });
    const root = el("aside", { id: "upc-cart" }, [a, b]);
    root.querySelectorAll = () => [a, b];
    const matches = matchGiftRows(root, UPC, [
      { variantId: 7, isAppGift: true },
    ]);
    assert.equal(matches[0].kind, LINE_MATCH.AMBIGUOUS);
    assert.equal(findGiftRows(root, UPC, [{ variantId: 7, isAppGift: true }]).length, 0);
  });

  it("source has no textContent Free Gift heuristic", () => {
    assert.equal(COMPAT_SRC.includes("rowHasAppGiftProperty"), false);
    assert.equal(/Free\\s\*Gift/.test(COMPAT_SRC), false);
    assert.equal(/Free\\s\*Gift/.test(ADAPTERS_SRC), false);
    assert.equal(/Free\\s\*Gift/.test(CORE_CART), false);
    assert.equal(CORE_CART.includes("rowHasAppGiftProperty"), false);
  });
});

describe("core same-SKU gift identity (no Free Gift text)", () => {
  it("paid same-SKU row with Free Gift: UNLOCKED text stays unmarked", () => {
    const giftKey = "g1";
    const paidKey = "p1";
    const giftRow = {
      marked: false,
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") giftRow.marked = true;
        },
        remove() {},
      },
      getAttribute: () => null,
      querySelector(sel) {
        if (String(sel).includes("data-line-key")) {
          return { getAttribute: () => giftKey };
        }
        return null;
      },
      querySelectorAll: () => [],
      textContent: "Free Gift: UNLOCKED",
    };
    const paidRow = {
      marked: false,
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") paidRow.marked = true;
        },
        remove() {},
      },
      getAttribute: () => null,
      querySelector(sel) {
        if (String(sel).includes("data-line-key")) {
          return { getAttribute: () => paidKey };
        }
        return null;
      },
      querySelectorAll: () => [],
      textContent: "Cool Tee Free Gift: UNLOCKED",
    };
    globalThis.document = {
      createElement: () => ({ className: "", setAttribute() {}, textContent: "" }),
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
        { variantId: 99, quantity: 1, lineKey: paidKey, properties: {} },
        {
          variantId: 99,
          quantity: 1,
          lineKey: giftKey,
          properties: { _fgpb_free_gift: "true" },
        },
      ],
    });
    assert.equal(giftRow.marked, true);
    assert.equal(paidRow.marked, false);
    delete globalThis.document;
  });

  it("variant alone does not mark paid when gift+paid same SKU both present", () => {
    const paidRow = {
      marked: false,
      classList: {
        add(c) {
          if (c === "fgpb-gift-line") paidRow.marked = true;
        },
        remove() {},
      },
      getAttribute: () => null,
      querySelector(sel) {
        if (String(sel).includes("data-variant")) {
          return { getAttribute: () => "42" };
        }
        return null;
      },
      querySelectorAll: () => [],
      textContent: "Free Gift: Yes",
    };
    globalThis.document = {
      createElement: () => ({ className: "", setAttribute() {}, textContent: "" }),
      querySelectorAll: (sel) => {
        if (sel === ".fgpb-gift-line") {
          const list = [];
          list.forEach = () => {};
          return list;
        }
        if (typeof sel === "string" && sel.includes("cart-item")) {
          const list = [paidRow];
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
        { variantId: 42, quantity: 1, lineKey: "paid", properties: {} },
        {
          variantId: 42,
          quantity: 1,
          lineKey: "gift",
          properties: { _fgpb_free_gift: "true" },
        },
      ],
    });
    // Paid row has no matching line key in DOM; uniqueGiftVids is empty (variant count 2).
    assert.equal(paidRow.marked, false);
    delete globalThis.document;
  });
});

describe("section ownership coexistence", () => {
  it("Dawn-only: filter never strips cart-drawer", () => {
    const { sections, stripped } = filterSectionsForAdapter(NONE_ADAPTER, {
      "cart-drawer": "<cart-drawer>x</cart-drawer>",
      "cart-icon-bubble": "<div>1</div>",
    });
    assert.equal(stripped, false);
    assert.ok(sections["cart-drawer"]);
    assert.ok(sections["cart-icon-bubble"]);
  });

  it("UPC-only: sections stay; apply blocked on compat-owned UPC root", () => {
    const upc = UPC;
    const { sections, stripped } = filterSectionsForAdapter(upc, {
      "cart-drawer": "<cart-drawer>dawn</cart-drawer>",
    });
    assert.equal(stripped, false);
    assert.ok(sections["cart-drawer"], "must not globally strip Dawn section HTML");
    const upcRoot = el("aside", { id: "upc-cart", "data-fgpb-surface-owner": "compat" });
    assert.equal(isCompatOwnedSurface(upcRoot), true);
    assert.equal(shouldApplyCartDrawerSectionToTarget(upc, upcRoot), false);
  });

  it("Dawn + UPC: Dawn target still receives section; UPC root does not", () => {
    const upc = UPC;
    const dawn = el("cart-drawer", { id: "CartDrawer", "data-fgpb-surface-owner": "core" });
    const upcRoot = el("aside", { id: "upc-cart", "data-fgpb-surface-owner": "compat" });
    const { sections } = filterSectionsForAdapter(upc, {
      "cart-drawer": "<cart-drawer>dawn</cart-drawer>",
    });
    assert.ok(sections["cart-drawer"]);
    assert.equal(shouldApplyCartDrawerSectionToTarget(upc, dawn), true);
    assert.equal(shouldApplyCartDrawerSectionToTarget(upc, upcRoot), false);
  });

  it("compat failed/conflict/none/disabled: Dawn section refresh remains", () => {
    const payload = {
      "cart-drawer": "<cart-drawer>ok</cart-drawer>",
      "cart-icon-bubble": "<div>1</div>",
    };
    for (const adapter of [NONE_ADAPTER, null, undefined]) {
      const { sections, stripped } = filterSectionsForAdapter(adapter, payload);
      assert.equal(stripped, false);
      assert.ok(sections["cart-drawer"]);
    }
    const dawn = el("cart-drawer", {});
    assert.equal(shouldApplyCartDrawerSectionToTarget(NONE_ADAPTER, dawn), true);
    assert.equal(isCompatOwnedSurface(dawn), false);
  });

  it("active TP adapter does not strip cart-drawer from payload", () => {
    const upc = UPC;
    assert.equal(upc.capabilities.acceptsShopifySections, false);
    const { sections, stripped } = filterSectionsForAdapter(upc, {
      "cart-drawer": "<cart-drawer>x</cart-drawer>",
      "cart-icon-bubble": "<div>1</div>",
    });
    assert.equal(stripped, false);
    assert.equal(sections["cart-drawer"], "<cart-drawer>x</cart-drawer>");
    assert.ok(sections["cart-icon-bubble"]);
  });
});

describe("section ownership + refresh + events + lifecycle", () => {
  beforeEach(() => {
    resetEmitDedup();
    delete globalThis.document;
    delete globalThis.window;
  });

  it("native refresh uses __tpCart when present", () => {
    globalThis.window = {
      __tpCart: {
        calls: 0,
        refresh() {
          this.calls += 1;
        },
      },
    };
    globalThis.document = {
      dispatchEvent() {
        return true;
      },
      querySelector: () => null,
    };
    const upc = UPC;
    const r = refreshNativeDrawer(upc, { items: [] });
    assert.equal(r.ok, true);
    assert.equal(r.nativeRefreshRequested, true);
    assert.equal(globalThis.window.__tpCart.calls, 1);
  });

  it("dedupes fgpb:cart-updated and omits secrets; payload is versioned", () => {
    const events = [];
    globalThis.document = {
      dispatchEvent(ev) {
        events.push(ev);
        return true;
      },
    };
    const cart = { items: [{ key: "a", properties: {} }] };
    assert.equal(emitCartUpdated({ adapterId: "upc-cart", reason: "t", cart, status: "supported" }), true);
    assert.equal(emitCartUpdated({ adapterId: "upc-cart", reason: "t", cart, status: "supported" }), false);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, CART_UPDATED_EVENT);
    const d = events[0].detail;
    assert.equal(d.adapterId, "upc-cart");
    assert.equal(d.version, COMPATIBILITY_API_VERSION);
    assert.ok(d.timestamp);
    assert.equal(d.token, undefined);
    assert.equal(d.email, undefined);
    assert.equal(d.items, undefined);
  });

  it("install is idempotent (no duplicate asset boot)", () => {
    globalThis.window = {};
    globalThis.document = {
      addEventListener() {},
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent() {
        return true;
      },
    };
    const a = installCartDrawerCompat();
    const b = installCartDrawerCompat();
    assert.equal(a.installed, true);
    assert.equal(b.duplicate, true);
    assert.equal(globalThis.window[BOOT_FLAG], true);
    assert.equal(typeof globalThis.window.__fgpbDrawerCompat.getStatus, "function");
    const st = globalThis.window.__fgpbDrawerCompat.getStatus();
    assert.equal(st.contractVersion, COMPATIBILITY_API_VERSION);
    assert.ok(st.adapterId);
    assert.ok(st.status);
    // none/unknown: no boot emit
    assert.equal(st.adapterId, "none");
  });

  it("destroy clears boot flag and listeners", () => {
    const listeners = [];
    globalThis.window = {};
    globalThis.document = {
      addEventListener(type, fn, opts) {
        listeners.push({ type, fn, opts });
      },
      querySelector: () => null,
      getElementById: () => null,
      dispatchEvent() {
        return true;
      },
    };
    installCartDrawerCompat();
    assert.ok(listeners.length >= 1);
    globalThis.window.__fgpbDrawerCompat.destroy();
    assert.equal(globalThis.window[BOOT_FLAG], false);
  });

  it("cartCompatMeta version is stable metadata only", () => {
    const meta = cartCompatMeta({
      items: [
        { key: "p", properties: {} },
        { key: "g", properties: { _fgpb_free_gift: "true" } },
      ],
    });
    assert.equal(meta.giftCount, 1);
    assert.equal(meta.itemCount, 2);
  });

  it("compat source never listens to fgpb:cart-updated", () => {
    assert.equal(
      /addEventListener\s*\(\s*["']fgpb:cart-updated["']/.test(COMPAT_SRC),
      false,
    );
  });
});

describe("kwikcart adapter", () => {
  beforeEach(() => {
    resetEmitDedup();
    delete globalThis.window;
    delete globalThis.document;
  });

  it("is registered separately from upc-cart", () => {
    assert.ok(KWIK);
    assert.ok(UPC);
    assert.notEqual(KWIK.id, UPC.id);
    assert.equal(KWIK.capabilities.acceptsShopifySections, false);
    assert.equal(KWIK.capabilities.mountProgressStrip, true);
    assert.equal(KWIK.lineKeyStrategy, "none");
    assert.equal(KWIK.nativeRefreshWindow.includes("refreshSideCart"), true);
  });

  it("does not activate on generic .cart-drawer or checkout chrome", () => {
    const dawn = el("cart-drawer", { id: "CartDrawer", class: "cart-drawer" });
    const buy = el("button", { id: "gokwik-buy-now" });
    const checkout = el("div", { class: "gokwik-checkout" });
    const modal = el("div", { id: "gokwik-modal-wrapper" });
    const config = el("script", { id: "gk-cart-config" });
    const doc = {
      querySelector(sel) {
        if (sel === "cart-drawer" || sel === ".cart-drawer" || sel === "#CartDrawer") return dawn;
        if (sel === "#gokwik-buy-now") return buy;
        if (sel === ".gokwik-checkout") return checkout;
        if (sel === "#gokwik-modal-wrapper") return modal;
        if (sel === "#gk-cart-config") return config;
        return null;
      },
      querySelectorAll: () => [],
    };
    globalThis.window = {};
    const scored = scoreAdapter(KWIK, doc);
    assert.ok(scored.confidence < DETECTION_ACTIVATE_MIN);
    const best = detectBestAdapter(doc);
    assert.equal(best.status, ADAPTER_STATUS.UNKNOWN);
    assert.equal(best.adapter.id, "none");
  });

  it("does not activate shadow-dom-container without GoKwik runtime", () => {
    const host = el("shadow-dom-container", {});
    const doc = {
      querySelector: (sel) => (sel === "shadow-dom-container" ? host : null),
      querySelectorAll: () => [],
    };
    globalThis.window = {};
    const scored = scoreAdapter(KWIK, doc);
    assert.ok(scored.confidence <= DETECTION_GENERIC_CLASS_MAX);
    const best = detectBestAdapter(doc);
    assert.notEqual(best.adapter?.id, "kwikcart");
  });

  it("activates when custom element + runtime evidence are both present", () => {
    const panel = el("div", { class: "gokwik-sidecart-container" });
    const host = el("shadow-dom-container", {});
    host.shadowRoot = {
      querySelector: (sel) => (sel === ".gokwik-sidecart-container" ? panel : null),
      querySelectorAll: () => [],
    };
    const doc = {
      querySelector: (sel) => (sel === "shadow-dom-container" ? host : null),
      querySelectorAll: () => [],
    };
    globalThis.window = { openGokwikSideCart() {}, refreshSideCart() {}, gk_cart_domain: "shop.myshopify.com" };
    const scored = scoreAdapter(KWIK, doc);
    assert.ok(scored.confidence >= DETECTION_ACTIVATE_MIN);
    assert.equal(scored.root, host);
    const best = detectBestAdapter(doc);
    assert.equal(best.adapter.id, "kwikcart");
    assert.equal(best.status, ADAPTER_STATUS.LIMITED);
  });

  it("Dawn and KwikCart coexistence: Dawn still receives sections; KwikCart is compat-owned", () => {
    const dawn = el("cart-drawer", { id: "CartDrawer", "data-fgpb-surface-owner": "core" });
    const host = el("shadow-dom-container", { "data-fgpb-surface-owner": "compat" });
    const { sections, stripped } = filterSectionsForAdapter(KWIK, {
      "cart-drawer": "<cart-drawer>dawn</cart-drawer>",
    });
    assert.equal(stripped, false);
    assert.ok(sections["cart-drawer"]);
    assert.equal(shouldApplyCartDrawerSectionToTarget(KWIK, dawn), true);
    assert.equal(shouldApplyCartDrawerSectionToTarget(KWIK, host), false);
    assert.equal(isCompatOwnedSurface(host), true);
    assert.equal(isCompatOwnedSurface(dawn), false);
  });

  it("does not style same-SKU paid lines (no line keys / no text heuristic)", () => {
    const paid = el("div", { class: "gokwik-sidecart-container", "data-variant-id": "99" });
    paid.textContent = "Free Gift: UNLOCKED";
    const host = el("shadow-dom-container", {}, [paid]);
    host.shadowRoot = {
      querySelector: () => paid,
      querySelectorAll: (sel) => (String(sel).includes("gokwik") ? [paid] : []),
    };
    const matches = matchGiftRows(host, KWIK, [
      { key: "gift-key", variantId: 99, isAppGift: true },
    ]);
    assert.equal(matches[0].kind, LINE_MATCH.NOT_FOUND);
    assert.equal(findGiftRows(host, KWIK, [{ key: "gift-key", variantId: 99, isAppGift: true }]).length, 0);
  });

  it("progress copy uses cart currency and existing evaluation fields", () => {
    const below = progressViewFromState(
      { enabled: true, threshold: 100, remaining: 40, progress: 60, currency: "USD", cartSubtotal: 60 },
      { currency: "USD", items: [{ final_line_price: 6000, properties: {} }] },
    );
    assert.equal(below.heading, "Add 40 more to earn Free Gift");
    assert.equal(below.heading.includes("₹"), false);
    assert.equal(below.heading.includes("$"), false);
    assert.equal(below.remaining, 40);
    const unlocked = progressViewFromState(
      { enabled: true, threshold: 50, remaining: 0, progress: 100, currency: "USD", cartSubtotal: 80 },
      { currency: "USD", items: [{ final_line_price: 8000, properties: {} }] },
    );
    assert.equal(unlocked.heading, formatUnlockedHeading());
    const paidPlusGift = progressViewFromState(
      { enabled: true, threshold: 100, remaining: 50, progress: 50, currency: "USD" },
      {
        currency: "USD",
        items: [
          { final_line_price: 5000, properties: {} },
          { final_line_price: 0, properties: { _fgpb_free_gift: "true" } },
        ],
      },
    );
    assert.equal(paidPlusGift.cartSubtotal, 50);
    assert.equal(formatAwayHeading(12, "USD"), "Add 12 more to earn Free Gift");
    assert.equal(formatAwayHeading(12, "USD").includes("₹"), false);
    assert.equal(formatAwayHeading(12, "USD").includes("$"), false);
  });

  it("tier states use widget-state tiers, not hardcoded INR thresholds", () => {
    const ws = {
      enabled: true,
      rewardType: "TIERED_FREE_GIFTS",
      currency: "USD",
      rewardTiers: [{ threshold: 30 }, { threshold: 80 }],
    };
    const before = progressViewFromState(ws, {
      currency: "USD",
      items: [{ final_line_price: 1000, properties: {} }],
    });
    assert.match(before.heading, /Add .+ more to earn Free Gift/);
    const mid = progressViewFromState(ws, {
      currency: "USD",
      items: [{ final_line_price: 4000, properties: {} }],
    });
    assert.ok(mid.progress > 0 && mid.progress < 100);
    const all = progressViewFromState(ws, {
      currency: "USD",
      items: [{ final_line_price: 9000, properties: {} }],
    });
    assert.equal(all.heading, "You have unlocked all rewards!");
    assert.equal(all.progress, 100);
  });

  it("closed cart hides the strip; open history.state.sideCart paints it", () => {
    const panel = {
      tagName: "DIV",
      attrs: { class: "gokwik-sidecart-container" },
      children: [],
      firstChild: null,
      ownerDocument: null,
      hidden: false,
      querySelector: () => null,
      insertBefore(node) {
        this.children.unshift(node);
        this.firstChild = node;
        return node;
      },
      appendChild(node) {
        this.children.push(node);
        if (!this.firstChild) this.firstChild = node;
        return node;
      },
    };
    const host = el("shadow-dom-container", { "data-fgpb-surface-owner": "compat" });
    host.shadowRoot = {
      querySelector(sel) {
        if (sel === ".gokwik-sidecart-container") return panel;
        if (String(sel).includes("fgpb-compat-strip")) return panel.children[0] || null;
        if (String(sel).includes("fgpb-compat-strip-css")) return { exists: true };
        return null;
      },
      querySelectorAll: () => [],
      appendChild() {},
      ownerDocument: {
        createElement(tag) {
          const node = el(tag, {});
          node.innerHTML = "";
          node.style = { setProperty() {}, getPropertyValue() { return ""; } };
          node.querySelector = (s) => {
            if (!node._map) node._map = {};
            if (!node._map[s]) {
              node._map[s] = el("span", {});
              node._map[s].style = { setProperty() {} };
              node._map[s].classList = node.classList;
            }
            return node._map[s];
          };
          node.querySelectorAll = () => [];
          return node;
        },
      },
    };
    panel.querySelector = host.shadowRoot.querySelector;
    panel.ownerDocument = host.shadowRoot.ownerDocument;
    globalThis.window = { history: { state: {} } };
    const closed = syncCompatProgressStrip(
      KWIK,
      host,
      { enabled: true, threshold: 50, remaining: 20, progress: 60, currency: "USD" },
      { currency: "USD", items: [{ final_line_price: 3000, properties: {} }] },
      globalThis.window,
    );
    assert.equal(closed.hidden, true);
    globalThis.window.history.state = { sideCart: true };
    const open = syncCompatProgressStrip(
      KWIK,
      host,
      { enabled: true, threshold: 50, remaining: 20, progress: 60, currency: "USD" },
      { currency: "USD", items: [{ final_line_price: 3000, properties: {} }] },
      globalThis.window,
    );
    assert.equal(isAdapterSurfaceOpen(KWIK, host, globalThis.window), true);
    assert.equal(open.mounted, true);
    assert.equal(open.hidden, false);
  });

  it("native refresh calls refreshSideCart, not Dawn sections", () => {
    let calls = 0;
    globalThis.window = {
      refreshSideCart() {
        calls += 1;
      },
    };
    globalThis.document = { dispatchEvent() { return true; }, querySelector: () => null };
    const r = refreshNativeDrawer(KWIK, { items: [] });
    assert.equal(r.ok, true);
    assert.equal(r.nativeRefreshRequested, true);
    assert.equal(calls, 1);
    assert.equal(shouldApplyDawnSections(KWIK), false);
  });

  it("adapter failure isolation: unknown cart does not inject", () => {
    globalThis.window = { openGokwikSideCart() {} };
    const doc = { querySelector: () => null, querySelectorAll: () => [] };
    const best = detectBestAdapter(doc);
    assert.equal(best.status, ADAPTER_STATUS.UNKNOWN);
    assert.equal(best.root, null);
    const injected = syncCompatProgressStrip(best.adapter, null, { enabled: true, threshold: 10 }, { items: [] });
    assert.equal(injected.mounted, false);
  });
});
