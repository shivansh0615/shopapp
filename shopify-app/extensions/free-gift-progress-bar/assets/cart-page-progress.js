/* Cart-page progress strip — presentation inspired by compact cart promo rails.
   Same widget-state / gift runtime as the product card. No gift business logic here. */
(function () {
  // Prevent double-boot when both app embed + section block load this asset.
  if (typeof window !== "undefined" && window.__FGPB_CPP_BOOTED) return;

  /**
   * Isolation stage gate. fgpb-runtime.js owns the real flags; if it failed to
   * load we fall back to the same safe defaults rather than assuming full
   * behaviour, so a missing asset can never re-enable cart mutations.
   */
  function rt() {
    var api = typeof window !== "undefined" ? window.__FGPB_RT : null;
    return (api && api.flags) || {
      stage: 4,
      enabled: true,
      readCart: true,
      renderProgress: true,
      progressRecovery: true,
      evaluateGifts: true,
      mutateGifts: false,
      optimisticPaint: false,
      recommendations: false,
      applyDawnSections: false,
    };
  }
  function can(capability) {
    return !!rt()[capability];
  }
  // Stage 0: leave Dawn completely native.
  if (!can("enabled")) return;

  if (typeof window !== "undefined") {
    window.__FGPB_CPP_BOOTED = true;
    window.__FGPB_CPP = {
      v: 142,
      t: Date.now(),
      perf: {
        sync: 0,
        cartJs: 0,
        widgetState: 0,
        paintFull: 0,
        paintSkip: 0,
        proxySkip: 0,
        proxyStale: 0,
      },
    };
  }

  var SEL = ".fgpb-progress-card[data-cp], .fgpb-progress-card[data-fg-strip]";
  var GIFT_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M20 7h-2.18A3 3 0 0 0 15 4a3 3 0 0 0-2.82 2H11.8A3 3 0 0 0 9 4a3 3 0 0 0-2.82 3H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1ZM9 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM3 12v7a2 2 0 0 0 2 2h6v-9H3Zm10 9h6a2 2 0 0 0 2-2v-7h-8v9Z"/>' +
    "</svg>";
  var DRAWER_SEL =
    "cart-drawer-component, cart-drawer, #CartDrawer, #cart-drawer, .cart-drawer, [data-cart-drawer], .mini-cart, #mini-cart, [data-mini-cart], mini-cart, .ajax-cart, #AjaxCart, .sidecart, #sidecart";
  /** Freshness window for proxySkip (same cart signature). No polling — event/visibility driven. */
  var PROXY_CACHE_TTL_MS = 45000;

  var lastCfg = null;
  var lastRecsCfg = null;
  var lastPaintKey = "";
  var lastCartSnapshot = null;
  var lastCartSyncToken = "";
  var proxyCacheAt = 0;
  var lastDesignKey = "";
  var lastPaintedGen = 0;
  var lastFillPct = 0;
  var cachedDrawer = null;
  var painting = false;
  var booted = false;
  var parkedDrawerStrip = null;
  var parkedDrawerRecs = null;
  var syncTimer = null;
  var syncInFlight = null;
  var syncQueued = false;
  var syncSeq = 0;
  var pinning = false;
  var pendingRepin = false;
  var lastPinAt = 0;
  var drawerObs = null;
  var keepAliveTimers = [];
  /** Set by syncEmptyCartChrome from /cart.js item_count. Gate all remount/show paths. */
  var cartIsEmpty = false;
  /** After product ATC, treat the drawer as opening so we do not park/hide mid-animation. */
  var expectDrawerOpenUntil = 0;

  function markExpectDrawerOpen() {
    expectDrawerOpenUntil = Date.now() + 2500;
    cartIsEmpty = false;
  }

  function drawerShouldShow(root) {
    if (Date.now() < expectDrawerOpenUntil) return true;
    return isDrawerOpen(root);
  }

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

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function str(v, fallback) {
    var s = v == null ? "" : String(v).trim();
    return s || fallback;
  }

  function onCartPage() {
    return /\/cart\/?$/i.test(String(location.pathname || ""));
  }

  /** Hide theme Product/Total column headers under the gift strip. */
  function hideCartColumnHeaders() {
    if (!onCartPage()) return;
    var roots = document.querySelectorAll(
      "#main-cart-items, [id^='main-cart-items'], .cart-items, cart-items",
    );
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      if (inDrawer(root)) continue;
      var theads = root.querySelectorAll("thead");
      for (var t = 0; t < theads.length; t++) {
        theads[t].style.setProperty("display", "none", "important");
      }
      // Some themes render a non-table header row with Product / Total copy.
      var candidates = root.querySelectorAll(
        ".cart-items__heading, .cart__header, [class*='cart-items'] > .caption-with-letter-spacing",
      );
      for (var c = 0; c < candidates.length; c++) {
        var el = candidates[c];
        var label = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (label.indexOf("product") !== -1 && label.indexOf("total") !== -1) {
          el.style.setProperty("display", "none", "important");
        }
      }
    }
  }

  function inDrawer(el) {
    if (!el || !el.closest) return false;
    return !!(
      el.closest("cart-drawer") ||
      el.closest("#CartDrawer") ||
      el.closest("#cart-drawer") ||
      el.closest(".cart-drawer") ||
      el.closest(".mini-cart") ||
      el.closest("#mini-cart") ||
      el.closest("[data-cart-drawer]") ||
      el.closest("[data-mini-cart]") ||
      el.closest(".ajaxcart") ||
      el.closest("#Cart") ||
      el.closest("[data-fgpb-cart-host]")
    );
  }

  function shopCurrency() {
    try {
      if (lastCartSnapshot && lastCartSnapshot.currency) return String(lastCartSnapshot.currency);
      if (lastCfg && lastCfg.currency) return String(lastCfg.currency);
      if (typeof window !== "undefined" && window.__fgpbLastKnownCart && window.__fgpbLastKnownCart.currency) {
        return String(window.__fgpbLastKnownCart.currency);
      }
      if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
        return String(window.Shopify.currency.active);
      }
    } catch (_e) {}
    return "";
  }

  function presentmentRate() {
    try {
      var rate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate);
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (_e) {}
    return 1;
  }

  function formatAmount(n) {
    var amt = Math.max(0, Number(n) || 0);
    var rounded = Math.round(amt * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
    return rounded.toFixed(2);
  }

  function formatMoneyLabel(n, _currency) {
    return formatAmount(n);
  }

  function formatThreshold(n, currency) {
    if (!Number.isFinite(n) || n <= 0) return "";
    return formatMoneyLabel(n, currency);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function variantNum(id) {
    var raw = String(id || "");
    if (/ProductVariant\//.test(raw)) raw = raw.split("/").pop() || "";
    if (/^\d+$/.test(raw)) return raw;
    var m = raw.match(/(\d+)$/);
    return m ? m[1] : "";
  }

  function money(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) return "";
    return formatMoneyLabel(n, shopCurrency());
  }

  function discountPct(price, compareAt) {
    var p = Number(price);
    var c = Number(compareAt);
    if (!Number.isFinite(p) || !Number.isFinite(c) || c <= p || c <= 0) return 0;
    return Math.max(1, Math.round(((c - p) / c) * 100));
  }

  /** Skip header cart buttons / links that some themes mark with drawer selectors. */
  function isPlausibleDrawer(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === "a" || tag === "button" || tag === "svg") return false;
    if (el.id === "cart-icon-bubble") return false;
    try {
      if (el.getAttribute && el.getAttribute("data-fgpb-surface-owner") === "compat") return false;
      if (el.closest && el.closest('[data-fgpb-surface-owner="compat"]')) return false;
      var compat = typeof window !== "undefined" ? window.__fgpbDrawerCompat : null;
      if (compat && typeof compat.ownsSurface === "function" && compat.ownsSurface(el)) return false;
    } catch (_e) {}
    return true;
  }

  /** Theme-agnostic cart drawer / mini-cart root. */
  function findDrawer() {
    if (cachedDrawer && cachedDrawer.isConnected && isPlausibleDrawer(cachedDrawer)) return cachedDrawer;
    var nodes = document.querySelectorAll(DRAWER_SEL);
    for (var i = 0; i < nodes.length; i++) {
      if (isPlausibleDrawer(nodes[i])) {
        cachedDrawer = nodes[i];
        return cachedDrawer;
      }
    }
    cachedDrawer = null;
    return null;
  }

  function invalidateDrawerCache() {
    cachedDrawer = null;
  }

  function drawerOpenFlags(el) {
    if (!el) return false;
    try {
      if (el.classList) {
        if (el.classList.contains("active")) return true;
        if (el.classList.contains("is-open")) return true;
        if (el.classList.contains("open")) return true;
      }
      if (el.hasAttribute && el.hasAttribute("open") && el.getAttribute("open") !== "false") return true;
      if (typeof HTMLDialogElement !== "undefined" && el instanceof HTMLDialogElement && el.open) return true;
      if (el.getAttribute && el.getAttribute("aria-hidden") === "false") return true;
    } catch (_e) {}
    return false;
  }

  function isDrawerOpen(root) {
    var drawer = root || findDrawer();
    if (!drawer) return false;
    if (drawerOpenFlags(drawer)) return true;
    if (drawer.closest) {
      var host = drawer.closest("cart-drawer");
      if (host && drawerOpenFlags(host)) return true;
    }
    var parent = drawer.parentElement;
    if (parent && drawerOpenFlags(parent)) return true;
    return false;
  }

  /**
   * Closed drawers stay off-screen via theme CSS. Do not set visibility:visible
   * on the strip — that punches through Dawn's visibility:hidden host (CSS spec)
   * and leaks a sliver under the cart icon.
   */
  function drawerPark() {
    var park = document.getElementById("fgpb-drawer-park");
    if (park) return park;
    park = document.createElement("div");
    park.id = "fgpb-drawer-park";
    park.hidden = true;
    park.setAttribute("aria-hidden", "true");
    park.style.cssText =
      "display:none!important;position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
    (document.body || document.documentElement).appendChild(park);
    return park;
  }

  function parkNode(node) {
    if (!node) return;
    node.removeAttribute("data-fgpb-open");
    node.hidden = true;
    try {
      drawerPark().appendChild(node);
    } catch (_e) {
      node.remove();
    }
  }

  function isParked(node) {
    if (!node) return false;
    if (!node.isConnected) return true;
    return !!(node.closest && node.closest("#fgpb-drawer-park"));
  }

  /** Closed drawers must not contain our chrome — Dawn paints the sliding panel anyway. */
  function parkClosedDrawerChrome(drawer) {
    drawer = drawer || findDrawer();
    if (!drawer || drawerShouldShow(drawer)) return;
    var nodes = drawer.querySelectorAll(
      ".fgpb-progress-card[data-fg-drawer], .fgpb-progress-card[data-fg-strip], [data-fgpb-recs='drawer']",
    );
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-fg-drawer") === "1" || nodes[i].getAttribute("data-fgpb-recs") === "drawer") {
        if (isOwnedDrawerStrip(nodes[i]) || nodes[i].getAttribute("data-fgpb-recs") === "drawer") {
          if (nodes[i].getAttribute("data-fg-drawer") === "1") parkedDrawerStrip = nodes[i];
          else parkedDrawerRecs = nodes[i];
          parkNode(nodes[i]);
        } else {
          nodes[i].remove();
        }
      }
    }
  }

  function syncDrawerOpenAttr() {
    var drawer = findDrawer();
    if (!drawer) return;
    var open = drawerShouldShow(drawer);
    if (!open) {
      parkClosedDrawerChrome(drawer);
      return;
    }
    var nodes = drawer.querySelectorAll(".fgpb-progress-card[data-fg-drawer], [data-fgpb-recs='drawer']");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute("data-fgpb-open", "1");
      nodes[i].hidden = false;
    }
  }

  function findDrawerHeader(drawer) {
    if (!drawer) return null;
    return drawer.querySelector(
      ".drawer__header, .cart-drawer__header, .mini-cart__header, [data-cart-drawer-header], .ajaxcart__header",
    );
  }

  function findDrawerItemsHost(drawer) {
    if (!drawer) return null;
    return drawer.querySelector(
      "cart-drawer-items, #CartDrawer-CartItems, .cart-drawer-items, .drawer__cart-items-wrapper, [data-cart-items], .mini-cart__items, .ajaxcart__products, .cart-items, [data-cart-item-list]",
    );
  }

  function matchDrawerItemsHost(drawer, nextItems) {
    if (!drawer || !nextItems) return null;
    var id = nextItems.id;
    if (id) {
      var byId = document.getElementById(id);
      if (byId && drawer.contains(byId)) return byId;
    }
    if (String(nextItems.tagName || "").toLowerCase() === "cart-drawer-items") {
      return drawer.querySelector("cart-drawer-items");
    }
    return findDrawerItemsHost(drawer);
  }

  function hostHasCartRows(el) {
    return !!(
      el &&
      el.querySelector &&
      el.querySelector(".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-']")
    );
  }

  function footerHasCheckout(el) {
    if (!el || !el.querySelector) return false;
    if (el.querySelector('[name="checkout"], #CartDrawer-Checkout, .cart__checkout-button')) {
      return true;
    }
    var nodes = el.querySelectorAll("button, a");
    for (var i = 0; i < nodes.length; i++) {
      if (/check\s*out/i.test(nodes[i].textContent || "")) return true;
    }
    return false;
  }

  function stripForeignCartChrome(root) {
    if (!root || !root.querySelectorAll) return;
    var junk = root.querySelectorAll(
      ".title-wrapper-with-link, #main-cart-items, [id^='main-cart-items'], #main-cart-footer, [id^='main-cart-footer']",
    );
    for (var i = 0; i < junk.length; i++) {
      try {
        junk[i].remove();
      } catch (_e) {}
    }
  }

  function findDrawerFooter(drawer) {
    if (!drawer) return null;
    return drawer.querySelector(
      ".drawer__footer, cart-drawer-footer, [data-cart-footer], .mini-cart__footer, .ajaxcart__footer, .cart-drawer__footer",
    );
  }

  function findFooter() {
    return document.querySelector(
      "#main-cart-footer, [id^=\"main-cart-footer\"], .cart__footer, .cart-footer, [data-cart-footer], .cart__ctas",
    );
  }

  function findMountPoint() {
    if (!onCartPage()) return null;
    var el = window.__FGPB_THEME
      ? window.__FGPB_THEME.cartAnchor()
      : document.querySelector(
          "#main-cart-items, [id^=\"main-cart-items\"], .cart__items, cart-items, [data-cart-items], #cartform, form[action='/cart']",
        );
    if (el && inDrawer(el)) return null;
    return el;
  }

  /** Dawn cart-items host — never the cart <form> cartAnchor() returns. */
  function findCartPageItemsHost() {
    if (!onCartPage()) return null;
    var el = document.querySelector("#main-cart-items, [id^=\"main-cart-items\"], cart-items");
    if (el && inDrawer(el)) return null;
    return el;
  }

  var RECS_DISMISS_KEY = "fgpb_recs_drawer_dismissed";

  function isDrawerRecsDismissed() {
    try {
      return sessionStorage.getItem(RECS_DISMISS_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function setDrawerRecsDismissed(on) {
    try {
      if (on) sessionStorage.setItem(RECS_DISMISS_KEY, "1");
      else sessionStorage.removeItem(RECS_DISMISS_KEY);
    } catch (_e) {}
  }

  function hideDrawerRecsSection(section) {
    if (!section) return;
    section.hidden = true;
    section.classList.add("fgpb-hide-empty");
    section.setAttribute("data-fgpb-recs-dismissed", "1");
    // Beat prior show paths that set display:block !important.
    section.style.setProperty("display", "none", "important");
  }

  function dismissDrawerRecs(section) {
    setDrawerRecsDismissed(true);
    hideDrawerRecsSection(section);
    var drawer = findDrawer();
    if (drawer) {
      var nodes = drawer.querySelectorAll("[data-fgpb-recs]");
      for (var i = 0; i < nodes.length; i++) hideDrawerRecsSection(nodes[i]);
    }
  }

  function createRecsSection(where) {
    var section = document.createElement("section");
    section.className = "fgpb-recs" + (where === "drawer" ? " fgpb-recs--drawer" : "");
    section.setAttribute("data-fgpb-recs", where);
    section.setAttribute("data-fgpb-recs-ready", "1");
    section.setAttribute("aria-live", "polite");
    section.hidden = true;
    var closeBtn =
      where === "drawer"
        ? '<button type="button" class="fgpb-recs__close" data-fgpb-recs-close aria-label="Hide bestsellers">&times;</button>'
        : "";
    section.innerHTML =
      '<div class="fgpb-recs__header">' +
      '<div class="fgpb-recs__header-text"><h2 class="fgpb-recs__heading">Bestsellers</h2><p class="fgpb-recs__description"></p></div>' +
      closeBtn +
      "</div>" +
      '<div class="fgpb-recs__grid" data-fgpb-recs-grid role="list"></div>';
    return section;
  }

  function mountBestsellersInDrawer(drawer, section) {
    if (!drawer || !section || !can("recommendations")) return;
    // MUST stay outside cart-drawer-items — Dawn replaces that host's innerHTML on qty/remove.
    var itemsHost = findDrawerItemsHost(drawer);
    if (itemsHost && itemsHost.parentNode) {
      if (section.parentNode === itemsHost.parentNode && itemsHost.nextSibling === section) return;
      itemsHost.parentNode.insertBefore(section, itemsHost.nextSibling);
      return;
    }
    var footer = findDrawerFooter(drawer);
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(section, footer);
      return;
    }
    // Never append to <cart-drawer> — that is a flex sibling of .drawer__inner
    // and collapses Dawn's sliding panel into a narrow fragment.
  }

  function ensureBestsellersPage() {
    if (!onCartPage()) return null;
    var existing = document.querySelector('[data-fgpb-recs="page"]');
    if (existing) return existing;

    var items = findMountPoint();
    var footer = findFooter();
    var section = createRecsSection("page");

    if (footer && footer.parentNode && !inDrawer(footer)) {
      footer.parentNode.insertBefore(section, footer);
    } else if (items && items.parentNode && !inDrawer(items)) {
      if (items.nextSibling) items.parentNode.insertBefore(section, items.nextSibling);
      else items.parentNode.appendChild(section);
    } else {
      return null;
    }
    return section;
  }

  function ensureBestsellersDrawer() {
    if (isDrawerRecsDismissed()) return null;
    var drawer = findDrawer();
    if (!drawer) return null;
    if (!drawerShouldShow(drawer)) {
      parkClosedDrawerChrome(drawer);
      return parkedDrawerRecs || null;
    }

    var existing = drawer.querySelector('[data-fgpb-recs="drawer"]') || drawer.querySelector("[data-fgpb-recs]");
    if (existing) {
      parkedDrawerRecs = existing;
      var itemsHost = findDrawerItemsHost(drawer);
      if (itemsHost && itemsHost.contains(existing)) {
        mountBestsellersInDrawer(drawer, existing);
      } else if (!drawer.contains(existing)) {
        mountBestsellersInDrawer(drawer, existing);
      }
      if (!existing.querySelector("[data-fgpb-recs-close]")) {
        var header = existing.querySelector(".fgpb-recs__header");
        if (header && !header.querySelector(".fgpb-recs__close")) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "fgpb-recs__close";
          btn.setAttribute("data-fgpb-recs-close", "");
          btn.setAttribute("aria-label", "Hide bestsellers");
          btn.innerHTML = "&times;";
          header.appendChild(btn);
        }
      }
      existing.hidden = false;
      existing.classList.remove("fgpb-hide-empty");
      existing.removeAttribute("data-fgpb-recs-dismissed");
      return existing;
    }

    var section =
      parkedDrawerRecs && isParked(parkedDrawerRecs) ? parkedDrawerRecs : createRecsSection("drawer");
    if (section.isConnected && !drawer.contains(section) && !isParked(section)) {
      section = createRecsSection("drawer");
    }
    section.setAttribute("data-fgpb-recs", "drawer");
    section.hidden = false;
    section.classList.remove("fgpb-hide-empty");
    section.removeAttribute("data-fgpb-recs-dismissed");
    mountBestsellersInDrawer(drawer, section);
    parkedDrawerRecs = section;
    syncDrawerOpenAttr();
    return section;
  }

  /** Re-insert bestsellers in the same turn Dawn wipes drawer line items. */
  function pinDrawerRecsNow() {
    if (!can("recommendations")) return null;
    if (cartIsEmpty) return null;
    if (isDrawerRecsDismissed()) return null;
    if (!lastRecsCfg || lastRecsCfg.enabled === false) return null;
    var drawer = findDrawer();
    if (!drawer) return null;
    if (!drawerShouldShow(drawer)) {
      parkClosedDrawerChrome(drawer);
      return parkedDrawerRecs || null;
    }

    var existing = drawer.querySelector('[data-fgpb-recs="drawer"]') || drawer.querySelector("[data-fgpb-recs]");
    if (existing) {
      parkedDrawerRecs = existing;
      syncDrawerOpenAttr();
      return existing;
    }

    var section = parkedDrawerRecs && isParked(parkedDrawerRecs) ? parkedDrawerRecs : null;
    if (section) {
      section.hidden = false;
      section.classList.remove("fgpb-hide-empty");
      section.style.removeProperty("display");
      mountBestsellersInDrawer(drawer, section);
      parkedDrawerRecs = section;
      syncDrawerOpenAttr();
      return section;
    }

    // Fresh mount + fill from last known config (no network).
    renderBestsellers(lastRecsCfg);
    return drawer.querySelector("[data-fgpb-recs]");
  }

  var recsBusy = Object.create(null);

  function applyCartIconBubble(sections) {
    if (!sections || !sections["cart-icon-bubble"]) return;
    var icon =
      document.getElementById("cart-icon-bubble") ||
      document.querySelector("[data-cart-icon]") ||
      document.querySelector(".cart-count-bubble") ||
      document.querySelector("a[href='/cart']");
    if (!icon) return;
    var parsed = new DOMParser().parseFromString(sections["cart-icon-bubble"], "text/html");
    var bubble = parsed.querySelector("#cart-icon-bubble") || parsed.body.firstElementChild;
    if (bubble && icon.id === "cart-icon-bubble") icon.innerHTML = bubble.innerHTML;
  }

  function liveCartForDom() {
    try {
      if (typeof window !== "undefined" && window.__fgpbLastKnownCart) {
        return window.__fgpbLastKnownCart;
      }
    } catch (_e) {}
    return lastCartSnapshot;
  }

  function pickSectionHtml(sections, el, fallbackKeys) {
    if (!sections) return "";
    var id =
      el && typeof el.getAttribute === "function"
        ? String(el.getAttribute("data-id") || el.getAttribute("data-section-id") || "").trim()
        : "";
    if (id && sections[id]) return sections[id];
    var keys = typeof fallbackKeys === "string" ? [fallbackKeys] : fallbackKeys || [];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] && sections[keys[i]]) return sections[keys[i]];
    }
    return "";
  }

  function applyCartPageSectionHtml(curHost, html, cartForStyle) {
    if (!curHost || !html) return false;
    var doc = new DOMParser().parseFromString(html, "text/html");
    var liveInner = curHost.querySelector(".js-contents");
    var parsedInner = doc.querySelector(".js-contents");
    if (liveInner && parsedInner) {
      styleGiftRowsInRoot(parsedInner, cartForStyle);
      liveInner.innerHTML = parsedInner.innerHTML;
      return true;
    }
    var nextHost =
      doc.getElementById("main-cart-items") ||
      doc.getElementById("main-cart-footer") ||
      doc.querySelector('[id^="main-cart-items"]') ||
      doc.querySelector('[id^="main-cart-footer"]') ||
      doc.querySelector("cart-items") ||
      doc.body.firstElementChild;
    if (!nextHost) return false;
    styleGiftRowsInRoot(nextHost, cartForStyle);
    curHost.innerHTML = nextHost.innerHTML;
    return true;
  }

  function applyGiftSyncChromeOnly(sections) {
    ensureGiftChromeStyles();
    applyCartIconBubble(sections);
    try {
      scheduleProgressHostRecover();
    } catch (_e) {}
    var cartForStyle = liveCartForDom();
    styleGiftRowsInRoot(document, cartForStyle);
    pruneStaleCartRows(cartForStyle);
  }

  /**
   * Refresh Dawn's own line list after an UpsellTrix gift mutation.
   *
   * This is the ONLY path where UpsellTrix writes Dawn cart markup, and it exists
   * because a gift line we added is otherwise invisible until the next Dawn
   * render — which previously forced a synthetic "optimistic" row that made the
   * visible cart disagree with checkout.
   *
   * Constraints that keep it safe:
   * - only ever runs for a mutation UpsellTrix itself performed
   * - re-checks the generation at apply time, so a customer qty/remove that
   *   landed while we were POSTing always wins
   * - replaces only the contents of Dawn's own containers, never <cart-drawer>
   *   itself, so Dawn's custom-element wiring and loading state survive
   */
  function applyConfirmedGiftSections(sections, startedGen) {
    if (!sections) return false;
    var liveGen = typeof window !== "undefined" ? Number(window.__fgpbCartUiGen) || 0 : 0;
    if (startedGen != null && Number(startedGen) !== liveGen) return false;
    var drawer = findDrawer();
    try {
      var compat = typeof window !== "undefined" ? window.__fgpbDrawerCompat : null;
      if (drawer && compat) {
        var owned =
          (typeof compat.ownsSurface === "function" && compat.ownsSurface(drawer)) ||
          (drawer.getAttribute && drawer.getAttribute("data-fgpb-surface-owner") === "compat");
        if (owned) drawer = null;
      }
    } catch (_e) {}
    var wrote = false;
    var cartForStyle = liveCartForDom();
    if (drawer && (!window.__FGPB_THEME || window.__FGPB_THEME.isDawnDrawer(drawer)) && sections["cart-drawer"]) {
      var next = new DOMParser()
        .parseFromString(sections["cart-drawer"], "text/html")
        .querySelector("cart-drawer, #CartDrawer, .cart-drawer, [data-cart-drawer]");
      var nextItems = next
        ? next.querySelector("cart-drawer-items") ||
          next.querySelector("#CartDrawer-CartItems") ||
          next.querySelector(".cart-drawer-items")
        : null;
      var curItems = matchDrawerItemsHost(drawer, nextItems) || findDrawerItemsHost(drawer);
      var hasItems = Number(cartForStyle.item_count) > 0;
      if (nextItems && curItems) {
        stripForeignCartChrome(nextItems);
        // Stale empty section HTML must not wipe a live cart or inject /cart
        // "Your cart" / Continue shopping chrome into the drawer.
        if (!hasItems || hostHasCartRows(nextItems)) {
          styleGiftRowsInRoot(nextItems, cartForStyle);
          curItems.innerHTML = nextItems.innerHTML;
          wrote = true;
        }
      }
      var nextFooter = next ? findDrawerFooter(next) : null;
      var curFooter = findDrawerFooter(drawer);
      if (nextFooter && curFooter) {
        if (!hasItems || footerHasCheckout(nextFooter)) {
          curFooter.innerHTML = nextFooter.innerHTML;
          wrote = true;
        } else {
          var nt = nextFooter.querySelector(".totals__total-value");
          var ct = curFooter.querySelector(".totals__total-value");
          if (nt && ct) {
            ct.innerHTML = nt.innerHTML;
            wrote = true;
          }
        }
      }
    }
    if (onCartPage()) {
      var curMain = findCartPageItemsHost();
      var mainHtml = pickSectionHtml(sections, curMain, ["main-cart-items", "cart-items"]);
      if (curMain && mainHtml && applyCartPageSectionHtml(curMain, mainHtml, cartForStyle)) {
        wrote = true;
      }
      var curFoot =
        document.getElementById("main-cart-footer") ||
        document.querySelector('[id^="main-cart-footer"]');
      var footHtml = pickSectionHtml(sections, curFoot, ["main-cart-footer", "cart-footer"]);
      if (curFoot && footHtml && applyCartPageSectionHtml(curFoot, footHtml, cartForStyle)) {
        wrote = true;
      }
    }
    pruneStaleCartRows(cartForStyle);
    scheduleStaleRowPrune();
    syncDawnCartChrome(cartForStyle);
    if (wrote) {
      applyCartIconBubble(sections);
      styleGiftRowsInRoot(document, cartForStyle);
      try {
        scheduleProgressHostRecover();
      } catch (_e) {}
    }
    return wrote;
  }

  /**
   * Dawn owns its cart markup. UpsellTrix applies chrome only; the section HTML
   * a caller hands us was fetched at a different instant than Dawn's own render,
   * so writing it back is how the visible cart drifts from the authoritative one.
   */
  function applyCartSections(sections, opts) {
    if (!sections) return;
    opts = opts || {};
    var liveGen = typeof window !== "undefined" ? Number(window.__fgpbCartUiGen) || 0 : 0;
    // Late HTML must not clobber a newer shopper qty/remove.
    if (opts.cartUiGen != null && Number(opts.cartUiGen) !== liveGen) {
      try {
        pinDrawerStripNow();
      } catch (_e) {}
      return;
    }
    if (opts.confirmedGiftMutation && can("mutateGifts")) {
      if (applyConfirmedGiftSections(sections, opts.cartUiGen)) return;
    }
    applyGiftSyncChromeOnly(sections);
  }

  // Shared with tiered-gift-sync.js — do not duplicate section DOM apply logic there.
  if (typeof window !== "undefined") {
    window.__fgpbApplyCartSections = applyCartSections;
    window.__fgpbCartSections =
      "cart-drawer,cart-icon-bubble,main-cart-items,main-cart-footer";
    window.__fgpbStyleGiftRowsNow = function () {
      styleGiftRowsInRoot(document, liveCartForDom());
    };
    window.__fgpbPaintFromCart = function (cart, opts) {
      paintFromCartNow(cart, opts);
    };
    window.__fgpbMarkDrawerBusy = markExpectDrawerOpen;
    window.__fgpbHideGiftRowsNow = hideGiftRowsNow;
    window.__fgpbUpsertOptimisticGift = upsertOptimisticGiftRow;
    window.__fgpbSyncDawnCartChrome = function () {
      syncDawnCartChrome(liveCartForDom());
    };
    window.__fgpbCartPageMissingKeys = function (items) {
      if (!onCartPage() || !items || !items.length) return false;
      var host = findCartPageItemsHost();
      if (!host) return true;
      var present = {};
      var rows = host.querySelectorAll(".cart-item, [id^='CartItem-']");
      for (var i = 0; i < rows.length; i++) {
        var key = lineKeyFromRow(rows[i]);
        if (key) present[key] = true;
      }
      for (var j = 0; j < items.length; j++) {
        var k = items[j] && items[j].key;
        if (k && !present[String(k)]) return true;
      }
      return false;
    };
  }

  function addRecsVariant(variantId) {
    if (!can("recommendations")) return Promise.reject(new Error("recommendations-disabled"));
    var id = Number(variantId);
    if (!id) return Promise.reject(new Error("id"));
    var item = { id: id, quantity: 1 };
    var withSections = {
      items: [item],
      sections: "cart-drawer,cart-icon-bubble",
      sections_url: String(location.pathname || "/"),
    };
    function post(body) {
      return fetch("/cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      }).then(function (r) {
        if (!r.ok) {
          return r
            .json()
            .catch(function () {
              return null;
            })
            .then(function (err) {
              throw Object.assign(new Error((err && (err.description || err.message)) || "add"), {
                status: r.status,
              });
            });
        }
        return r.json();
      });
    }
    return post(withSections)
      .catch(function () {
        return post({ items: [item] });
      })
      .then(function (data) {
        if (data && data.sections) {
          applyCartSections(data.sections);
          return data;
        }
        return fetch(
          "/?sections=cart-drawer,cart-icon-bubble&_cs=" + Date.now(),
          { credentials: "same-origin", headers: { Accept: "application/json" } },
        )
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (sections) {
            applyCartSections(sections);
            return data;
          })
          .catch(function () {
            return data;
          });
      })
      .then(function (data) {
        if (lastRecsCfg) renderBestsellers(lastRecsCfg);
        var mutationId =
          "fgpb-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        document.dispatchEvent(
          new CustomEvent("cart:updated", { detail: { cart: data, mutationId: mutationId } }),
        );
        document.dispatchEvent(new CustomEvent("cart:change", { detail: { mutationId: mutationId } }));
        return data;
      });
  }

  function fillBestsellersRoot(root, cfg, products, btnLabel, signature) {
    if (!root || !can("recommendations")) return;
    if (root.getAttribute("data-fgpb-recs") === "drawer" && isDrawerRecsDismissed()) {
      hideDrawerRecsSection(root);
      return;
    }
    var grid = root.querySelector("[data-fgpb-recs-grid]");
    if (!grid) return;

    root.hidden = false;
    root.classList.remove("fgpb-hide-empty");
    root.removeAttribute("data-fgpb-recs-dismissed");
    root.setAttribute("data-fgpb-recs-ready", "1");
    var bg = typeof cfg.backgroundColor === "string" && cfg.backgroundColor ? cfg.backgroundColor : "#f7d6de";
    root.style.setProperty("--fgpb-recs-bg", bg);
    root.style.background = bg;

    if (root.getAttribute("data-fgpb-sig") === signature && grid.children.length) {
      return;
    }
    root.setAttribute("data-fgpb-sig", signature);

    var heading = root.querySelector(".fgpb-recs__heading");
    var desc = root.querySelector(".fgpb-recs__description");
    if (heading) heading.textContent = cfg.heading || "Bestsellers";
    if (desc) {
      var text = cfg.description || "";
      desc.textContent = text;
      desc.hidden = !text;
    }
    grid.innerHTML = products
      .map(function (p) {
        var media = p.imageUrl
          ? '<img src="' + esc(p.imageUrl) + '" alt="" loading="lazy" width="156" height="156">'
          : '<span class="fgpb-recs__placeholder" aria-hidden="true"></span>';
        var priceHtml = "";
        if (p.price) {
          var compare =
            p.compareAtPrice && Number(p.compareAtPrice) > Number(p.price) ? p.compareAtPrice : "";
          priceHtml =
            '<p class="fgpb-recs__prices">' +
            (compare ? '<span class="fgpb-recs__compare">' + esc(money(compare)) + "</span>" : "") +
            '<span class="fgpb-recs__price">' +
            esc(money(p.price)) +
            "</span></p>";
        }
        var off = discountPct(p.price, p.compareAtPrice);
        var badge =
          off > 0
            ? '<span class="fgpb-recs__badge">' + off + "% off</span>"
            : '<span class="fgpb-recs__badge" hidden></span>';
        return (
          '<article class="fgpb-recs__card" role="listitem">' +
          '<div class="fgpb-recs__media">' +
          media +
          "</div>" +
          '<div class="fgpb-recs__body">' +
          '<h3 class="fgpb-recs__title">' +
          esc(p.title) +
          "</h3>" +
          priceHtml +
          '<div class="fgpb-recs__footer">' +
          badge +
          '<button type="button" class="fgpb-recs__btn" data-variant="' +
          esc(p.variantId) +
          '">' +
          esc(btnLabel) +
          "</button>" +
          "</div></div></article>"
        );
      })
      .join("");

    if (!root._fgpbRecsBound) {
      root._fgpbRecsBound = true;
      root.addEventListener("click", function (event) {
        var target = event.target;
        if (target && target.nodeType === 3) target = target.parentElement;
        var close = target && target.closest ? target.closest("[data-fgpb-recs-close]") : null;
        if (close && root.contains(close)) {
          event.preventDefault();
          event.stopPropagation();
          dismissDrawerRecs(root);
          return;
        }
        var btn = target && target.closest ? target.closest(".fgpb-recs__btn") : null;
        if (!btn || !root.contains(btn) || btn.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        var id = variantNum(btn.getAttribute("data-variant"));
        if (!id || recsBusy[id]) return;
        recsBusy[id] = true;
        btn.disabled = true;
        var label = btn.textContent;
        btn.textContent = "…";
        addRecsVariant(id)
          .then(function () {
            btn.textContent = "Added";
          })
          .catch(function () {
            btn.textContent = "Retry";
            btn.disabled = false;
          })
          .finally(function () {
            recsBusy[id] = false;
            setTimeout(function () {
              if (!btn.isConnected) return;
              if (btn.textContent === "Added" || btn.textContent === "Retry") {
                btn.textContent = label;
                btn.disabled = false;
              }
            }, 1400);
          });
      });
    }
  }

  function renderBestsellers(cfg) {
    if (!cfg || cfg.enabled !== true || !Array.isArray(cfg.products) || !cfg.products.length) {
      var dead = document.querySelectorAll("[data-fgpb-recs]");
      for (var d = 0; d < dead.length; d++) dead[d].remove();
      return;
    }

    var max = Math.max(2, Math.min(8, Number(cfg.maxProducts) || 4));
    var products = [];
    var seen = Object.create(null);
    for (var i = 0; i < cfg.products.length; i++) {
      var p = cfg.products[i];
      if (!p) continue;
      var vid = variantNum(p.variantId);
      var pid = String(p.productId || "");
      if (!vid || !pid) continue;
      var key = pid + "::" + vid;
      if (seen[key]) continue;
      seen[key] = 1;
      products.push({
        variantId: vid,
        title: p.title || "Product",
        imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : "",
        price: p.price || "",
        compareAtPrice: p.compareAtPrice || "",
      });
      if (products.length >= max) break;
    }
    if (!products.length) {
      var gone = document.querySelectorAll("[data-fgpb-recs]");
      for (var g = 0; g < gone.length; g++) gone[g].remove();
      return;
    }

    var btnLabel = cfg.buttonText || "+ Add";
    var signature =
      String(cfg.heading || "") +
      "|" +
      btnLabel +
      "|" +
      String(cfg.backgroundColor || "") +
      "|" +
      products
        .map(function (p) {
          return p.variantId + ":" + p.price;
        })
        .join(",");
    fillBestsellersRoot(ensureBestsellersPage(), cfg, products, btnLabel, signature);
    fillBestsellersRoot(ensureBestsellersDrawer(), cfg, products, btnLabel, signature);
  }

  function readCfg(data) {
    if (!data || data.enabled === false) return { enabled: false };
    var colors = data.colors || {};
    var ws = data.widgetSettings || {};
    var bar = ws.cartProgressBar || {};
    var gift = data.gift || {};
    var isTiered = data.rewardType === "TIERED_FREE_GIFTS";
    var unlockedCount = Array.isArray(data.unlockedGifts) ? data.unlockedGifts.length : 0;
    var next = data.nextTier || null;
    var defaultBanner = isTiered ? "SHOP MORE, WIN FREEBIES" : "SHOP MORE, WIN FREEBIES";
    var giftTitle = isTiered
      ? next
        ? unlockedCount > 0
          ? "Next gift unlock"
          : "Tier gifts"
        : "All rewards unlocked"
      : str(gift.title, "Free Gift");
    var tiers = Array.isArray(data.rewardTiers) ? data.rewardTiers.slice() : [];
    tiers.sort(function (a, b) {
      return (Number(a.position) || 0) - (Number(b.position) || 0) || Number(a.threshold) - Number(b.threshold);
    });
    var cartSubtotal = num(data.cartSubtotal, 0);
    var heading = str(data.heading, "");
    return {
      enabled: bar.enabled !== false,
      placements: Array.isArray(data.placements) ? data.placements : null,
      h: Math.max(4, Math.min(40, Math.round(num(bar.height, 6)))),
      r: Math.max(0, Math.min(16, Math.round(num(bar.borderRadius, 8)))),
      compact: bar.compact !== false,
      bar: str(colors.barColor || ws.barColor, "#5c4a3a"),
      textColor: str(colors.textColor || ws.textColor, "#1a1a1a"),
      bannerTitle: str(bar.bannerTitle, defaultBanner),
      bannerSubtitle: str(bar.bannerSubtitle, "Free gifts worth unlocking"),
      bannerBg: str(bar.bannerBackgroundColor, ""),
      bannerText: str(bar.bannerTextColor, "#ffffff"),
      bodyBg: str(bar.bodyBackgroundColor, "#ffffff"),
      trackColor: str(bar.trackColor, "#e8e8e8"),
      markBorder: str(bar.markBorderColor, "#cfcfcf"),
      tierLabel: str(bar.tierLabel, "Gift"),
      finalTierLabel: str(bar.finalTierLabel, "Bumper"),
      giftTitle: giftTitle,
      isTiered: isTiered,
      ht: str(ws.heading, ""),
      ds: str(ws.description, ""),
      uh: str(ws.unlockedHeading, ""),
      ud: str(ws.unlockedDescription, ""),
      threshold: num(data.threshold, 0),
      thresholdLabel: formatThreshold(num(data.threshold, 0), str(data.currency, "")),
      rewardTiers: tiers,
      cartSubtotal: cartSubtotal,
      heading: heading,
      remaining: num(data.remaining, 0),
      progress: Math.max(0, Math.min(100, num(data.progress, 0))),
      currency: str(data.currency, ""),
    };
  }

  function formatAwayHeading(remaining, _currency) {
    var label = formatAmount(Math.max(0, Number(remaining) || 0));
    return "Add " + label + " more to earn Free Gift";
  }

  function formatUnlockedHeading() {
    return "You've unlocked your free gift!";
  }

  function applyProgressCopy(cfg) {
    if (!cfg) return cfg;
    var paid = Number(cfg.cartSubtotal) || 0;
    var currency = cfg.currency;
    if (cfg.isTiered && cfg.rewardTiers && cfg.rewardTiers.length) {
      var maxTh = 0;
      var nextTh = 0;
      for (var i = 0; i < cfg.rewardTiers.length; i++) {
        var th = Number(cfg.rewardTiers[i].threshold) || 0;
        if (th > maxTh) maxTh = th;
        if (!nextTh && paid + 1e-9 < th) nextTh = th;
      }
      if (maxTh > 0) cfg.progress = Math.max(0, Math.min(100, (paid / maxTh) * 100));
      if (nextTh > 0) {
        cfg.remaining = nextTh - paid;
        cfg.heading = formatAwayHeading(cfg.remaining, currency);
        cfg.thresholdLabel = formatMoneyLabel(nextTh, currency);
      } else {
        cfg.remaining = 0;
        cfg.heading = "You have unlocked all rewards!";
        cfg.thresholdLabel = formatMoneyLabel(maxTh, currency);
      }
      return cfg;
    }
    var threshold = Number(cfg.threshold) || 0;
    if (threshold > 0) {
      cfg.progress = Math.max(0, Math.min(100, (paid / threshold) * 100));
      cfg.thresholdLabel = formatMoneyLabel(threshold, currency);
      if (paid + 1e-9 >= threshold) {
        cfg.remaining = 0;
        cfg.heading = formatUnlockedHeading();
      } else {
        cfg.remaining = threshold - paid;
        cfg.heading = formatAwayHeading(cfg.remaining, currency);
      }
    }
    return cfg;
  }

  /**
   * Instant fill from /cart.js.
   */
  function optimisticCfgFromCart(cart) {
    if (!lastCfg || lastCfg.enabled === false) return null;
    var paid = eligiblePaidSubtotal(cart);
    var currency = (cart && cart.currency) || lastCfg.currency || shopCurrency();
    var cfg = Object.assign({}, lastCfg, { cartSubtotal: paid, currency: currency });
    return applyProgressCopy(cfg);
  }

  function stripHtml() {
    return (
      '<div class="fgpb-strip-banner">' +
      '<p class="fgpb-strip-banner__title"></p>' +
      '<p class="fgpb-strip-banner__sub"></p>' +
      "</div>" +
      '<div class="fgpb-strip-body">' +
      '<p class="fgpb-progress-heading"></p>' +
      '<div class="fgpb-strip-rail">' +
      '<div class="fgpb-progress-track" role="progressbar" aria-label="Free gift progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Free gift progress"><span class="fgpb-progress-fill" style="--fg-p:0"></span></div>' +
      '<div class="fgpb-strip-mark" aria-hidden="true">' +
      '<span class="fgpb-strip-mark__amount"></span>' +
      '<span class="fgpb-strip-mark__icon">' +
      GIFT_SVG +
      "</span>" +
      '<span class="fgpb-strip-mark__caption">Gift</span>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function tieredStripHtml() {
    return (
      '<div class="fgpb-strip-banner">' +
      '<p class="fgpb-strip-banner__title"></p>' +
      '<p class="fgpb-strip-banner__sub"></p>' +
      "</div>" +
      '<div class="fgpb-strip-body">' +
      '<p class="fgpb-progress-heading"></p>' +
      '<div class="fgpb-strip-rail fgpb-strip-rail--tiers">' +
      '<div class="fgpb-progress-track" role="progressbar" aria-label="Free gift progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Free gift progress"><span class="fgpb-progress-fill" style="--fg-p:0"></span></div>' +
      '<div class="fgpb-strip-milestones" aria-hidden="true"></div>' +
      "</div>" +
      '<button type="button" class="fgpb-claim-gift" hidden>Add free gift</button>' +
      '<button type="button" class="fgpb-clear-cart" hidden>Clear cart (fix rate limit)</button>' +
      '<p class="fgpb-claim-hint" hidden></p>' +
      "</div>"
    );
  }

  function clearCartHard() {
    try {
      sessionStorage.removeItem("fgpb_cart_rate_until");
    } catch (e) {}
    try {
      if (typeof window.__fgpbUnlockTierSync === "function") window.__fgpbUnlockTierSync();
      window.__fgpbTieredSyncDisabled = false;
    } catch (e2) {}
    return fetch("/cart/clear.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .catch(function () {})
      .then(function () {
        window.location.href = "/cart/clear";
      });
  }
  if (typeof window !== "undefined") {
    window.__fgpbClearCart = clearCartHard;
  }

  function pageHasTooManyAttempts() {
    try {
      var errNodes = document.querySelectorAll(
        ".cart-item__error-text, .cart-item__error, [id*='Line-item-error'], [id*='LineItemError']",
      );
      for (var ei = 0; ei < errNodes.length; ei++) {
        var node = errNodes[ei];
        if (node.closest && node.closest("#fgpb-emergency-clear, .fgpb-claim-hint, .fgpb-clear-cart")) {
          continue;
        }
        var et = String(node.textContent || "").toLowerCase();
        if (et.indexOf("too many attempts") !== -1) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /** Standalone unblock UI — does not depend on progress-strip rebuild / claim paint. */
  function ensureEmergencyClearBanner() {
    if (!pageHasTooManyAttempts()) {
      var old = document.getElementById("fgpb-emergency-clear");
      if (old) old.remove();
      return;
    }
    var host =
      findDrawer() ||
      document.querySelector("cart-drawer") ||
      document.querySelector("#CartDrawer") ||
      document.querySelector(".cart-drawer") ||
      null;
    if (!host) return;
    var banner = document.getElementById("fgpb-emergency-clear");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "fgpb-emergency-clear";
      banner.className = "fgpb-emergency-clear";
      banner.innerHTML =
        '<p class="fgpb-emergency-clear__msg">Cart edits are blocked by Shopify. Empty the cart to recover.</p>' +
        '<button type="button" class="fgpb-emergency-clear__btn">Empty cart now</button>' +
        '<p class="fgpb-emergency-clear__alt">Or open <a href="/cart/clear">/cart/clear</a></p>';
      var btn = banner.querySelector(".fgpb-emergency-clear__btn");
      if (btn) {
        btn.addEventListener("click", function () {
          btn.disabled = true;
          btn.textContent = "Clearing…";
          clearCartHard();
        });
      }
    }
    // Avoid re-inserting when already correctly placed (prevents MutationObserver loops).
    if (banner.isConnected && host.contains(banner)) return;
    var footer =
      host.querySelector(".cart-drawer__footer") ||
      host.querySelector(".drawer__footer") ||
      host.querySelector("[data-cart-drawer-footer]");
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(banner, footer);
    } else {
      host.insertBefore(banner, host.firstChild);
    }
  }

  var claimMissingSince = 0;
  var claimRevealTimer = null;
  var CLAIM_REVEAL_MS = 2800;

  /**
   * Auto-add is the default. Do not flash hint/button while gifts are mid-add.
   * Only reveal recovery UI if gifts stay missing for CLAIM_REVEAL_MS.
   */
  function paintClaimButton(el, cfg) {
    if (!el) return;
    var btn = el.querySelector(".fgpb-claim-gift");
    var clearBtn = el.querySelector(".fgpb-clear-cart");
    var hint = el.querySelector(".fgpb-claim-hint");

    if (btn && !btn._fgpbClaimBound) {
      btn._fgpbClaimBound = true;
      btn.addEventListener("click", function () {
        btn.disabled = true;
        btn.textContent = "Adding…";
        var claim =
          typeof window !== "undefined" && typeof window.__fgpbClaimTierGifts === "function"
            ? window.__fgpbClaimTierGifts()
            : Promise.resolve({ ok: false });
        Promise.resolve(claim)
          .then(function (res) {
            var miss = (res && res.missing && res.missing.length) || 0;
            btn.textContent = miss ? "Add free gift" : "Gift added";
            btn.disabled = false;
            if (!miss) btn.hidden = true;
            scheduleSyncChrome(0);
          })
          .catch(function () {
            btn.textContent = "Add free gift";
            btn.disabled = false;
          });
      });
    }

    if (clearBtn && !clearBtn._fgpbClearBound) {
      clearBtn._fgpbClearBound = true;
      clearBtn.addEventListener("click", function () {
        clearBtn.disabled = true;
        clearBtn.textContent = "Clearing…";
        clearCartHard();
      });
    }

    var st = (typeof window !== "undefined" && window.__fgpbTierStatus) || null;
    var missingCount = (st && st.missing && st.missing.length) || 0;
    var rateBlocked = !!(st && st.rateLimited) || pageHasTooManyAttempts();

    if (missingCount > 0 && !rateBlocked) {
      if (!claimMissingSince) claimMissingSince = Date.now();
    } else {
      claimMissingSince = 0;
      if (claimRevealTimer) {
        clearTimeout(claimRevealTimer);
        claimRevealTimer = null;
      }
    }

    var stuckLongEnough =
      missingCount > 0 &&
      !rateBlocked &&
      claimMissingSince > 0 &&
      Date.now() - claimMissingSince >= CLAIM_REVEAL_MS;

    if (missingCount > 0 && !rateBlocked && !stuckLongEnough && !claimRevealTimer) {
      claimRevealTimer = setTimeout(function () {
        claimRevealTimer = null;
        if (lastCfg && lastCfg.enabled) paintEnabledChrome();
      }, CLAIM_REVEAL_MS + 30);
    }

    if (btn) {
      // Keep recovery button out of the happy path — no flash during auto-add.
      btn.hidden = !stuckLongEnough;
      btn.disabled = false;
      if (missingCount > 1) btn.textContent = "Add free gifts";
      else btn.textContent = "Add free gift";
    }
    if (clearBtn) {
      clearBtn.hidden = !rateBlocked;
      clearBtn.disabled = false;
      clearBtn.textContent = "Clear cart (fix rate limit)";
    }
    if (hint) {
      if (rateBlocked) {
        hint.hidden = false;
        hint.textContent =
          "Shopify blocked cart edits (“Too many attempts”). Click Clear cart, wait 2 minutes, then shop again.";
      } else {
        // Never show the missing-gift hint — it flashed on every successful auto-add.
        hint.hidden = true;
        hint.textContent = "";
      }
    }
  }

  function convertToStrip(card, useTiered) {
    if (!card) return null;
    card.setAttribute("data-cp", "1");
    card.setAttribute("data-fg-strip", "1");
    if (card.getAttribute("data-fg-drawer") === "1") {
      card.setAttribute("data-fgpb-progress-host", "1");
    }
    card.classList.add("fgpb-progress-card", "fgpb-progress-strip");
    card.dataset.widgetStateUrl = card.dataset.widgetStateUrl || "/apps/free-gift/widget-state";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Free gift progress");
    var wantTiered = !!useTiered;
    var hasMilestones = !!card.querySelector(".fgpb-strip-milestones");
    var hasSingleMark = !!card.querySelector(".fgpb-strip-mark");
    var needsRebuild =
      !card.querySelector(".fgpb-strip-banner") ||
      !card.querySelector(".fgpb-progress-track") ||
      (wantTiered && !hasMilestones) ||
      (wantTiered && !card.querySelector(".fgpb-clear-cart")) ||
      (!wantTiered && hasMilestones && !hasSingleMark);
    if (needsRebuild) {
      var fill = card.querySelector(".fgpb-progress-fill");
      var keptP = "0";
      if (fill) {
        var rawP = fill.style.getPropertyValue("--fg-p");
        if (rawP !== "") keptP = rawP;
        else if (fill.style.width && /%$/.test(fill.style.width)) {
          keptP = String(Math.max(0, Math.min(100, parseFloat(fill.style.width) || 0)) / 100);
        }
      }
      card.innerHTML = wantTiered ? tieredStripHtml() : stripHtml();
      seedFill(card);
      var nextFill = card.querySelector(".fgpb-progress-fill");
      if (nextFill && keptP !== "0") nextFill.style.setProperty("--fg-p", keptP);
    }
    if (wantTiered) card.setAttribute("data-fg-tiered-milestones", "1");
    else card.removeAttribute("data-fg-tiered-milestones");
    return card;
  }

  function createStripCard(useTiered) {
    if (!can("renderProgress")) return null;
    var c = document.createElement("div");
    c.className = "fgpb-progress-card fgpb-progress-strip";
    c.setAttribute("data-cp", "1");
    c.setAttribute("data-fg-strip", "1");
    c.setAttribute("data-fgpb-progress-host", "1");
    c.dataset.widgetStateUrl = "/apps/free-gift/widget-state";
    c.setAttribute("role", "region");
    c.setAttribute("aria-label", "Free gift progress");
    c.innerHTML = useTiered ? tieredStripHtml() : stripHtml();
    if (useTiered) c.setAttribute("data-fg-tiered-milestones", "1");
    seedFill(c);
    return c;
  }

  function createProductCard() {
    if (!can("renderProgress")) return null;
    var c = document.createElement("div");
    c.className = "fgpb-progress-card";
    c.setAttribute("data-pp", "1");
    c.setAttribute("data-fg-auto", "1");
    c.dataset.widgetStateUrl = "/apps/free-gift/widget-state";
    c.innerHTML =
      '<p class="fgpb-progress-heading"></p>' +
      '<div class="fgpb-progress-track" role="progressbar" aria-label="Free gift progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Free gift progress">' +
      '<span class="fgpb-progress-fill" style="--fg-p:0"></span></div>' +
      '<p class="fgpb-progress-text"></p>';
    return c;
  }

  function ensureStrip() {
    if (!can("renderProgress")) return null;
    var cards = document.querySelectorAll(".fgpb-progress-card");
    var kept = null;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (inDrawer(card)) continue;
      if (card.getAttribute("data-pp") === "1") continue;
      if (!kept) {
        kept = convertToStrip(card, false);
      } else {
        card.remove();
      }
    }

    if (kept) return kept;

    var items = findMountPoint();
    if (!items || !items.parentNode || inDrawer(items)) return null;

    var c = createStripCard(false);
    if (!c) return null;
    if (/^(MAIN)$/i.test(items.tagName) || items.getAttribute("role") === "main") items.insertBefore(c, items.firstChild);
    else items.parentNode.insertBefore(c, items);
    return c;
  }

  /**
   * Dawn is the only drawer that can hold the progress strip. Horizon replaces
   * .cart-drawer__inner on quantity changes and when the cart becomes empty, and
   * a strip inside that panel leaves the drawer blank.
   */
  function allowsOwnedDrawerStrip(drawer) {
    if (!drawer || !drawer.querySelector) return false;
    var api = typeof window !== "undefined" ? window.__FGPB_THEME : null;
    if (api && typeof api.isDawnDrawer === "function") return !!api.isDawnDrawer(drawer);
    return !!(drawer.querySelector("cart-drawer-items") && drawer.querySelector(".drawer__inner"));
  }

  function releaseNonDawnDrawer(drawer) {
    if (!drawer || !drawer.querySelectorAll) return;
    var nodes = drawer.querySelectorAll(
      ".fgpb-progress-card[data-fg-drawer], [data-fgpb-recs='drawer']",
    );
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute && nodes[i].getAttribute("data-fg-drawer") === "1") {
        parkedDrawerStrip = nodes[i];
      } else if (nodes[i].getAttribute && nodes[i].getAttribute("data-fgpb-recs") === "drawer") {
        parkedDrawerRecs = nodes[i];
      }
      parkNode(nodes[i]);
    }
  }

  function mountInDrawer(drawer, node) {
    if (!can("renderProgress")) return;
    if (!allowsOwnedDrawerStrip(drawer)) return;
    if (!drawer || !node || cartIsEmpty) return;
    // Always mount inside the sliding panel so a closed drawer cannot leak.
    var inner =
      (window.__FGPB_THEME && window.__FGPB_THEME.drawerInner(drawer)) ||
      drawer.querySelector(".drawer__inner") ||
      drawer.querySelector(".cart-drawer__inner") ||
      drawer.querySelector("[role='dialog']");
    var scope = inner || drawer;
    // Prefer right under the "Your cart" header, inside .drawer__inner only.
    var header = findDrawerHeader(scope) || findDrawerHeader(drawer);
    if (header && header.parentNode && (!inner || inner.contains(header))) {
      var afterHeader = header.nextSibling;
      while (afterHeader && afterHeader.nodeType !== 1) afterHeader = afterHeader.nextSibling;
      if (node.parentNode === header.parentNode && afterHeader === node) return;
      header.parentNode.insertBefore(node, header.nextSibling);
      return;
    }
    var items = findDrawerItemsHost(scope) || findDrawerItemsHost(drawer);
    if (items && items.parentNode && (!inner || inner.contains(items))) {
      if (node.parentNode === items.parentNode && items.previousElementSibling === node) return;
      items.parentNode.insertBefore(node, items);
      return;
    }
    if (inner) {
      if (inner.firstElementChild === node) return;
      inner.insertBefore(node, inner.firstChild);
      return;
    }
    // Never become a flex sibling of the sliding panel — that paints on-screen
    // while .drawer__inner is still translated off-canvas.
  }

  /**
   * Owned drawer chrome only — classic theme blocks must never be parked/reused.
   */
  function isOwnedDrawerStrip(card) {
    return !!(
      card &&
      card.getAttribute &&
      card.getAttribute("data-fg-drawer") === "1" &&
      card.querySelector &&
      card.querySelector(".fgpb-strip-banner")
    );
  }

  /**
   * Classic theme-block / product cards must never remain in the cart drawer.
   * Only purge when we can replace them with an owned strip (cfg ready).
   */
  function purgeForeignDrawerCards(drawer) {
    if (!drawer) return;
    var cards = drawer.querySelectorAll(".fgpb-progress-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (isOwnedDrawerStrip(card)) continue;
      if (parkedDrawerStrip === card) parkedDrawerStrip = null;
      card.remove();
    }
  }

  /**
   * Insert the owned strip into the live drawer. Must not run inside Dawn
   * renderContents/setInnerHTML — callers schedule this after the current turn.
   */
  function pinDrawerStripNow() {
    if (!can("renderProgress")) return null;
    if (pinning) {
      pendingRepin = true;
      return parkedDrawerStrip || null;
    }
    // Empty cart: never remount/show — syncEmptyCartChrome owns soft-hide.
    if (cartIsEmpty) {
      hideDrawerStrip();
      return null;
    }
    // Explicitly disabled campaign: do not remount.
    if (lastCfg && lastCfg.enabled === false) {
      return null;
    }
    invalidateDrawerCache();
    var drawer = findDrawer();
    if (!drawer) {
      return null;
    }
    if (!allowsOwnedDrawerStrip(drawer)) {
      releaseNonDawnDrawer(drawer);
      return null;
    }
    if (!drawerShouldShow(drawer)) {
      parkClosedDrawerChrome(drawer);
      return parkedDrawerStrip || null;
    }

    var cfgReady = !!(lastCfg && lastCfg.enabled);
    var useTiered = !!(
      cfgReady &&
      lastCfg.isTiered &&
      lastCfg.rewardTiers &&
      lastCfg.rewardTiers.length
    );

    var existing =
      drawer.querySelector(".fgpb-progress-card[data-fgpb-progress-host]") ||
      drawer.querySelector(".fgpb-progress-card[data-fg-drawer].fgpb-progress-strip") ||
      drawer.querySelector(".fgpb-progress-card[data-fg-drawer]");
    // Already in the live drawer: paint only. Remounting here loops with MutationObserver
    // and freezes theme preview / Dawn qty UI.
    if (existing && isOwnedDrawerStrip(existing) && drawer.contains(existing) && !isParked(existing)) {
      parkedDrawerStrip = existing;
      existing.setAttribute("data-fgpb-progress-host", "1");
      if (cfgReady && Date.now() - lastPinAt > 200) {
        lastPinAt = Date.now();
        convertToStrip(existing, useTiered);
        paintStrip(existing, lastCfg);
      }
      syncDrawerOpenAttr();
      return existing;
    }
    // Dawn wiped the drawer: remount immediately. The 400ms throttle caused the bar
    // to vanish then pop back after add-to-cart / qty updates.
    var missingFromDrawer = !drawer.querySelector(".fgpb-progress-card[data-fg-drawer]");
    if (!missingFromDrawer && Date.now() - lastPinAt < 400) {
      pendingRepin = true;
      return existing || parkedDrawerStrip || null;
    }

    pinning = true;
    lastPinAt = Date.now();
    try {
      // Never purge unless we can immediately mount a replacement strip.
      if (cfgReady) purgeForeignDrawerCards(drawer);

      existing =
        drawer.querySelector(".fgpb-progress-card[data-fgpb-progress-host]") ||
        drawer.querySelector(".fgpb-progress-card[data-fg-drawer].fgpb-progress-strip") ||
        drawer.querySelector(".fgpb-progress-card[data-fg-drawer]");
      if (existing && !isOwnedDrawerStrip(existing) && !cfgReady) {
        existing = null;
      }

      if (existing && (isOwnedDrawerStrip(existing) || cfgReady)) {
        parkedDrawerStrip = existing;
        existing.setAttribute("data-fg-drawer", "1");
        existing.setAttribute("data-fg-strip", "1");
        existing.setAttribute("data-fgpb-progress-host", "1");
        existing.hidden = false;
        existing.classList.remove("fgpb-hide-empty");
        existing.style.removeProperty("display");
        existing.style.removeProperty("visibility");
        existing.style.removeProperty("opacity");
        if (cfgReady) {
          convertToStrip(existing, useTiered);
          paintStrip(existing, lastCfg);
        }
        if (!drawer.contains(existing)) mountInDrawer(drawer, existing);
        syncDrawerOpenAttr();
        return existing;
      }

      // Only reuse a parked node if it is already an owned strip.
      var c =
        parkedDrawerStrip &&
        (isParked(parkedDrawerStrip) || !parkedDrawerStrip.isConnected) &&
        isOwnedDrawerStrip(parkedDrawerStrip)
          ? parkedDrawerStrip
          : null;
      var fresh = false;
      if (!c) {
        if (!cfgReady) {
          return null;
        }
        c = createStripCard(useTiered);
        fresh = true;
      }
      c.setAttribute("data-fg-drawer", "1");
      c.setAttribute("data-fg-strip", "1");
      c.setAttribute("data-fgpb-progress-host", "1");
      c.hidden = false;
      c.classList.remove("fgpb-hide-empty");
      c.style.removeProperty("display");
      c.style.removeProperty("visibility");
      c.style.removeProperty("opacity");
      if (cfgReady && (fresh || !c.querySelector(".fgpb-strip-banner"))) {
        convertToStrip(c, useTiered);
      }
      if (cfgReady) paintStrip(c, lastCfg);
      mountInDrawer(drawer, c);
      parkedDrawerStrip = c;
      syncDrawerOpenAttr();
      return c;
    } finally {
      pinning = false;
      // Do not disconnect or re-observe here. Do not recover synchronously —
      // that re-enters Dawn's render/finally path.
      if (pendingRepin) {
        pendingRepin = false;
        scheduleProgressHostRecover();
      }
    }
  }

  function liveDrawerHasOwnedHost(drawer) {
    drawer = drawer || findDrawer();
    if (!drawer) return false;
    var host =
      drawer.querySelector(".fgpb-progress-card[data-fgpb-progress-host]") ||
      drawer.querySelector(".fgpb-progress-card[data-fg-drawer] .fgpb-strip-banner");
    if (!host) return false;
    var card =
      host.classList && host.classList.contains("fgpb-progress-card")
        ? host
        : host.closest
          ? host.closest(".fgpb-progress-card")
          : host;
    return !!(card && drawer.contains(card) && !isParked(card));
  }

  /**
   * After Dawn replaces `.drawer__inner` / `#CartDrawer`, mount into the LIVE drawer.
   * Only adds/updates the owned progress host. Never opens/closes the drawer,
   * never replaces Dawn-owned nodes, never runs inside Dawn renderContents.
   */
  function recoverLiveDrawerProgressHost() {
    if (!can("progressRecovery")) return null;
    if (recoveringHost) return null;
    recoveringHost = true;
    try {
      invalidateDrawerCache();
      if (cartIsEmpty) return null;
      if (lastCfg && lastCfg.enabled === false) return null;
      var host = pinDrawerStripNow();
      if (host && lastCfg) {
        var useTiered = !!(lastCfg.isTiered && lastCfg.rewardTiers && lastCfg.rewardTiers.length);
        convertToStrip(host, useTiered);
        paintStrip(host, lastCfg);
        showDrawerStrip(host);
      }
      return host;
    } finally {
      recoveringHost = false;
    }
  }

  var recoveringHost = false;
  var progressRecoverScheduled = false;
  function scheduleProgressHostRecover() {
    if (!can("progressRecovery")) return;
    if (recoveringHost || progressRecoverScheduled || pinning) {
      if (pinning) pendingRepin = true;
      return;
    }
    progressRecoverScheduled = true;
    setTimeout(function () {
      progressRecoverScheduled = false;
      try {
        recoverLiveDrawerProgressHost();
      } catch (_e) {}
      try {
        var cartNow = liveCartForDom();
        styleGiftRowsInRoot(document, cartNow);
        syncDawnCartChrome(cartNow);
        var liveDrawer = findDrawer();
        if (liveDrawer) stripForeignCartChrome(findDrawerItemsHost(liveDrawer) || liveDrawer);
      } catch (_e2) {}
    }, 0);
  }

  if (typeof window !== "undefined") {
    window.__fgpbRecoverDrawerHost = scheduleProgressHostRecover;
  }

  /** Light remount only when Dawn wiped the strip — no multi-second retry storm. */
  function keepDrawerStripAlive() {
    for (var i = 0; i < keepAliveTimers.length; i++) clearTimeout(keepAliveTimers[i]);
    keepAliveTimers = [];
    if (inThemeEditor()) return;
    if (cartIsEmpty) return;
    if (lastCfg && lastCfg.enabled === false) return;
    keepAliveTimers.push(
      setTimeout(function () {
        if (cartIsEmpty || (lastCfg && lastCfg.enabled === false)) return;
        var drawer = findDrawer();
        if (!drawer) return;
        if (drawer.querySelector(".fgpb-progress-card[data-fg-drawer] .fgpb-strip-banner")) return;
        pinDrawerStripNow();
      }, 80),
    );
  }

  function ensureDrawerStrip(useTiered) {
    if (!can("renderProgress")) return null;
    if (cartIsEmpty) return null;
    var drawer = findDrawer();
    if (!drawer || !drawerShouldShow(drawer)) {
      if (drawer) parkClosedDrawerChrome(drawer);
      return parkedDrawerStrip || null;
    }
    var pinned = pinDrawerStripNow();
    if (pinned) {
      return convertToStrip(pinned, !!useTiered);
    }
    var c = createStripCard(!!useTiered);
    if (!c) return null;
    c.setAttribute("data-fg-drawer", "1");
    convertToStrip(c, !!useTiered);
    mountInDrawer(drawer, c);
    parkedDrawerStrip = c;
    return c;
  }

  function removeStrip() {
    var nodes = document.querySelectorAll(SEL);
    for (var i = 0; i < nodes.length; i++) {
      if (!inDrawer(nodes[i]) && !nodes[i].hasAttribute("data-fg-auto")) nodes[i].remove();
    }
  }

  /** Soft-hide even while the drawer stays open — empty cart must not keep stale remaining copy. */
  function hideDrawerStrip() {
    var drawer = findDrawer();
    if (parkedDrawerStrip) parkNode(parkedDrawerStrip);
    if (!drawer) return;
    var nodes = drawer.querySelectorAll(
      ".fgpb-progress-card[data-fg-drawer], .fgpb-progress-card[data-fg-strip]",
    );
    for (var i = 0; i < nodes.length; i++) parkNode(nodes[i]);
  }

  function resetEmptyCartChrome() {
    cartIsEmpty = true;
    lastFillPct = 0;
    if (lastCfg && lastCfg.enabled !== false) {
      lastCfg.cartSubtotal = 0;
      lastCfg.progress = 0;
      var th = Number(lastCfg.threshold) || 0;
      lastCfg.remaining = th;
      lastCfg.heading = th > 0 ? formatAwayHeading(th, lastCfg.currency || shopCurrency()) : "";
    }
    lastPaintKey = "";
    hideDrawerStrip();
    setProgressCardsHidden(true);
    setRecsHidden(true);
  }

  function showDrawerStrip(el) {
    if (!el || cartIsEmpty) return;
    var drawer = findDrawer();
    if (!drawer || !drawerShouldShow(drawer)) {
      parkedDrawerStrip = el;
      parkNode(el);
      return;
    }
    el.hidden = false;
    el.classList.remove("fgpb-hide-empty");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("opacity");
    syncDrawerOpenAttr();
  }

  function removeDrawerStrip() {
    // Campaign disabled: park node so a remount can reuse DOM/fill state.
    var drawer = findDrawer();
    if (!drawer) return;
    var nodes = drawer.querySelectorAll(SEL);
    for (var i = 0; i < nodes.length; i++) {
      parkedDrawerStrip = nodes[i];
      nodes[i].remove();
    }
  }

  function setFillWidth(fill, pct) {
    if (!fill) return;
    var p = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    var next = String(p);
    lastFillPct = p * 100;
    if (fill.style.getPropertyValue("--fg-p") === next) return;
    fill.style.setProperty("--fg-p", next);
  }

  function seedFill(el) {
    if (!el) return;
    var fill = el.querySelector(".fgpb-progress-fill");
    if (!fill) return;
    var prev = lastFillPct > 0 ? lastFillPct / 100 : 0;
    fill.style.transition = "none";
    fill.style.setProperty("--fg-p", String(prev));
    void fill.offsetWidth;
    fill.style.removeProperty("transition");
    var headingEl = el.querySelector(".fgpb-progress-heading");
    syncProgressA11y(
      el.querySelector(".fgpb-progress-track"),
      lastFillPct,
      headingEl && headingEl.textContent,
    );
  }

  function paintTieredMilestones(el, cfg) {
    var host = el.querySelector(".fgpb-strip-milestones");
    if (!host) return;
    var tiers = cfg.rewardTiers || [];
    var maxTh = 0;
    for (var i = 0; i < tiers.length; i++) {
      maxTh = Math.max(maxTh, Number(tiers[i].threshold) || 0);
    }
    if (!(maxTh > 0)) {
      host.innerHTML = "";
      return;
    }
    var sub = Math.max(0, Number(cfg.cartSubtotal) || 0);
    var marks = host.querySelectorAll(".fgpb-strip-mark--tier");
    var canReuse = marks.length === tiers.length;

    if (canReuse) {
      for (var t = 0; t < tiers.length; t++) {
        var tier = tiers[t];
        var th = Number(tier.threshold) || 0;
        var pct = Math.max(0, Math.min(100, (th / maxTh) * 100));
        var unlocked = sub + 1e-9 >= th;
        var isLast = t === tiers.length - 1;
        var label = isLast ? cfg.finalTierLabel || "Bumper" : cfg.tierLabel || "Gift";
        var mark = marks[t];
        mark.style.left = pct + "%";
        mark.classList.toggle("is-unlocked", unlocked);
        var amount = mark.querySelector(".fgpb-strip-mark__amount");
        var caption = mark.querySelector(".fgpb-strip-mark__caption");
        if (amount) amount.textContent = formatThreshold(th);
        if (caption) caption.textContent = label;
      }
    } else {
      var html = "";
      for (var u = 0; u < tiers.length; u++) {
        var tier2 = tiers[u];
        var th2 = Number(tier2.threshold) || 0;
        var pct2 = Math.max(0, Math.min(100, (th2 / maxTh) * 100));
        var unlocked2 = sub + 1e-9 >= th2;
        var isLast2 = u === tiers.length - 1;
        var label2 = isLast2 ? cfg.finalTierLabel || "Bumper" : cfg.tierLabel || "Gift";
        html +=
          '<div class="fgpb-strip-mark fgpb-strip-mark--tier' +
          (unlocked2 ? " is-unlocked" : "") +
          '" style="left:' +
          pct2 +
          '%">' +
          '<span class="fgpb-strip-mark__amount">' +
          formatThreshold(th2) +
          "</span>" +
          '<span class="fgpb-strip-mark__icon">' +
          GIFT_SVG +
          "</span>" +
          '<span class="fgpb-strip-mark__caption">' +
          label2 +
          "</span>" +
          "</div>";
      }
      host.innerHTML = html;
    }

    var fill = el.querySelector(".fgpb-progress-fill");
    // Prefer live cart subtotal; never clamp fill to the last unlocked mark.
    var overall = Math.max(0, Math.min(100, (sub / maxTh) * 100));
    if (fill) setFillWidth(fill, overall);
    el.classList.toggle("is-complete", overall >= 99.5);
  }

  function paintStrip(el, cfg) {
    if (!can("renderProgress")) return;
    if (!el || !cfg || !cfg.enabled) return;
    var inDrawerEl = el.getAttribute("data-fg-drawer") === "1";
    var useTiered = !!(cfg.isTiered && inDrawerEl && cfg.rewardTiers && cfg.rewardTiers.length);
    convertToStrip(el, useTiered);

    var h = Math.max(4, cfg.h);
    var r = cfg.r > 0 ? cfg.r : Math.round(h / 2);
    var bannerBg = cfg.bannerBg || (cfg.isTiered ? "#6b7c4a" : cfg.bar);
    var bannerText = cfg.bannerText || "#ffffff";
    var bodyBg = cfg.bodyBg || "#ffffff";
    var trackColor = cfg.trackColor || "#e8e8e8";

    el.classList.add("fgpb-progress-strip");
    el.setAttribute("data-cp", "1");
    el.setAttribute("data-fg-strip", "1");
    el.classList.toggle("is-compact", !!cfg.compact);
    el.classList.toggle("is-tiered-drawer", useTiered);
    el.style.setProperty("--fg-h", h + "px");
    el.style.setProperty("--fg-b", cfg.bar);
    el.style.setProperty("--fg-strip-r", r + "px");
    el.style.setProperty("--fg-strip-accent", bannerBg);
    el.style.setProperty("--fg-strip-banner-text", bannerText);
    el.style.setProperty("--fg-strip-body-bg", bodyBg);
    el.style.setProperty("--fg-strip-track", trackColor);
    el.style.setProperty("--fg-strip-mark-border", cfg.markBorder || "#cfcfcf");
    el.style.setProperty("--fg-t", cfg.textColor || "#1a1a1a");
    el.style.padding = "0";
    el.style.margin = inDrawerEl ? "0 0 0.75rem" : "0 0 1rem";
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.boxShadow = "none";
    el.style.borderRadius = "0";

    var title = el.querySelector(".fgpb-strip-banner__title");
    var sub = el.querySelector(".fgpb-strip-banner__sub");
    var heading = el.querySelector(".fgpb-progress-heading");
    var banner = el.querySelector(".fgpb-strip-banner");
    var body = el.querySelector(".fgpb-strip-body");
    if (banner) {
      banner.style.background = bannerBg;
      banner.style.color = bannerText;
    }
    if (body) body.style.background = bodyBg;
    if (title) title.textContent = cfg.bannerTitle;
    if (sub) {
      var subtitle = cfg.bannerSubtitle || "Free gifts worth unlocking";
      sub.hidden = false;
      sub.textContent = subtitle;
    }
    if (heading) {
      var headTxt = cfg.heading ? String(cfg.heading) : "";
      // Sanitize broken server/merchant copy like "You are Rs. !"
      if (!headTxt || /You are Rs\.\s*!/i.test(headTxt) || /\{remaining\}/i.test(headTxt)) {
        headTxt = formatAwayHeading(cfg.remaining, cfg.currency);
      }
      if (heading.textContent !== headTxt) heading.textContent = headTxt;
      heading.style.color = cfg.textColor || "#1a1a1a";
    }

    var track = el.querySelector(".fgpb-progress-track");
    if (track) {
      track.style.setProperty("height", h + "px", "important");
      track.style.setProperty("min-height", h + "px", "important");
      track.style.borderRadius = r + "px";
      track.style.background = trackColor;
    }
    var a11yHeading = heading && heading.textContent;
    syncProgressA11y(track, cfg.progress, a11yHeading);
    var fill = el.querySelector(".fgpb-progress-fill");
    if (fill) {
      fill.style.borderRadius = r + "px";
      fill.style.backgroundColor = cfg.bar;
      fill.style.backgroundImage =
        "linear-gradient(90deg, " + cfg.bar + "d9 0%, " + cfg.bar + " 100%)";
    }

    if (useTiered) {
      paintTieredMilestones(el, cfg);
      paintClaimButton(el, cfg);
      // Guard: never keep "All gifts unlocked" when paid is below the final tier.
      var maxThCopy = 0;
      var tiersCopy = cfg.rewardTiers || [];
      for (var mt = 0; mt < tiersCopy.length; mt++) {
        maxThCopy = Math.max(maxThCopy, Number(tiersCopy[mt].threshold) || 0);
      }
      var paidNow = Number(cfg.cartSubtotal) || 0;
      if (heading && maxThCopy > 0 && paidNow + 1e-9 < maxThCopy) {
        var headTxt = String(cfg.heading || heading.textContent || "");
        var subEl = el.querySelector(".fgpb-strip-banner__sub");
        var bodyDesc = el.querySelector(".fgpb-progress-text");
        if (
          /all gifts unlocked/i.test(headTxt) ||
          /every tier gift/i.test(headTxt) ||
          /all rewards unlocked/i.test(headTxt)
        ) {
          var nextRem = 0;
          for (var nt = 0; nt < tiersCopy.length; nt++) {
            var nth = Number(tiersCopy[nt].threshold) || 0;
            if (nth > 0 && paidNow + 1e-9 < nth) {
              nextRem = nth - paidNow;
              break;
            }
          }
          heading.textContent = formatAwayHeading(
            nextRem > 0 ? nextRem : cfg.remaining,
            cfg.currency,
          );
          if (subEl && /every tier|all rewards|all gifts/i.test(String(subEl.textContent || ""))) {
            subEl.textContent = cfg.bannerSubtitle || "Free gifts worth unlocking";
          }
          if (bodyDesc && /every tier|all gifts unlocked/i.test(String(bodyDesc.textContent || ""))) {
            bodyDesc.textContent = "";
          }
        }
      }
    } else {
      el.removeAttribute("data-fg-tiered-milestones");
      var amount = el.querySelector(".fgpb-strip-mark__amount");
      var caption = el.querySelector(".fgpb-strip-mark__caption");
      if (amount) amount.textContent = cfg.thresholdLabel || "";
      if (caption) caption.textContent = cfg.progress >= 99.5 ? "Unlocked" : cfg.tierLabel || "Gift";
      if (fill && !(cfg.isTiered && inDrawerEl)) {
        // Single-mark strip: keep fill from main runtime unless we have progress.
        if (cfg.progress > 0 || cfg.progress === 0) setFillWidth(fill, cfg.progress);
      }
      el.classList.toggle("is-complete", (cfg.progress || 0) >= 99.5);
    }

    var text = el.querySelector(".fgpb-progress-text");
    var cta = el.querySelector(".fgpb-progress-cta-wrap");
    if (text) text.remove();
    if (cta) cta.remove();
    syncProgressA11y(
      el.querySelector(".fgpb-progress-track"),
      cfg.progress,
      heading && heading.textContent,
    );
  }

  function apply(cfg) {
    lastCfg = cfg;
    if (!cfg || !cfg.enabled) {
      removeStrip();
      hideDrawerStrip();
      paintPortableProduct();
      return;
    }
    // Mount immediately when campaign is enabled. syncEmptyCartChrome still soft-hides
    // when /cart.js reports empty — that is the only empty-cart gate.
    paintEnabledChrome();
  }

  function setProgressCardsHidden(hidden) {
    // Only soft-hide *cart page* cards. Product/section cards stay visible with an
    // empty cart (classic Free Gift behavior). Drawer strip uses hideDrawerStrip.
    if (!onCartPage()) return;
    var nodes = document.querySelectorAll(".fgpb-progress-card");
    for (var i = 0; i < nodes.length; i++) {
      if (inDrawer(nodes[i]) || nodes[i].getAttribute("data-fg-drawer") === "1") continue;
      if (nodes[i].getAttribute("data-pp") === "1") continue;
      nodes[i].hidden = !!hidden;
      if (hidden) nodes[i].classList.add("fgpb-hide-empty");
      else nodes[i].classList.remove("fgpb-hide-empty");
    }
  }

  function setRecsHidden(hidden) {
    var recs = document.querySelectorAll("[data-fgpb-recs]");
    for (var i = 0; i < recs.length; i++) {
      var isDrawerRec =
        inDrawer(recs[i]) || recs[i].getAttribute("data-fgpb-recs") === "drawer";
      // Drawer bestsellers are pinned — only soft-hide when cart is truly empty.
      if (hidden && isDrawerRec) {
        parkedDrawerRecs = recs[i];
      }
      // Shopper dismissed drawer bestsellers — keep hidden until new browser session.
      if (!hidden && isDrawerRec && isDrawerRecsDismissed()) {
        hideDrawerRecsSection(recs[i]);
        continue;
      }
      recs[i].hidden = !!hidden;
      if (hidden) {
        recs[i].classList.add("fgpb-hide-empty");
        recs[i].style.setProperty("display", "none", "important");
      } else {
        recs[i].classList.remove("fgpb-hide-empty");
        recs[i].style.removeProperty("display");
      }
    }
  }

  function eligiblePaidSubtotal(cart) {
    var items = (cart && cart.items) || [];
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var props = item.properties || {};
      var giftFlag = props._fgpb_free_gift;
      if (giftFlag === "true" || giftFlag === true) continue;
      // cart.js money fields are always cents — never treat unit_price as major units.
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

  function ensureGiftChromeStyles() {
    if (document.getElementById("fgpb-gift-chrome-css")) return;
    var s = document.createElement("style");
    s.id = "fgpb-gift-chrome-css";
    s.textContent =
      ".fgpb-gift-line quantity-input," +
      ".fgpb-gift-line .quantity," +
      ".fgpb-gift-line .cart-item__quantity," +
      ".fgpb-gift-line .cart-item__quantity-wrapper," +
      ".fgpb-gift-line cart-remove-button," +
      ".fgpb-gift-line .cart-remove," +
      ".fgpb-gift-line button[name='plus']," +
      ".fgpb-gift-line button[name='minus']," +
      ".fgpb-gift-line input[name='updates[]']," +
      ".fgpb-gift-line input.quantity__input," +
      ".fgpb-gift-line .quantity-popover," +
      ".fgpb-gift-line .product-option," +
      ".fgpb-gift-line dl.product-option{display:none!important}" +
      ".fgpb-free-gift-badge{display:block!important;margin-top:4px!important;" +
      "padding:0!important;background:transparent!important;color:#0b0b0b!important;" +
      "font-family:inherit!important;font-size:13px!important;font-weight:800!important;" +
      "letter-spacing:.04em!important;text-transform:uppercase!important;line-height:1.3!important}" +
      ".fgpb-gift-line .discounts{display:none!important}" +
      ".fgpb-gift-line .discounts__discount{display:none!important}" +
      ".fgpb-gift-line .cart-item__discounted{display:none!important}" +
      "cart-drawer .cart-items,#CartDrawer .cart-items,cart-drawer-items .cart-items," +
      "#CartDrawer-CartItems.cart-items,#CartDrawer-CartItems .cart-items{" +
      "display:flex!important;flex-direction:column}" +
      "cart-drawer .cart-item.fgpb-gift-line,#CartDrawer .cart-item.fgpb-gift-line," +
      "cart-drawer-items .cart-item.fgpb-gift-line,#CartDrawer-CartItems .cart-item.fgpb-gift-line{order:-1}" +
      "#main-cart-items tbody,[id^='main-cart-items'] tbody,cart-items tbody{" +
      "display:flex;flex-direction:column}" +
      "#main-cart-items tbody>tr,[id^='main-cart-items'] tbody>tr,cart-items tbody>tr{" +
      "display:table;width:100%;table-layout:fixed}" +
      "#main-cart-items tbody>tr.fgpb-gift-line,[id^='main-cart-items'] tbody>tr.fgpb-gift-line," +
      "cart-items tbody>tr.fgpb-gift-line{order:-1}";
    (document.head || document.documentElement).appendChild(s);
  }

  function hideGiftRowsNow() {
    var rows = document.querySelectorAll("[data-fgpb-optimistic-gift]");
    for (var i = 0; i < rows.length; i++) {
      try {
        rows[i].remove();
      } catch (_e) {}
    }
  }

  function liveCartLineKeys(cart) {
    var keys = {};
    var items = cart && cart.items;
    if (!items) return keys;
    for (var i = 0; i < items.length; i++) {
      var k = items[i] && items[i].key;
      if (k) keys[String(k)] = true;
    }
    return keys;
  }

  /**
   * Drop DOM lines that cart.js no longer has. Gift REMOVE only refreshes the
   * drawer via section HTML; /cart must not keep a snowboard row after the
   * gift is gone.
   */
  function cartHasTaggedGift(cart) {
    var items = cart && cart.items;
    if (!items) return false;
    for (var i = 0; i < items.length; i++) {
      var props = (items[i] && items[i].properties) || {};
      if (props._fgpb_free_gift === "true" || props._fgpb_free_gift === true) return true;
    }
    return false;
  }

  /**
   * Dawn's renderContents writes the line list and the footer total in one
   * pass. A positive total means that pass already has the new cart, so an
   * older empty snapshot must not delete the lines or mark the drawer empty.
   */
  function renderedCartShowsItems() {
    var selectors = onCartPage()
      ? [
          "#main-cart-footer .totals__total-value",
          "#main-cart-footer .totals__subtotal-value",
          "cart-drawer .totals__subtotal-value",
          "#CartDrawer .totals__subtotal-value",
          "cart-drawer .totals__total-value",
          "#CartDrawer .totals__total-value",
        ]
      : [
          "cart-drawer .totals__subtotal-value",
          "#CartDrawer .totals__subtotal-value",
          "cart-drawer .totals__total-value",
          "#CartDrawer .totals__total-value",
        ];
    for (var i = 0; i < selectors.length; i++) {
      var node = document.querySelector(selectors[i]);
      if (!node) continue;
      var match = String(node.textContent || "")
        .replace(/,/g, "")
        .match(/(\d+(?:\.\d+)?)/);
      var amount = match ? Number(match[1]) : 0;
      if (Number.isFinite(amount) && amount > 0) return true;
    }
    return false;
  }

  function pruneStaleCartRows(cart) {
    if (!cart || !Array.isArray(cart.items)) return;
    // add.js snapshots are partial. Pruning against them deletes the paid
    // lines or the gift we just applied from mutation HTML.
    if (cart._partial) return;
    var keys = liveCartLineKeys(cart);
    var keepUnkeyedGift = cartHasTaggedGift(cart);
    var roots = [];
    var pageHost = findCartPageItemsHost();
    if (pageHost) roots.push(pageHost);
    var drawer = findDrawer();
    if (drawer) {
      var drawerHost = findDrawerItemsHost(drawer);
      if (drawerHost) roots.push(drawerHost);
    }
    if (!(Number(cart.item_count) > 0)) {
      if (renderedCartShowsItems()) return;
      for (var e = 0; e < roots.length; e++) {
        var emptyRows = roots[e].querySelectorAll(
          ".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-']",
        );
        for (var g = 0; g < emptyRows.length; g++) {
          try {
            emptyRows[g].remove();
          } catch (_e0) {}
        }
      }
      syncDawnCartChrome(cart);
      return;
    }
    for (var r = 0; r < roots.length; r++) {
      var rows = roots[r].querySelectorAll(
        ".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-']",
      );
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        var key = lineKeyFromRow(row);
        if (key) {
          if (keys[key]) continue;
        } else if (!(row.classList && row.classList.contains("fgpb-gift-line") && !keepUnkeyedGift)) {
          continue;
        }
        try {
          row.remove();
        } catch (_e) {}
      }
      reindexCartRows(roots[r]);
    }
    syncDawnCartChrome(cart);
  }

  function visibleCartTotalText() {
    // Document order puts the closed drawer ahead of the cart page, so a stale
    // drawer total was announced after a /cart quantity change.
    var selectors = onCartPage()
      ? ["#main-cart-footer .totals__total-value", "#main-cart-footer .totals__subtotal-value"]
      : ["cart-drawer .totals__total-value", "#CartDrawer .totals__total-value"];
    for (var i = 0; i < selectors.length; i++) {
      var node = document.querySelector(selectors[i]);
      var t = node && String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (t) return t;
    }
    return "";
  }

  /**
   * Dawn writes #cart-live-region-text from change.js before our gift prune.
   * Footer .js-contents can already be $837 while that hidden node still says
   * $947. Empty cart also needs Dawn's is-empty classes so "Your cart is empty"
   * and the checkout footer swap.
   */
  function syncDawnCartChrome(cart) {
    var empty = !(cart && Number(cart.item_count) > 0);
    if (empty && renderedCartShowsItems()) return;
    var nodes = [
      document.querySelector("cart-items"),
      document.getElementById("main-cart-footer"),
      document.querySelector("cart-drawer"),
      document.querySelector("cart-drawer-items"),
      document.getElementById("CartDrawer-CartItems"),
    ];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].classList) nodes[i].classList.toggle("is-empty", empty);
    }
    var live =
      document.getElementById("cart-live-region-text") ||
      document.getElementById("CartDrawer-LiveRegionText");
    if (!live) return;
    if (empty) {
      live.textContent = "Your cart is empty";
      return;
    }
    var money = visibleCartTotalText();
    if (!money) return;
    var cur = String(live.textContent || "");
    if (/\$[\d,]+(?:\.\d+)?(?:\s*[A-Z]{3})?/.test(cur)) {
      live.textContent = cur.replace(/\$[\d,]+(?:\.\d+)?(?:\s*[A-Z]{3})?/, money);
    } else {
      live.textContent = "New estimated total: " + money;
    }
  }

  /**
   * Dawn posts /cart/change.js with data-index as a 1-based line number.
   * After a gift row is pruned the remaining inputs still have the old index
   * (CartItem-2 with a one-line cart), which Shopify rejects as invalid.
   */
  function reindexCartRows(root) {
    if (!root || !root.querySelectorAll) return;
    var rows = root.querySelectorAll(
      ".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-']",
    );
    for (var i = 0; i < rows.length; i++) {
      var n = String(i + 1);
      var row = rows[i];
      if (row.id && /^CartItem-\d+$/.test(row.id)) row.id = "CartItem-" + n;
      if (row.id && /^CartDrawer-Item-\d+$/.test(row.id)) row.id = "CartDrawer-Item-" + n;
      var qty = row.querySelector('input.quantity__input, input[name="updates[]"], input[name^="updates["]');
      if (qty) {
        qty.setAttribute("data-index", n);
        if (qty.id && /^Quantity-\d+$/.test(qty.id)) qty.id = "Quantity-" + n;
      }
      var remove = row.querySelector("cart-remove-button");
      if (remove) {
        remove.setAttribute("data-index", n);
        if (remove.id && /^Remove-\d+$/.test(remove.id)) remove.id = "Remove-" + n;
        if (remove.id && /^CartDrawer-Remove-\d+$/.test(remove.id)) {
          remove.id = "CartDrawer-Remove-" + n;
        }
      }
      var lineErr = row.querySelector("[id^='Line-item-error-']");
      if (lineErr) lineErr.id = "Line-item-error-" + n;
      var drawerErr = row.querySelector("[id^='CartDrawer-LineItemError-']");
      if (drawerErr) drawerErr.id = "CartDrawer-LineItemError-" + n;
    }
  }

  function scheduleStaleRowPrune() {
    var delays = [0, 80, 220];
    for (var i = 0; i < delays.length; i++) {
      (function (ms) {
        setTimeout(function () {
          pruneStaleCartRows(liveCartForDom());
        }, ms);
      })(delays[i]);
    }
  }

  /**
   * A synthetic gift row used to be injected so the drawer looked correct before
   * Shopify confirmed the line. It is gone: it showed the shopper a line that was
   * not in the authoritative cart, and it survived the gift being removed, which
   * is exactly the "gift still in the cart but not at checkout" defect. The gift
   * line now becomes visible only when Shopify confirms it, via
   * applyConfirmedGiftSections.
   */
  function upsertOptimisticGiftRow() {
    hideGiftRowsNow();
  }

  function paintFromCartNow(cart, opts) {
    if (!cart) return;
    opts = opts || {};
    var gen =
      opts.cartUiGen != null
        ? Number(opts.cartUiGen)
        : cart._fgpbVer != null
          ? Number(cart._fgpbVer)
          : null;
    if (gen == null) {
      if (lastPaintedGen > 0) {
        scheduleProgressHostRecover();
        return;
      }
      gen = Number(window.__fgpbCartUiGen) || 0;
    }
    if (lastPaintedGen > 0 && gen < lastPaintedGen) {
      scheduleProgressHostRecover();
      return;
    }
    if (!(Number(cart.item_count) > 0) && renderedCartShowsItems()) {
      scheduleProgressHostRecover();
      return;
    }
    lastPaintedGen = Math.max(lastPaintedGen, gen);
    lastCartSnapshot = cart;
    try {
      window.__fgpbLastKnownCart = cart;
    } catch (_eSnap) {}
    cartIsEmpty = !(Number(cart.item_count) > 0);
    if (cartIsEmpty) {
      pruneStaleCartRows(cart);
      resetEmptyCartChrome();
      paintPortableProduct();
      return;
    }
    var cfg = optimisticCfgFromCart(cart);
    if (!cfg) {
      paintEnabledChrome();
      styleGiftRowsInRoot(document, cart);
      syncDawnCartChrome(cart);
      scheduleProgressHostRecover();
      return;
    }
    lastCfg = cfg;
    paintEnabledChrome(true);
    styleGiftRowsInRoot(document, cart);
    syncDawnCartChrome(cart);
    scheduleProgressHostRecover();
  }

  /**
   * `confirmedFree` comes from authoritative cart evidence, never from the
   * `_fgpb_*` tag. Until Shopify's allocation proves the line costs nothing we
   * must not claim it is free, so the badge stays neutral.
   */
  function lockGiftBadgeStyle(badge) {
    if (!badge || !badge.style) return;
    badge.style.setProperty("display", "block", "important");
    badge.style.setProperty("margin-top", "4px", "important");
    badge.style.setProperty("padding", "0", "important");
    badge.style.setProperty("background", "transparent", "important");
    badge.style.setProperty("color", "#0b0b0b", "important");
    badge.style.setProperty("font-family", "inherit", "important");
    badge.style.setProperty("font-size", "13px", "important");
    badge.style.setProperty("font-weight", "800", "important");
    badge.style.setProperty("letter-spacing", "0.04em", "important");
    badge.style.setProperty("text-transform", "uppercase", "important");
    badge.style.setProperty("line-height", "1.3", "important");
  }

  function hideThemeGiftDiscount(row) {
    if (!row || !row.querySelectorAll) return;
    var chips = row.querySelectorAll(
      ".discounts, .discounts__discount, .cart-item__discounted, .cart-item__discounted-prices",
    );
    for (var i = 0; i < chips.length; i++) {
      chips[i].style.setProperty("display", "none", "important");
      chips[i].setAttribute("data-fgpb-hid", "1");
    }
  }

  function ensureGiftBadge(row, confirmedFree) {
    ensureGiftChromeStyles();
    var text = confirmedFree ? "FREE GIFT" : "GIFT";
    if (!row) return;
    var existing = row.querySelector(".fgpb-free-gift-badge");
    if (existing) {
      if (existing.textContent !== text) existing.textContent = text;
      lockGiftBadgeStyle(existing);
      return;
    }
    var badge = document.createElement("span");
    badge.className = "fgpb-free-gift-badge";
    badge.setAttribute("data-fgpb-free-gift-badge", "1");
    badge.textContent = text;
    lockGiftBadgeStyle(badge);
    var host =
      row.querySelector(".cart-item__details") ||
      (row.querySelector(".cart-item__name") && row.querySelector(".cart-item__name").parentElement) ||
      row;
    host.appendChild(badge);
  }

  function clearGiftBadge(row) {
    if (!row) return;
    row.classList.remove("fgpb-gift-line");
    restoreGiftControls(row);
    var badges = row.querySelectorAll(".fgpb-free-gift-badge, [data-fgpb-free-gift-badge]");
    for (var b = 0; b < badges.length; b++) badges[b].remove();
    var prices = row.querySelectorAll(".fgpb-gift-price, [data-fgpb-gift-price]");
    for (var p = 0; p < prices.length; p++) prices[p].remove();
    var hosts = row.querySelectorAll(".fgpb-price-host");
    for (var h = 0; h < hosts.length; h++) hosts[h].classList.remove("fgpb-price-host");
    var labels = row.querySelectorAll(".fgpb-free-gift-label");
    for (var L = 0; L < labels.length; L++) labels[L].classList.remove("fgpb-free-gift-label");
  }

  function lineKeyFromRow(row) {
    if (!row) return "";
    var attrKey =
      (typeof row.getAttribute === "function" &&
        (row.getAttribute("data-line-key") ||
          row.getAttribute("data-cart-item-key") ||
          row.getAttribute("data-key"))) ||
      "";
    if (attrKey) return String(attrKey).trim();
    var keyEl = row.querySelector("[data-line-key], [data-cart-item-key], [data-key]");
    if (keyEl) {
      var raw = keyEl.getAttribute("data-line-key") || keyEl.getAttribute("data-cart-item-key") || keyEl.getAttribute("data-key");
      if (raw) return String(raw).trim();
    }
    var qtyInput = row.querySelector('input[name="updates[]"], input[name^="updates["]');
    if (qtyInput && qtyInput.getAttribute("data-line-key")) {
      return String(qtyInput.getAttribute("data-line-key")).trim();
    }
    if (qtyInput) {
      var nm = qtyInput.getAttribute("name") || "";
      var named = nm.match(/^updates\[(.+)\]$/);
      if (named && named[1] && named[1] !== "") return String(named[1]).trim();
    }
    // Shopify line key in change URL (?id=variant:hash) — never use ?line=N (index).
    var links = row.querySelectorAll('a[href*="/cart/change"], a[href*="/cart/update"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      var idMatch = href.match(/[?&]id=([^&]+)/);
      if (idMatch && idMatch[1]) {
        try {
          return decodeURIComponent(idMatch[1]).trim();
        } catch (_e) {
          return String(idMatch[1]).trim();
        }
      }
    }
    return "";
  }

  function isTaggedGiftProps(props) {
    props = props || {};
    return props._fgpb_free_gift === "true" || props._fgpb_free_gift === true;
  }

  function rowVariantId(row) {
    if (!row) return "";
    var fromRow =
      (typeof row.getAttribute === "function" &&
        (row.getAttribute("data-quantity-variant-id") || row.getAttribute("data-variant-id"))) ||
      "";
    if (fromRow) return String(fromRow);
    var el =
      row.querySelector &&
      row.querySelector("[data-quantity-variant-id], [data-variant-id]");
    if (!el) return "";
    return String(el.getAttribute("data-quantity-variant-id") || el.getAttribute("data-variant-id") || "");
  }

  function rowLineIndex(row) {
    if (!row) return 0;
    var raw = (typeof row.getAttribute === "function" && row.getAttribute("data-index")) || "";
    if (!raw && row.querySelector) {
      var el = row.querySelector("[data-index]");
      raw = el && el.getAttribute("data-index");
    }
    var n = Number(raw);
    return n > 0 ? n : 0;
  }

  /**
   * Dawn's drawer qty input is name="updates[]" with no line key. Identify a
   * gift by key, then data-index (only when the variant agrees), then a unique
   * tagged variant. Never mark a paid same-SKU line.
   */
  function taggedGiftItemForRow(row, cart) {
    var items = cart && cart.items;
    if (!row || !items || !items.length) return null;
    var key = lineKeyFromRow(row);
    var i;
    if (key) {
      for (i = 0; i < items.length; i++) {
        if (items[i] && String(items[i].key) === key) {
          return isTaggedGiftProps(items[i].properties) ? items[i] : null;
        }
      }
    }
    var idx = rowLineIndex(row);
    var vid = rowVariantId(row);
    if (idx && items[idx - 1]) {
      var byIndex = items[idx - 1];
      var itemVid = String(byIndex.variant_id || byIndex.id || "");
      if (!vid || vid === itemVid) {
        if (isTaggedGiftProps(byIndex.properties)) return byIndex;
      }
    }
    if (!vid) return null;
    var hits = [];
    for (i = 0; i < items.length; i++) {
      if (!items[i]) continue;
      if (String(items[i].variant_id || items[i].id || "") === vid) hits.push(items[i]);
    }
    if (hits.length === 1 && isTaggedGiftProps(hits[0].properties)) return hits[0];
    return null;
  }

  /** Explicit `_fgpb_free_gift` data attrs only — never visible "Free Gift" text. */
  function rowHasExplicitFgpbGiftProp(row) {
    if (!row || typeof row.getAttribute !== "function") return false;
    try {
      var d = row.getAttribute("data-fgpb-free-gift");
      if (d === "true" || d === "1") return true;
      return !!(
        row.querySelector &&
        row.querySelector(
          '[data-cart-item-property-name="_fgpb_free_gift"],[data-property-name="_fgpb_free_gift"]',
        )
      );
    } catch (_e) {
      return false;
    }
  }

  var GIFT_CONTROL_SEL =
    "quantity-input, .quantity, .cart-item__quantity, .cart-item__quantity-wrapper, " +
    "cart-remove-button, .cart-remove, button[name='plus'], button[name='minus'], " +
    "input[name='updates[]'], input.quantity__input, .quantity-popover, " +
    "a[aria-label*='Remove'], a[aria-label*='remove']";

  /**
   * Undo hiding applied to a row that is no longer a gift. Without this a row
   * misclassified even once keeps `display:none !important` on Dawn's quantity
   * and remove controls forever, which reads to the shopper as "+/- and remove
   * do nothing".
   */
  function restoreGiftControls(row) {
    if (!row || typeof row.querySelectorAll !== "function") return;
    var hidden = row.querySelectorAll("[data-fgpb-hid]");
    for (var i = 0; i < hidden.length; i++) {
      hidden[i].style.removeProperty("display");
      hidden[i].removeAttribute("hidden");
      hidden[i].removeAttribute("data-fgpb-hid");
    }
  }

  function forceHideGiftControls(row) {
    if (!row) return;
    var hide = row.querySelectorAll(GIFT_CONTROL_SEL);
    for (var i = 0; i < hide.length; i++) {
      hide[i].style.setProperty("display", "none", "important");
      hide[i].setAttribute("hidden", "true");
      hide[i].setAttribute("data-fgpb-hid", "1");
    }
    // Only the variant-option clutter. Dawn's price, struck original and
    // discount list stay visible: they are the shopper's evidence that the gift
    // really was discounted, and hiding them is how a charged gift looked free.
    var clutter = row.querySelectorAll(".product-option, dl.product-option");
    for (var c = 0; c < clutter.length; c++) {
      clutter[c].style.setProperty("display", "none", "important");
      clutter[c].setAttribute("data-fgpb-hid", "1");
    }
  }

  /**
   * Style gift rows immediately in a root (live document or parsed section HTML).
   * Identity: line key → explicit `_fgpb_*` prop → unique tagged variant → none.
   * Never uses visible "Free Gift" text.
   */
  /**
   * Delegates to the shared evidence gate in tiered-gift-sync. If that asset is
   * not present we report "not confirmed" rather than guessing, because the
   * fallback for an unproven gift must never be to claim it is free.
   */
  function giftLineIsConfirmedFree(item) {
    try {
      if (typeof window !== "undefined" && typeof window.__fgpbCanRenderFree === "function") {
        return !!window.__fgpbCanRenderFree(item);
      }
    } catch (_e) {}
    return false;
  }

  function styleGiftRowsInRoot(root, cart) {
    if (!root) return;
    ensureGiftChromeStyles();
    var taggedKeys = {};
    var confirmedFreeKeys = {};
    if (cart && cart.items) {
      for (var j = 0; j < cart.items.length; j++) {
        var item = cart.items[j];
        var props = (item && item.properties) || {};
        if (props._fgpb_free_gift === "true" || props._fgpb_free_gift === true) {
          if (item.key) {
            taggedKeys[String(item.key)] = true;
            // Authoritative evidence only. A tagged line that Shopify has not
            // actually discounted must never be presented as free.
            if (giftLineIsConfirmedFree(item)) confirmedFreeKeys[String(item.key)] = true;
          }
        }
      }
    }
    var rows =
      typeof root.querySelectorAll === "function"
        ? root.querySelectorAll(
            ".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-'], .cart-drawer .cart-items tr",
          )
        : [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var rowKey = lineKeyFromRow(row);
      var tagged = taggedGiftItemForRow(row, cart);
      // Identity is the tagged cart line (key, then Dawn data-index+variant,
      // then a unique tagged variant) or an explicit _fgpb_* property. Never
      // an ambiguous same-SKU paid line.
      var isGift = !!tagged || !!(rowKey && taggedKeys[rowKey]) || rowHasExplicitFgpbGiftProp(row);
      if (!isGift) {
        if (row.classList && row.classList.contains("fgpb-gift-line")) clearGiftBadge(row);
        else restoreGiftControls(row);
        continue;
      }
      row.classList.add("fgpb-gift-line");
      forceHideGiftControls(row);
      hideThemeGiftDiscount(row);
      ensureGiftBadge(
        row,
        !!(tagged ? giftLineIsConfirmedFree(tagged) : rowKey && confirmedFreeKeys[rowKey]),
      );
    }
    if (
      root.querySelector &&
      root.querySelector(".fgpb-gift-line:not([data-fgpb-optimistic-gift])")
    ) {
      hideGiftRowsNow();
    }
  }

  function highlightGiftRows(cart) {
    styleGiftRowsInRoot(document, cart);
  }

  function paintKeyFor(cfg) {
    if (!cfg) return "";
    return [
      cartIsEmpty ? 1 : 0,
      cfg.enabled === false ? 0 : 1,
      cfg.cartSubtotal,
      cfg.progress,
      cfg.remaining,
      cfg.heading,
      cfg.bar,
      cfg.bannerTitle,
      cfg.isTiered ? 1 : 0,
      (cfg.rewardTiers && cfg.rewardTiers.length) || 0,
      onCartPage() ? 1 : 0,
    ].join("|");
  }

  function paintGiftHighlights() {
    styleGiftRowsInRoot(document, lastCartSnapshot || (typeof window !== "undefined" ? window.__fgpbLastKnownCart : null));
  }

  function fillProductCopy(template, remaining, currency, fallback) {
    var rem = formatMoneyLabel(Math.max(0, Number(remaining) || 0), currency);
    var src = template ? String(template) : "";
    if (/\{remaining\}/i.test(src)) {
      var raw = src.replace(/\{remaining\}/gi, rem);
      if (!raw || raw.indexOf("{") >= 0 || /You are\s*!/i.test(raw) || /Rs\.|₹|\$/.test(raw)) {
        return fallback;
      }
      return raw;
    }
    if (!src || /You are\s+/i.test(src)) return fallback;
    return src;
  }

  function progressNow(progress) {
    var n = Math.round(Number(progress) || 0);
    if (n < 0) n = 0;
    if (n > 100) n = 100;
    return n;
  }

  function progressValueText(progress, heading) {
    var now = progressNow(progress);
    var head = heading ? String(heading).replace(/\s+/g, " ").trim() : "";
    if (head) return head;
    if (now >= 100) return "Free gift unlocked";
    return now + " percent";
  }

  function syncProgressA11y(track, progress, heading) {
    if (!track || typeof track.setAttribute !== "function") return;
    var now = progressNow(progress);
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Free gift progress");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(now));
    track.setAttribute("aria-valuetext", progressValueText(now, heading));
  }

  /**
   * Merchant product app block (`data-pp="1"`) must stay a card, never a strip.
   * cart-page-progress already has live remaining; paint it here so the product
   * widget cannot freeze on the first widget-state snapshot.
   */
  function paintMerchantProductCard(el, cfg) {
    if (!el || !cfg || cfg.enabled === false || typeof el.querySelector !== "function") return;
    var remaining = Math.max(0, Number(cfg.remaining) || 0);
    var progress = Math.max(0, Math.min(100, Number(cfg.progress) || 0));
    var unlocked = remaining < 0.005 || progress >= 99.5;
    var remLabel = formatMoneyLabel(remaining, cfg.currency);
    var headingEl = el.querySelector(".fgpb-progress-heading");
    var textEl = el.querySelector(".fgpb-progress-text");
    var fill = el.querySelector(".fgpb-progress-fill");
    var track = el.querySelector(".fgpb-progress-track");
    var headTxt = fillProductCopy(
      unlocked ? cfg.uh : cfg.ht,
      remaining,
      cfg.currency,
      unlocked ? formatUnlockedHeading() : "You are " + remLabel + " away from your free gift",
    );
    if (headingEl && headingEl.textContent !== headTxt) headingEl.textContent = headTxt;
    if (textEl) {
      var desc = fillProductCopy(
        unlocked ? cfg.ud : cfg.ds,
        remaining,
        cfg.currency,
        unlocked ? "Your gift has been added to the cart." : "Add more items to your cart to unlock your gift.",
      );
      if (textEl.textContent !== desc) textEl.textContent = desc;
    }
    if (fill) setFillWidth(fill, progress);
    syncProgressA11y(track, progress, headTxt);
    el.hidden = false;
    if (el.classList && typeof el.classList.remove === "function") el.classList.remove("fgpb-hide-empty");
  }

  function paintPortableProduct() {
    var api = window.__FGPB_THEME;
    if (!api) return;
    var card = document.querySelector('[data-fg-auto]');
    var existingBlock = document.querySelector('.fgpb-progress-card[data-pp="1"]:not([data-fg-auto])');
    var enabled = !!(lastCfg && lastCfg.enabled !== false);
    var productOk = !lastCfg || !lastCfg.placements || lastCfg.placements.indexOf("Product Page") !== -1;
    if (existingBlock) {
      if (card) card.remove();
      if (enabled && productOk) paintMerchantProductCard(existingBlock, lastCfg);
      api.fallback(null, null);
      return;
    }
    var anchor = /\/products\//.test(location.pathname) ? api.productAnchor() : null;
    var allowed = enabled && lastCfg && lastCfg.placements && lastCfg.placements.indexOf("Product Page") !== -1;
    if (!allowed || !anchor || !anchor.parentNode) {
      if (card) card.remove();
      api.fallback(null, null);
      return;
    }
    if (!card) {
      card = createProductCard();
      if (!card) return;
    }
    if (card.parentNode !== anchor.parentNode || card.previousElementSibling !== anchor) {
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    }
    card.hidden = false;
    card.classList.remove("fgpb-hide-empty");
    paintMerchantProductCard(card, lastCfg);
    var drawer = findDrawer();
    api.fallback(!drawer || !api.isDawnDrawer(drawer) ? card : null, lastCfg);
  }

  function paintEnabledChrome(force) {
    if (!can("renderProgress")) return;
    if (!lastCfg) {
      // Boot race: do not hide a strip that sync/Dawn remount may already own.
      return;
    }
    if (lastCfg.enabled === false) {
      lastPaintKey = paintKeyFor(lastCfg);
      removeStrip();
      hideDrawerStrip();
      return;
    }
    // Empty cart: keep strip parked but never show alongside "Your cart is empty".
    if (cartIsEmpty) {
      lastPaintKey = paintKeyFor(lastCfg);
      resetEmptyCartChrome();
      paintPortableProduct();
      return;
    }
    paintPortableProduct();
    var key = paintKeyFor(lastCfg);
    if (!force && key && key === lastPaintKey) {
      perfBump("paintSkip");
      if (!liveDrawerHasOwnedHost()) scheduleProgressHostRecover();
      paintGiftHighlights();
      return;
    }
    lastPaintKey = key;
    perfBump("paintFull");
    if (onCartPage()) {
      var pageEl = ensureStrip();
      if (pageEl) {
        pageEl.hidden = false;
        pageEl.classList.remove("fgpb-hide-empty");
        paintStrip(pageEl, lastCfg);
      }
    } else {
      removeStrip();
    }
    var wantTiered = !!(lastCfg.isTiered && lastCfg.rewardTiers && lastCfg.rewardTiers.length);
    var drawerRoot = findDrawer();
    if (drawerRoot) purgeForeignDrawerCards(drawerRoot);
    var drawerEl = ensureDrawerStrip(wantTiered);
    if (drawerEl) {
      showDrawerStrip(drawerEl);
      paintStrip(drawerEl, lastCfg);
    }
    paintGiftHighlights();
    ensureEmergencyClearBanner();
    // Do not keepDrawerStripAlive here — races Dawn qty/section updates.
  }

  function perfBump(key) {
    try {
      var p = window.__FGPB_CPP && window.__FGPB_CPP.perf;
      if (p && typeof p[key] === "number") p[key] += 1;
    } catch (_e) {}
  }

  function cartSyncToken(cart, paid) {
    return (
      String((cart && cart.item_count) || 0) +
      ":" +
      String((cart && cart.total_price) || 0) +
      ":" +
      String(Math.round((Number(paid) || 0) * 100))
    );
  }

  /** Presentation fingerprint — TTL refresh reapplies when merchant settings change. */
  function designKeyFromCfg(cfg, recs) {
    if (!cfg) return "";
    var tiers = cfg.rewardTiers || [];
    var tierSig = "";
    for (var i = 0; i < tiers.length; i++) {
      var t = tiers[i];
      if (!t) continue;
      tierSig +=
        String(t.tierId || t.id || "") +
        ":" +
        String(t.threshold || "") +
        ":" +
        String(t.variantId || t.giftVariantId || "") +
        ";";
    }
    return [
      cfg.enabled === false ? 0 : 1,
      cfg.heading || "",
      cfg.description || "",
      cfg.bannerTitle || "",
      cfg.bannerSubtitle || "",
      cfg.bar || "",
      cfg.trackColor || "",
      cfg.textColor || "",
      cfg.bannerBg || "",
      cfg.bannerText || "",
      cfg.bodyBg || "",
      cfg.h || "",
      cfg.r || "",
      cfg.threshold || "",
      cfg.giftTitle || "",
      cfg.giftVariantId || "",
      cfg.isTiered ? 1 : 0,
      tierSig,
      recs && recs.enabled !== false ? 1 : 0,
      (recs && recs.heading) || "",
    ].join("|");
  }

  function markProxyCache(token, cfg, recs) {
    lastCartSyncToken = token;
    proxyCacheAt = Date.now();
    lastDesignKey = designKeyFromCfg(cfg, recs);
  }

  function isProxyCacheFresh(token) {
    return !!(
      token &&
      lastCartSyncToken &&
      token === lastCartSyncToken &&
      proxyCacheAt > 0 &&
      Date.now() - proxyCacheAt < PROXY_CACHE_TTL_MS
    );
  }

  function isProxyCacheStale() {
    return !(proxyCacheAt > 0 && Date.now() - proxyCacheAt < PROXY_CACHE_TTL_MS);
  }

  function fetchWidgetState(paid, currency) {
    perfBump("widgetState");
    return fetch(
      "/apps/free-gift/widget-state?cartSubtotal=" +
        encodeURIComponent(Math.max(0, paid)) +
        "&currency=" +
        encodeURIComponent(currency || shopCurrency()) +
        "&currencyRate=" +
        encodeURIComponent(String(presentmentRate())) +
        "&_cs=" +
        Date.now(),
      {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    ).then(function (r) {
      return r.ok ? r.json() : null;
    });
  }

  function applyWidgetStateData(data, paid, currency, syncToken, seqGen) {
    if (seqGen != null && lastPaintedGen > 0 && Number(seqGen) < lastPaintedGen) return;
    if (!data) {
      paintEnabledChrome();
      if (lastRecsCfg) renderBestsellers(lastRecsCfg);
      return;
    }
    try {
      window.__fgpbLastWidgetState = data;
    } catch (_eWs) {}
    var cfg = readCfg(data);
    var recs =
      (data.widgetSettings && data.widgetSettings.cartRecommendations) || lastRecsCfg;
    var livePaid =
      lastCartSnapshot && !cartIsEmpty ? eligiblePaidSubtotal(lastCartSnapshot) : paid;
    var liveCurrency = (lastCartSnapshot && lastCartSnapshot.currency) || currency || shopCurrency();
    if (cfg && cfg.enabled !== false) {
      cfg.cartSubtotal = livePaid;
      cfg.currency = liveCurrency;
      applyProgressCopy(cfg);
      var nextDesign = designKeyFromCfg(cfg, recs);
      if (lastDesignKey && nextDesign !== lastDesignKey) {
        lastPaintKey = "";
      }
      lastCfg = cfg;
      lastRecsCfg = recs;
      markProxyCache(syncToken, cfg, recs);
    } else if (cfg && cfg.enabled === false) {
      // Honor disable on TTL/same-cart refresh; keep anti-flash guard only for
      // brand-new cart signatures (flaky disabled while paid items still present).
      var sameCart = lastCartSyncToken === syncToken;
      if (sameCart || !(lastCfg && lastCfg.enabled && livePaid > 0)) {
        lastCfg = cfg;
        lastRecsCfg = recs;
        markProxyCache(syncToken, cfg, recs);
        lastPaintKey = "";
      }
    }
    paintEnabledChrome();
    if (lastRecsCfg) renderBestsellers(lastRecsCfg);
  }

  function syncEmptyCartChrome() {
    if (syncInFlight) {
      syncQueued = true;
      return syncInFlight;
    }

    var seq = ++syncSeq;
    var paidAtStart = null;
    var seqGen = Number(typeof window !== "undefined" && window.__fgpbCartUiGen) || 0;
    perfBump("sync");

    var known =
      (typeof window !== "undefined" && window.__fgpbLastKnownCart) || lastCartSnapshot;
    var knownAt = Number(typeof window !== "undefined" && window.__fgpbLastKnownCartAt) || 0;
    var useKnown = !!(known && Array.isArray(known.items) && knownAt && Date.now() - knownAt < 4000);

    function afterCart(cart) {
        if (seq !== syncSeq) return null;
        if (seqGen && lastPaintedGen > 0 && seqGen < lastPaintedGen) return null;
        // Failed cart fetch: keep bar, do not treat as empty.
        if (!cart) {
          pinDrawerStripNow();
          pinDrawerRecsNow();
          return null;
        }
        lastCartSnapshot = cart;
        try {
          window.__fgpbLastKnownCart = cart;
        } catch (_eSnap2) {}
        var empty = !(Number(cart.item_count) > 0);
        // ATC in flight — Shopify may still report the previous (empty) cart.
        if (empty && Date.now() < expectDrawerOpenUntil) {
          pinDrawerStripNow();
          pinDrawerRecsNow();
          if (lastCfg && lastCfg.enabled) paintEnabledChrome();
          scheduleSyncChrome(80);
          return null;
        }
        cartIsEmpty = empty;
        var currency = (cart && cart.currency) || shopCurrency();
        if (empty) {
          setProgressCardsHidden(true);
          setRecsHidden(true);
          // Keep drawer strip mounted (hidden) so reopen/add does not flash-mount.
          hideDrawerStrip();
          var emptyToken = "0";
          // Fresh empty cache: skip. Stale: one design refresh (activation/copy/colors).
          if (isProxyCacheFresh(emptyToken)) {
            perfBump("proxySkip");
            return null;
          }
          // load() just seeded design — adopt empty token without a second proxy.
          if (!lastCartSyncToken && proxyCacheAt && Date.now() - proxyCacheAt < 5000) {
            markProxyCache(emptyToken, lastCfg, lastRecsCfg);
            perfBump("proxySkip");
            return null;
          }
          if (lastCartSyncToken === emptyToken) perfBump("proxyStale");
          return fetchWidgetState(0, currency).then(function (data) {
            if (seq !== syncSeq) return;
            if (!data) {
              markProxyCache(emptyToken, lastCfg, lastRecsCfg);
              return;
            }
            var cfg = readCfg(data);
            var recs =
              (data.widgetSettings && data.widgetSettings.cartRecommendations) || lastRecsCfg;
            lastRecsCfg = recs;
            if (cfg && cfg.enabled === false) {
              lastCfg = cfg;
              lastPaintKey = "";
            } else if (cfg) {
              var nextDesign = designKeyFromCfg(cfg, recs);
              if (lastDesignKey && nextDesign !== lastDesignKey) lastPaintKey = "";
              // Empty cart stays hidden; absorb activation + presentation settings.
              if (!lastCfg || lastCfg.enabled === false) {
                lastCfg = cfg;
              } else {
                lastCfg.heading = cfg.heading || lastCfg.heading;
                lastCfg.bannerTitle = cfg.bannerTitle || lastCfg.bannerTitle;
                lastCfg.bannerSubtitle = cfg.bannerSubtitle || lastCfg.bannerSubtitle;
                lastCfg.bar = cfg.bar || lastCfg.bar;
                lastCfg.trackColor = cfg.trackColor || lastCfg.trackColor;
                lastCfg.textColor = cfg.textColor || lastCfg.textColor;
                lastCfg.bannerBg = cfg.bannerBg || lastCfg.bannerBg;
                lastCfg.bannerText = cfg.bannerText || lastCfg.bannerText;
                lastCfg.bodyBg = cfg.bodyBg || lastCfg.bodyBg;
                lastCfg.h = cfg.h != null ? cfg.h : lastCfg.h;
                lastCfg.r = cfg.r != null ? cfg.r : lastCfg.r;
                lastCfg.threshold = cfg.threshold != null ? cfg.threshold : lastCfg.threshold;
                lastCfg.giftTitle = cfg.giftTitle || lastCfg.giftTitle;
                lastCfg.giftVariantId = cfg.giftVariantId || lastCfg.giftVariantId;
                lastCfg.isTiered = cfg.isTiered;
                lastCfg.rewardTiers = cfg.rewardTiers || lastCfg.rewardTiers;
                lastCfg.enabled = cfg.enabled;
              }
            }
            markProxyCache(emptyToken, lastCfg, lastRecsCfg);
          });
        }

        setProgressCardsHidden(false);
        setRecsHidden(false);
        pinDrawerStripNow();
        pinDrawerRecsNow();

        var paid = eligiblePaidSubtotal(cart);
        paidAtStart = paid;
        var syncToken = cartSyncToken(cart, paid);

        // Same cart signature + fresh TTL: reuse cached widget-state (burst coalescing).
        if (lastCfg && lastCfg.enabled && isProxyCacheFresh(syncToken)) {
          perfBump("proxySkip");
          paintEnabledChrome();
          if (lastRecsCfg) renderBestsellers(lastRecsCfg);
          return null;
        }

        // Same signature but TTL expired: allow exactly one proxy refresh (no polling).
        if (lastCfg && lastCfg.enabled && lastCartSyncToken === syncToken) {
          perfBump("proxyStale");
        }

        // Paint remaining/unlocked immediately from the cart snapshot.
        var optimistic = optimisticCfgFromCart(cart);
        if (optimistic) {
          lastCfg = optimistic;
          paintEnabledChrome();
        } else if (lastCfg && lastCfg.enabled) {
          paintEnabledChrome();
        }

        return fetchWidgetState(paid, currency).then(function (data) {
          if (seq !== syncSeq) return;
          applyWidgetStateData(
            data,
            paidAtStart != null ? paidAtStart : paid,
            currency,
            syncToken,
            seqGen,
          );
        });
    }

    var cartPromise;
    if (useKnown) {
      cartPromise = Promise.resolve(known);
    } else {
      perfBump("cartJs");
      cartPromise = fetch("/cart.js", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(function (r) {
        return r.ok ? r.json() : null;
      });
    }

    syncInFlight = cartPromise
      .then(afterCart)
      .catch(function () {
        // Network blip: keep last painted strip visible.
        if (seq === syncSeq && lastCfg && lastCfg.enabled) paintEnabledChrome();
      })
      .finally(function () {
        if (seq !== syncSeq) return;
        syncInFlight = null;
        if (syncQueued) {
          syncQueued = false;
          scheduleSyncChrome(0);
        }
      });

    return syncInFlight;
  }

  function scheduleSyncChrome(delay) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      syncTimer = null;
      syncEmptyCartChrome();
    }, delay == null ? 50 : delay);
  }

  function reapplyChrome(e) {
    var detail = (e && e.detail) || {};
    var cart = detail.cart || null;
    var known = (typeof window !== "undefined" && window.__fgpbLastKnownCart) || lastCartSnapshot;
    if (cart && cart._fgpbVer == null && known && known._fgpbVer != null) cart = known;
    if (!cart) cart = known;
    if (cart && Array.isArray(cart.items)) {
      paintFromCartNow(cart, {
        cartUiGen: cart._fgpbVer != null ? cart._fgpbVer : detail.cartUiGen,
      });
      if (cartIsEmpty) return;
      var paid = eligiblePaidSubtotal(cart);
      var token = cartSyncToken(cart, paid);
      if (lastCfg && lastCfg.enabled && isProxyCacheFresh(token)) return;
    }
    scheduleSyncChrome(50);
  }

  var loadTimer = null;

  function load() {
    if (!onCartPage()) removeStrip();
    fetch(
      "/apps/free-gift/widget-state?cartSubtotal=0&currency=" +
        encodeURIComponent(shopCurrency()) +
        "&currencyRate=" +
        encodeURIComponent(String(presentmentRate())) +
        "&_cs=1",
      {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      },
    )
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        // Failed boot fetch must NOT clobber a live strip painted by syncEmptyCartChrome.
        if (!data) {
          syncEmptyCartChrome();
          booted = true;
          return;
        }
        try {
          window.__fgpbLastWidgetState = data;
        } catch (_eWs) {}
        var cfg = readCfg(data);
        // A disabled boot payload must not hide a strip already proven enabled for a paid cart.
        if (cfg && cfg.enabled === false && lastCfg && lastCfg.enabled) {
          syncEmptyCartChrome();
          booted = true;
          return;
        }
        // Never clobber live fill with a cartSubtotal=0 boot/settings fetch.
        if (lastCfg && lastCfg.enabled && cfg && cfg.enabled !== false) {
          cfg.cartSubtotal = lastCfg.cartSubtotal;
          cfg.progress = lastCfg.progress;
          cfg.heading = lastCfg.heading;
          cfg.remaining = lastCfg.remaining;
          cfg.currency = lastCfg.currency || cfg.currency;
          if ((!cfg.rewardTiers || !cfg.rewardTiers.length) && lastCfg.rewardTiers) {
            cfg.rewardTiers = lastCfg.rewardTiers;
          }
        }
        apply(cfg);
        lastRecsCfg =
          (data.widgetSettings && data.widgetSettings.cartRecommendations) || lastRecsCfg;
        // Page load always fetched widget-state; seed freshness (token finalized after /cart.js).
        proxyCacheAt = Date.now();
        lastDesignKey = designKeyFromCfg(cfg, lastRecsCfg);
        if (onCartPage()) hideCartColumnHeaders();
        // Soft-hide if cart is empty; repaint with paid subtotal when not.
        syncEmptyCartChrome();
        booted = true;
      })
      .catch(function () {
        // Network error: keep any live cfg and still reconcile against /cart.js.
        syncEmptyCartChrome();
        booted = true;
      });
  }

  function scheduleLoad() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(load, 350);
  }

  function boot() {
    load();
    if (onCartPage()) hideCartColumnHeaders();
  }

  // Boot via load() → syncEmptyCartChrome. One delayed reconcile after DOM has drawer nodes
  // (coalesces with load; unchanged cart skips widget-state via lastCartSyncToken).
  boot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (lastCartSnapshot) return;
      scheduleSyncChrome(400);
    });
  }

  /** One stale-cache refresh on tab focus / bfcache restore — never on a timer loop. */
  function maybeResumeStaleProxy() {
    if (!booted) return;
    if (!isProxyCacheStale()) return;
    // Coalesce with any in-flight sync; force path is TTL gate inside syncEmptyCartChrome.
    scheduleSyncChrome(200);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") maybeResumeStaleProxy();
  });
  window.addEventListener("pageshow", function () {
    maybeResumeStaleProxy();
  });

  document.addEventListener("cart:change", reapplyChrome);
  document.addEventListener("fgpb:cart", reapplyChrome);
  // Dawn OS 2.0: also wrap publish so chrome refreshes when the drawer updates.
  // Skip in the theme editor — wrapping + observers freeze the customizer.
  if (!inThemeEditor() && typeof window.publish === "function" && !window.__fgpbCppPublishWrapped) {
    window.__fgpbCppPublishWrapped = true;
    var _fgpbCppPublish = window.publish;
    window.publish = function (eventName, data) {
      var ret = _fgpbCppPublish.apply(this, arguments);
      try {
        var cartEv =
          (window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) || "cart-update";
        if (
          eventName === cartEv ||
          eventName === "cart-update" ||
          eventName === "cart-updated"
        ) {
          reapplyChrome({
            detail: {
              cart: (data && data.cart) || (typeof window !== "undefined" && window.__fgpbLastKnownCart),
              cartUiGen: data && data.cartUiGen,
            },
          });
        }
      } catch (_e) {}
      return ret;
    };
  }
  if (!inThemeEditor() && typeof window.subscribe === "function") {
    try {
      var pubName =
        (window.PUB_SUB_EVENTS && window.PUB_SUB_EVENTS.cartUpdate) || "cart-update";
      window.subscribe(pubName, function () {
        reapplyChrome();
      });
      if (pubName !== "cart-update") {
        window.subscribe("cart-update", function () {
          reapplyChrome();
        });
      }
    } catch (_pub) {}
  }
  // Do not also listen to cart:updated + cart:refresh — Dawn fires multiple and we
  // were stacking widget-state fetches + remounts until qty/price UI froze.
  document.addEventListener("fgpb:tier-status", function () {
    if (cartIsEmpty) return;
    if (lastCfg && lastCfg.enabled) paintEnabledChrome();
  });

  // Unblock stuck carts even before campaign config loads.
  function watchRateLimitErrors() {
    ensureEmergencyClearBanner();
  }
  document.addEventListener("cart:change", watchRateLimitErrors);
  document.addEventListener("cart:updated", watchRateLimitErrors);
  document.addEventListener("cart:refresh", watchRateLimitErrors);
  setTimeout(watchRateLimitErrors, 500);
  setTimeout(watchRateLimitErrors, 2000);
  setTimeout(watchRateLimitErrors, 5000);

  function isDawnDrawerSectionReplace(mutations) {
    if (!mutations || !mutations.length) return false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      var target = m.target;
      if (target && target.nodeType === 1) {
        if (
          target.classList &&
          target.classList.contains("drawer__inner") &&
          m.removedNodes &&
          m.removedNodes.length
        ) {
          return true;
        }
        if (target.id === "CartDrawer" && m.removedNodes && m.removedNodes.length) return true;
      }
      var added = m.addedNodes;
      if (!added || !added.length) continue;
      for (var a = 0; a < added.length; a++) {
        var an = added[a];
        if (!an || an.nodeType !== 1) continue;
        if (
          an.getAttribute &&
          (an.getAttribute("data-fgpb-progress-host") === "1" ||
            an.getAttribute("data-fg-drawer") === "1" ||
            an.getAttribute("data-fgpb-recs") === "drawer")
        ) {
          continue;
        }
        if (
          an.classList &&
          (an.classList.contains("drawer__inner") ||
            an.classList.contains("drawer__header") ||
            an.classList.contains("cart-drawer-items"))
        ) {
          return true;
        }
        if (an.tagName && String(an.tagName).toUpperCase() === "CART-DRAWER-ITEMS") return true;
        if (
          an.querySelector &&
          (an.querySelector(".drawer__header") ||
            an.querySelector("cart-drawer-items") ||
            an.querySelector(".cart-item"))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  if (!inThemeEditor() && typeof MutationObserver !== "undefined") {
    var obsTimer = null;
    drawerObs = new MutationObserver(function (mutations) {
      if (pinning) {
        pendingRepin = true;
        return;
      }
      var sectionReplace = isDawnDrawerSectionReplace(mutations);
      var stripLost = false;
      var recsLost = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        var removed = m.removedNodes;
        if (!removed || !removed.length) continue;
        for (var r = 0; r < removed.length; r++) {
          var rn = removed[r];
          if (!rn || rn.nodeType !== 1) continue;
          if (rn.classList && rn.classList.contains("fgpb-progress-card")) {
            // Only park owned strips — never revive a purged classic card.
            if (isOwnedDrawerStrip(rn)) {
              parkedDrawerStrip = rn;
              stripLost = true;
            } else if (rn.getAttribute && rn.getAttribute("data-fg-drawer") === "1") {
              stripLost = true;
            }
          } else if (rn.getAttribute && rn.getAttribute("data-fgpb-recs") != null) {
            parkedDrawerRecs = rn;
            recsLost = true;
          } else if (rn.querySelector) {
            var nestedStrip =
              rn.querySelector(".fgpb-progress-card[data-fgpb-progress-host]") ||
              rn.querySelector(".fgpb-progress-card[data-fg-drawer]") ||
              rn.querySelector(".fgpb-progress-card");
            if (nestedStrip && isOwnedDrawerStrip(nestedStrip)) {
              parkedDrawerStrip = nestedStrip;
              stripLost = true;
            } else if (nestedStrip && nestedStrip.getAttribute("data-fg-drawer") === "1") {
              stripLost = true;
            }
            var nestedRecs = rn.querySelector("[data-fgpb-recs]");
            if (nestedRecs) {
              parkedDrawerRecs = nestedRecs;
              recsLost = true;
            }
          }
        }
      }
      if (stripLost && parkedDrawerStrip && parkedDrawerStrip.isConnected && inDrawer(parkedDrawerStrip)) {
        stripLost = false;
      }
      if (recsLost && parkedDrawerRecs && parkedDrawerRecs.isConnected && inDrawer(parkedDrawerRecs)) {
        recsLost = false;
      }
      invalidateDrawerCache();
      var drawer = findDrawer();
      var dawnDrawer = !!(drawer && allowsOwnedDrawerStrip(drawer));
      if (!dawnDrawer) releaseNonDawnDrawer(drawer);
      // Schedule after Dawn's current turn — never recover inside renderContents.
      var missingOwned =
        dawnDrawer &&
        !cartIsEmpty &&
        lastCfg &&
        lastCfg.enabled &&
        !liveDrawerHasOwnedHost(drawer);
      if (dawnDrawer && !cartIsEmpty && (sectionReplace || stripLost || missingOwned)) {
        scheduleProgressHostRecover();
      } else if (cartIsEmpty && stripLost) {
        hideDrawerStrip();
      }
      if (
        dawnDrawer &&
        !cartIsEmpty &&
        (recsLost ||
          (lastRecsCfg && lastRecsCfg.enabled !== false && !drawer.querySelector("[data-fgpb-recs]")))
      ) {
        scheduleProgressHostRecover();
      }
      // Remount only — do not re-queue /cart.js from DOM churn.
      return;
    });
    function observeRoot(root) {
      if (root) drawerObs.observe(root, { childList: true, subtree: true });
    }
    function watch() {
      var drawer = findDrawer();
      observeRoot(drawer);
      // Late drawer injection: shallow body watch only when drawer is absent.
      // Do not observe the cart-page form/items tree — subtree paints loop and hang /cart.
      if (!drawer && document.body) {
        drawerObs.observe(document.body, { childList: true, subtree: false });
      }
    }
    if (document.body) watch();
    else document.addEventListener("DOMContentLoaded", watch);
  }

  // Remount when the cart drawer opens (Dawn often rebuilds drawer HTML on open/update).
  function onDrawerOpenSoon() {
    if (cartIsEmpty && Date.now() >= expectDrawerOpenUntil) {
      hideDrawerStrip();
      setProgressCardsHidden(true);
      setRecsHidden(true);
      scheduleSyncChrome(50);
      return;
    }
    scheduleProgressHostRecover();
    if (lastCartSnapshot) paintFromCartNow(lastCartSnapshot);
    else scheduleSyncChrome(50);
  }

  function thirdPartyCartOwnsOpen() {
    try {
      var compat = typeof window !== "undefined" ? window.__fgpbDrawerCompat : null;
      if (!compat || typeof compat.getStatus !== "function") return false;
      var st = compat.getStatus();
      if (!st || st.adapterId === "none" || st.adapterId === "cart-popup") return false;
      return st.status === "supported" || st.status === "limited";
    } catch (_e) {
      return false;
    }
  }

  /**
   * After Add to cart, open the theme drawer, then pin the gift bar.
   * Never steal the product form (no preventDefault). When a third-party
   * cart adapter is active it owns open — do not force Dawn's empty drawer.
   */
  function openThemeCartDrawer() {
    if (thirdPartyCartOwnsOpen()) return false;
    if (isDrawerOpen()) return true;
    var host = document.querySelector("cart-drawer");
    if (host) {
      try {
        if (typeof host.open === "function") {
          host.open();
          return true;
        }
      } catch (_e) {}
      try {
        if (typeof host.show === "function") {
          host.show();
          return true;
        }
      } catch (_e2) {}
      try {
        if (typeof HTMLDialogElement !== "undefined" && host instanceof HTMLDialogElement && typeof host.showModal === "function") {
          if (!host.open) host.showModal();
          return true;
        }
      } catch (_e3) {}
    }
    var bubble = document.getElementById("cart-icon-bubble");
    if (bubble && typeof bubble.click === "function") {
      try {
        bubble.click();
        return true;
      } catch (_e4) {}
    }
    return false;
  }

  var addOpenTimer = 0;
  function onProductAddToCart() {
    markExpectDrawerOpen();
    if (addOpenTimer) clearTimeout(addOpenTimer);
    addOpenTimer = setTimeout(function () {
      addOpenTimer = 0;
      if (!isDrawerOpen()) openThemeCartDrawer();
      onDrawerOpenSoon();
    }, 80);
    setTimeout(function () {
      if (!isDrawerOpen()) openThemeCartDrawer();
      onDrawerOpenSoon();
    }, 400);
  }

  function isCartAddForm(form) {
    if (!form) return false;
    var action = "";
    try {
      action = String(form.getAttribute("action") || form.action || "");
    } catch (_e) {
      return false;
    }
    return /\/cart\/add/i.test(action);
  }

  document.addEventListener(
    "submit",
    function (event) {
      var form = event.target;
      if (!form || form.closest && form.closest("cart-drawer, #CartDrawer, .cart-drawer")) return;
      if (isCartAddForm(form) || (form.closest && form.closest("product-form"))) {
        onProductAddToCart();
      }
    },
    false,
  );

  document.addEventListener(
    "click",
    function (event) {
      var t = event.target;
      if (!t || !t.closest) return;
      // Do NOT hook product Add to cart — races Dawn ProductForm and worsens 429 recovery.
      if (
        t.closest("#cart-icon-bubble") ||
        t.closest("a[href='/cart']") ||
        t.closest("[href='#CartDrawer']")
      ) {
        onDrawerOpenSoon();
        setTimeout(onDrawerOpenSoon, 80);
        setTimeout(onDrawerOpenSoon, 250);
      }
    },
    true,
  );

  if (typeof MutationObserver !== "undefined") {
    var openObs = new MutationObserver(function () {
      var drawer = findDrawer();
      if (!drawer) return;
      var open = isDrawerOpen(drawer);
      syncDrawerOpenAttr();
      if (open || Date.now() < expectDrawerOpenUntil) onDrawerOpenSoon();
      else parkClosedDrawerChrome(drawer);
    });
    function watchDrawerOpen() {
      var drawer = findDrawer();
      if (drawer) {
        openObs.observe(drawer, { attributes: true, attributeFilter: ["class", "open", "aria-hidden"] });
        var host = drawer.closest && drawer.closest("cart-drawer");
        if (host && host !== drawer) {
          openObs.observe(host, { attributes: true, attributeFilter: ["class", "open", "aria-hidden"] });
        }
        if (!isDrawerOpen(drawer)) parkClosedDrawerChrome(drawer);
        else syncDrawerOpenAttr();
      }
    }
    if (document.body) watchDrawerOpen();
    else document.addEventListener("DOMContentLoaded", watchDrawerOpen);
    setTimeout(watchDrawerOpen, 1000);
  }
})();
