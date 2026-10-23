/**
 * Tiered Free Gifts cart sync — classic Free Gift loop × N tiers.
 *
 * Native hot path (myavni-speed):
 *   observe POST /cart/add.js|/cart/update.js|/cart/change.js via fetch clone
 *   → update lastKnownCart / progress. Never rewrite Dawn's request or response.
 *   Shopper add/qty/remove must reach Shopify and Dawn's render/finally untouched.
 *
 * Slow path (boot / claim):
 *   cart:change → debounce → widget-state → plan → REMOVE locked → ADD missing
 *
 * Hard rules:
 * - Gift identity is ONLY `_fgpb_free_gift === "true"` (+ campaign / tier ids)
 * - Never treat paid same-SKU lines as gifts
 * - `processing` flag blocks re-entry (gift add must not re-trigger the interceptor)
 * - After ADD/REMOVE: refresh theme sections via shared `__fgpbApplyCartSections`
 *   (same path as cart-page-progress recs add). Do not emit cart:change from here.
 */
(function () {
  "use strict";

  if (typeof window !== "undefined" && typeof window.__fgpbTieredSyncAbort === "function") {
    try {
      window.__fgpbTieredSyncAbort();
    } catch (_e) {}
  }

  /**
   * Isolation stage gate. Falls back to the same safe defaults as fgpb-runtime.js
   * so a missing runtime asset can never silently re-enable cart mutations.
   */
  function rt() {
    var api = typeof window !== "undefined" ? window.__FGPB_RT : null;
    return (api && api.flags) || { evaluateGifts: true, mutateGifts: false };
  }
  function can(capability) {
    return !!rt()[capability];
  }
  function noteDiag(type, data) {
    try {
      if (typeof window !== "undefined" && window.__FGPB_RT && window.__FGPB_RT.note) {
        window.__FGPB_RT.note(type, data);
      }
    } catch (_e) {}
  }

  /** Compact cart shape for the diagnostics timeline. */
  function summarizeCartForDiag(cart) {
    if (!cart || typeof cart !== "object") return null;
    return {
      token: cart.token || null,
      item_count: cart.item_count,
      total_price: cart.total_price,
      items_subtotal_price: cart.items_subtotal_price,
      lines: ((cart && cart.items) || []).map(function (it) {
        var props = it.properties || {};
        return {
          key: it.key,
          variant_id: it.variant_id || it.id,
          qty: it.quantity,
          final_line_price: it.final_line_price,
          gift: props._fgpb_free_gift === "true" || props._fgpb_free_gift === true,
          tier: props._fgpb_tier_id || null,
        };
      }),
    };
  }

  var aborted = false;
  var FREE_GIFT_KEY = "_fgpb_free_gift";
  var CAMPAIGN_KEY = "_fgpb_campaign_id";
  var TIER_KEY = "_fgpb_tier_id";
  var DEBOUNCE_MS = 80;
  var RATE_LIMIT_COOLDOWN_MS = 120000;
  var WIDGET_URL = "/apps/free-gift/widget-state";
  var RATE_KEY = "fgpb_cart_rate_until";

  function inThemeEditor() {
    try {
      if (window.Shopify && (window.Shopify.designMode || window.Shopify.inspectMode)) return true;
    } catch (_e) {}
    try {
      if (
        document.documentElement &&
        document.documentElement.classList &&
        document.documentElement.classList.contains("shopify-design-mode")
      ) {
        return true;
      }
    } catch (_e2) {}
    try {
      if (window.top && window.top !== window.self) {
        try {
          var host = String((window.top.location && window.top.location.hostname) || "");
          if (/shopify\.com$/i.test(host)) return true;
        } catch (_cross) {
          return true;
        }
      }
    } catch (_e4) {}
    return false;
  }

  var installed = false;
  var mutating = false;
  var queued = false;
  var suppressEvents = false;
  var timer = null;
  var rateLimitedUntil = 0;
  var lastAddError = null;
  var lastPlanKey = "";
  var failCounts = {};
  var MAX_PLAN_FAILS = 3;
  var RETRY_MISSING_MS = 400;
  var lastWs = null;
  var lastKnownCart = null;
  var giftUnavailable = false;
  var mutationQueue = Promise.resolve();
  /** { gen, fingerprint } of the cart the in-flight gift plan was built from. */
  var activePlan = null;
  var processing = false;
  var lastNativeAt = 0;
  var nativeFetch =
    typeof window !== "undefined" && typeof window.fetch === "function" ? window.fetch : null;
  var xhrOpenOrig = null;
  var xhrSendOrig = null;

  if (typeof window !== "undefined") {
    // Build marker — verify in the console that every asset is the same version.
    window.__FGPB_TGS = { v: 142, t: Date.now() };
    window.__fgpbTieredSyncAbort = function () {
      aborted = true;
      restoreNativeInterceptor();
    };
    window.__fgpbTieredSyncDisabled = false;
    // Presentation must consult authoritative cart evidence, never the tag.
    window.__fgpbCanRenderFree = canRenderFree;
    window.__fgpbGiftDiscountEvidence = discountEvidence;
    /**
     * Read-only attribution probe. Reports exactly how Shopify labelled every
     * allocation on a tagged line and how we attributed it. Mutates nothing, so
     * it is safe to run at any stage before deciding the allowlist.
     */
    window.__fgpbAttributionProbe = function () {
      return fetchCart().then(function (cart) {
        var report = {
          allowlist: OUR_DISCOUNT_TITLES.slice(),
          applicationTypes: OUR_APPLICATION_TYPES.slice(),
          tagged: summarizeTaggedAllocations(cart),
        };
        noteDiag("attribution-probe", report);
        return report;
      });
    };
  }

  function readRateLimit() {
    try {
      var until = Number(sessionStorage.getItem(RATE_KEY) || 0);
      if (until > Date.now()) rateLimitedUntil = until;
    } catch (_e) {}
  }

  function writeRateLimit(until) {
    rateLimitedUntil = until;
    try {
      sessionStorage.setItem(RATE_KEY, String(until));
    } catch (_e) {}
  }

  function unlockLocalRateLimit() {
    rateLimitedUntil = 0;
    try {
      sessionStorage.removeItem(RATE_KEY);
    } catch (_e) {}
    if (typeof window !== "undefined") window.__fgpbTieredSyncDisabled = false;
    // Allow a fresh ADD attempt after the merchant clears rate-limit / cooldown.
    lastAddError = null;
    lastPlanKey = "";
    failCounts = {};
    // A 422 means that gift SKU was unavailable for that cart, not forever.
    // Leaving this latched until reload silently disabled rewards for the session.
    giftUnavailable = false;
  }

  function isRateLimited() {
    return Date.now() < rateLimitedUntil;
  }

  function tripRateLimit() {
    writeRateLimit(Date.now() + RATE_LIMIT_COOLDOWN_MS);
    queued = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof window !== "undefined") {
      window.__fgpbTieredSyncDisabled = true;
      setTimeout(function () {
        if (Date.now() >= rateLimitedUntil) {
          window.__fgpbTieredSyncDisabled = false;
        }
      }, RATE_LIMIT_COOLDOWN_MS + 50);
    }
    publishStatus(
      (window.__fgpbTierStatus && window.__fgpbTierStatus.unlocked) || [],
      (window.__fgpbTierStatus && window.__fgpbTierStatus.missing) || [],
      (window.__fgpbTierStatus && window.__fgpbTierStatus.paid) || 0,
    );
  }

  function variantId(v) {
    var raw = v == null ? "" : String(v).trim();
    if (!raw) return "";
    if (/\/Product\//.test(raw) && !/ProductVariant\//.test(raw)) return "";
    if (raw.indexOf("ProductVariant/") >= 0) {
      var pop = raw.split("/").pop() || "";
      return /^\d+$/.test(pop) ? pop : "";
    }
    return raw;
  }

  function ajaxVariantId(v) {
    var id = variantId(v);
    return /^\d+$/.test(id) ? id : "";
  }

  /** Strict: only the app gift property. Never Free Gift text / tier-only heuristics. */
  function isTagged(props) {
    if (!props || typeof props !== "object" || Array.isArray(props)) return false;
    var flag = props[FREE_GIFT_KEY];
    return flag === "true" || flag === true;
  }

  function lineTierId(item) {
    var p = item && item.properties;
    return p && p[TIER_KEY] != null ? String(p[TIER_KEY]).trim() : "";
  }

  function lineCampaignId(item) {
    var p = item && item.properties;
    return p && p[CAMPAIGN_KEY] != null ? String(p[CAMPAIGN_KEY]).trim() : "";
  }

  function lineKeyOf(item) {
    return (item && (item.key || item.lineKey)) || "";
  }

  /**
   * Deterministic signature of the promotion-relevant cart state, sorted by line
   * key so DOM order can never influence it. Used to prove that the cart a gift
   * plan was built from is still the cart we are about to mutate.
   */
  function cartFingerprint(cart) {
    if (!cart || typeof cart !== "object") return "none";
    var items = (cart.items || []).map(function (item) {
      return [
        String(item.key || ""),
        String(item.variant_id || item.id || ""),
        Number(item.quantity) || 0,
        Number(item.final_line_price != null ? item.final_line_price : item.line_price || 0),
        isTagged(item.properties) ? 1 : 0,
        lineCampaignId(item),
        lineTierId(item),
      ].join(":");
    });
    items.sort();
    return [
      String(cart.token || ""),
      String(cart.currency || ""),
      String(Number(cart.item_count) || 0),
      String(Number(cart.total_price) || 0),
      items.join(","),
    ].join("|");
  }

  function eligibleSubtotal(cart) {
    var items = (cart && cart.items) || [];
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (isTagged(item.properties)) continue;
      var line = Number(
        item.final_line_price != null
          ? item.final_line_price
          : item.line_price != null
            ? item.line_price
            : NaN,
      );
      if (!Number.isFinite(line)) {
        var q = Number(item.quantity) || 0;
        var p = Number(item.price) || 0;
        line = q * p;
      }
      if (!Number.isFinite(line)) continue;
      sum += line;
    }
    var major = sum / 100;
    var itemsSub = Number(cart && cart.items_subtotal_price);
    if (Number.isFinite(itemsSub) && itemsSub > 0) {
      var cap = itemsSub / 100;
      if (major > cap + 0.05) major = cap;
    }
    return major;
  }

  function giftProperties(campaignId, tierId) {
    var p = {};
    p[FREE_GIFT_KEY] = "true";
    p._is_free_gift = "true";
    if (campaignId) p[CAMPAIGN_KEY] = String(campaignId);
    if (tierId) p[TIER_KEY] = String(tierId);
    return p;
  }

  function requestJson(url, opts) {
    opts = opts || {};
    var method = String(opts.method || "GET").toUpperCase();
    var headers = { Accept: "application/json" };
    if (opts.headers) {
      for (var k in opts.headers) {
        if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];
      }
    }
    if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
    var init = {
      method: method,
      headers: headers,
      body: opts.body,
      cache: opts.cache,
      credentials: "same-origin",
    };
    var send = nativeFetch || fetch;
    var pending =
      typeof window !== "undefined" && typeof window.__fgpbGuardFetch === "function"
        ? window.__fgpbGuardFetch(function (guardedUrl, guardedInit) {
            return send.call(window, guardedUrl, guardedInit);
          }, url, init)
        : send.call(window, url, init);
    // Deliver the parsed body on a fresh turn. Returning Shopify's json()
    // promise straight out of this callback can leave the caller waiting when
    // that promise resolved while this turn was still inside a gift mutation.
    return new Promise(function (resolve, reject) {
      pending.then(function (res) {
        if (!res || !res.ok) {
          var failed = res && typeof res.json === "function" ? res.json() : null;
          Promise.resolve(failed)
            .catch(function () {
              return null;
            })
            .then(function (body) {
              var msg =
                (body && (body.description || body.message || body.status)) ||
                "E" + ((res && res.status) || 0);
              var err = new Error(String(msg));
              err.status = res && res.status;
              err.body = body;
              reject(err);
            });
          return;
        }
        var parsed = typeof res.json === "function" ? res.json() : res;
        // Settle on a later microtask. Resolving from inside the response's
        // own json() callback drops the caller's reaction while a gift
        // mutation is still unwinding. A timer here is unref'd by the test
        // harness and lets the process exit with the promise still pending.
        var later = typeof queueMicrotask === "function"
          ? queueMicrotask
          : function (fn) { Promise.resolve().then(fn); };
        later(function () {
          if (parsed && typeof parsed.then === "function") {
            parsed.then(function (body) { later(function () { resolve(body); }); }, reject);
          } else {
            resolve(parsed);
          }
        });
      }, reject);
    });
  }

  function fetchCart() {
    return requestJson("/cart.js", { cache: "no-store" });
  }

  function cartPageSectionId(el) {
    if (!el || typeof el.getAttribute !== "function") return "";
    return String(el.getAttribute("data-id") || el.getAttribute("data-section-id") || "").trim();
  }

  function liveCartComponentSectionIds() {
    var ids = [];
    if (typeof document === "undefined" || !document.querySelectorAll) return ids;
    var comps = document.querySelectorAll("cart-items-component");
    var i;
    for (i = 0; i < comps.length; i++) {
      var id = componentSectionId(comps[i]);
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
    return ids;
  }

  function cartSectionsList() {
    // Only ask for sections that are actually on this document. A cart-page
    // id that is not rendered makes Shopify reject the whole gift mutation.
    // Dawn's cart page uses #main-cart-items. Savor's cart page and drawer
    // are cart-items-component nodes whose data-section-id is the section
    // the theme morphs, including the estimated total. A Dawn lookup that
    // throws must not drop those component ids.
    var list = "cart-drawer,cart-icon-bubble";
    var extra = [];
    try {
      if (/\/cart\/?$/i.test(String(location.pathname || ""))) {
        var items = null;
        var foot = null;
        if (typeof document.getElementById === "function") {
          items = document.getElementById("main-cart-items");
          foot = document.getElementById("main-cart-footer");
        }
        if (!items && typeof document.querySelector === "function") {
          items = document.querySelector("cart-items");
        }
        var itemsId = cartPageSectionId(items);
        var footId = cartPageSectionId(foot);
        if (itemsId) extra.push(itemsId);
        if (footId && extra.indexOf(footId) === -1) extra.push(footId);
      }
    } catch (_dawn) {}
    try {
      var componentIds = liveCartComponentSectionIds();
      var c;
      for (c = 0; c < componentIds.length; c++) {
        if (extra.indexOf(componentIds[c]) === -1) extra.push(componentIds[c]);
      }
    } catch (_components) {}
    if (extra.length) list += "," + extra.join(",");
    return list;
  }

  /**
   * Savor's cart-items-component morphs itself when a document-level
   * shopify:cart:lines-update promise resolves with detail.sections[sectionId].
   * The same promise's itemCount is what cart-icon renders. The event is not
   * dispatched on the component, and it carries no line id, so it cannot be
   * mistaken for a shopper click. Missing HTML is ignored: an empty payload
   * would make Savor fetch the section again and can paint an older cart.
   */
  function publishHorizonCartSections(sections, startedGen) {
    if (!sections || typeof document === "undefined") return;
    if (!shouldApplyGiftCartSections(startedGen, currentCartUiGen())) return;
    var ids = liveCartComponentSectionIds();
    if (!ids.length) return;
    var useful = {};
    var found = false;
    var i;
    for (i = 0; i < ids.length; i++) {
      var html = sections[ids[i]];
      if (typeof html === "string" && html) {
        useful[ids[i]] = html;
        found = true;
      }
    }
    if (!found) return;
    var count = lastKnownCart && Number(lastKnownCart.item_count);
    if (!Number.isFinite(count) || count < 0) count = 0;
    var detail = {
      sections: useful,
      itemCount: count,
      items: (lastKnownCart && lastKnownCart.items) || [],
      source: "fgpb-gift-sync",
    };
    try {
      var ev = new CustomEvent("shopify:cart:lines-update", { bubbles: true });
      ev.promise = Promise.resolve({
        cart: { totalQuantity: count },
        detail: detail,
      });
      document.dispatchEvent(ev);
    } catch (_e) {}
  }

  function currentCartUiGen() {
    if (typeof window === "undefined") return 0;
    return Number(window.__fgpbCartUiGen) || 0;
  }

  function bumpShopperCartGen() {
    if (typeof window === "undefined") return;
    noteDiag("customer-generation", { from: currentCartUiGen(), to: currentCartUiGen() + 1 });
    window.__fgpbCartUiGen = currentCartUiGen() + 1;
    window.__fgpbShopperCartAt = Date.now();
  }

  function shouldApplyGiftCartSections(startedGen, liveGen) {
    if (startedGen == null || startedGen === "") return true;
    return Number(startedGen) === Number(liveGen || 0);
  }

  /**
   * Only ever called with sections returned by UpsellTrix's own gift mutation, so
   * the HTML and the cart it describes are the same version. A separately fetched
   * `/?sections=` document is a different instant in time and applying it on top
   * of Dawn's render is how the visible cart drifts from the authoritative one.
   */
  function confirmGiftCartThenApply(data, startedGen, url) {
    if (lastKnownCart && startedGen != null) lastKnownCart._fgpbVer = startedGen;
    paintKnownCart(lastKnownCart, startedGen);
    noteDiag("gift-post-result", {
      url: url,
      ok: true,
      generation: currentCartUiGen(),
      startedGen: startedGen,
      cart: summarizeCartForDiag(lastKnownCart),
    });
    // Sections that came back with this mutation describe this cart version.
    // If the generation moved on, we simply do not paint — a separate
    // `/?sections=` fetch would only reintroduce a stale second writer.
    if (data && data.sections) {
      applySharedCartSections(data.sections, startedGen);
      publishHorizonCartSections(data.sections, startedGen);
    }
    return fillMissingCartPageRows(startedGen).then(function () {
      return data;
    });
  }

  function fillMissingCartPageRows(startedGen) {
    try {
      if (!/\/cart\/?$/i.test(String(location.pathname || ""))) return Promise.resolve();
    } catch (_e0) {
      return Promise.resolve();
    }
    if (!shouldApplyGiftCartSections(startedGen, currentCartUiGen())) return Promise.resolve();
    return fetchCart()
      .then(function (confirmed) {
        if (confirmed && (startedGen == null || Number(startedGen) === currentCartUiGen())) {
          lastKnownCart = stripKnownCart(confirmed);
          lastKnownCart._partial = false;
          if (startedGen != null) lastKnownCart._fgpbVer = startedGen;
          publishKnownCart(lastKnownCart);
          paintKnownCart(lastKnownCart, startedGen);
        }
        var missing = false;
        try {
          if (typeof window !== "undefined" && typeof window.__fgpbCartPageMissingKeys === "function") {
            missing = !!window.__fgpbCartPageMissingKeys((lastKnownCart && lastKnownCart.items) || []);
          }
        } catch (_e) {}
        if (!missing) return;
        var ids = [];
        try {
          var itemsId = cartPageSectionId(document.getElementById("main-cart-items"));
          var footId = cartPageSectionId(document.getElementById("main-cart-footer"));
          if (itemsId) ids.push(itemsId);
          if (footId && ids.indexOf(footId) === -1) ids.push(footId);
        } catch (_e2) {}
        if (!ids.length) return;
        function writeCartPageSections(sections) {
          if (!sections) return false;
          var host = document.getElementById("main-cart-items");
          var html = "";
          var hostId = cartPageSectionId(host);
          if (hostId && sections[hostId]) html = sections[hostId];
          else if (sections["main-cart-items"]) html = sections["main-cart-items"];
          if (!host || !html) return false;
          var doc = new DOMParser().parseFromString(html, "text/html");
          var liveInner = host.querySelector(".js-contents");
          var parsedInner = doc.querySelector(".js-contents");
          if (!liveInner || !parsedInner) return false;
          liveInner.innerHTML = parsedInner.innerHTML;
          var foot = document.getElementById("main-cart-footer");
          var footId = cartPageSectionId(foot);
          var footHtml = (footId && sections[footId]) || sections["main-cart-footer"] || "";
          if (foot && footHtml) {
            var footDoc = new DOMParser().parseFromString(footHtml, "text/html");
            var liveFoot = foot.querySelector(".js-contents");
            var parsedFoot = footDoc.querySelector(".js-contents");
            if (liveFoot && parsedFoot) liveFoot.innerHTML = parsedFoot.innerHTML;
          }
          try {
            if (typeof window !== "undefined" && typeof window.__fgpbStyleGiftRowsNow === "function") {
              window.__fgpbStyleGiftRowsNow();
            }
          } catch (_eStyle) {}
          try {
            if (typeof window !== "undefined" && typeof window.__fgpbSyncDawnCartChrome === "function") {
              window.__fgpbSyncDawnCartChrome();
            }
          } catch (_eChrome) {}
          return true;
        }
        function pull() {
          return requestJson("/?sections=" + ids.join(",") + "&_cs=" + Date.now(), { cache: "no-store" }).then(
            function (sections) {
              if (!sections || !shouldApplyGiftCartSections(startedGen, currentCartUiGen())) return;
              writeCartPageSections(sections);
            },
          );
        }
        function stillMissing() {
          try {
            return !!(
              typeof window !== "undefined" &&
              typeof window.__fgpbCartPageMissingKeys === "function" &&
              window.__fgpbCartPageMissingKeys((lastKnownCart && lastKnownCart.items) || [])
            );
          } catch (_e3) {
            return false;
          }
        }
        return pull().then(function () {
          if (!stillMissing()) return;
          return new Promise(function (resolve) {
            setTimeout(function () {
              pull().then(resolve, resolve);
            }, 250);
          });
        });
      })
      .catch(function () {});
  }

  function applySharedCartSections(sections, startedGen) {
    if (!sections) return false;
    if (!shouldApplyGiftCartSections(startedGen, currentCartUiGen())) return false;
    if (typeof window !== "undefined" && typeof window.__fgpbApplyCartSections === "function") {
      try {
        window.__fgpbApplyCartSections(sections, {
          cartUiGen: startedGen,
          fromGiftSync: true,
          confirmedGiftMutation: true,
        });
      } catch (_e) {}
    }
    return true;
  }

  function cartPost(url, body) {
    var startedGen = currentCartUiGen();
    var withSections = {};
    var k;
    for (k in body) {
      if (Object.prototype.hasOwnProperty.call(body, k)) withSections[k] = body[k];
    }
    withSections.sections = cartSectionsList();
    withSections.sections_url = String((typeof location !== "undefined" && location.pathname) || "/");

    return requestJson(url, {
      method: "POST",
      body: JSON.stringify(withSections),
    })
      .catch(function (err) {
        if (err && (err.status === 429 || err.status === 430)) {
          tripRateLimit();
          throw err;
        }
        return requestJson(url, { method: "POST", body: JSON.stringify(body) });
      })
      .then(function (data) {
        if (data) adoptMutationResponse(data, { fromGift: true });
        return confirmGiftCartThenApply(data, startedGen, url);
      })
      .catch(function (err) {
        noteDiag("gift-post-result", {
          url: url,
          ok: false,
          status: err && err.status,
          message: err && err.message,
          generation: currentCartUiGen(),
        });
        if (err && (err.status === 429 || err.status === 430)) tripRateLimit();
        throw err;
      });
  }

  function proxyUrl(base, paid, currency) {
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    var currencyRate = 1;
    try {
      var candidate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate);
      if (Number.isFinite(candidate) && candidate > 0) currencyRate = candidate;
    } catch (_rateError) {}
    return (
      base +
      sep +
      "cartSubtotal=" +
      Math.max(0, paid) +
      "&currency=" +
      encodeURIComponent(currency || shopCurrency()) +
      "&currencyRate=" +
      encodeURIComponent(String(currencyRate)) +
      "&_t=" +
      Date.now()
    );
  }

  function bootstrapUrls() {
    var el = document.querySelector("[data-widget-state-url]");
    var stateUrl = (el && el.getAttribute("data-widget-state-url")) || WIDGET_URL;
    return { stateUrl: stateUrl };
  }

  /**
   * A campaign response describes the subtotal it was asked about. If the
   * shopper mutated the cart while it was in flight it describes a cart that no
   * longer exists, so it is discarded rather than used to plan a gift.
   */
  function fetchWidgetState(paid, currency, expectedGen, done) {
    function finish(json) {
      if (typeof done === "function") done(json);
      return json;
    }
    var urls = bootstrapUrls();
    var startedGen = expectedGen == null ? currentCartUiGen() : expectedGen;
    if (currentCartUiGen() !== startedGen) return Promise.resolve(finish(null));
    return requestJson(proxyUrl(urls.stateUrl, paid, currency), { cache: "no-store" })
      .then(function (json) {
        if (currentCartUiGen() !== startedGen) {
          noteDiag("widget-state-stale", {
            requestedSubtotal: paid,
            plannedGen: startedGen,
            liveGen: currentCartUiGen(),
          });
          return finish(null);
        }
        if (!json || typeof json !== "object" || typeof json.enabled !== "boolean") return finish(null);
        json._fgpbGen = startedGen;
        json._fgpbSubtotal = paid;
        json._fgpbCurrency = String(currency || shopCurrency() || "").trim().toUpperCase();
        json._fgpbRate = presentmentRate();
        return finish(json);
      })
      .catch(function () {
        return finish(null);
      });
  }

  /**
   * Recompute unlocked gifts from a previously fetched campaign + the live cart.
   * Used to REMOVE locked gifts immediately — do not wait on widget-state.
   */
  function unlockedFromCachedWs(ws, cart) {
    var paid = eligibleSubtotal(cart);
    var unlocked = [];
    if (!ws || ws.enabled === false) return unlocked;
    if (ws.rewardType === "TIERED_FREE_GIFTS") {
      var tiers = Array.isArray(ws.rewardTiers) ? ws.rewardTiers : [];
      if (tiers.length) {
        for (var i = 0; i < tiers.length; i++) {
          var t = tiers[i];
          if (!t) continue;
          var th = Number(t.threshold) || 0;
          var tid = t.tierId || t.id;
          var vid = t.variantId || t.giftVariantId;
          if (th > 0 && tid && vid && paid + 1e-9 >= th) {
            unlocked.push({
              tierId: String(tid),
              threshold: th,
              variantId: vid,
              productId: t.productId || t.giftProductId,
              quantity: 1,
            });
          }
        }
        return unlocked;
      }
      var prev = Array.isArray(ws.unlockedGifts) ? ws.unlockedGifts : [];
      for (var u = 0; u < prev.length; u++) {
        var g = prev[u];
        if (!g) continue;
        var gth = Number(g.threshold) || 0;
        if (!gth || paid + 1e-9 >= gth) unlocked.push(g);
      }
      return unlocked;
    }
    if (ws.rewardType === "FREE_GIFT") {
      var gift = ws.gift || null;
      var classicVid = gift && (gift.variantId || gift.giftVariantId);
      var threshold = Number(ws.threshold) || 0;
      var eligible = threshold > 0 ? paid + 1e-9 >= threshold : !!(ws.eligible && paid > 0);
      if (eligible && classicVid) {
        unlocked.push({
          tierId: "classic",
          threshold: threshold,
          variantId: classicVid,
          productId: gift && (gift.productId || gift.giftProductId),
          quantity: (gift && gift.quantity) || 1,
        });
      }
    }
    return unlocked;
  }

  function extractUnlockedFromWs(ws, cart) {
    if (!ws) return [];
    if (ws.rewardType === "TIERED_FREE_GIFTS") {
      var unlocked = Array.isArray(ws.unlockedGifts) ? ws.unlockedGifts : [];
      if (!unlocked.length) return unlockedFromCachedWs(ws, cart);
      return unlocked;
    }
    if (ws.rewardType === "FREE_GIFT") return unlockedFromCachedWs(ws, cart);
    return [];
  }

  /**
   * Same decision model as storefront-extension/src/utils/tiered-gift-sync.js planTieredGiftSync.
   * Server unlockedGifts only — no local threshold invention.
   */
  function planTieredGiftSync(cart, unlockedGifts, campaignId, autoAddGift) {
    var unlocked = Array.isArray(unlockedGifts) ? unlockedGifts : [];
    var unlockedByTier = {};
    for (var u = 0; u < unlocked.length; u++) {
      if (unlocked[u] && unlocked[u].tierId) unlockedByTier[String(unlocked[u].tierId)] = unlocked[u];
    }

    var items = (cart && cart.items) || [];
    var giftLines = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!isTagged(item.properties)) continue;
      giftLines.push(item);
    }

    var actions = [];
    var linesByTier = {};

    for (var j = 0; j < giftLines.length; j++) {
      var line = giftLines[j];
      var tierId = lineTierId(line);
      var key = lineKeyOf(line);
      var expected = unlockedByTier[tierId];
      var lineVariant = ajaxVariantId(line.variant_id || line.variantId || line.id);
      if (lineCampaignId(line) !== String(campaignId == null ? "" : campaignId).trim() ||
          !expected || !lineVariant || lineVariant !== ajaxVariantId(expected.variantId)) {
        if (key) actions.push({ type: "REMOVE", lineKey: key });
        continue;
      }
      if (!linesByTier[tierId]) linesByTier[tierId] = [];
      linesByTier[tierId].push(line);
    }

    Object.keys(linesByTier).forEach(function (tid) {
      var lines = linesByTier[tid];
      for (var d = 1; d < lines.length; d++) {
        var dupKey = lineKeyOf(lines[d]);
        if (dupKey) actions.push({ type: "REMOVE", lineKey: dupKey, tierId: tid });
      }
      var primary = lines[0];
      var pKey = lineKeyOf(primary);
      if (pKey && (Number(primary.quantity) || 0) > 1) {
        actions.push({ type: "NORMALIZE", lineKey: pKey, quantity: 1, tierId: tid });
      }
    });

    if (autoAddGift !== false) {
      for (var t = 0; t < unlocked.length; t++) {
        var gift = unlocked[t];
        if (!gift || !gift.tierId || !gift.variantId) continue;
        var tid2 = String(gift.tierId);
        if (linesByTier[tid2] && linesByTier[tid2].length) continue;
        var id = ajaxVariantId(gift.variantId);
        if (!id) continue;
        actions.push({
          type: "ADD",
          tierId: tid2,
          variantId: id,
          properties: giftProperties(campaignId, tid2),
        });
      }
    }

    return actions;
  }

  function planKey(actions) {
    var parts = [];
    for (var i = 0; i < (actions || []).length; i++) {
      var a = actions[i];
      if (!a) continue;
      parts.push(
        a.type +
          ":" +
          (a.tierId || "") +
          ":" +
          (a.variantId || "") +
          ":" +
          (a.lineKey || "") +
          ":" +
          (a.quantity || ""),
      );
    }
    parts.sort();
    return parts.join("|");
  }

  function publishStatus(unlocked, missing, paid) {
    try {
      window.__fgpbTierStatus = {
        unlocked: unlocked || [],
        missing: missing || [],
        blocked: [],
        paid: paid,
        rateLimited: isRateLimited(),
        lastAddError: lastAddError,
      };
      document.dispatchEvent(
        new CustomEvent("fgpb:tier-status", { detail: window.__fgpbTierStatus }),
      );
    } catch (_e) {}
  }

  function removeLinesBatch(keys) {
    var updates = {};
    var count = 0;
    for (var i = 0; i < keys.length; i++) {
      if (!keys[i]) continue;
      updates[keys[i]] = 0;
      count += 1;
    }
    if (!count) return Promise.resolve({ ok: false });
    return cartPost("/cart/update.js", { updates: updates }).then(
      function () {
        return { ok: true };
      },
      function () {
        return { ok: false };
      },
    );
  }

  function setLineQty(lineKey, quantity) {
    if (!lineKey) return Promise.resolve({ ok: false });
    var updates = {};
    updates[lineKey] = quantity;
    return cartPost("/cart/update.js", { updates: updates }).then(
      function () {
        return { ok: true };
      },
      function () {
        return { ok: false };
      },
    );
  }

  function reportGiftsAdded(campaignId, variantIds) {
    if (!nativeFetch || campaignId == null || !variantIds || !variantIds.length) return;
    var i;
    for (i = 0; i < variantIds.length; i++) {
      var id = String(variantIds[i] || "");
      if (!id) continue;
      try {
        nativeFetch.call(window, "/apps/free-gift/track-event", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            eventType: "gift_added",
            campaignId: Number(campaignId),
            giftProductId: id,
          }),
          keepalive: true,
        });
      } catch (_e) {}
    }
  }

  function addGiftsBatch(adds, campaignId) {
    // Last checkpoint before the gift leaves the page. If the shopper mutated the
    // cart after this plan was built, the plan is void — adding now would create
    // the orphaned gift that shows up at checkout.
    if (!planStillValid()) {
      noteDiag("gift-add-superseded", {
        plannedGen: activePlan && activePlan.gen,
        liveGen: currentCartUiGen(),
      });
      return Promise.resolve({ ok: false, added: 0, superseded: true });
    }
    // Every precondition is enforced here, at the POST site itself, rather than
    // wherever the plan happened to be built. A gift that fails any of them
    // would be permanently chargeable once it reaches the cart.
    var config = safetyConfig();
    var items = [];
    for (var i = 0; i < adds.length; i++) {
      var a = adds[i];
      if (!a || !a.variantId || !a.tierId) continue;
      var id = ajaxVariantId(a.variantId);
      if (!id) continue;
      var check = validateGiftAddition(campaignId, a.variantId, config, lastKnownCart);
      if (!check.ok) {
        noteDiag("gift-add-refused", {
          campaignId: campaignId,
          variantId: a.variantId,
          reasons: check.reasons,
        });
        continue;
      }
      items.push({
        id: +id,
        quantity: 1,
        properties: giftProperties(campaignId, String(a.tierId)),
      });
    }
    if (!items.length) return Promise.resolve({ ok: false, added: 0, refused: true });

    // Prefer one batch POST (classic feel). Fall back to sequential on failure
    // so a single bad gift SKU cannot block the rest of the unlocked tiers.
    return cartPost("/cart/add.js", { items: items }).then(
      function () {
        var addedIds = [];
        for (var n = 0; n < items.length; n++) addedIds.push(items[n].id);
        reportGiftsAdded(campaignId, addedIds);
        return { ok: true, added: items.length };
      },
      function (err) {
        if (err && (err.status === 429 || err.status === 430)) {
          lastAddError = { status: err.status, message: "Cart rate-limited" };
          return { ok: false, added: 0 };
        }
        if (err && err.status === 422) {
          giftUnavailable = true;
          lastAddError = { status: 422, message: "Gift unavailable" };
          return { ok: false, added: 0 };
        }
        var chain = Promise.resolve({ ok: false, added: 0 });
        for (var j = 0; j < items.length; j++) {
          (function (item) {
            chain = chain.then(function (acc) {
              if (isRateLimited()) return acc;
              return cartPost("/cart/add.js", {
                items: [
                  {
                    id: item.id,
                    quantity: 1,
                    properties: item.properties,
                  },
                ],
              }).then(
                function () {
                  reportGiftsAdded(campaignId, [item.id]);
                  return { ok: true, added: acc.added + 1 };
                },
                function (e2) {
                  lastAddError = {
                    status: e2 && e2.status,
                    message: (e2 && e2.message) || "add failed",
                    variantId: item.id,
                  };
                  if (e2 && (e2.status === 429 || e2.status === 430)) tripRateLimit();
                  if (e2 && e2.status === 422) {
                    giftUnavailable = true;
                    return acc;
                  }
                  // Keep going — later tiers must still try after an earlier SKU fails.
                  return acc;
                },
              );
            });
          })(items[j]);
        }
        return chain;
      },
    );
  }

  /**
   * The popup is for a gift that is still in the latest cart and still earned.
   * An add that landed from an older, higher cart is removed by the safety
   * pass; celebrating that response would show an award the shopper no longer has.
   */
  function celebrateEarnedGift(campaignId) {
    var cart = lastKnownCart;
    var items = (cart && cart.items) || [];
    var paid = eligibleSubtotal(cart);
    var config = safetyConfig();
    var i;
    for (i = 0; i < items.length; i++) {
      if (!isTagged(items[i].properties)) continue;
      if (campaignId != null && String(lineCampaignId(items[i]) || "") !== String(campaignId)) continue;
      var verdict = auditTaggedLine(items[i], config, paid, true);
      if (verdict && verdict.action === "KEEP" && !(verdict.reasons && verdict.reasons.length)) {
        try { document.dispatchEvent(new CustomEvent("fgpb:gift-added", { detail: { campaignId: campaignId } })); } catch (_e) {}
        return;
      }
    }
    noteDiag("gift-celebrate-suppressed", { campaignId: campaignId, subtotal: paid });
  }

  /**
   * Single chokepoint for gift mutations, so the safety postcondition runs
   * after every one of them. Corrections issued by the postcondition itself go
   * straight to the raw path — otherwise settling would recurse.
   */
  function applyActions(actions, campaignId) {
    return applyActionsRaw(actions, campaignId).then(function (acc) {
      if (safetySettling || !acc || !acc.any) return acc;
      return giftSafetySettle().then(
        function (settled) {
          if (settled && settled.ok && acc.addRes && (acc.addRes.ok || acc.addRes.added > 0)) {
            celebrateEarnedGift(campaignId);
          }
          return acc;
        },
        function () {
          return acc;
        },
      );
    });
  }

  function applyActionsRaw(actions, campaignId) {
    var removes = [];
    var norms = [];
    var adds = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (!a) continue;
      if (a.type === "REMOVE" && a.lineKey) removes.push(a.lineKey);
      else if (a.type === "NORMALIZE" && a.lineKey) norms.push(a);
      else if (a.type === "ADD") adds.push(a);
    }

    var chain = Promise.resolve({ any: false });

    if (removes.length) {
      chain = chain.then(function (acc) {
        var removeP =
          removes.length === 1
            ? cartPost("/cart/change.js", { id: removes[0], quantity: 0 }).then(
                function () {
                  return { ok: true };
                },
                function () {
                  return { ok: false };
                },
              )
            : removeLinesBatch(removes);
        return removeP.then(function (res) {
          return { any: acc.any || !!(res && res.ok) };
        });
      });
    }

    for (var n = 0; n < norms.length; n++) {
      (function (norm) {
        chain = chain.then(function (acc) {
          // Normalize the tagged line by its own Shopify line key; a paid
          // same-SKU line has a different key and is never touched.
          var target = Math.max(1, Math.trunc(Number(norm.quantity) || 1));
          return setLineQty(norm.lineKey, target).then(function (res) {
            return { any: acc.any || !!(res && res.ok) };
          });
        });
      })(norms[n]);
    }

    if (adds.length && !isRateLimited() && !giftUnavailable) {
      chain = chain.then(function (acc) {
        lastAddError = null;
        return addGiftsBatch(adds, campaignId).then(function (res) {
          return { any: acc.any || !!(res && (res.ok || res.added > 0)), addRes: res };
        });
      });
    }

    return chain;
  }

  function isCartMutationUrl(url) {
    var s = String(url || "");
    if (s.indexOf("/cart/") === -1) return false;
    return /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/.test(s);
  }

  function isCartChangeUrl(url) {
    var s = String(url || "");
    return /\/cart\/change(\.js)?(\?|$)/.test(s);
  }

  function isCartUpdateUrl(url) {
    var s = String(url || "");
    return /\/cart\/update(\.js)?(\?|$)/.test(s);
  }

  function isCartClearUrl(url) {
    var s = String(url || "");
    return /\/cart\/clear(\.js)?(\?|$)/.test(s);
  }

  function parseJsonBody(init) {
    if (!init || init.body == null) return null;
    if (typeof init.body !== "string") return null;
    try {
      return JSON.parse(init.body);
    } catch (_e) {
      return null;
    }
  }

  function applyLineQuantity(cart, payload) {
    var items = (cart && cart.items) || [];
    var qty = Number(payload && payload.quantity);
    if (!Number.isFinite(qty)) return;
    var idx = -1;
    var id = payload.id != null ? String(payload.id) : "";
    if (id) {
      for (var i = 0; i < items.length; i++) {
        if (String(items[i].key) === id || String(items[i].variant_id) === id || String(items[i].id) === id) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) {
      var line = Number(payload.line);
      if (Number.isFinite(line) && line >= 1 && line <= items.length) idx = line - 1;
    }
    if (idx < 0 && qty > 0) {
      var paidIdx = [];
      var p;
      for (p = 0; p < items.length; p++) {
        if (!isTagged(items[p].properties)) paidIdx.push(p);
      }
      if (paidIdx.length === 1) idx = paidIdx[0];
    }
    if (idx < 0) return;
    if (qty <= 0) {
      items.splice(idx, 1);
      return;
    }
    var item = items[idx];
    var unit = Number(item.price) || 0;
    item.quantity = qty;
    item.final_line_price = unit * qty;
    item.line_price = unit * qty;
  }

  function projectAfterChange(cart, payload) {
    var next = cloneKnownCart(cart);
    if (!payload || typeof payload !== "object") return recountKnownCart(next);
    if (payload.updates && typeof payload.updates === "object") {
      var key;
      for (key in payload.updates) {
        if (Object.prototype.hasOwnProperty.call(payload.updates, key)) {
          applyLineQuantity(next, { id: key, quantity: payload.updates[key] });
        }
      }
      return recountKnownCart(next);
    }
    applyLineQuantity(next, payload);
    return recountKnownCart(next);
  }

  function parseOutgoingChange(init) {
    var body = parseJsonBody(init);
    if (body) return body;
    try {
      if (init && typeof FormData !== "undefined" && init.body instanceof FormData) {
        var updates = {};
        var hasUpdates = false;
        if (typeof init.body.keys === "function") {
          var keys = init.body.keys();
          var step = keys.next();
          while (!step.done) {
            var name = String(step.value || "");
            var m = name.match(/^updates\[(.+)\]$/);
            if (m) {
              updates[m[1]] = init.body.get(name);
              hasUpdates = true;
            }
            step = keys.next();
          }
        }
        if (hasUpdates) return { updates: updates };
        return {
          id: init.body.get("id"),
          line: init.body.get("line"),
          quantity: init.body.get("quantity"),
        };
      }
    } catch (_e) {}
    return null;
  }

  function jsonCartResponse(json, res) {
    return new Response(JSON.stringify(json), {
      status: res && res.status,
      statusText: (res && res.statusText) || "",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  }

  function markDrawerBusy() {
    try {
      if (typeof window !== "undefined" && typeof window.__fgpbMarkDrawerBusy === "function") {
        window.__fgpbMarkDrawerBusy();
      }
    } catch (_e) {}
  }

  function paintKnownCart(cart, ver) {
    if (!cart) return;
    if (ver != null) cart._fgpbVer = ver;
    publishKnownCart(cart);
    try {
      if (typeof window !== "undefined" && typeof window.__fgpbPaintFromCart === "function") {
        window.__fgpbPaintFromCart(cart, { cartUiGen: ver != null ? ver : currentCartUiGen() });
      }
    } catch (_e) {}
  }

  function rewriteChangeLineToKey(body, cart) {
    if (!body || typeof body !== "object") return body;
    if (body.id || (body.updates && typeof body.updates === "object")) return body;
    var items = (cart && cart.items) || [];
    var line = Number(body.line);
    var qtyZero = body.quantity === 0 || body.quantity === "0";
    var key = null;
    if (Number.isFinite(line) && line >= 1 && line <= items.length) {
      key = items[line - 1] && items[line - 1].key;
    } else if (qtyZero && items.length > 0 && Number.isFinite(line) && line >= 1) {
      var idx = Math.min(line, items.length) - 1;
      key = (items[idx] && items[idx].key) || items[items.length - 1].key;
    }
    if (!key) return body;
    var next = {};
    var bk;
    for (bk in body) {
      if (Object.prototype.hasOwnProperty.call(body, bk) && bk !== "line") next[bk] = body[bk];
    }
    next.id = String(key);
    return next;
  }

  function isInvalidLineError(payload, status) {
    if (Number(status) !== 400) return false;
    var msg = String(
      (payload && (payload.description || payload.message || payload.status)) || payload || "",
    ).toLowerCase();
    return msg.indexOf("line") !== -1 && msg.indexOf("invalid") !== -1;
  }

  function cloneInitWithBody(init, bodyObj) {
    var next = {};
    var k;
    if (init) {
      for (k in init) {
        if (Object.prototype.hasOwnProperty.call(init, k)) next[k] = init[k];
      }
    }
    next.method = (init && init.method) || "POST";
    next.credentials = (init && init.credentials) || "same-origin";
    next.headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (init && init.headers) {
      var hk;
      var src = init.headers;
      if (typeof Headers !== "undefined" && src instanceof Headers) {
        src.forEach(function (val, name) {
          next.headers[name] = val;
        });
      } else {
        for (hk in src) {
          if (Object.prototype.hasOwnProperty.call(src, hk)) next.headers[hk] = src[hk];
        }
      }
    }
    next.body = JSON.stringify(bodyObj);
    return next;
  }

  function rewriteShopperChangeInit(init, cart) {
    var body = parseJsonBody(init);
    if (!body) return init;
    var nextBody = rewriteChangeLineToKey(body, cart);
    if (nextBody === body || (nextBody && nextBody.id && !body.id)) {
      if (nextBody && nextBody.id && nextBody.id !== body.id) return cloneInitWithBody(init, nextBody);
      if (nextBody && nextBody.id && body.line != null && nextBody.line == null) {
        return cloneInitWithBody(init, nextBody);
      }
    }
    return init;
  }

  function retryInvalidLineChange(init, cart) {
    var items = (cart && cart.items) || [];
    var body = parseJsonBody(init) || {};
    var qtyZero = body.quantity === 0 || body.quantity === "0";
    if (!qtyZero) return Promise.resolve(null);
    if (!items.length) {
      return nativeFetch.call(window, "/cart/clear.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    }
    var updates = {};
    if (items.length === 1 || body.line == null) {
      for (var i = 0; i < items.length; i++) {
        if (items[i] && items[i].key) updates[items[i].key] = 0;
      }
    } else {
      var rewritten = rewriteChangeLineToKey(body, cart);
      if (rewritten && rewritten.id) updates[rewritten.id] = 0;
      else if (items[items.length - 1].key) updates[items[items.length - 1].key] = 0;
    }
    if (!Object.keys(updates).length) {
      return nativeFetch.call(window, "/cart/clear.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
    }
    var retryBody = { updates: updates };
    if (body.sections) retryBody.sections = body.sections;
    if (body.sections_url) retryBody.sections_url = body.sections_url;
    return nativeFetch.call(window, "/cart/update.js", cloneInitWithBody(init, retryBody));
  }

  function requestUrl(input) {
    if (!input) return "";
    if (typeof input === "string") return input;
    try {
      if (input.url) return String(input.url);
    } catch (_e) {}
    return String(input);
  }

  function requestMethod(input, init) {
    if (init && init.method) return String(init.method).toUpperCase();
    try {
      if (input && typeof input === "object" && input.method) return String(input.method).toUpperCase();
    } catch (_e2) {}
    return "GET";
  }

  function presentmentRate() {
    try {
      var rate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate);
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (_e) {}
    return 1;
  }

  function shopCurrency() {
    try {
      if (lastKnownCart && lastKnownCart.currency) return String(lastKnownCart.currency);
      if (typeof window !== "undefined" && window.__fgpbLastKnownCart && window.__fgpbLastKnownCart.currency) {
        return String(window.__fgpbLastKnownCart.currency);
      }
      if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
        return String(window.Shopify.currency.active);
      }
    } catch (_e) {}
    return "";
  }

  function emptyKnownCart() {
    return {
      items: [],
      item_count: 0,
      total_price: 0,
      items_subtotal_price: 0,
      currency: shopCurrency(),
    };
  }

  function cloneKnownCart(cart) {
    try {
      return JSON.parse(JSON.stringify(cart || emptyKnownCart()));
    } catch (_e) {
      return emptyKnownCart();
    }
  }

  function recountKnownCart(cart) {
    var next = cart || emptyKnownCart();
    var count = 0;
    var total = 0;
    var sub = 0;
    var items = next.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      count += Number(item.quantity) || 0;
      var line = Number(
        item.final_line_price != null
          ? item.final_line_price
          : item.line_price != null
            ? item.line_price
            : (Number(item.quantity) || 0) * (Number(item.price) || 0),
      );
      if (Number.isFinite(line)) {
        total += line;
        if (!isTagged(item.properties)) sub += line;
      }
    }
    next.item_count = count;
    next.total_price = total;
    next.items_subtotal_price = sub;
    return next;
  }

  function stripKnownCart(json) {
    return recountKnownCart({
      items: json && Array.isArray(json.items) ? json.items.slice() : [],
      item_count: json && json.item_count,
      total_price: json && json.total_price,
      items_subtotal_price: json && json.items_subtotal_price,
      currency: (json && json.currency) || shopCurrency(),
    });
  }

  function isFullCartJson(json) {
    return !!(
      json &&
      typeof json === "object" &&
      Array.isArray(json.items) &&
      json.total_price != null &&
      json.item_count != null
    );
  }

  function addedLinesFromResponse(json) {
    if (!json || typeof json !== "object") return [];
    if (Array.isArray(json.items) && (json.total_price == null || json.item_count == null)) {
      return json.items;
    }
    if (json.variant_id != null || json.product_id != null || (json.id && json.quantity && !json.items)) {
      return [json];
    }
    return [];
  }

  function mergeAddedItems(cart, added) {
    var next = recountKnownCart(cloneKnownCart(cart));
    var list = Array.isArray(added) ? added : added ? [added] : [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || typeof raw !== "object") continue;
      if (raw.sections && raw.variant_id == null && raw.id == null && !raw.key) continue;
      var idx = raw.key ? -1 : -1;
      if (raw.key) {
        for (var j = 0; j < next.items.length; j++) {
          if (next.items[j].key === raw.key) {
            idx = j;
            break;
          }
        }
      }
      if (idx >= 0) next.items[idx] = raw;
      else next.items.push(raw);
    }
    return recountKnownCart(next);
  }

  function publishKnownCart(cart) {
    lastKnownCart = cart || lastKnownCart;
    if (!lastKnownCart || typeof window === "undefined") return lastKnownCart;
    try {
      window.__fgpbLastKnownCart = lastKnownCart;
      window.__fgpbLastKnownCartAt = Date.now();
    } catch (_e) {}
    return lastKnownCart;
  }

  function retainTaggedGifts(next, prev) {
    if (!next || !prev || !prev.items || !next.items) return next;
    var have = {};
    for (var i = 0; i < next.items.length; i++) {
      if (next.items[i] && next.items[i].key) have[String(next.items[i].key)] = true;
    }
    var extra = false;
    for (var j = 0; j < prev.items.length; j++) {
      var it = prev.items[j];
      var props = (it && it.properties) || {};
      if (!(props._fgpb_free_gift === "true" || props._fgpb_free_gift === true)) continue;
      if (!it.key || have[String(it.key)]) continue;
      next.items.push(it);
      extra = true;
    }
    return extra ? recountKnownCart(next) : next;
  }

  function adoptMutationResponse(json, opts) {
    opts = opts || {};
    var prev = lastKnownCart;
    if (isFullCartJson(json)) {
      lastKnownCart = stripKnownCart(json);
      lastKnownCart._partial = false;
      // A full cart lists every line Shopify saved. Putting a gift back that
      // this response left out makes the planner skip the add, so the cart
      // the shopper is looking at never receives it.
      return publishKnownCart(lastKnownCart);
    }
    var added = addedLinesFromResponse(json);
    if (added.length) {
      lastKnownCart = mergeAddedItems(lastKnownCart, added);
      if (!lastKnownCart._partial) lastKnownCart._partial = true;
      return publishKnownCart(lastKnownCart);
    }
    if (!opts.fromGift) lastKnownCart = retainTaggedGifts(lastKnownCart, prev);
    return publishKnownCart(lastKnownCart);
  }

  function campaignWs() {
    if (lastWs) return lastWs;
    if (typeof window !== "undefined") return window.__fgpbLastWidgetState || lastWs;
    return lastWs;
  }

  function acceptWidgetState(ws) {
    var previousSignature = safetyConfigSignature();
    if (ws && !ws._fgpbCurrency) ws._fgpbCurrency = String(shopCurrency() || "").trim().toUpperCase();
    if (ws && ws._fgpbRate == null) ws._fgpbRate = presentmentRate();
    lastWs = ws;
    try { window.__fgpbLastWidgetState = ws; } catch (_eWs) {}
    if (ws) ws._fgpbConfigSig = safetyConfigSignature();
    if (previousSignature !== safetyConfigSignature()) {
      // Unavailability belongs to the old reward, not every future campaign.
      giftUnavailable = false;
      lastAddError = null;
      lastPlanKey = "";
      failCounts = {};
    }
  }

  function lookupVariantPriceCents(variantId) {
    var want = String(variantId || "");
    if (!want) return 0;
    var items = (lastKnownCart && lastKnownCart.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (ajaxVariantId(items[i].variant_id || items[i].id) === ajaxVariantId(want)) {
        var p = Number(items[i].price);
        if (Number.isFinite(p) && p > 0) return p;
      }
    }
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      var variants = meta && meta.product && meta.product.variants;
      if (Array.isArray(variants)) {
        for (var v = 0; v < variants.length; v++) {
          if (ajaxVariantId(variants[v].id) === ajaxVariantId(want)) {
            var cents = Number(variants[v].price);
            if (Number.isFinite(cents) && cents > 0) return cents < 1000 ? Math.round(cents * 100) : cents;
          }
        }
      }
    } catch (_e) {}
    try {
      var nodes = document.querySelectorAll('script[type="application/json"]');
      for (var n = 0; n < nodes.length; n++) {
        var parsed = JSON.parse(nodes[n].textContent || "null");
        var list = parsed && (parsed.variants || (parsed.product && parsed.product.variants));
        if (!Array.isArray(list)) continue;
        for (var t = 0; t < list.length; t++) {
          if (ajaxVariantId(list[t].id) === ajaxVariantId(want)) {
            var pr = Number(list[t].price);
            if (Number.isFinite(pr) && pr > 0) return pr;
          }
        }
      }
    } catch (_e2) {}
    return 0;
  }

  function normalizeAddItems(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.items)) {
      var out = [];
      for (var i = 0; i < payload.items.length; i++) {
        var it = payload.items[i];
        if (!it) continue;
        out.push({
          id: it.id || it.variant_id,
          quantity: it.quantity || 1,
          properties: it.properties || {},
          price: it.price,
        });
      }
      return out;
    }
    if (payload.id != null) {
      return [
        {
          id: payload.id,
          quantity: payload.quantity || 1,
          properties: payload.properties || {},
          price: payload.price,
        },
      ];
    }
    return [];
  }

  function itemsFromFormData(fd) {
    if (!fd || typeof fd.get !== "function") return [];
    var nested = [];
    var n = 0;
    while (fd.get("items[" + n + "][id]")) {
      nested.push({
        id: fd.get("items[" + n + "][id]"),
        quantity: fd.get("items[" + n + "][quantity]") || 1,
      });
      n += 1;
    }
    if (nested.length) return nested;
    var id = fd.get("id");
    if (!id) return [];
    return [{ id: id, quantity: fd.get("quantity") || 1 }];
  }

  function parseOutgoingAddItems(init) {
    var body = init && init.body;
    if (!body) return { items: [], payload: null, form: null };
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return { items: itemsFromFormData(body), payload: null, form: body };
    }
    if (typeof body === "string") {
      try {
        var json = JSON.parse(body);
        return { items: normalizeAddItems(json), payload: json, form: null };
      } catch (_e) {
        return { items: [], payload: null, form: null };
      }
    }
    if (body && typeof body === "object") {
      return { items: normalizeAddItems(body), payload: body, form: null };
    }
    return { items: [], payload: null, form: null };
  }

  function projectPaidCart(incomingItems) {
    var next = cloneKnownCart(lastKnownCart);
    for (var i = 0; i < (incomingItems || []).length; i++) {
      var inc = incomingItems[i];
      if (!inc || isTagged(inc.properties)) continue;
      var qty = Math.max(1, Number(inc.quantity) || 1);
      var vid = ajaxVariantId(inc.id || inc.variant_id);
      var unit = Number(inc.price);
      if (!Number.isFinite(unit) || unit <= 0) unit = lookupVariantPriceCents(vid);
      next.items.push({
        key: "proj:" + vid + ":" + i,
        variant_id: vid,
        id: vid,
        quantity: qty,
        price: unit,
        final_line_price: (Number.isFinite(unit) ? unit : 0) * qty,
        properties: inc.properties || {},
      });
    }
    return recountKnownCart(next);
  }





  function enqueueMutation(fn) {
    var run = mutationQueue.then(fn, fn);
    mutationQueue = run.then(
      function () {},
      function () {},
    );
    return run;
  }

  function dispatchCartRefresh(mutationId) {
    var detail = {
      mutationId: mutationId,
      cart: lastKnownCart,
      cartUiGen: currentCartUiGen(),
    };
    try {
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true, detail: detail }));
      document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true, detail: detail }));
      document.dispatchEvent(new CustomEvent("fgpb:cart", { detail: detail }));
    } catch (_e) {}
    try {
      if (typeof window.publish === "function") {
        var ev = (window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) || "cart-update";
        window.publish(ev, { source: "fgpb-native", mutationId: mutationId, cart: lastKnownCart, cartUiGen: detail.cartUiGen });
      }
    } catch (_e2) {}
  }

  /**
   * Native responses paint immediately, but campaign choice depends on the
   * complete live cart. Let the one serialized reconciler fetch that choice
   * before changing gifts; a cached winner cannot arbitrate another campaign.
   */
  function applyNativeGiftThreshold(cart) {
    if (aborted || !can("evaluateGifts")) return Promise.resolve();
    if (mutating || suppressEvents || processing) {
      queued = true;
      return Promise.resolve();
    }
    schedule(0);
    return Promise.resolve();
  }

  /* ------------------------------------------------------------------ *
   * Gift safety postcondition (build 138).
   *
   * Mirrors storefront-extension/src/utils/gift-safety.js. The `_fgpb_*` tag is
   * never proof that a line is free: only the authoritative cart is, and only
   * when the allocation covering it is positively attributed to our own
   * discount. Unknown and foreign attribution both fail closed, because
   * removing a legitimate gift is safer than checking out a charged one.
   * ------------------------------------------------------------------ */

  // Exact normalized titles only. Substring matching on "free gift" would
  // attribute an unrelated merchant discount of that name to us. Live cart.js
  // surfaces the Function candidate message ("FREE GIFT"), not the Admin node
  // title; both are ours after normalizeDiscountTitle.
  var OUR_DISCOUNT_TITLES = ["upselltrix free gift", "free gift progress bar - campaign rewards", "FREE GIFT"];
  var OUR_APPLICATION_TYPES = ["automatic"];

  /**
   * Gifts whose safety postcondition failed, keyed by campaign + variant.
   *
   * Without this, a removal and the planner fight forever: the gift is removed
   * because Shopify charged for it, eligibility is still true, so the planner
   * adds it straight back. The latch makes a failure terminal until the
   * authoritative state that produced it actually changes.
   *
   * Deliberately in-memory only. A page load re-probes exactly once, so a
   * merchant who fixes the discount sees it work on the next view instead of
   * having to clear browser storage — one bounded cycle per load is not a loop.
   */
  var giftSafetyLatches = {};
  var DISCOUNT_GRACE_READS = 1;
  var MAX_CORRECTION_ROUNDS = 2;
  var safetySettling = false;

  function safetyCents(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  /** Fold case, whitespace and dash variants so an em dash cannot break matching. */
  function normalizeDiscountTitle(value) {
    var text = String(value == null ? "" : value);
    if (typeof text.normalize === "function") text = text.normalize("NFKC");
    return text
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function allocationApplication(alloc) {
    if (!alloc || typeof alloc !== "object") return null;
    return alloc.discount_application || alloc.discountApplication || null;
  }

  /**
   * A recognised title arriving under an unexpected application type reads as
   * foreign: an automatic discount and a discount code are not interchangeable
   * evidence, and a code can be removed by the shopper.
   */
  function attributeAllocation(alloc) {
    var app = allocationApplication(alloc);
    var title = normalizeDiscountTitle(app && (app.title || app.description));
    if (!title) return "unknown";
    var known = false;
    for (var i = 0; i < OUR_DISCOUNT_TITLES.length; i++) {
      if (normalizeDiscountTitle(OUR_DISCOUNT_TITLES[i]) === title) {
        known = true;
        break;
      }
    }
    if (!known) return "foreign";
    var type = normalizeDiscountTitle(app && app.type);
    if (!type) return "ours";
    for (var t = 0; t < OUR_APPLICATION_TYPES.length; t++) {
      if (normalizeDiscountTitle(OUR_APPLICATION_TYPES[t]) === type) return "ours";
    }
    return "foreign";
  }

  function discountEvidence(line) {
    var original = safetyCents(
      line && (line.original_line_price != null ? line.original_line_price : line.line_price),
    );
    var finalPrice = safetyCents(line && line.final_line_price);
    var originalUnit = safetyCents(
      line && (line.original_price != null ? line.original_price : line.price),
    );
    var finalUnit = safetyCents(line && (line.final_price != null ? line.final_price : line.price));
    var allocs =
      line && Array.isArray(line.line_level_discount_allocations)
        ? line.line_level_discount_allocations
        : [];
    var attributed = 0;
    var foreign = 0;
    var unknown = 0;
    var total = 0;
    for (var i = 0; i < allocs.length; i++) {
      var amount = safetyCents(allocs[i] && allocs[i].amount);
      total += amount;
      var source = attributeAllocation(allocs[i]);
      if (source === "ours") attributed += amount;
      else if (source === "foreign") foreign += amount;
      else unknown += amount;
    }
    // The zero-price exception, and the only case where an absent allocation is
    // acceptable. Every authoritative amount — unit and line, original and final
    // — must be zero, so there is nothing for a discount to cover and nothing a
    // shopper could uncover by removing one.
    var intrinsicallyZero =
      originalUnit === 0 && finalUnit === 0 && original === 0 && finalPrice === 0;
    var discountConfirmed = original > 0 && finalPrice === 0 && attributed >= original;
    return {
      originalLinePrice: original,
      finalLinePrice: finalPrice,
      originalUnitPrice: originalUnit,
      finalUnitPrice: finalUnit,
      allocatedCents: total,
      attributedCents: attributed,
      foreignCents: foreign,
      unknownCents: unknown,
      allocationCount: allocs.length,
      residualChargedCents: finalPrice,
      attributedToUs: attributed > 0,
      coveredByForeignDiscountOnly: finalPrice === 0 && foreign > 0 && attributed < original,
      coveredByUnknownDiscountOnly: finalPrice === 0 && unknown > 0 && attributed < original,
      intrinsicallyZero: intrinsicallyZero,
      discountConfirmed: discountConfirmed,
      evidenceKind: discountConfirmed
        ? "discount-confirmed"
        : intrinsicallyZero
          ? "intrinsically-zero"
          : null,
      fullyFree: intrinsicallyZero || discountConfirmed,
    };
  }

  /** The only gate presentation may consult before rendering FREE. */
  function canRenderFree(line) {
    if (!isTagged(line && line.properties)) return false;
    return discountEvidence(line).fullyFree;
  }

  /** Storefront view of the configuration the Discount Function was synced with. */
  function safetyConfig() {
    var ws = campaignWs();
    if (!ws || ws.enabled === false) return { activeCampaigns: [] };
    var cid = ws.campaignId != null ? String(ws.campaignId).trim() : "";
    if (!cid) return { activeCampaigns: [] };

    if (ws.rewardType === "TIERED_FREE_GIFTS") {
      var src = Array.isArray(ws.rewardTiers) ? ws.rewardTiers : [];
      var tiers = [];
      for (var i = 0; i < src.length; i++) {
        var t = src[i];
        if (!t) continue;
        var tid = t.tierId || t.id;
        var tvid = ajaxVariantId(t.variantId || t.giftVariantId);
        var th = Number(t.threshold) || 0;
        if (!tid || !tvid || th <= 0) continue;
        tiers.push({ tierId: String(tid), threshold: th, giftVariantId: tvid });
      }
      if (!tiers.length) return { activeCampaigns: [] };
      return {
        activeCampaigns: [
          { campaignId: cid, rewardType: "TIERED_FREE_GIFTS", tiers: tiers },
        ],
      };
    }

    if (ws.rewardType !== "FREE_GIFT") return { activeCampaigns: [] };
    var gift = ws.gift || null;
    var gvid = ajaxVariantId(gift && (gift.variantId || gift.giftVariantId));
    var threshold = Number(ws.threshold) || 0;
    if (!gvid || threshold <= 0) return { activeCampaigns: [] };
    var cap = Number(ws.maxGiftQuantity);
    return {
      activeCampaigns: [
        {
          campaignId: cid,
          rewardType: "FREE_GIFT",
          threshold: threshold,
          giftVariantIds: [gvid],
          maxGiftQuantity: Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : 1,
        },
      ],
    };
  }

  function safetyConfigSignature() {
    try {
      return JSON.stringify(safetyConfig());
    } catch (_eSig) {
      return "none";
    }
  }

  /**
   * Signature of the lines that earn a gift, excluding tagged gifts themselves.
   *
   * Excluding them is the whole point: removing the failing gift must not look
   * like the change that justifies adding it again.
   */
  function qualifyingFingerprint(cart) {
    var items = (cart && cart.items) || [];
    var parts = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (isTagged(it.properties)) continue;
      parts.push(
        [
          String(it.key || ""),
          String(it.variant_id || it.id || ""),
          Number(it.quantity) || 0,
          Number(it.final_line_price != null ? it.final_line_price : it.line_price || 0),
        ].join(":"),
      );
    }
    parts.sort();
    return parts.length ? parts.join("|") : "empty";
  }

  function latchKey(campaignId, variantId) {
    return String(campaignId == null ? "" : campaignId) + "|" + String(variantId == null ? "" : variantId);
  }

  function latchGiftSafetyFailure(campaignId, variantId, cart, reasons) {
    var key = latchKey(campaignId, variantId);
    giftSafetyLatches[key] = {
      campaignId: campaignId || null,
      variantId: variantId || null,
      fingerprint: qualifyingFingerprint(cart),
      configSignature: safetyConfigSignature(),
      reasons: reasons || [],
      at: Date.now(),
    };
    noteDiag("gift-safety-latched", {
      key: key,
      reasons: reasons || [],
      fingerprint: giftSafetyLatches[key].fingerprint,
    });
  }

  /** Clears only on a change that could plausibly change the outcome. */
  function giftIsLatched(campaignId, variantId, cart) {
    var key = latchKey(campaignId, variantId);
    var entry = giftSafetyLatches[key];
    if (!entry && !variantId) {
      // Some unlocked-gift records carry no variant id. Fall back to any latch
      // for the same campaign, or the retry loop this prevents never ends.
      var wantCampaign = String(campaignId == null ? "" : campaignId);
      for (var k in giftSafetyLatches) {
        if (!Object.prototype.hasOwnProperty.call(giftSafetyLatches, k)) continue;
        if (String(giftSafetyLatches[k].campaignId) === wantCampaign) {
          key = k;
          entry = giftSafetyLatches[k];
          break;
        }
      }
    }
    if (!entry) return false;
    var fingerprint = qualifyingFingerprint(cart);
    if (entry.fingerprint !== fingerprint) {
      delete giftSafetyLatches[key];
      noteDiag("gift-safety-latch-cleared", { key: key, reason: "qualifying-cart-changed" });
      return false;
    }
    if (entry.configSignature !== safetyConfigSignature()) {
      delete giftSafetyLatches[key];
      noteDiag("gift-safety-latch-cleared", { key: key, reason: "configuration-changed" });
      return false;
    }
    return true;
  }

  function clearGiftSafetyLatches(reason) {
    giftSafetyLatches = {};
    noteDiag("gift-safety-latch-cleared", { key: "*", reason: reason || "manual" });
  }

  /** Suppress planned adds the latch forbids; removals are never suppressed. */
  function dropLatchedAdds(actions, campaignId, cart) {
    var out = [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      if (a && a.type === "ADD" && giftIsLatched(campaignId, ajaxVariantId(a.variantId), cart)) {
        noteDiag("gift-add-latched", { campaignId: campaignId, variantId: a.variantId });
        continue;
      }
      out.push(a);
    }
    return out;
  }

  function findSafetyCampaign(config, campaignId) {
    var want = String(campaignId == null ? "" : campaignId).trim();
    if (!want) return null;
    var list = (config && config.activeCampaigns) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].campaignId).trim() === want) return list[i];
    }
    return null;
  }

  /**
   * Conditions run in the order the invariant lists them, so a fixable quantity
   * is normalized rather than removed; the next pass then re-checks the
   * corrected line's discount.
   */
  function auditTaggedLine(line, config, paidMajor, finalAttempt) {
    if (!isTagged(line && line.properties)) return null;
    var key = lineKeyOf(line);
    var qty = Math.max(0, Math.trunc(Number(line.quantity) || 0));
    var cid = String(lineCampaignId(line) || "").trim();
    var vid = ajaxVariantId(line.variant_id || line.id);
    function remove(reason) {
      return {
        lineKey: key,
        action: "REMOVE",
        quantity: 0,
        reasons: [reason],
        campaignId: cid,
        variantId: vid,
        deferrable: false,
      };
    }

    if (!cid) return remove("missing-campaign-id");
    var campaign = findSafetyCampaign(config, cid);
    if (!campaign) return remove("campaign-not-in-config");

    var desired;
    if (campaign.rewardType === "TIERED_FREE_GIFTS") {
      var tid = String(lineTierId(line) || "").trim();
      if (!tid) return remove("missing-tier-id");
      var tier = null;
      for (var i = 0; i < campaign.tiers.length; i++) {
        if (campaign.tiers[i].tierId === tid) {
          tier = campaign.tiers[i];
          break;
        }
      }
      if (!tier) return remove("tier-not-in-campaign");
      if (tier.giftVariantId !== vid) return remove("variant-not-allowed");
      if (paidMajor + 1e-9 < tier.threshold) return remove("eligibility-lost");
      desired = 1;
    } else {
      var allowed = campaign.giftVariantIds || [];
      var permitted = false;
      for (var j = 0; j < allowed.length; j++) {
        if (allowed[j] === vid) {
          permitted = true;
          break;
        }
      }
      if (!vid || !permitted) return remove("variant-not-allowed");
      if (paidMajor + 1e-9 < campaign.threshold) return remove("eligibility-lost");
      desired = campaign.maxGiftQuantity || 1;
    }

    if (desired <= 0) return remove("eligibility-lost");
    if (qty > desired) {
      return {
        lineKey: key,
        action: "NORMALIZE",
        quantity: desired,
        reasons: ["quantity-above-cap"],
        deferrable: false,
      };
    }

    var evidence = discountEvidence(line);
    if (!evidence.fullyFree) {
      return {
        lineKey: key,
        action: finalAttempt ? "REMOVE" : "KEEP",
        quantity: 0,
        reasons: ["not-fully-discounted"],
        campaignId: cid,
        variantId: vid,
        deferrable: !finalAttempt,
        evidence: evidence,
      };
    }
    return {
      lineKey: key,
      action: "KEEP",
      quantity: qty,
      reasons: [],
      deferrable: false,
      evidenceKind: evidence.evidenceKind,
    };
  }

  /** Untagged lines are never audited, so a paid same-SKU line is safe by construction. */
  function auditCartSafety(cart, config, finalAttempt) {
    var items = (cart && cart.items) || [];
    var paidMajor = eligibleSubtotal(cart);
    var audits = [];
    var actions = [];
    var violations = [];
    var deferred = false;
    for (var i = 0; i < items.length; i++) {
      var a = auditTaggedLine(items[i], config, paidMajor, finalAttempt);
      if (!a) continue;
      audits.push(a);
      if (a.deferrable) deferred = true;
      if (a.reasons.length) violations = violations.concat(a.reasons);
      if (a.action === "REMOVE" || a.action === "NORMALIZE") {
        actions.push({
          type: a.action,
          lineKey: a.lineKey,
          quantity: a.quantity,
          reasons: a.reasons,
          campaignId: a.campaignId,
          variantId: a.variantId,
        });
      }
    }
    return {
      cart: cart,
      paidSubtotal: paidMajor,
      audits: audits,
      actions: actions,
      violations: violations,
      deferred: deferred,
      safe: actions.length === 0 && !deferred,
    };
  }

  function summarizeTaggedAllocations(cart) {
    var items = (cart && cart.items) || [];
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!isTagged(it.properties)) continue;
      var allocs = Array.isArray(it.line_level_discount_allocations)
        ? it.line_level_discount_allocations
        : [];
      var seen = [];
      for (var a = 0; a < allocs.length; a++) {
        var app = allocationApplication(allocs[a]);
        seen.push({
          title: (app && app.title) || null,
          description: (app && app.description) || null,
          normalizedTitle: normalizeDiscountTitle(app && (app.title || app.description)),
          type: (app && app.type) || null,
          allocationMethod: (app && (app.allocation_method || app.allocationMethod)) || null,
          targetSelection: (app && (app.target_selection || app.targetSelection)) || null,
          targetType: (app && (app.target_type || app.targetType)) || null,
          value: (app && app.value) != null ? app.value : null,
          valueType: (app && (app.value_type || app.valueType)) || null,
          amount: allocs[a] && allocs[a].amount,
          attributed: attributeAllocation(allocs[a]),
        });
      }
      var ev = discountEvidence(it);
      out.push({
        key: lineKeyOf(it),
        campaignId: lineCampaignId(it),
        tierId: lineTierId(it),
        qty: it.quantity,
        originalUnit: ev.originalUnitPrice,
        finalUnit: ev.finalUnitPrice,
        original: ev.originalLinePrice,
        final: ev.finalLinePrice,
        allocations: seen,
        evidenceKind: ev.evidenceKind,
        fullyFree: ev.fullyFree,
      });
    }
    return out;
  }

  /**
   * Preconditions that must all hold before a gift may be POSTed, revalidated
   * here against the newest authoritative cart rather than the cart the plan was
   * built from. Eligibility and subtotal are rechecked because a widget-state
   * response computed for an older subtotal must never authorise an add.
   */
  function validateGiftAddition(campaignId, variantId, config, cart) {
    var reasons = [];
    var id = String(campaignId == null ? "" : campaignId).trim();
    if (!id) reasons.push("missing-campaign-id");
    var campaign = id ? findSafetyCampaign(config, id) : null;
    if (id && !campaign) reasons.push("campaign-not-in-config");
    var wanted = ajaxVariantId(variantId);
    var paid = eligibleSubtotal(cart);

    if (campaign) {
      var required = null;
      var permitted = false;
      if (campaign.rewardType === "TIERED_FREE_GIFTS") {
        var tiers = campaign.tiers || [];
        for (var t = 0; t < tiers.length; t++) {
          if (tiers[t].giftVariantId === wanted) {
            permitted = true;
            required = tiers[t].threshold;
            break;
          }
        }
      } else {
        var allowed = campaign.giftVariantIds || [];
        for (var i = 0; i < allowed.length; i++) {
          if (allowed[i] === wanted) {
            permitted = true;
            required = campaign.threshold;
            break;
          }
        }
      }
      if (!wanted || !permitted) reasons.push("variant-not-allowed");
      else if (paid + 1e-9 < Number(required)) reasons.push("eligibility-lost");
    }

    if (cart && cart._partial) reasons.push("partial-cart");
    if (!planStillValid()) reasons.push("generation-superseded");
    if (giftIsLatched(id, wanted, cart)) reasons.push("safety-latched");
    return { ok: reasons.length === 0, reasons: reasons };
  }

  /**
   * Bounded confirm-and-correct cycle against the authoritative cart.
   *
   * A mutation response is never evidence — the allocation may not be present
   * in it yet — so every decision comes from a fresh `/cart.js` read. One
   * bounded re-read is allowed when the discount is the only unproven thing;
   * provable faults never spend it. When the budget is exhausted we record a
   * diagnostic failure and settle on Dawn's native cart rather than loop.
   */
  function giftSafetySettle() {
    if (aborted || !can("mutateGifts")) return Promise.resolve({ ok: true, skipped: true });
    if (safetySettling) return Promise.resolve({ ok: false, busy: true });
    safetySettling = true;

    var maxReads = MAX_CORRECTION_ROUNDS + DISCOUNT_GRACE_READS + 2;
    var reads = 0;
    var graceUsed = 0;
    var rounds = 0;
    var applied = [];

    function done(result) {
      safetySettling = false;
      return result;
    }

    function readAndAudit() {
      reads += 1;
      return fetchCart().then(function (cart) {
        if (!cart) return null;
        var next = stripKnownCart(cart);
        next._partial = false;
        publishKnownCart(next);
        var audit = auditCartSafety(next, safetyConfig(), graceUsed >= DISCOUNT_GRACE_READS);
        noteDiag("gift-safety-audit", {
          read: reads,
          graceUsed: graceUsed,
          round: rounds,
          // The observed allocation labels, so a live operator can confirm what
          // Shopify actually calls our discount rather than inferring it.
          tagged: summarizeTaggedAllocations(next),
          violations: audit.violations,
          actions: audit.actions.map(function (a) {
            return { type: a.type, lineKey: a.lineKey, quantity: a.quantity };
          }),
          safe: audit.safe,
          cart: summarizeCartForDiag(next),
        });
        return audit;
      });
    }

    function step() {
      if (reads >= maxReads) return Promise.resolve(null);
      return readAndAudit().then(function (audit) {
        if (!audit) return null;
        if (audit.safe) return { settled: true };

        if (!audit.actions.length && audit.deferred) {
          if (graceUsed >= DISCOUNT_GRACE_READS) return null;
          graceUsed += 1;
          noteDiag("gift-safety-grace", { read: reads, graceUsed: graceUsed });
          return step();
        }

        if (rounds >= MAX_CORRECTION_ROUNDS) return null;
        rounds += 1;
        // Latch before correcting. Otherwise eligibility is still true when the
        // gift disappears and the planner adds it straight back, forever.
        for (var i = 0; i < audit.actions.length; i++) {
          var action = audit.actions[i];
          if (action.type !== "REMOVE") continue;
          latchGiftSafetyFailure(action.campaignId, action.variantId, audit.cart, action.reasons);
        }
        return applyActions(audit.actions, null).then(function () {
          applied = applied.concat(audit.actions);
          return step();
        });
      });
    }

    return step()
      .then(function (result) {
        if (result && result.settled) {
          return done({ ok: true, reads: reads, graceUsed: graceUsed, rounds: rounds, applied: applied });
        }
        // Budget spent: one last authoritative read decides the outcome.
        graceUsed = DISCOUNT_GRACE_READS;
        return readAndAudit().then(function (final) {
          if (final && final.safe) {
            return done({ ok: true, reads: reads, graceUsed: graceUsed, rounds: rounds, applied: applied });
          }
          noteDiag("gift-safety-failed", {
            reads: reads,
            rounds: rounds,
            violations: (final && final.violations) || ["unreadable-cart"],
          });
          return done({
            ok: false,
            gaveUp: true,
            reads: reads,
            rounds: rounds,
            applied: applied,
            violations: (final && final.violations) || [],
          });
        });
      })
      .catch(function (err) {
        noteDiag("gift-safety-failed", { reads: reads, error: err && err.message });
        return done({ ok: false, gaveUp: true, reads: reads, applied: applied });
      });
  }

  /**
   * Late-add safety net.
   *
   * An ADD already in flight cannot be cancelled. If the shopper dropped below
   * the threshold while it was in flight, the newest confirmed cart now holds a
   * gift nobody earned — and checkout would show it. Re-read the authoritative
   * cart and remove anything that is no longer eligible, under the newest
   * generation. Removal only; this must never add.
   */
  function reconcileAfterGiftMutation() {
    if (aborted || !can("mutateGifts")) return Promise.resolve(null);
    var reconcileGen = currentCartUiGen();
    return fetchCart()
      .then(function (confirmed) {
        if (!confirmed || currentCartUiGen() !== reconcileGen) {
          queued = true;
          return null;
        }
        var next = stripKnownCart(confirmed);
        next._partial = false;
        publishKnownCart(next);
        return fetchWidgetState(eligibleSubtotal(next), next.currency || shopCurrency(), reconcileGen)
          .then(function (ws) {
            if (!ws || currentCartUiGen() !== reconcileGen) {
              if (currentCartUiGen() !== reconcileGen) queued = true;
              return null;
            }
            acceptWidgetState(ws);
            var campaignId = ws.campaignId != null ? ws.campaignId : null;
            var unlocked = ws.enabled !== false ? extractUnlockedFromWs(ws, next) : [];
            var undo = planTieredGiftSync(next, unlocked, campaignId, false).filter(function (a) {
              return a && a.type === "REMOVE";
            });
            activePlan = { gen: reconcileGen, fingerprint: cartFingerprint(next), subtotal: eligibleSubtotal(next) };
            noteDiag("compensating-reconcile", {
              generation: reconcileGen,
              eligibleSubtotal: eligibleSubtotal(next),
              removals: undo.length,
              confirmedCart: summarizeCartForDiag(next),
            });
            if (!undo.length) return null;
            return applyActions(undo, campaignId).then(function (acc) {
              dispatchCartRefresh("fgpb-undo-" + Date.now().toString(36));
              return acc;
            });
          });
      })
      .catch(function () { return null; });
  }

  /**
   * Evaluated immediately before a gift POST leaves the page, not just before
   * painting. Generation advances only on customer mutations, so a mismatch
   * means the shopper changed their mind and this plan is void.
   */
  function planStillValid() {
    if (!activePlan) return true;
    var ok = Number(activePlan.gen) === currentCartUiGen();
    noteDiag("pre-post-validate", {
      plannedGen: activePlan.gen,
      liveGen: currentCartUiGen(),
      valid: ok,
    });
    return ok;
  }

  /**
   * Confirms a cache decision against widget-state after the gift section has
   * already been applied. A newer shopper change voids it. This may remove or
   * add only while the captured generation is still current.
   */
  function verifyCachedEligibility(gen) {
    if (aborted || currentCartUiGen() !== gen) return;
    var cart = lastKnownCart;
    if (!cart || cart._partial) return;
    // The callback runs inside the response turn. A chained `.then` on this
    // promise can be skipped when the body is delivered from a nested
    // resolution, which left the server's campaign unapplied.
    fetchWidgetState(eligibleSubtotal(cart), cart.currency || shopCurrency(), gen, function (ws) {
      if (!ws || currentCartUiGen() !== gen) return;
      // Keep the server result even if a sync is busy. Dropping it left the
      // cache on the previous campaign, which then removed the gift the server
      // still required.
      var previousSignature = safetyConfigSignature();
      acceptWidgetState(ws);
      var configChanged = previousSignature !== safetyConfigSignature();
      noteDiag("compensating-reconcile", {
        generation: gen,
        eligibleSubtotal: eligibleSubtotal(cart),
        configChanged: configChanged,
      });
      if (mutating || processing || suppressEvents) {
        // Same campaign: the sync already in flight applied this cache.
        // A different campaign has to be planned again once the lock clears,
        // because that sync may already have passed its queue check.
        if (!configChanged) return;
        queued = true;
        var attempt = 0;
        function runWhenFree() {
          setTimeout(function () {
            if (aborted || currentCartUiGen() !== gen) return;
            if (mutating || processing || suppressEvents) {
              attempt += 1;
              if (attempt < 20) runWhenFree();
              return;
            }
            syncOnce();
          }, 40);
        }
        runWhenFree();
        return;
      }
      var live = lastKnownCart && !lastKnownCart._partial ? lastKnownCart : cart;
      if (!live || currentCartUiGen() !== gen) return;
      var campaignId = ws.campaignId != null ? ws.campaignId : null;
      var unlocked = [];
      if (ws.enabled !== false && (ws.rewardType === "TIERED_FREE_GIFTS" || ws.rewardType === "FREE_GIFT")) {
        unlocked = extractUnlockedFromWs(ws, live);
      }
      activePlan = { gen: gen, fingerprint: cartFingerprint(live), subtotal: eligibleSubtotal(live) };
      var actions = dropLatchedAdds(
        planTieredGiftSync(live, unlocked, campaignId, ws.autoAddGift !== false),
        campaignId,
        live,
      );
      noteDiag("eligibility-verify", {
        generation: gen,
        subtotal: eligibleSubtotal(live),
        actions: actions.length,
      });
      if (!actions.length || currentCartUiGen() !== gen) return;
      mutating = true;
      suppressEvents = true;
      applyActions(actions, campaignId).then(function () {
        mutating = false;
        suppressEvents = false;
        if (aborted) return;
        if (queued && !isRateLimited()) {
          queued = false;
          schedule();
        }
      });
    });
  }

  function scheduleDrawerHostRecover() {
    try {
      if (typeof window !== "undefined" && typeof window.__fgpbRecoverDrawerHost === "function") {
        window.__fgpbRecoverDrawerHost();
      }
    } catch (_e) {}
  }

  function followUpGiftSync(json, startedGen) {
    if (aborted) {
      scheduleDrawerHostRecover();
      return;
    }
    if (startedGen != null && Number(startedGen) < currentCartUiGen()) {
      scheduleDrawerHostRecover();
      return;
    }
    adoptMutationResponse(json);
    // A full cart response is the cart Shopify just saved. A later sync may
    // plan from it. A partial add.js body is not that cart.
    if (lastKnownCart && isFullCartJson(json) && lastKnownCart._partial !== true) {
      lastKnownCart._fgpbFromMutation = true;
      lastKnownCart._fgpbAdoptedGen = currentCartUiGen();
    } else if (lastKnownCart) {
      lastKnownCart._fgpbFromMutation = false;
    }
    if (lastKnownCart && startedGen != null) lastKnownCart._fgpbVer = startedGen;
    paintKnownCart(lastKnownCart, startedGen != null ? startedGen : currentCartUiGen());
    scheduleDrawerHostRecover();
    if (processing || mutating) { queued = true; return; }
    if (startedGen != null && Number(startedGen) !== currentCartUiGen()) return;
    // After Dawn's current turn — never POST gift add/remove inside updateQuantity.
    setTimeout(function () {
      if (aborted) return;
      if (processing || mutating) { queued = true; return; }
      applyNativeGiftThreshold(lastKnownCart);
    }, 0);
  }

  function onNativeCartResponse(json) {
    followUpGiftSync(json);
  }


  function restoreNativeInterceptor() {
    try {
      if (typeof window !== "undefined" && window.__fgpbNativeFetchWrapped && nativeFetch) {
        window.fetch = nativeFetch;
        window.__fgpbNativeFetchWrapped = false;
      }
    } catch (_e) {}
    try {
      if (xhrOpenOrig && xhrSendOrig && typeof XMLHttpRequest !== "undefined") {
        XMLHttpRequest.prototype.open = xhrOpenOrig;
        XMLHttpRequest.prototype.send = xhrSendOrig;
        xhrOpenOrig = null;
        xhrSendOrig = null;
        if (typeof window !== "undefined") window.__fgpbNativeXhrWrapped = false;
      }
    } catch (_e2) {}
  }

  function installXhrInterceptor() {
    if (typeof XMLHttpRequest === "undefined") return;
    if (typeof window !== "undefined" && window.__fgpbNativeXhrWrapped) return;
    xhrOpenOrig = XMLHttpRequest.prototype.open;
    xhrSendOrig = XMLHttpRequest.prototype.send;
    if (typeof window !== "undefined") window.__fgpbNativeXhrWrapped = true;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fgpbMethod = method;
      this.__fgpbUrl = url;
      return xhrOpenOrig.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      var xhr = this;
      var watch =
        !aborted &&
        /POST|PUT/i.test(String(xhr.__fgpbMethod || "")) &&
        isCartMutationUrl(xhr.__fgpbUrl);
      if (watch) {
        bumpShopperCartGen();
        var startedGen = currentCartUiGen();
        xhr.addEventListener("load", function () {
          var parsed = null;
          try {
            parsed = JSON.parse(xhr.responseText);
          } catch (_e) {}
          if (xhr.status === 422) {
            giftUnavailable = true;
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) followUpGiftSync(parsed, startedGen);
        });
      }
      return xhrSendOrig.apply(this, arguments);
    };
  }

  function observeNativeCartResponse(req, startedGen) {
    if (!req || typeof req.then !== "function") return;
    req.then(
      function (res) {
        if (!res || !res.ok) return;
        res
          .clone()
          .json()
          .then(function (json) {
            followUpGiftSync(json, startedGen);
          })
          .catch(function () {});
      },
      function () {},
    );
  }

  /**
   * Savor (and the other Horizon-family carts) send /cart/change with a 1-based
   * `line`. The free gift is inserted at line 1, so that index then points at
   * the gift or at a row that no longer exists. Shopify answers
   * "line parameter is invalid" and the extra gift units are charged.
   * The row's data-key is the line item the button belongs to. Send that as
   * `id` and keep sections so the theme can redraw. Dawn has no
   * cart-items-component row key, so its request is left unchanged.
   *
   * A hidden drawer and the cart page are both cart-items-component nodes, and
   * their row order can differ. The acting surface is the one Savor names
   * first in `sections` (its own section id), or the component that just
   * dispatched shopify:cart:lines-update. A line index is never taken from a
   * different surface.
   */
  function componentSectionId(comp) {
    if (!comp) return "";
    var id = comp.dataset && comp.dataset.sectionId;
    if (!id && comp.getAttribute) id = comp.getAttribute("data-section-id");
    return id ? String(id).trim() : "";
  }

  function componentRows(comp) {
    var rows = null;
    try {
      rows = comp.refs && comp.refs.cartItemRows;
    } catch (_e) {}
    if ((!rows || !rows.length) && comp.querySelectorAll) rows = comp.querySelectorAll('[ref="cartItemRows[]"]');
    return rows;
  }

  function rowKeyAt(comp, line) {
    var rows = componentRows(comp);
    var row = rows && rows[line - 1];
    if (!row) return "";
    var key = row.dataset && row.dataset.key;
    if (!key && row.getAttribute) key = row.getAttribute("data-key");
    return key ? String(key) : "";
  }

  function lineIntentKey(raw) {
    var key = raw == null ? "" : String(raw);
    var gid = key.match(/CartLine\/([^/?#]+)/);
    if (!gid) return key;
    try {
      return decodeURIComponent(gid[1]);
    } catch (_e) {
      return gid[1];
    }
  }

  function rememberLineIntent(event) {
    if (!event || typeof window === "undefined") return;
    var lines = event.lines || (event.detail && event.detail.lines);
    var first = lines && lines[0];
    var key = first ? lineIntentKey(first.id) : "";
    var target = event.target;
    var comp = null;
    if (target && String(target.tagName || "").toLowerCase() === "cart-items-component") comp = target;
    else if (target && target.closest) comp = target.closest("cart-items-component");
    if (!comp && !key) return;
    window.__fgpbPendingLineIntent = { component: comp, key: key, at: Date.now() };
  }

  function installLineIntentListener() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (window.__fgpbLineIntentListening) return;
    window.__fgpbLineIntentListening = true;
    document.addEventListener("shopify:cart:lines-update", rememberLineIntent, true);
  }

  function takePendingLineIntent() {
    if (typeof window === "undefined") return null;
    var intent = window.__fgpbPendingLineIntent;
    window.__fgpbPendingLineIntent = null;
    if (!intent || Date.now() - Number(intent.at) > 1500) return null;
    return intent;
  }

  function actingSectionId(body) {
    if (!body || body.sections == null) return "";
    var raw = Array.isArray(body.sections) ? body.sections.join(",") : String(body.sections);
    var first = raw.split(",")[0];
    return first ? first.trim() : "";
  }

  function themeLineItemKey(lineNumber, body) {
    var line = Number(lineNumber);
    if (!Number.isFinite(line) || line < 1 || typeof document === "undefined") return "";
    var components = document.querySelectorAll("cart-items-component");
    if (!components || !components.length) return "";
    var intent = takePendingLineIntent();
    var sectionId = actingSectionId(body);
    var sectionMatches = [];
    var i;
    for (i = 0; i < components.length; i++) {
      if (sectionId && componentSectionId(components[i]) === sectionId) sectionMatches.push(components[i]);
    }
    var actor = null;
    if (sectionMatches.length === 1) actor = sectionMatches[0];
    else if (intent && intent.component) {
      for (i = 0; i < components.length; i++) {
        if (components[i] === intent.component) {
          actor = intent.component;
          break;
        }
      }
    }
    if (!actor && intent && intent.key) {
      for (i = 0; i < components.length; i++) {
        if (rowKeyAt(components[i], line) === intent.key) {
          actor = components[i];
          break;
        }
      }
    }
    if (!actor && components.length === 1) actor = components[0];
    if (!actor) return "";
    return rowKeyAt(actor, line);
  }

  function rewriteThemeLineBody(body) {
    if (!body || typeof body !== "object") return null;
    if (body.id || (body.updates && typeof body.updates === "object")) return null;
    if (body.line == null) return null;
    var key = themeLineItemKey(body.line, body);
    if (!key) return null;
    var next = {};
    var bk;
    for (bk in body) {
      if (Object.prototype.hasOwnProperty.call(body, bk) && bk !== "line") next[bk] = body[bk];
    }
    next.id = key;
    return next;
  }

  function rewriteThemeLineChange(input, init) {
    if (!isCartChangeUrl(requestUrl(input))) return null;
    var body = parseJsonBody(init);
    if (!body) return null;
    var nextBody = rewriteThemeLineBody(body);
    if (!nextBody) return null;
    return cloneInitWithBody(init, nextBody);
  }

  function installNativeCartInterceptor() {
    if (typeof window === "undefined" || inThemeEditor()) return;
    installLineIntentListener();
    if (window.__fgpbNativeFetchWrapped) return;
    if (typeof window.fetch !== "function") return;
    nativeFetch = window.__fgpbOrigFetch || window.fetch;
    window.__fgpbOrigFetch = nativeFetch;
    window.__fgpbNativeFetchWrapped = true;
    window.fetch = function (input, init) {
      // Dawn's add.js stays untouched. Savor's /cart/change `line` is rewritten
      // to the row key above; every other call keeps the same Request and body.
      // The password guard only stops the /password → /password redirect loop.
      var rewrittenInit = null;
      try {
        rewrittenInit = rewriteThemeLineChange(input, init);
      } catch (_rewrite) {}
      var req =
        typeof window.__fgpbGuardFetch === "function"
          ? window.__fgpbGuardFetch(function (guardedInput, guardedInit) {
              return nativeFetch.call(window, guardedInput, guardedInit);
            }, input, rewrittenInit || init)
          : rewrittenInit
            ? nativeFetch.call(this, input, rewrittenInit)
            : nativeFetch.apply(this, arguments);
      if (aborted) return req;
      var url = requestUrl(input);
      var method = requestMethod(input, init);
      if (!/POST|PUT/i.test(method) || !isCartMutationUrl(url)) return req;
      // Only Dawn/customer traffic reaches this wrapper — UpsellTrix's own gift
      // mutations use the saved native fetch. Skipping the bump while
      // `processing` therefore hid real customer mutations that landed during a
      // gift POST, which is precisely how a stale plan survived.
      bumpShopperCartGen();
      var startedGen = currentCartUiGen();
      markDrawerBusy();
      observeNativeCartResponse(req, startedGen);
      return req;
    };
    installXhrInterceptor();
  }

  function missingFromUnlocked(unlocked, cart, campaignId) {
    var items = (cart && cart.items) || [];
    return (unlocked || []).filter(function (gift) {
      if (!gift || !gift.tierId) return false;
      return !items.some(function (item) {
        return isTagged(item.properties) &&
          lineCampaignId(item) === String(campaignId == null ? "" : campaignId) &&
          lineTierId(item) === String(gift.tierId) &&
          ajaxVariantId(item.variant_id || item.variantId || item.id) === ajaxVariantId(gift.variantId);
      });
    });
  }

  /**
   * Read the authoritative cart, paint progress from it, and report the gift plan
   * that stage 5 would execute. Performs no cart mutation, so the visible cart and
   * checkout stay identical to native Dawn.
   */
  function syncDryRunOnce() {
    return fetchCart()
      .then(function (cart) {
        if (!cart) return null;
        lastKnownCart = stripKnownCart(cart);
        lastKnownCart._partial = false;
        publishKnownCart(lastKnownCart);
        paintKnownCart(lastKnownCart, currentCartUiGen());
        var ws = campaignWs();
        if (!ws || !can("evaluateGifts")) return null;
        var campaignId = ws.campaignId != null ? ws.campaignId : null;
        var unlocked = unlockedFromCachedWs(ws, lastKnownCart);
        var actions = planTieredGiftSync(lastKnownCart, unlocked, campaignId, ws.autoAddGift !== false);
        noteDiag("gift-plan-dry-run", {
          stage: rt().stage,
          source: "slow-path",
          generation: currentCartUiGen(),
          fingerprint: cartFingerprint(lastKnownCart),
          eligibleSubtotal: eligibleSubtotal(lastKnownCart),
          unlocked: unlocked.map(function (u) {
            return u && u.tierId;
          }),
          actions: actions.map(function (a) {
            return { type: a.type, tierId: a.tierId || null };
          }),
        });
        return actions;
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * The shopper's own cart save, when the response was a full cart for the
   * generation we are planning. A boot read or a partial add.js body is not.
   */
  function mutationCartForSync() {
    var cart = lastKnownCart;
    if (!cart || cart._partial || cart._fgpbFromMutation !== true) return null;
    if (Number(cart._fgpbAdoptedGen) !== currentCartUiGen()) return null;
    if (!isFullCartJson(cart)) return null;
    return cart;
  }

  /**
   * Cached campaign rules match a fresh widget-state only when the payload is
   * complete and the currency and presentment rate are the ones it was built
   * for. A different market, a partial cart, or a missing threshold falls
   * back to the server before any gift POST.
   */
  function cachedEligibilityUsable(cart) {
    if (!cart || cart._partial || !isFullCartJson(cart)) return false;
    var ws = campaignWs();
    if (!ws || ws.enabled === false) return false;
    if (ws.rewardType !== "FREE_GIFT" && ws.rewardType !== "TIERED_FREE_GIFTS") return false;
    if (ws.campaignId == null || String(ws.campaignId).trim() === "") return false;
    if (!ws._fgpbConfigSig || ws._fgpbConfigSig !== safetyConfigSignature()) return false;
    if (!safetyConfig().activeCampaigns.length) return false;
    var currency = String(cart.currency || "").trim().toUpperCase();
    var stamped = String(ws._fgpbCurrency || "").trim().toUpperCase();
    if (!currency || !stamped || currency !== stamped) return false;
    if (Number(ws._fgpbRate) !== presentmentRate()) return false;
    return true;
  }

  function syncOnce(manualClaim) {
    if (aborted) return Promise.resolve();
    if (mutating || suppressEvents || processing) {
      queued = true;
      return Promise.resolve();
    }
    // Below stage 5 the slow path may still read and paint, but the reconcile
    // plan is reported instead of executed.
    if (!can("mutateGifts")) return syncDryRunOnce();
    if (typeof window !== "undefined" && window.__fgpbTieredSyncDisabled) {
      return Promise.resolve();
    }
    readRateLimit();
    if (isRateLimited()) return Promise.resolve();

    mutating = true;
    suppressEvents = true;
    var syncGen = currentCartUiGen();
    var fastChanged = false;
    var seeded = mutationCartForSync();

    function rememberCart(cart) {
      lastKnownCart = stripKnownCart(cart);
      lastKnownCart._partial = false;
      lastKnownCart._fgpbFromMutation = false;
      publishKnownCart(lastKnownCart);
      paintKnownCart(lastKnownCart, syncGen);
      return lastKnownCart;
    }

    function planWith(cart, ws, usedServer) {
      var paid = eligibleSubtotal(cart);
      if (ws) {
        if (usedServer) acceptWidgetState(ws);
        activePlan = { gen: syncGen, fingerprint: cartFingerprint(cart), subtotal: paid };
      }
      if (!ws) {
        publishStatus([], [], paid);
        return Promise.resolve({ changed: fastChanged });
      }
      var campaignId = ws.campaignId != null ? ws.campaignId : null;
      var unlocked = [];
      if (ws.enabled !== false && (ws.rewardType === "TIERED_FREE_GIFTS" || ws.rewardType === "FREE_GIFT")) {
        unlocked = usedServer ? extractUnlockedFromWs(ws, cart) : unlockedFromCachedWs(ws, cart);
      }
      var actions = dropLatchedAdds(
        planTieredGiftSync(cart, unlocked, campaignId, (manualClaim === true || ws.autoAddGift !== false)),
        campaignId,
        cart,
      );
      noteDiag("eligibility-source", { source: usedServer ? "server" : "cache", subtotal: paid });
      noteDiag("eligibility", { campaignId: campaignId, subtotal: paid, unlocked: unlocked.length });
      noteDiag("gift-plan", { campaignId: campaignId, actions: actions });
      var key = planKey(actions);
      var missing = missingFromUnlocked(unlocked, cart, campaignId);
      publishStatus(unlocked, missing, paid);
      var verify = usedServer ? false : { gen: syncGen };

      if (!actions.length) {
        lastPlanKey = key;
        lastAddError = null;
        failCounts = {};
        return Promise.resolve({ changed: fastChanged, verify: verify });
      }
      var fails = failCounts[key] || 0;
      if (key === lastPlanKey && lastAddError && fails >= MAX_PLAN_FAILS) {
        return Promise.resolve({ changed: fastChanged, stuck: true, missing: missing, verify: verify });
      }
      lastPlanKey = key;

      return applyActions(actions, campaignId).then(function (acc) {
        var nextCart = lastKnownCart || cart;
        noteDiag("final-confirmed-cart", { cart: summarizeCartForDiag(nextCart), generation: currentCartUiGen() });
        var still = missingFromUnlocked(unlocked, nextCart, campaignId);
        if (!still.length) {
          lastAddError = null;
          failCounts = {};
        } else if (lastAddError) {
          failCounts[key] = fails + 1;
        }
        publishStatus(unlocked, still, eligibleSubtotal(nextCart));
        var retryable = still.filter(function (g) {
          return !giftIsLatched(campaignId, ajaxVariantId(g && g.variantId), nextCart);
        });
        return {
          changed: fastChanged || !!(acc && acc.any),
          missing: still,
          shouldRetry: (manualClaim === true || ws.autoAddGift !== false) && retryable.length > 0 && !isRateLimited(),
          // The section HTML was applied inside the gift POST. Server
          // confirmation runs after this returns, and a retry already
          // re-reads eligibility, so it must not also verify.
          verify: (manualClaim === true || ws.autoAddGift !== false) && retryable.length > 0 ? false : verify,
        };
      });
    }

    var loadCart = seeded
      ? Promise.resolve(seeded)
      : fetchCart().then(function (cart) {
          if (!cart || currentCartUiGen() !== syncGen) {
            if (currentCartUiGen() !== syncGen) queued = true;
            return null;
          }
          return rememberCart(cart);
        });

    return loadCart.then(function (cart) {
      if (!cart || currentCartUiGen() !== syncGen) {
        if (currentCartUiGen() !== syncGen) queued = true;
        return { changed: false };
      }
      if (seeded) paintKnownCart(cart, syncGen);
      if (cachedEligibilityUsable(cart)) return planWith(cart, campaignWs(), false);
      return fetchWidgetState(eligibleSubtotal(cart), cart.currency || shopCurrency(), syncGen).then(function (ws) {
        if (currentCartUiGen() !== syncGen) {
          queued = true;
          return { changed: false };
        }
        return planWith(lastKnownCart || cart, ws, true);
      });
    })
      .catch(function () {
        return { changed: fastChanged };
      })
      .then(function (result) {
        mutating = false;
        suppressEvents = false;
        if (aborted) return;
        if (result && result.changed) notifyAfterMutation();
        if (result && result.verify && currentCartUiGen() === result.verify.gen) {
          verifyCachedEligibility(result.verify.gen);
        }
        if (result && result.shouldRetry) {
          schedule(RETRY_MISSING_MS);
        } else if (queued && !isRateLimited()) {
          queued = false;
          schedule();
        } else {
          queued = false;
        }
      });
  }

  function schedule(delayMs) {
    if (aborted || isRateLimited()) return;
    var delay = delayMs == null ? DEBOUNCE_MS : delayMs;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      syncOnce();
    }, delay);
  }

  function onCartMutation(e) {
    if (aborted) return;
    if (Date.now() - lastNativeAt < 800) return;
    // Queue while muted so theme PubSub during section apply is not dropped.
    if (suppressEvents || mutating || processing) {
      queued = true;
      return;
    }
    schedule();
  }

  function claimGifts() {
    // The manual claim button is the one gift path a shopper can trigger directly,
    // so it refuses here rather than relying on the planner's dry-run branch.
    if (!can("mutateGifts")) {
      noteDiag("gift-claim-refused", { stage: rt().stage });
      return Promise.resolve({ ok: false, stageBlocked: true, missing: [] });
    }
    unlockLocalRateLimit();
    if (mutating) return Promise.resolve({ ok: false, busy: true });
    // An explicit shopper click overrides the latch: the latch exists to stop
    // automatic re-adds, not to refuse a deliberate retry.
    clearGiftSafetyLatches("manual-claim");
    lastAddError = null;
    lastPlanKey = "";
    return syncOnce(true).then(function () {
      var st = window.__fgpbTierStatus || {};
      var miss = (st.missing && st.missing.length) || 0;
      return {
        ok: miss === 0 && !isRateLimited(),
        missing: st.missing || [],
        rateLimited: isRateLimited(),
        reason: lastAddError && lastAddError.message,
      };
    });
  }

  /** Dawn / OS 2.0 themes publish cart updates via PubSub, not DOM CustomEvents. */
  function installPubSubBridge() {
    if (typeof window === "undefined") return;

    // Wrap publish — more reliable than subscribe (survives load-order races).
    if (typeof window.publish === "function" && !window.__fgpbPublishWrapped) {
      window.__fgpbPublishWrapped = true;
      var originalPublish = window.publish;
      window.publish = function (eventName, data) {
        var ret = originalPublish.apply(this, arguments);
        try {
          var cartEv =
            (window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) || "cart-update";
          if (
            eventName === cartEv ||
            eventName === "cart-update" ||
            eventName === "cart-updated"
          ) {
            onCartMutation();
          }
        } catch (_e) {}
        return ret;
      };
    }

    if (typeof window.subscribe !== "function") return;
    var names = [];
    try {
      if (window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) {
        names.push(window.PUB_SUB_EVENTS.cartUpdate);
      }
    } catch (_e) {}
    names.push("cart-update", "cart-updated");
    var seen = {};
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (!name || seen[name]) continue;
      seen[name] = true;
      try {
        window.subscribe(name, function () {
          onCartMutation();
        });
      } catch (_e2) {}
    }
  }

  /**
   * Sections were already applied from the mutation response inside cartPost.
   * This only announces the change; it deliberately does not issue a second
   * `/?sections=` GET, because that HTML is a different cart version than the one
   * Dawn just rendered.
   */
  function notifyAfterMutation() {
    suppressEvents = true;
    try {
      var mutationId =
        "fgpb-sync-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      document.dispatchEvent(new CustomEvent("fgpb:cart", { detail: { mutationId: mutationId } }));
      document.dispatchEvent(new CustomEvent("cart:updated", { detail: { mutationId: mutationId } }));
    } catch (_e) {}
    setTimeout(function () {
      suppressEvents = false;
    }, 200);
  }

  function install() {
    if (installed || aborted || typeof window === "undefined") return;
    if (inThemeEditor()) return;
    // Stage 3 and below: no eligibility evaluation, no gift work at all.
    if (!can("evaluateGifts")) return;
    installed = true;
    unlockLocalRateLimit();
    window.__fgpbClaimTierGifts = claimGifts;
    window.__fgpbUnlockTierSync = unlockLocalRateLimit;
    document.addEventListener("cart:change", function (e) {
      onCartMutation(e);
    });
    document.addEventListener("cart:updated", function (e) {
      onCartMutation(e);
    });
    document.addEventListener("fgpb:cart", function (e) {
      onCartMutation(e);
    });
    document.addEventListener("shopify:cart:change", function (e) {
      onCartMutation(e);
    });
    installPubSubBridge();
    // Boot reconcile (add unlocked / remove locked leftovers).
    schedule(80);
  }

  installNativeCartInterceptor();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
