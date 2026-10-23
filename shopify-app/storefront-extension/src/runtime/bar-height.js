/* Applies widget size + track thickness + template outside the 10KB gift-bar budget.
   Product / section cards use full merchant size.
   Cart drawer + cart page use a capped scale so spacious stays cart-optimized. */
(function () {
  // Isolation stage gate — no design fetch or observer below stage 2.
  try {
    var rtFlags = (typeof window !== "undefined" && window.__FGPB_RT && window.__FGPB_RT.flags) || null;
    if (rtFlags && !rtFlags.renderProgress) return;
  } catch (_gate) {}

  var timer = null;
  var last = null;
  var booted = false;

  function num(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function str(v, fallback) {
    var s = v == null ? "" : String(v).trim();
    return s || fallback;
  }

  function slug(template) {
    return str(template, "Premium")
      .toLowerCase()
      .replace(/\s+/g, "-");
  }

  function channel(hex, i) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return Number.isFinite(n) ? n / 255 : 0;
  }

  function luminance(hex) {
    function lin(c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
  }

  function contrastRatio(a, b) {
    var L1 = luminance(a);
    var L2 = luminance(b);
    var hi = Math.max(L1, L2);
    var lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Keep merchant text color when readable; otherwise flip to white/black on the card bg. */
  function readableText(bg, preferred) {
    var pref = str(preferred, "#111827");
    if (contrastRatio(bg, pref) >= 4.5) return pref;
    return luminance(bg) < 0.55 ? "#ffffff" : "#111111";
  }

  function read(data) {
    if (!data) return null;
    var colors = data.colors || {};
    var ws = data.widgetSettings || {};
    var bg = str(colors.backgroundColor || ws.backgroundColor, "#f8fafc");
    var text = str(colors.textColor || ws.textColor, "#111827");
    return {
      h: num(colors.progressHeight != null ? colors.progressHeight : ws.progressHeight, 12),
      p: num(colors.widgetPadding != null ? colors.widgetPadding : ws.widgetPadding, 16),
      t: slug(ws.template || data.template || "Premium"),
      bg: bg,
      bar: str(colors.barColor || ws.barColor, "#111111"),
      text: readableText(bg, text),
      r: num(colors.borderRadius != null ? colors.borderRadius : ws.borderRadius, 14),
    };
  }

  function cartPad(full) {
    // Map 2→2 … 32→14 so Spacious still grows, but never fills the drawer with empty blue.
    return Math.max(2, Math.min(14, Math.round(2 + full * 0.375)));
  }

  function metrics(pad) {
    var gap = Math.max(4, Math.min(14, Math.round(pad * 0.55)));
    var hs = pad <= 6 ? 13 : pad >= 20 ? 16 : 14;
    var ts = pad <= 6 ? 11 : 13;
    return { gap: gap, hs: hs, ts: ts };
  }

  function applyTemplate(card, cfg) {
    var t = cfg.t;
    card.setAttribute("data-fg-tpl", t);
    card.style.setProperty("--fg-bg", cfg.bg);
    card.style.setProperty("--fg-b", cfg.bar);
    card.style.setProperty("--fg-t", cfg.text);
    card.style.setProperty("--fg-r", cfg.r + "px");

    // Inline fallbacks so Gradient / Celebration work without color-mix support.
    if (t === "gradient") {
      card.style.background =
        "linear-gradient(135deg, " + cfg.bg + " 0%, " + cfg.bar + "33 100%)";
    } else if (t === "celebration") {
      card.style.background =
        "linear-gradient(160deg, " + cfg.bg + " 0%, " + cfg.bar + "28 52%, " + cfg.bg + " 100%)";
      card.style.boxShadow = "0 10px 28px " + cfg.bar + "2a";
      card.style.borderColor = cfg.bar + "55";
    } else if (t === "minimal") {
      card.style.background = cfg.bg;
      card.style.boxShadow = "none";
    } else if (t === "cart-drawer") {
      card.style.background = cfg.bg;
      card.style.boxShadow = "none";
      card.style.borderRadius = "0";
    } else if (t === "mobile-compact") {
      card.style.background = cfg.bg;
      card.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.05)";
    } else {
      card.style.background = cfg.bg;
      card.style.boxShadow = "";
      card.style.borderColor = "";
    }
  }

  function applyCard(card, h, pad, cfg) {
    var m = metrics(pad);
    card.style.setProperty("--fg-h", h + "px");
    card.style.setProperty("--fg-pad", pad + "px");
    card.style.setProperty("--fg-gap", m.gap + "px");
    card.style.setProperty("--fg-hs", m.hs + "px");
    card.style.setProperty("--fg-ts", m.ts + "px");
    card.style.setProperty("padding", pad + "px", "important");
    applyTemplate(card, cfg);

    var heading = card.querySelector(".fgpb-progress-heading");
    var textEl = card.querySelector(".fgpb-progress-text");
    if (heading) heading.style.color = cfg.text;
    if (textEl) textEl.style.color = cfg.text;

    var track = card.querySelector(".fgpb-progress-track");
    if (track) {
      track.style.setProperty("height", h + "px", "important");
      track.style.setProperty("min-height", h + "px", "important");
    }
  }

  function isCartStrip(card) {
    return (
      card.getAttribute("data-cp") === "1" ||
      card.getAttribute("data-fg-strip") === "1" ||
      card.classList.contains("fgpb-progress-strip")
    );
  }

  function isDrawerCard(card) {
    return !!(
      card.closest("cart-drawer") ||
      card.closest("#CartDrawer") ||
      card.closest(".cart-drawer")
    );
  }

  function paint(cfg) {
    if (!cfg) return;
    var h = Math.max(4, Math.min(40, Math.round(cfg.h)));
    var pFull = Math.max(2, Math.min(32, Math.round(cfg.p)));
    var pCart = cartPad(pFull);
    last = cfg;
    last.h = h;
    last.p = pFull;

    var mFull = metrics(pFull);
    var css =
      ".fgpb-progress-card:not([data-cp]):not([data-fg-strip]):not(.fgpb-progress-strip){--fg-h:" +
      h +
      "px;--fg-pad:" +
      pFull +
      "px;--fg-gap:" +
      mFull.gap +
      "px;--fg-hs:" +
      mFull.hs +
      "px;--fg-ts:" +
      mFull.ts +
      "px;--fg-bg:" +
      cfg.bg +
      ";--fg-b:" +
      cfg.bar +
      ";--fg-t:" +
      cfg.text +
      ";--fg-r:" +
      cfg.r +
      "px}" +
      ".fgpb-progress-card:not([data-cp]):not([data-fg-strip]):not(.fgpb-progress-strip) .fgpb-progress-track{height:" +
      h +
      "px!important;min-height:" +
      h +
      "px!important}" +
      "cart-drawer .fgpb-progress-card,#CartDrawer .fgpb-progress-card,.cart-drawer .fgpb-progress-card{--fg-pad:" +
      pCart +
      "px;--fg-gap:" +
      metrics(pCart).gap +
      "px}";

    var tag = document.getElementById("fgpb-bar-height-style");
    if (!tag) {
      tag = document.createElement("style");
      tag.id = "fgpb-bar-height-style";
      (document.head || document.documentElement).appendChild(tag);
    }
    tag.textContent = css;

    var cards = document.querySelectorAll(".fgpb-progress-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      // Cart page strip has its own presenter (cart-page-progress.js).
      if (isCartStrip(card)) continue;
      var pad = isDrawerCard(card) ? pCart : pFull;
      applyCard(card, h, pad, cfg);
      if (isDrawerCard(card)) {
        card.style.setProperty("padding", pad + "px 1.5rem", "important");
      }
    }
  }

  function load() {
    var cached = typeof window !== "undefined" ? window.__fgpbLastWidgetState : null;
    if (cached) {
      paint(read(cached));
      booted = true;
      return;
    }
    var currency = "";
    var currencyRate = 1;
    try {
      currency = String((window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "");
      var rate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate);
      if (Number.isFinite(rate) && rate > 0) currencyRate = rate;
    } catch (_currencyError) {}
    fetch(
      "/apps/free-gift/widget-state?cartSubtotal=0&currency=" +
        encodeURIComponent(currency) +
        "&currencyRate=" +
        encodeURIComponent(String(currencyRate)) +
        "&_bh=1",
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
        paint(read(data));
        booted = true;
      })
      .catch(function () {});
  }

  /** Design config does not change with cart totals — repaint cached config only. */
  function onCartChrome() {
    var cached = typeof window !== "undefined" ? window.__fgpbLastWidgetState : null;
    if (cached) last = read(cached) || last;
    if (last) paint(last);
    else if (!booted) scheduleBoot();
  }

  function scheduleBoot() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, 120);
  }

  function boot() {
    scheduleBoot();
  }

  // Defer first network+paint off the critical path when the browser allows it.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(boot, { timeout: 1200 });
  } else {
    setTimeout(boot, 0);
  }

  document.addEventListener("cart:change", onCartChrome);
  document.addEventListener("cart:updated", onCartChrome);
  document.addEventListener("cart:refresh", onCartChrome);
  document.addEventListener("fgpb:cart", onCartChrome);

  if (typeof MutationObserver !== "undefined") {
    var obsTimer = null;
    var obs = new MutationObserver(function () {
      try {
        if (window.Shopify && (window.Shopify.designMode || window.Shopify.inspectMode)) return;
      } catch (_e) {}
      if (obsTimer) clearTimeout(obsTimer);
      obsTimer = setTimeout(function () {
        if (last) paint(last);
        else if (!booted) scheduleBoot();
      }, 160);
    });
    function observeRoot(root) {
      if (root) obs.observe(root, { childList: true, subtree: true });
    }
    function watch() {
      // Prefer scoped roots over document.body to cut MutationObserver cost.
      var drawer =
        document.querySelector("cart-drawer") ||
        document.getElementById("CartDrawer") ||
        document.querySelector(".cart-drawer");
      observeRoot(drawer);
      var product =
        document.querySelector("product-info") ||
        document.querySelector(".product__info-container") ||
        document.querySelector(".product");
      observeRoot(product);
      // Fallback: watch body childList only (no subtree) for late drawer injection.
      if (!drawer && document.body) {
        obs.observe(document.body, { childList: true, subtree: false });
      }
    }
    if (document.body) watch();
    else document.addEventListener("DOMContentLoaded", watch);
  }
})();
