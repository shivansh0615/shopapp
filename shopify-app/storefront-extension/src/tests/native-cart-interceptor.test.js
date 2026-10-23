import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isTaggedGift, planTieredGiftSync } from "../utils/tiered-gift-sync.js";
import { isCartMutationUrl } from "../utils/util.js";

const TIERED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../extensions/free-gift-progress-bar/assets/tiered-gift-sync.js"),
  "utf8",
);

function isFullCartJson(json) {
  return !!(
    json &&
    typeof json === "object" &&
    Array.isArray(json.items) &&
    json.total_price != null &&
    json.item_count != null
  );
}

describe("native cart fetch interceptor", () => {
  it("wraps window.fetch for cart add/update/change and skips theme-editor", () => {
    assert.match(TIERED, /function installNativeCartInterceptor/);
    assert.match(TIERED, /window\.fetch = function/);
    assert.match(TIERED, /\.clone\(\)/);
    assert.match(TIERED, /XMLHttpRequest\.prototype\.open/);
    assert.match(TIERED, /inThemeEditor\(\)/);
    assert.match(TIERED, /nativeFetch \|\| fetch/);
    assert.equal(TIERED.includes("[?&]pb="), false);
    assert.equal(TIERED.includes("preview_theme_id="), false);
  });

  it("treats Shopify cart mutation URLs as intercept targets", () => {
    assert.equal(isCartMutationUrl("/cart/add.js"), true);
    assert.equal(isCartMutationUrl("/cart/update.js"), true);
    assert.equal(isCartMutationUrl("/cart/change.js"), true);
    assert.equal(isCartMutationUrl("/cart.js"), false);
    assert.equal(isCartMutationUrl("/apps/free-gift/widget-state"), false);
    assert.match(TIERED, /add\|change\|update\|clear/);
  });

  it("uses a processing flag so gift add/remove cannot recurse", () => {
    assert.match(TIERED, /var processing = false/);
    assert.match(TIERED, /mutating = true/);
    assert.match(TIERED, /function enqueueMutation/);
    assert.match(TIERED, /var lastKnownCart = null/);
    assert.match(TIERED, /lastNativeAt/);
  });

  it("dispatches cart:refresh after native gift mutation (no cart:change)", () => {
    assert.match(TIERED, /CustomEvent\("cart:refresh"/);
    const nativeBlock = TIERED.slice(TIERED.indexOf("function dispatchCartRefresh"));
    const fn = nativeBlock.slice(0, nativeBlock.indexOf("function onNativeCartResponse"));
    assert.equal(fn.includes('CustomEvent("cart:change"'), false);
  });

  it("queues authoritative selection on the native path", () => {
    const start = TIERED.indexOf("function applyNativeGiftThreshold");
    // The safety postcondition sits between the hot path and the reconciler and
    // reads the cart by design, so it is excluded from this slice.
    const end = TIERED.indexOf("* Gift safety postcondition");
    assert.ok(end > start, "safety section must follow the hot path");
    const body = TIERED.slice(start, end);
    assert.equal(body.includes("fetchWidgetState"), false);
    assert.equal(body.includes("/apps/free-gift/widget-state"), false);
    assert.equal(body.includes("fetchCart()"), false);
    assert.match(body, /schedule/);
    assert.doesNotMatch(body, /cartPost\(/);

    // The one place a read is required: after our own mutation we must confirm
    // the authoritative cart before deciding whether the gift is still earned.
    const reconcile = TIERED.slice(
      TIERED.indexOf("function reconcileAfterGiftMutation"),
      TIERED.indexOf("function planStillValid"),
    );
    assert.match(reconcile, /fetchCart\(\)/);
    assert.match(reconcile, /type === "REMOVE"/);
    assert.equal(reconcile.includes('"ADD"'), false, "compensation must never add");
    const responseFn = TIERED.slice(
      TIERED.indexOf("function onNativeCartResponse"),
      TIERED.indexOf("function restoreNativeInterceptor"),
    );
    assert.equal(responseFn.includes("fetchCart()"), false);
  });

  it("never rewrites Dawn's outgoing add.js payload", () => {
    // Batching our gift onto the shopper's own add request meant a failure of
    // ours could fail their add. Dawn's request now goes out untouched.
    assert.equal(TIERED.includes("function prepareBatchedAdd"), false);
    assert.equal(TIERED.includes("function runWatchedFetch"), false);
    assert.match(TIERED, /function adoptMutationResponse/);
    assert.match(TIERED, /giftUnavailable = true/);
    // A 422 on our gift SKU must not latch for the whole session.
    assert.match(TIERED, /giftUnavailable = false;/);
    assert.match(TIERED, /followUpGiftSync/);
    assert.match(TIERED, /function observeNativeCartResponse/);
    assert.match(TIERED, /nativeFetch\.apply\(this, arguments\)/);
    assert.match(TIERED, /__fgpbGuardFetch/);
    assert.match(TIERED, /cart\._partial/);
    const propsFn = TIERED.slice(
      TIERED.indexOf("function giftProperties"),
      TIERED.indexOf("function requestJson"),
    );
    assert.equal(propsFn.includes('["Free Gift"]'), false);
    assert.match(propsFn, /FREE_GIFT_KEY/);
    assert.match(propsFn, /_is_free_gift/);
  });

  it("add.js item payload is not treated as a full cart", () => {
    assert.equal(isFullCartJson({ id: 1, variant_id: 2, quantity: 1 }), false);
    assert.equal(
      isFullCartJson({ items: [{ id: 1 }], total_price: 200000, item_count: 1 }),
      true,
    );
  });

  it("bumps cart UI generation on shopper qty/remove and skips stale gift sections", () => {
    assert.match(TIERED, /function bumpShopperCartGen/);
    assert.match(TIERED, /__fgpbCartUiGen/);
    assert.match(TIERED, /bumpShopperCartGen\(\)/);
    assert.match(TIERED, /function shouldApplyGiftCartSections/);
    assert.match(TIERED, /cartUiGen: startedGen/);
    // Sections are applied only from the mutation response that produced them.
    // The old fallback re-fetched `/?sections=` and applied HTML describing a
    // different cart version on top of Dawn's render. Savor's morph uses the
    // same response, and a moved generation skips both writers.
    assert.match(
      TIERED,
      /if \(data && data\.sections\) \{\s*applySharedCartSections\(data\.sections, startedGen\);\s*publishHorizonCartSections\(data\.sections, startedGen\);\s*\}/,
    );
    assert.equal(TIERED.includes("fetchCartSectionsFallback"), false);
    assert.match(TIERED, /fromGiftSync: true/);
    assert.match(TIERED, /confirmedGiftMutation: true/);
    assert.match(TIERED, /planStillValid/);
    assert.match(TIERED, /__fgpbPaintFromCart/);
    assert.match(TIERED, /function rewriteChangeLineToKey/);
    assert.match(TIERED, /function themeLineItemKey/);
    assert.match(TIERED, /function rewriteThemeLineBody/);
    assert.match(TIERED, /rewriteThemeLineChange\(input, init\)/);
    assert.match(TIERED, /function isInvalidLineError/);
    assert.match(TIERED, /retryInvalidLineChange/);
  });
});

describe("native threshold Condition A / B", () => {
  const campaignId = "12";
  const giftVid = "555";

  function taggedGift(key) {
    return {
      key,
      variant_id: Number(giftVid),
      quantity: 1,
      properties: { _fgpb_free_gift: "true", _fgpb_tier_id: "classic", _fgpb_campaign_id: campaignId },
    };
  }

  it("Condition A: at-or-above threshold without tagged gift plans ADD", () => {
    const unlocked = [{ tierId: "classic", variantId: giftVid, threshold: 2000 }];
    const cart = {
      items: [{ key: "paid", variant_id: 1, final_line_price: 200000, quantity: 1, properties: {} }],
    };
    const actions = planTieredGiftSync({
      cart,
      unlockedGifts: unlocked,
      campaignId,
      autoAddGift: true,
    });
    assert.equal(actions.some((a) => a.type === "ADD" && String(a.variantId) === giftVid), true);
    assert.equal(actions.some((a) => a.type === "REMOVE"), false);
  });

  it("Condition B: below threshold with tagged gift plans REMOVE", () => {
    const cart = {
      items: [
        { key: "paid", variant_id: 1, final_line_price: 50000, quantity: 1, properties: {} },
        taggedGift("gift-line"),
      ],
    };
    const actions = planTieredGiftSync({
      cart,
      unlockedGifts: [],
      campaignId,
      autoAddGift: true,
    });
    assert.equal(actions.some((a) => a.type === "REMOVE" && a.lineKey === "gift-line"), true);
    assert.equal(actions.some((a) => a.type === "ADD"), false);
    assert.equal(isTaggedGift(taggedGift("gift-line").properties), true);
  });

  it("does not treat a paid same-SKU line as the free gift", () => {
    const unlocked = [{ tierId: "classic", variantId: giftVid, threshold: 2000 }];
    const cart = {
      items: [
        {
          key: "paid-same",
          variant_id: Number(giftVid),
          final_line_price: 200000,
          quantity: 1,
          properties: {},
        },
      ],
    };
    const actions = planTieredGiftSync({
      cart,
      unlockedGifts: unlocked,
      campaignId,
      autoAddGift: true,
    });
    assert.equal(actions.some((a) => a.type === "ADD"), true);
    assert.equal(isTaggedGift({}), false);
  });
});
