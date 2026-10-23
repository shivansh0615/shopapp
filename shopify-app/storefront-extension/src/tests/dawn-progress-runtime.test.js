import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { shouldAcceptPaintGen } from "../utils/native-cart-predict.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const EXT = join(ROOT, "extensions/free-gift-progress-bar");
const CORE_SRC = readFileSync(join(ROOT, "storefront-extension/src/index.js"), "utf8");
const CORE_JS = join(EXT, "assets/free-gift-progress-bar.js");
const CART_PAGE = readFileSync(join(EXT, "assets/cart-page-progress.js"), "utf8");
const TIERED = readFileSync(join(EXT, "assets/tiered-gift-sync.js"), "utf8");
const CSS = readFileSync(join(EXT, "assets/free-gift-progress-bar.css"), "utf8");
const EMBED = readFileSync(join(EXT, "blocks/free-gift-embed.liquid"), "utf8");

describe("Dawn progress runtime ownership", () => {
  it("Liquid always loads cart satellites; core does not inject them", () => {
    assert.match(EMBED, /cart-page-progress\.js/);
    assert.match(EMBED, /tiered-gift-sync\.js/);
    const SECTION = readFileSync(join(EXT, "blocks/free-gift-progress-bar.liquid"), "utf8");
    assert.match(SECTION, /fgpb-runtime\.js/);
    assert.match(SECTION, /cart-page-progress\.js/);
    assert.match(SECTION, /tiered-gift-sync\.js/);
    assert.equal(CORE_SRC.includes("ensureSatellites"), false);
    assert.equal(CORE_SRC.includes('["cart-page-progress.js", "tiered-gift-sync.js"]'), false);
    assert.match(CORE_SRC, /satelliteOwnsStorefront/);
    assert.match(CORE_SRC, /__FGPB_CPP/);
    assert.match(CORE_SRC, /__fgpbLastKnownCart/);
  });

  it("one cart snapshot is published for paint + sync reuse", () => {
    assert.match(TIERED, /function publishKnownCart/);
    assert.match(TIERED, /__fgpbLastKnownCart/);
    assert.match(TIERED, /__fgpbLastKnownCartAt/);
    assert.match(TIERED, /detail: detail/);
    assert.match(CART_PAGE, /window\.__fgpbLastKnownCart/);
    assert.match(CART_PAGE, /useKnown/);
    assert.match(CART_PAGE, /function reapplyChrome\(e\)/);
    assert.match(CART_PAGE, /lastPaintedGen/);
  });

  it("stale generations cannot overwrite newer progress", () => {
    assert.equal(shouldAcceptPaintGen(1, 2), false);
    assert.equal(shouldAcceptPaintGen(2, 2), true);
    assert.match(CART_PAGE, /gen < lastPaintedGen/);
    assert.match(CART_PAGE, /seqGen < lastPaintedGen/);
    // Gift POSTs use the saved native fetch and never reach the wrapper, so the
    // bump must be unconditional: gating it on `processing` hid real customer
    // mutations that landed while a gift mutation was in flight.
    assert.equal(TIERED.includes("if (!processing) bumpShopperCartGen"), false);
    assert.match(TIERED, /bumpShopperCartGen\(\);/);
    assert.match(TIERED, /function projectAfterChange/);
    assert.equal(TIERED.includes("json.sections) delete json.sections"), false);
    assert.match(TIERED, /startedGen\) < currentCartUiGen/);
  });

  it("does not default Dawn money or widget-state to INR", () => {
    assert.equal(CART_PAGE.includes('currency || "INR"'), false);
    assert.equal(CART_PAGE.includes('|| "INR"'), false);
    assert.equal(TIERED.includes('currency: "INR"'), false);
    assert.equal(TIERED.includes('currency || "INR"'), false);
    assert.match(CART_PAGE, /function shopCurrency/);
    assert.match(TIERED, /function shopCurrency/);
    assert.equal(CART_PAGE.includes('return "₹" + n.toLocaleString("en-IN"'), false);
  });

  it("paints remaining immediately and does not reset fill on every cart paint", () => {
    const paintFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function paintFromCartNow"),
      CART_PAGE.indexOf("function ensureGiftBadge"),
    );
    assert.equal(paintFn.includes('lastPaintKey = ""'), false);
    assert.match(paintFn, /optimisticCfgFromCart/);
    assert.match(CART_PAGE, /Paint remaining\/unlocked immediately/);
    assert.match(CART_PAGE, /function seedFill/);
    assert.match(CSS, /transform: scaleX\(var\(--fg-p, 0\)\)/);
    assert.match(CSS, /transition: transform 240ms ease-out/);
    assert.match(CSS, /prefers-reduced-motion: reduce/);
  });

  it("does not monkey-patch Dawn renderContents/setInnerHTML; remount is coalesced", () => {
    assert.equal(CART_PAGE.includes("function wrapDawnSectionRender"), false);
    assert.equal(CART_PAGE.includes("installDawnSectionRenderHook"), false);
    assert.equal(CART_PAGE.includes("dawnRenderHooked"), false);
    assert.equal(CART_PAGE.includes('proto[name] = function ()'), false);
    assert.match(CART_PAGE, /function scheduleProgressHostRecover/);
    assert.match(CART_PAGE, /function recoverLiveDrawerProgressHost/);
    assert.match(CART_PAGE, /Never append to <cart-drawer>/);
    assert.match(CART_PAGE, /data-fgpb-progress-host/);
    const recoverFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function recoverLiveDrawerProgressHost"),
      CART_PAGE.indexOf("function scheduleProgressHostRecover"),
    );
    assert.equal(recoverFn.includes(".open("), false);
    assert.equal(recoverFn.includes(".close("), false);
    assert.equal(recoverFn.includes("pinDrawerRecsNow"), false);
    const pinFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function pinDrawerStripNow"),
      CART_PAGE.indexOf("function liveDrawerHasOwnedHost"),
    );
    assert.equal(pinFn.includes("drawerObs.disconnect"), false);
    assert.match(TIERED, /function scheduleDrawerHostRecover/);
    assert.match(TIERED, /__fgpbRecoverDrawerHost/);
    assert.match(TIERED, /nativeFetch\.apply\(this, arguments\)/);
    assert.match(TIERED, /function observeNativeCartResponse/);
    const fetchWrap = TIERED.slice(
      TIERED.indexOf("window.fetch = function (input, init)"),
      TIERED.indexOf("installXhrInterceptor();"),
    );
    assert.equal(fetchWrap.includes("enqueueMutation"), false);
    assert.equal(fetchWrap.includes("rewriteShopperChangeInit"), false);
    assert.equal(fetchWrap.includes("delete json.sections"), false);
  });

  it("MutationObserver remounts chrome without refetching /cart.js", () => {
    const obs = CART_PAGE.slice(CART_PAGE.indexOf("drawerObs = new MutationObserver"));
    assert.match(obs, /Remount only/);
    const obsHead = obs.slice(0, obs.indexOf("function observeRoot"));
    assert.equal(obsHead.includes("scheduleSyncChrome(0)"), false);
  });

  it("locks FREE GIFT badge type after Dawn remounts cart HTML", () => {
    assert.match(CART_PAGE, /function lockGiftBadgeStyle/);
    assert.match(CART_PAGE, /function hideThemeGiftDiscount/);
    assert.match(CART_PAGE, /font-family:\s*inherit/);
    assert.match(CSS, /font-family:\s*inherit/);
    const applyFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function applyConfirmedGiftSections"),
      CART_PAGE.indexOf("function applyCartSections"),
    );
    assert.match(applyFn, /styleGiftRowsInRoot\(nextItems/);
    assert.match(CART_PAGE, /styleGiftRowsInRoot\(parsedInner/);
    const badgeFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function ensureGiftBadge"),
      CART_PAGE.indexOf("function clearGiftBadge"),
    );
    assert.match(badgeFn, /lockGiftBadgeStyle\(existing\)/);
    assert.match(badgeFn, /lockGiftBadgeStyle\(badge\)/);
  });

  it("does not reorder Dawn cart-item nodes", () => {
    // Reordering rows invalidates the positional `line` index Dawn sends to
    // /cart/change.js. There is no longer any code path that moves them.
    assert.equal(CART_PAGE.includes("pinGiftRowsToTopInDrawer"), false);
    assert.equal(/itemsHost\.insertBefore\(row/.test(CART_PAGE), false);
    assert.match(CSS, /order:\s*-1/);
    assert.match(CART_PAGE, /order:-1/);
    assert.match(CSS, /Visual pin only/);
  });

  it("never hides the drawer strip at threshold and parks on empty even if the drawer is open", () => {
    assert.match(CART_PAGE, /function resetEmptyCartChrome/);
    assert.match(CART_PAGE, /empty cart must not keep stale remaining copy/);
    assert.match(CART_PAGE, /window\.__fgpbMarkDrawerBusy = markExpectDrawerOpen/);
    assert.match(TIERED, /function markDrawerBusy/);
    assert.equal(
      CART_PAGE.includes("if (!el || cartIsEmpty) return;\n    var drawer = findDrawer();\n    if (!drawer || !drawerShouldShow(drawer)) {\n      parkedDrawerStrip = el;\n      parkNode(el);") &&
        CART_PAGE.includes("function hideDrawerStrip() {\n    var drawer = findDrawer();\n    if (drawer) parkClosedDrawerChrome(drawer);"),
      false,
    );
    const hideFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function hideDrawerStrip()"),
      CART_PAGE.indexOf("function resetEmptyCartChrome()"),
    );
    assert.match(hideFn, /parkNode/);
    assert.equal(hideFn.includes("parkClosedDrawerChrome"), false);
    const paintFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function paintFromCartNow"),
      CART_PAGE.indexOf("function ensureGiftBadge"),
    );
    assert.match(paintFn, /resetEmptyCartChrome/);
    assert.match(paintFn, /optimisticCfgFromCart/);
    assert.equal(paintFn.includes("if (!cfg) return;"), false);
  });

  it("mounts the drawer strip after the header, never via .drawer__inner fallback", () => {
    const itemsHost = CART_PAGE.slice(
      CART_PAGE.indexOf("function findDrawerItemsHost"),
      CART_PAGE.indexOf("function findDrawerFooter"),
    );
    assert.equal(itemsHost.includes(".drawer__inner"), false);
    assert.match(CART_PAGE, /if \(!drawer \|\| !node \|\| cartIsEmpty\) return/);
  });

  it("core schema asset stays under the Theme App Extension budget", () => {
    const bytes = statSync(CORE_JS).size;
    assert.ok(bytes <= 10000, "free-gift-progress-bar.js is " + bytes + " B (need <= 10000)");
  });

  it("paints merchant product cards from live remaining without converting them to strips", () => {
    assert.match(CART_PAGE, /function paintMerchantProductCard/);
    assert.match(CART_PAGE, /function fillProductCopy/);
    assert.match(CART_PAGE, /function createProductCard/);
    const paintFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function paintPortableProduct()"),
      CART_PAGE.indexOf("function paintEnabledChrome("),
    );
    assert.match(paintFn, /paintMerchantProductCard\(existingBlock/);
    assert.match(paintFn, /createProductCard\(\)/);
    assert.match(paintFn, /paintMerchantProductCard\(card, lastCfg\)/);
    assert.equal(paintFn.includes("paintStrip(existingBlock"), false);
    assert.equal(paintFn.includes("createStripCard"), false);
    assert.equal(paintFn.includes("paintStrip(card"), false);
  });

  it("shows remaining as a bare number and keeps cart/drawer surfaces isolated", () => {
    assert.match(CART_PAGE, /function formatAmount/);
    assert.equal(CART_PAGE.includes('style: "currency"'), false);
    assert.equal(CART_PAGE.includes('currency || "INR"'), false);
    const mount = CART_PAGE.slice(
      CART_PAGE.indexOf("function findMountPoint"),
      CART_PAGE.indexOf("var RECS_DISMISS_KEY"),
    );
    assert.match(mount, /if \(!onCartPage\(\)\) return null/);
    assert.match(mount, /inDrawer\(el\)\) return null/);
    assert.equal(CART_PAGE.includes("observeRoot(form)"), false);
    assert.equal(CART_PAGE.includes("observeRoot(findMountPoint())"), false);
    assert.match(CSS, /flex-shrink: 0/);
    assert.match(CSS, /cart-drawer \.drawer__footer/);
    assert.match(CORE_SRC, /await loadContext\(anchor, cart\)/);
    assert.equal(CORE_SRC.includes("campaignLoaded"), false);
    assert.match(CORE_SRC, /document.addEventListener\("fgpb:cart"/);
  });

  it("refreshes /cart line items from gift mutation sections and prunes stale rows", () => {
    assert.match(CART_PAGE, /function findCartPageItemsHost/);
    assert.match(CART_PAGE, /function pruneStaleCartRows/);
    assert.match(CART_PAGE, /function reindexCartRows/);
    assert.match(TIERED, /function retainTaggedGifts/);
    assert.match(TIERED, /fromGift: true/);
    assert.match(CART_PAGE, /function applyCartPageSectionHtml/);
    assert.match(CART_PAGE, /\.js-contents/);
    const applyFn = CART_PAGE.slice(
      CART_PAGE.indexOf("function applyConfirmedGiftSections"),
      CART_PAGE.indexOf("function applyCartSections"),
    );
    assert.match(applyFn, /findCartPageItemsHost\(\)/);
    assert.match(applyFn, /pickSectionHtml/);
    assert.equal(applyFn.includes("findMountPoint()"), false);
    assert.match(applyFn, /pruneStaleCartRows/);
    assert.match(applyFn, /findDrawerFooter/);
    assert.match(applyFn, /syncDawnCartChrome/);
    assert.match(CART_PAGE, /function syncDawnCartChrome/);
    assert.match(CART_PAGE, /cart-live-region-text/);
    assert.match(CART_PAGE, /classList\.toggle\("is-empty"/);
    assert.match(CART_PAGE, /Number\(cart\.item_count\) > 0/);
    assert.match(CART_PAGE, /function syncProgressA11y/);
    assert.match(CART_PAGE, /aria-valuetext/);
    assert.match(CART_PAGE, /role="progressbar"/);
    assert.match(CART_PAGE, /function taggedGiftItemForRow/);
    assert.match(CART_PAGE, /data-quantity-variant-id/);
    assert.match(CART_PAGE, /function stripForeignCartChrome/);
    assert.match(CART_PAGE, /function footerHasCheckout/);
    assert.match(CART_PAGE, /function matchDrawerItemsHost/);
    assert.match(CART_PAGE, /styleGiftRowsInRoot\(document, liveCartForDom\(\)\)/);
    const paintFnChrome = CART_PAGE.slice(
      CART_PAGE.indexOf("function paintFromCartNow"),
      CART_PAGE.indexOf("function ensureGiftBadge"),
    );
    assert.match(paintFnChrome, /syncDawnCartChrome\(cart\)/);
    assert.match(applyFn, /footerHasCheckout\(nextFooter\)/);
    assert.match(applyFn, /stripForeignCartChrome\(nextItems\)/);
    assert.match(applyFn, /hostHasCartRows\(nextItems\)/);
    assert.match(TIERED, /__fgpbSyncDawnCartChrome/);
    assert.match(TIERED, /function cartPageSectionId/);
    assert.match(TIERED, /getElementById\("main-cart-items"\)/);
    assert.match(TIERED, /getElementById\("main-cart-footer"\)/);
    assert.match(TIERED, /getAttribute\("data-id"\)/);
    assert.equal(TIERED.includes('list += ",main-cart-items,main-cart-footer"'), false);
    assert.ok(TIERED.includes("\\/cart\\/?$"));
    const cartPostFn = TIERED.slice(
      TIERED.indexOf("function cartPost"),
      TIERED.indexOf("function proxyUrl"),
    );
    assert.match(cartPostFn, /confirmGiftCartThenApply\(data, startedGen, url\)/);
    assert.match(cartPostFn, /adoptMutationResponse\(data, \{ fromGift: true \}\)/);
    assert.match(TIERED, /function fillMissingCartPageRows/);
    const fillFn = TIERED.slice(
      TIERED.indexOf("function fillMissingCartPageRows"),
      TIERED.indexOf("function applySharedCartSections"),
    );
    assert.ok(fillFn.includes("\\/cart\\/?$"));
    assert.match(fillFn, /fetchCart\(\)/);
    assert.match(fillFn, /function writeCartPageSections/);
    assert.match(CART_PAGE, /__fgpbCartPageMissingKeys/);
  });
});
