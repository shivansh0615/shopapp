/* Confetti + unlock popup — merchant-configurable via widgetSettings.celebrationPopup. */
(function () {
  // Isolation stage gate — silent below stage 2 so a clean Dawn baseline has no
  // UpsellTrix reads, timers, or overlays at all.
  try {
    var rtFlags = (typeof window !== "undefined" && window.__FGPB_RT && window.__FGPB_RT.flags) || null;
    if (rtFlags && !rtFlags.renderProgress) return;
  } catch (_gate) {}

  var prevEligible = null;
  var prevUnlockedCount = null;
  var busy = false;
  var checkQueued = false;
  var baselined = false;
  var nextCheckIsBoot = false;
  var confirmedGiftAdd = false;
  var STYLE_ID = "fgpb-unlock-style";
  var ROOT_ID = "fgpb-unlock-root";

  function paidSubtotal(cart) {
    var items = (cart && cart.items) || [];
    var sum = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var props = it.properties || {};
      var giftFlag = props._fgpb_free_gift;
      if (
        giftFlag === "true" ||
        giftFlag === true ||
        giftFlag === "1" ||
        props["Free Gift"] === "UNLOCKED" ||
        props["Free Gift"] === "Yes" ||
        (props._fgpb_tier_id && String(props._fgpb_tier_id).trim())
      ) {
        continue;
      }
      var line = Number(it.final_line_price != null ? it.final_line_price : it.line_price);
      if (!Number.isFinite(line)) continue;
      sum += line;
    }
    return sum / 100;
  }

  function ensureStyles() {
    var s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement("style");
      s.id = STYLE_ID;
      document.head.appendChild(s);
    }
    s.textContent =
      "#" +
      ROOT_ID +
      "{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;pointer-events:none}" +
      "#" +
      ROOT_ID +
      "[data-open='1']{pointer-events:auto}" +
      "#" +
      ROOT_ID +
      "[data-style='toast']{align-items:flex-start;padding-top:18px}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer']{position:relative;inset:auto;z-index:30;display:block;width:100%;margin:0 0 6px;padding:0;pointer-events:auto;align-items:stretch;justify-content:stretch}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-style='toast']{padding-top:0}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__scrim{position:absolute;inset:0;background:rgba(15,23,42,.42);opacity:0;transition:opacity .25s ease}" +
      "#" +
      ROOT_ID +
      "[data-open='1'] .fgpb-unlock__scrim{opacity:1}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__scrim{display:none}" +
      "#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__scrim,#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__scrim{background:rgba(15,23,42,.28)}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__card{position:relative;z-index:2;width:min(92vw,340px);padding:28px 22px 20px;border-radius:18px;background:#fff;color:#111;text-align:center;box-shadow:0 18px 50px rgba(15,23,42,.28);transform:scale(.92) translateY(12px);opacity:0;transition:transform .28s cubic-bezier(.22,1,.36,1),opacity .28s ease}" +
      "#" +
      ROOT_ID +
      "[data-open='1'] .fgpb-unlock__card{transform:scale(1) translateY(0);opacity:1}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__card{width:100%;max-width:none;margin:0;padding:6px 8px;box-shadow:0 4px 12px rgba(15,23,42,.1);border:1px solid rgba(17,24,39,.06);transform:translateY(6px);zoom:var(--fgpb-drawer-scale,.52)}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-open='1'] .fgpb-unlock__card{transform:translateY(0)}" +
      "#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__card{padding:18px 16px 14px;box-shadow:0 8px 24px rgba(15,23,42,.16)}" +
      "#" +
      ROOT_ID +
      "[data-style='soft'] .fgpb-unlock__card{box-shadow:0 16px 40px rgba(15,23,42,.12)}" +
      "#" +
      ROOT_ID +
      "[data-style='bold'] .fgpb-unlock__card{background:#111;color:#fff}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__card{width:min(94vw,420px);display:flex;align-items:center;gap:12px;text-align:left;padding:14px 16px;transform:translateY(-16px)}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'][data-open='1'] .fgpb-unlock__card{transform:translateY(0)}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-style='toast'] .fgpb-unlock__card{width:100%;padding:6px 8px;gap:8px;min-height:0;transform:translateY(6px);zoom:var(--fgpb-drawer-scale,.52)}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-style='toast'][data-open='1'] .fgpb-unlock__card{transform:translateY(0)}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__copy{flex:1;min-width:0}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__copy{min-width:0}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__icon{width:52px;height:52px;margin:0 auto 12px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:#111;color:#fff}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__icon{width:22px;height:22px;margin:0 auto 4px}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__icon{width:40px;height:40px;margin:0;flex:0 0 auto}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-style='toast'] .fgpb-unlock__icon{width:22px;height:22px}" +
      "#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__icon{width:40px;height:40px}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__icon svg{width:26px;height:26px;display:block}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__icon svg,#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__icon svg{width:20px;height:20px}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__icon svg{width:14px;height:14px}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__title{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em;line-height:1.25}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__title,#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__title{font-size:15px}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__title{font-size:12px;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__sub{margin:8px 0 0;font-size:14px;color:#555;line-height:1.4}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__sub{margin:4px 0 0;font-size:12px}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__sub{margin:2px 0 0;font-size:10px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}" +
      "#" +
      ROOT_ID +
      "[data-style='bold'] .fgpb-unlock__sub{color:#cfcfcf}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__btn{margin-top:18px;appearance:none;border:none;border-radius:999px;background:#111;color:#fff;font-size:14px;font-weight:700;padding:11px 22px;cursor:pointer}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__btn{margin-top:4px;padding:4px 10px;font-size:10px;line-height:1.2}" +
      "#" +
      ROOT_ID +
      "[data-style='toast'] .fgpb-unlock__btn{margin-top:0;flex:0 0 auto;padding:9px 14px;font-size:12px}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'][data-style='toast'] .fgpb-unlock__btn{padding:4px 10px;font-size:10px;line-height:1.2}" +
      "#" +
      ROOT_ID +
      "[data-style='minimal'] .fgpb-unlock__btn{margin-top:12px;padding:9px 16px;font-size:13px}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__burst{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__burst{border-radius:inherit;overflow:hidden}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__piece{position:absolute;top:-24px;border-radius:2px;opacity:0;will-change:transform,opacity;animation:fgpb-confetti-fall var(--dur,2.4s) cubic-bezier(.15,.6,.3,1) forwards}" +
      "#" +
      ROOT_ID +
      "[data-anchor='drawer'] .fgpb-unlock__piece{animation-name:fgpb-confetti-drawer}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__piece.is-round{border-radius:999px}" +
      "#" +
      ROOT_ID +
      " .fgpb-unlock__piece.is-ribbon{border-radius:1px;width:4px!important}" +
      ".fgpb-drawer-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:40}" +
      ".fgpb-screen-confetti{position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:2147483001}" +
      ".fgpb-drawer-confetti .fgpb-unlock__piece,.fgpb-screen-confetti .fgpb-unlock__piece{position:absolute;top:-24px;border-radius:2px;opacity:0;will-change:transform,opacity;animation:fgpb-confetti-fall var(--dur,2.4s) cubic-bezier(.15,.6,.3,1) forwards}" +
      ".fgpb-drawer-confetti .fgpb-unlock__piece{animation-name:fgpb-confetti-drawer-full}" +
      ".fgpb-screen-confetti .fgpb-unlock__piece{animation-name:fgpb-confetti-fall}" +
      ".fgpb-drawer-confetti .fgpb-unlock__piece.is-round,.fgpb-screen-confetti .fgpb-unlock__piece.is-round{border-radius:999px}" +
      ".fgpb-drawer-confetti .fgpb-unlock__piece.is-ribbon,.fgpb-screen-confetti .fgpb-unlock__piece.is-ribbon{border-radius:1px;width:4px!important}" +
      "@keyframes fgpb-confetti-fall{0%{opacity:1;transform:translate3d(0,-40px,0) rotate(0) scale(1)}12%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),115vh,0) rotate(var(--rot)) scale(.85)}}" +
      "@keyframes fgpb-confetti-drawer{0%{opacity:1;transform:translate3d(0,-8px,0) rotate(0) scale(1)}15%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),120px,0) rotate(var(--rot)) scale(.9)}}" +
      "@keyframes fgpb-confetti-drawer-full{0%{opacity:1;transform:translate3d(0,-12px,0) rotate(0) scale(1)}12%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),var(--dy,110%),0) rotate(var(--rot)) scale(.88)}}";
  }

  function findCartDrawerRoot() {
    return (
      findOpenCartDrawer() ||
      document.querySelector("cart-drawer") ||
      document.querySelector("#CartDrawer") ||
      document.querySelector(".cart-drawer") ||
      null
    );
  }

  function findDrawerConfettiHost(drawer) {
    if (!drawer) return null;
    return (
      drawer.querySelector(".drawer__inner") ||
      drawer.querySelector(".cart-drawer__inner") ||
      drawer.querySelector("#CartDrawer") ||
      drawer
    );
  }

  function findOpenCartDrawer() {
    return (
      document.querySelector("cart-drawer[open]") ||
      document.querySelector("cart-drawer.active") ||
      document.querySelector("#CartDrawer.active") ||
      document.querySelector(".cart-drawer.is-open") ||
      document.querySelector("cart-drawer.is-open") ||
      null
    );
  }

  function findDrawerProgressStrip() {
    var drawer =
      findOpenCartDrawer() ||
      document.querySelector("cart-drawer") ||
      document.querySelector("#CartDrawer") ||
      document.querySelector(".cart-drawer");
    if (!drawer) return null;
    var open = findOpenCartDrawer();
    // Prefer open drawer; still allow mounting if strip exists and drawer is animating open.
    if (!open) {
      var cs = window.getComputedStyle ? window.getComputedStyle(drawer) : null;
      if (cs && (cs.visibility === "hidden" || cs.display === "none")) return null;
      if (drawer.tagName === "CART-DRAWER" && !drawer.hasAttribute("open")) {
        // Closed custom element — only use if strip is currently visible on screen.
        var probe = drawer.querySelector(".fgpb-progress-card");
        if (!probe) return null;
        var r = probe.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return null;
      }
    }
    return (
      drawer.querySelector(".fgpb-progress-card[data-fg-drawer]") ||
      drawer.querySelector(".fgpb-progress-card.fgpb-progress-strip") ||
      drawer.querySelector(".fgpb-progress-card")
    );
  }

  function sparkDrawerConfetti(heavy) {
    var drawer = findCartDrawerRoot();
    var hostParent = findDrawerConfettiHost(drawer);
    if (!hostParent) return null;
    var prev = hostParent.querySelector(".fgpb-drawer-confetti");
    if (prev) prev.remove();
    var host = document.createElement("div");
    host.className = "fgpb-drawer-confetti";
    host.setAttribute("aria-hidden", "true");
    var pos = window.getComputedStyle ? window.getComputedStyle(hostParent).position : "";
    if (!pos || pos === "static") hostParent.style.position = "relative";
    hostParent.appendChild(host);

    var colors = heavy
      ? ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"]
      : ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7"];
    var count = heavy ? 72 : 48;
    var height = Math.max(hostParent.clientHeight || 480, 360);
    for (var i = 0; i < count; i++) {
      var q = document.createElement("span");
      q.className = "fgpb-unlock__piece" + (i % 3 === 0 ? " is-round" : i % 5 === 0 ? " is-ribbon" : "");
      q.style.left = Math.random() * 100 + "%";
      q.style.top = -10 - Math.random() * 40 + "px";
      q.style.background = colors[i % colors.length];
      q.style.setProperty("--dx", (Math.random() * 200 - 100).toFixed(1) + "px");
      q.style.setProperty("--dy", Math.round(height * (0.75 + Math.random() * 0.45)) + "px");
      q.style.setProperty("--rot", (Math.random() * 1080 - 540).toFixed(0) + "deg");
      q.style.setProperty("--dur", (1.6 + Math.random() * 1.4).toFixed(2) + "s");
      q.style.animationDelay = (Math.random() * 0.55).toFixed(2) + "s";
      q.style.width = 5 + Math.random() * 10 + "px";
      q.style.height = 7 + Math.random() * 11 + "px";
      host.appendChild(q);
    }
    setTimeout(function () {
      if (host.parentNode) host.parentNode.removeChild(host);
    }, 3200);
    return host;
  }

  function sparkScreenConfetti(heavy) {
    var prev = document.querySelector(".fgpb-screen-confetti");
    if (prev) prev.remove();
    var host = document.createElement("div");
    host.className = "fgpb-screen-confetti";
    host.id = "fgpb-screen-confetti";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);

    var colors = heavy
      ? ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#fff"]
      : ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7"];
    var count = heavy ? 96 : 64;
    for (var i = 0; i < count; i++) {
      var q = document.createElement("span");
      q.className = "fgpb-unlock__piece" + (i % 3 === 0 ? " is-round" : i % 5 === 0 ? " is-ribbon" : "");
      q.style.left = Math.random() * 100 + "%";
      q.style.top = -12 - Math.random() * 60 + "px";
      q.style.background = colors[i % colors.length];
      q.style.setProperty("--dx", (Math.random() * 520 - 260).toFixed(1) + "px");
      q.style.setProperty("--rot", (Math.random() * 1080 - 540).toFixed(0) + "deg");
      q.style.setProperty("--dur", (2.1 + Math.random() * 1.8).toFixed(2) + "s");
      q.style.animationDelay = (Math.random() * 0.65).toFixed(2) + "s";
      q.style.width = 5 + Math.random() * 11 + "px";
      q.style.height = 7 + Math.random() * 12 + "px";
      host.appendChild(q);
    }
    if (heavy) {
      setTimeout(function () {
        for (var j = 0; j < 36; j++) {
          var p = document.createElement("span");
          p.className = "fgpb-unlock__piece is-round";
          p.style.left = Math.random() * 100 + "%";
          p.style.top = -8 - Math.random() * 40 + "px";
          p.style.background = colors[j % colors.length];
          p.style.setProperty("--dx", (Math.random() * 480 - 240).toFixed(1) + "px");
          p.style.setProperty("--rot", (Math.random() * 1080 - 540).toFixed(0) + "deg");
          p.style.setProperty("--dur", (2 + Math.random() * 1.6).toFixed(2) + "s");
          p.style.animationDelay = (0.15 + Math.random() * 0.55).toFixed(2) + "s";
          p.style.width = 6 + Math.random() * 11 + "px";
          p.style.height = 8 + Math.random() * 12 + "px";
          host.appendChild(p);
        }
      }, 220);
    }
    setTimeout(function () {
      if (host.parentNode) host.parentNode.removeChild(host);
    }, 4200);
    return host;
  }

  function closePopup() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.setAttribute("data-open", "0");
    setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      var screen = document.getElementById("fgpb-screen-confetti");
      if (screen && screen.parentNode) screen.parentNode.removeChild(screen);
    }, 280);
  }

  function spawnConfetti(root, heavy, local) {
    var layer = root.querySelector(".fgpb-unlock__burst") || root;
    if (!layer) return;
    var colors = heavy
      ? ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"]
      : ["#111", "#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7"];
    var count = local ? (heavy ? 28 : 18) : heavy ? 56 : 36;
    for (var i = 0; i < count; i++) {
      var q = document.createElement("span");
      q.className = "fgpb-unlock__piece" + (i % 3 === 0 ? " is-round" : i % 5 === 0 ? " is-ribbon" : "");
      q.style.left = Math.random() * 100 + "%";
      q.style.background = colors[i % colors.length];
      q.style.setProperty("--dx", (Math.random() * (local ? 160 : 480) - (local ? 80 : 240)).toFixed(1) + "px");
      q.style.setProperty("--rot", (Math.random() * 1080 - 540).toFixed(0) + "deg");
      q.style.setProperty("--dur", (local ? 1.2 + Math.random() * 0.9 : 2 + Math.random() * 1.6).toFixed(2) + "s");
      q.style.animationDelay = (Math.random() * 0.35).toFixed(2) + "s";
      q.style.width = 5 + Math.random() * (local ? 8 : 11) + "px";
      q.style.height = 6 + Math.random() * (local ? 9 : 12) + "px";
      layer.appendChild(q);
    }
    if (heavy && !local) {
      setTimeout(function () {
        for (var j = 0; j < 24; j++) {
          var p = document.createElement("span");
          p.className = "fgpb-unlock__piece is-round";
          p.style.left = Math.random() * 100 + "%";
          p.style.background = colors[j % colors.length];
          p.style.setProperty("--dx", (Math.random() * 480 - 240).toFixed(1) + "px");
          p.style.setProperty("--rot", (Math.random() * 1080 - 540).toFixed(0) + "deg");
          p.style.setProperty("--dur", (2 + Math.random() * 1.6).toFixed(2) + "s");
          p.style.animationDelay = (0.2 + Math.random() * 0.5).toFixed(2) + "s";
          p.style.width = 6 + Math.random() * 11 + "px";
          p.style.height = 8 + Math.random() * 12 + "px";
          layer.appendChild(p);
        }
      }, 280);
    }
  }

  function readCeleb(ws, unlockedWs) {
    var c = (ws && ws.celebrationPopup) || {};
    var style = String(c.style || "classic").toLowerCase();
    if (
      style !== "classic" &&
      style !== "minimal" &&
      style !== "confetti" &&
      style !== "soft" &&
      style !== "bold" &&
      style !== "toast"
    ) {
      style = "classic";
    }
    return {
      enabled: c.enabled !== false,
      style: style,
      tierHeading: c.tierHeading || "You've unlocked a free gift!",
      tierDescription: c.tierDescription || "Keep shopping to unlock more tier gifts.",
      heading: c.heading || (unlockedWs && unlockedWs.heading) || "You've unlocked your free gift!",
      description:
        c.description ||
        (unlockedWs && unlockedWs.description) ||
        "Your free gift has been added to the cart.",
      buttonText: c.buttonText || "Awesome",
      borderRadius: Math.max(0, Math.min(32, Math.round(Number(c.borderRadius) || 18))),
      cardBackgroundColor: c.cardBackgroundColor || "#ffffff",
      titleColor: c.titleColor || "#111111",
      descriptionColor: c.descriptionColor || "#555555",
      buttonBackgroundColor: c.buttonBackgroundColor || "#111111",
      buttonTextColor: c.buttonTextColor || "#ffffff",
      iconBackgroundColor: c.iconBackgroundColor || "#111111",
      showIcon: c.showIcon !== false,
      showConfetti: c.showConfetti !== false && style !== "minimal",
      autoCloseMs: Math.max(2000, Math.min(15000, Number(c.autoCloseMs) || 6500)),
      drawerSizePercent: Math.max(30, Math.min(100, Math.round(Number(c.drawerSizePercent) || 52))),
      placement: "center",
    };
  }

  function celebrate(heading, description, cfg) {
    if (!cfg || cfg.enabled === false) return;
    ensureStyles();
    var existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    var preferDrawer = cfg.placement === "drawer";
    var strip = preferDrawer ? findDrawerProgressStrip() : null;
    var root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-open", "0");
    root.setAttribute("data-style", cfg.style || "classic");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", strip ? "false" : "true");
    if (strip) root.setAttribute("data-anchor", "drawer");

    var drawerScale =
      Math.max(30, Math.min(100, Number(cfg.drawerSizePercent) || 52)) / 100;
    root.style.setProperty("--fgpb-drawer-scale", String(drawerScale));

    var iconHtml =
      '<div class="fgpb-unlock__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M20 7h-2.18A3 3 0 0 0 15 4a3 3 0 0 0-2.82 2H11.8A3 3 0 0 0 9 4a3 3 0 0 0-2.82 3H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1ZM9 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM3 12v7a2 2 0 0 0 2 2h6v-9H3Zm10 9h6a2 2 0 0 0 2-2v-7h-8v9Z"/></svg>' +
      "</div>";

    var isToast = cfg.style === "toast" || !!strip;
    if (isToast) {
      root.innerHTML =
        '<div class="fgpb-unlock__scrim" data-fgpb-unlock-close></div>' +
        '<div class="fgpb-unlock__card">' +
        (cfg.showIcon ? iconHtml : "") +
        '<div class="fgpb-unlock__copy">' +
        '<p class="fgpb-unlock__title"></p>' +
        '<p class="fgpb-unlock__sub"></p>' +
        "</div>" +
        '<button type="button" class="fgpb-unlock__btn" data-fgpb-unlock-close></button>' +
        '<div class="fgpb-unlock__burst" aria-hidden="true"></div>' +
        "</div>";
      if (strip && cfg.style !== "toast") root.setAttribute("data-style", "toast");
    } else {
      root.innerHTML =
        '<div class="fgpb-unlock__scrim" data-fgpb-unlock-close></div>' +
        '<div class="fgpb-unlock__card">' +
        (cfg.showIcon ? iconHtml : "") +
        '<p class="fgpb-unlock__title"></p>' +
        '<p class="fgpb-unlock__sub"></p>' +
        '<button type="button" class="fgpb-unlock__btn" data-fgpb-unlock-close></button>' +
        '<div class="fgpb-unlock__burst" aria-hidden="true"></div>' +
        "</div>";
    }

    var card = root.querySelector(".fgpb-unlock__card");
    var title = root.querySelector(".fgpb-unlock__title");
    var sub = root.querySelector(".fgpb-unlock__sub");
    var btn = root.querySelector(".fgpb-unlock__btn");
    var icon = root.querySelector(".fgpb-unlock__icon");

    if (card) {
      card.style.borderRadius = Math.min(cfg.borderRadius, strip ? 10 : cfg.borderRadius) + "px";
      if (cfg.style !== "bold") card.style.background = cfg.cardBackgroundColor;
      if (strip) {
        try {
          card.style.zoom = String(drawerScale);
        } catch (e) {}
      }
    }
    if (title) {
      title.textContent = heading || cfg.heading;
      if (cfg.style !== "bold") title.style.color = cfg.titleColor;
    }
    if (sub) {
      var text = description || cfg.description || "";
      sub.textContent = text;
      sub.hidden = !text;
      if (cfg.style !== "bold") sub.style.color = cfg.descriptionColor;
    }
    if (btn) {
      btn.textContent = cfg.buttonText || "Awesome";
      btn.style.background = cfg.buttonBackgroundColor;
      btn.style.color = cfg.buttonTextColor;
    }
    if (icon) {
      icon.style.background = cfg.iconBackgroundColor;
      icon.style.color = "#fff";
    }

    function mountNearStrip(targetStrip) {
      if (!preferDrawer || !targetStrip || !targetStrip.parentNode) return false;
      root.setAttribute("data-anchor", "drawer");
      root.setAttribute("aria-modal", "false");
      targetStrip.parentNode.insertBefore(root, targetStrip.nextSibling);
      return true;
    }

    var anchored = mountNearStrip(strip);
    if (!anchored) document.body.appendChild(root);

    if (cfg.showConfetti) {
      var heavy = cfg.style === "confetti";
      if (anchored) {
        spawnConfetti(root, heavy, true);
        sparkDrawerConfetti(heavy);
      } else {
        // Page center: full-viewport confetti, plus a light burst on the card.
        sparkScreenConfetti(heavy);
        spawnConfetti(root, heavy, false);
      }
    }

    requestAnimationFrame(function () {
      root.setAttribute("data-open", "1");
      if (anchored && strip && strip.scrollIntoView) {
        try {
          strip.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } catch (_e) {}
      }
    });

    // Drawer often opens just after unlock — retry anchoring only when placement is drawer.
    if (preferDrawer && !anchored) {
      setTimeout(function () {
        var live = document.getElementById(ROOT_ID);
        if (!live || live.getAttribute("data-anchor") === "drawer") {
          if (cfg.showConfetti) sparkDrawerConfetti(cfg.style === "confetti");
          return;
        }
        var nextStrip = findDrawerProgressStrip();
        if (!nextStrip || !nextStrip.parentNode) {
          if (cfg.showConfetti) sparkDrawerConfetti(cfg.style === "confetti");
          return;
        }
        live.setAttribute("data-anchor", "drawer");
        live.setAttribute("aria-modal", "false");
        if (cfg.style !== "toast") live.setAttribute("data-style", "toast");
        nextStrip.parentNode.insertBefore(live, nextStrip.nextSibling);
        if (cfg.showConfetti) sparkDrawerConfetti(cfg.style === "confetti");
      }, 420);
    }

    root.addEventListener("click", function (event) {
      var t = event.target;
      if (t && t.closest && t.closest("[data-fgpb-unlock-close]")) closePopup();
    });
    setTimeout(closePopup, cfg.autoCloseMs || 6500);
  }

  function check() {
    if (busy) {
      checkQueued = true;
      return;
    }
    busy = true;
    fetch("/cart.js", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (cart) {
        if (!cart) return null;
        var subtotal = paidSubtotal(cart);
        return fetch(
          "/apps/free-gift/widget-state?cartSubtotal=" +
            encodeURIComponent(String(subtotal)) +
            "&currency=" +
            encodeURIComponent(String(cart.currency || "")) +
            "&currencyRate=" +
            encodeURIComponent(
              String(
                (window.Shopify &&
                  window.Shopify.currency &&
                  Number(window.Shopify.currency.rate)) ||
                  1,
              ),
            ) +
            "&_cs=" +
            Date.now(),
          { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } },
        )
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (state) {
            return { cart: cart, state: state, subtotal: subtotal };
          });
      })
      .then(function (pack) {
        var fromBoot = nextCheckIsBoot;
        nextCheckIsBoot = false;
        if (!pack || !pack.state || pack.state.enabled === false) {
          prevEligible = false;
          prevUnlockedCount = 0;
          baselined = true;
          return;
        }
        var ws = pack.state.widgetSettings || {};
        var celeb = readCeleb(ws, {
          heading: ws.unlockedHeading,
          description: ws.unlockedDescription,
        });
        var isTiered = pack.state.rewardType === "TIERED_FREE_GIFTS";
        var unlockedCount = Array.isArray(pack.state.unlockedGifts)
          ? pack.state.unlockedGifts.length
          : 0;
        var allTiersDone = isTiered && unlockedCount > 0 && !pack.state.nextTier;

        function fireTierCelebrate() {
          if (allTiersDone) {
            celebrate(
              celeb.heading || ws.unlockedHeading || "All gifts unlocked!",
              celeb.description || ws.unlockedDescription || "You've unlocked every tier gift.",
              celeb,
            );
          } else {
            celebrate(celeb.tierHeading, celeb.tierDescription, celeb);
          }
        }

        if (isTiered) {
          if (!baselined || prevUnlockedCount == null) {
            // Boot: silent baseline. Cart-driven first read: treat as 0 → N so first unlock isn't missed.
            if (!fromBoot && unlockedCount > 0) {
              fireTierCelebrate();
            }
            prevUnlockedCount = unlockedCount;
            baselined = true;
            prevEligible = unlockedCount > 0;
            confirmedGiftAdd = false;
            return;
          }
          if (unlockedCount > prevUnlockedCount) {
            fireTierCelebrate();
          }
          prevUnlockedCount = unlockedCount;
          prevEligible = unlockedCount > 0;
          confirmedGiftAdd = false;
          return;
        }

        var threshold = Number(pack.state.threshold);
        var eligible =
          pack.state.eligible === true ||
          (Number.isFinite(threshold) && threshold > 0 && pack.subtotal + 1e-9 >= threshold) ||
          (Number(pack.state.remaining) || 0) < 0.01 ||
          (Number(pack.state.progress) || 0) >= 99.5;

        if (!baselined) {
          if ((!fromBoot || confirmedGiftAdd) && eligible) {
            celebrate(
              celeb.heading || ws.unlockedHeading || pack.state.heading || "You've unlocked your free gift!",
              celeb.description ||
                ws.unlockedDescription ||
                pack.state.description ||
                "Your free gift has been added to the cart.",
              celeb,
            );
          }
          prevEligible = !!eligible;
          baselined = true;
          confirmedGiftAdd = false;
          return;
        }

        if (prevEligible === false && eligible) {
          celebrate(
            celeb.heading || ws.unlockedHeading || pack.state.heading || "You've unlocked your free gift!",
            celeb.description ||
              ws.unlockedDescription ||
              pack.state.description ||
              "Your free gift has been added to the cart.",
            celeb,
          );
        }
        prevEligible = !!eligible;
        confirmedGiftAdd = false;
      })
      .catch(function () {
        nextCheckIsBoot = false;
      })
      .finally(function () {
        busy = false;
        if (checkQueued) {
          checkQueued = false;
          schedule(40, false);
        }
      });
  }

  var timer = null;
  function schedule(delay, isBoot) {
    nextCheckIsBoot = isBoot === true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(check, delay == null ? 180 : delay);
  }

  document.addEventListener("cart:change", function () {
    schedule(100, false);
  });
  document.addEventListener("cart:updated", function () {
    schedule(100, false);
  });
  document.addEventListener("cart:refresh", function () {
    schedule(140, false);
  });
  document.addEventListener("fgpb:cart", function () {
    schedule(80, false);
  });
  document.addEventListener("fgpb:gift-added", function () {
    confirmedGiftAdd = true;
    // A confirmed app-owned add is a real unlock even if the initial baseline
    // request was still in flight when the mutation completed.
    baselined = false;
    schedule(20, false);
  });

  function boot() {
    // Silent baseline ASAP so 0 → 1 is detectable.
    schedule(0, true);
  }
  boot();
})();
