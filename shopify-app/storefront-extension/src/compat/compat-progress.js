/**
 * UpsellTrix-owned progress strip for third-party carts (KwikCart).
 * Presentation only — consumes widget-state / cart JSON. Never evaluates campaigns.
 */
import { SURFACE_OWNER_ATTR, SURFACE_OWNER_COMPAT } from "./compat-contract.js";
import { isAdapterSurfaceOpen, queryInHost } from "./cart-drawer-adapters.js";

const STRIP_ATTR = "data-fgpb-compat-strip";
const STYLE_ATTR = "data-fgpb-compat-strip-css";

const GIFT_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M20 7h-2.18A3 3 0 0 0 15 4a3 3 0 0 0-2.82 2H11.8A3 3 0 0 0 9 4a3 3 0 0 0-2.82 3H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1ZM9 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM3 12v7a2 2 0 0 0 2 2h6v-9H3Zm10 9h6a2 2 0 0 0 2-2v-7h-8v9Z"/>' +
  "</svg>";

const SHADOW_CSS =
  ".fgpb-progress-card[data-fgpb-compat-strip]{display:block;width:100%;box-sizing:border-box;margin:0;padding:0;border:none;border-radius:0;background:#fff;color:#1a1a1a;box-shadow:none}" +
  ".fgpb-progress-card[data-fgpb-compat-strip][hidden]{display:none!important}" +
  ".fgpb-strip-banner{background:var(--fg-strip-accent,#4a5c3a);color:var(--fg-strip-banner-text,#fff);text-align:center;padding:8px 12px 7px}" +
  ".fgpb-strip-banner__title{margin:0;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:1.25}" +
  ".fgpb-strip-banner__sub{margin:3px 0 0;font-size:11px;font-weight:500;opacity:.9;line-height:1.3}" +
  ".fgpb-strip-banner__sub[hidden]{display:none!important}" +
  ".fgpb-strip-body{padding:10px 12px 12px;background:var(--fg-strip-body-bg,#fff)}" +
  ".fgpb-progress-heading{display:block;margin:0 0 12px;text-align:center;font-size:13px;font-weight:700;line-height:1.35;color:var(--fg-t,#1a1a1a)}" +
  ".fgpb-strip-rail{position:relative;padding:18px 22px 28px 8px}" +
  ".fgpb-strip-rail--tiers{padding:22px 12px 32px}" +
  ".fgpb-progress-track{margin:0;height:var(--fg-h,6px);border-radius:999px;background:var(--fg-strip-track,rgba(17,24,39,.08));overflow:hidden}" +
  ".fgpb-progress-fill{display:block;height:100%;width:calc(var(--fg-p,0)*100%);border-radius:inherit;background:var(--fg-b,#5c4a3a);min-width:0}" +
  ".fgpb-strip-milestones{position:absolute;left:12px;right:12px;top:0;bottom:0;pointer-events:none}" +
  ".fgpb-strip-mark{position:absolute;right:0;top:0;width:44px;display:flex;flex-direction:column;align-items:center;transform:translateX(8px);pointer-events:none}" +
  ".fgpb-strip-mark--tier{right:auto;width:52px;transform:translateX(-50%)}" +
  ".fgpb-strip-mark__amount{font-size:10px;font-weight:600;color:#8a8a8a;line-height:1;margin-bottom:6px;white-space:nowrap}" +
  ".fgpb-strip-mark__icon{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#fff;border:1.5px solid var(--fg-strip-mark-border,rgba(17,24,39,.14));color:var(--fg-b,#5c4a3a)}" +
  ".fgpb-strip-mark--tier.is-unlocked .fgpb-strip-mark__icon,.is-complete .fgpb-strip-mark__icon{background:var(--fg-b,#5c4a3a);border-color:var(--fg-b,#5c4a3a);color:#fff}" +
  ".fgpb-strip-mark__caption{margin-top:5px;font-size:10px;font-weight:600;color:#666}";

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v, fallback = "") {
  return v == null ? fallback : String(v);
}

function taggedGift(item) {
  const props = (item && item.properties) || {};
  const flag = props._fgpb_free_gift;
  return flag === true || flag === "true" || flag === 1 || flag === "1";
}

export function eligiblePaidSubtotal(cart) {
  if (!cart || !Array.isArray(cart.items)) return 0;
  let cents = 0;
  for (const item of cart.items) {
    if (taggedGift(item)) continue;
    const line = Number(item.final_line_price != null ? item.final_line_price : item.line_price);
    if (Number.isFinite(line)) cents += line;
  }
  if (cents > 0) return cents / 100;
  const itemsSub = Number(cart.items_subtotal_price);
  return Number.isFinite(itemsSub) && itemsSub > 0 ? itemsSub / 100 : 0;
}

export function formatMoneyLabel(amount, _currency) {
  const amt = Math.max(0, Number(amount) || 0);
  const rounded = Math.round(amt * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

export function formatAwayHeading(remaining, currency) {
  return "Add " + formatMoneyLabel(Math.max(0, Number(remaining) || 0), currency) + " more to earn Free Gift";
}

export function formatUnlockedHeading() {
  return "You've unlocked your free gift!";
}

/**
 * Map existing widget-state (+ optional live cart) into strip view-model.
 * Does not evaluate campaigns.
 * @param {Record<string, unknown> | null | undefined} ws
 * @param {object | null | undefined} cart
 */
export function progressViewFromState(ws, cart) {
  if (!ws || ws.enabled === false) return null;
  const currency = str((cart && cart.currency) || ws.currency, "");
  const paidFromCart = cart ? eligiblePaidSubtotal(cart) : null;
  const paid = paidFromCart != null ? paidFromCart : num(ws.cartSubtotal, 0);
  const tiers = Array.isArray(ws.rewardTiers) ? ws.rewardTiers.slice() : [];
  const isTiered = String(ws.rewardType || "") === "TIERED_FREE_GIFTS" || tiers.length > 1;
  const bar = (ws.widgetSettings && ws.widgetSettings.cartProgressBar) || ws.cartProgressBar || {};
  const colors = ws.colors || {};
  const view = {
    enabled: true,
    bannerTitle: str(bar.bannerTitle || ws.heading, "Free Gift"),
    bannerSubtitle: str(bar.bannerSubtitle, isTiered ? "Free gifts worth unlocking" : ""),
    bannerBg: str(bar.bannerBackgroundColor || colors.barColor, ""),
    bannerText: str(bar.bannerTextColor, "#ffffff"),
    bodyBg: str(bar.bodyBackgroundColor, "#ffffff"),
    barColor: str(colors.barColor || bar.barColor, "#5c4a3a"),
    textColor: str(colors.textColor, "#1a1a1a"),
    height: Math.max(4, Math.min(40, Math.round(num(bar.height, 6)))),
    tierLabel: str(bar.tierLabel, "Gift"),
    finalTierLabel: str(bar.finalTierLabel, "Bumper"),
    isTiered,
    rewardTiers: tiers,
    currency,
    cartSubtotal: paid,
    threshold: num(ws.threshold, 0),
    remaining: num(ws.remaining, 0),
    progress: Math.max(0, Math.min(100, num(ws.progress, 0))),
    heading: str(ws.heading, ""),
  };

  if (isTiered && tiers.length) {
    let maxTh = 0;
    let nextTh = 0;
    for (let i = 0; i < tiers.length; i++) {
      const th = num(tiers[i].threshold, 0);
      if (th > maxTh) maxTh = th;
      if (!nextTh && paid + 1e-9 < th) nextTh = th;
    }
    if (maxTh > 0) view.progress = Math.max(0, Math.min(100, (paid / maxTh) * 100));
    if (nextTh > 0) {
      view.remaining = nextTh - paid;
      view.heading = formatAwayHeading(view.remaining, currency);
    } else {
      view.remaining = 0;
      view.heading = "You have unlocked all rewards!";
    }
    return view;
  }

  const threshold = view.threshold;
  if (threshold > 0) {
    view.progress = Math.max(0, Math.min(100, (paid / threshold) * 100));
    if (paid + 1e-9 >= threshold) {
      view.remaining = 0;
      view.heading = formatUnlockedHeading();
    } else {
      view.remaining = threshold - paid;
      view.heading = formatAwayHeading(view.remaining, currency);
    }
  } else if (!view.heading) {
    view.heading = view.remaining > 0 ? formatAwayHeading(view.remaining, currency) : formatUnlockedHeading();
  }
  return view;
}

function ensureShadowCss(shadowRoot) {
  if (!shadowRoot || typeof shadowRoot.querySelector !== "function") return;
  if (shadowRoot.querySelector("style[" + STYLE_ATTR + "]")) return;
  const style = shadowRoot.ownerDocument
    ? shadowRoot.ownerDocument.createElement("style")
    : document.createElement("style");
  style.setAttribute(STYLE_ATTR, "1");
  style.textContent = SHADOW_CSS;
  shadowRoot.appendChild(style);
}

function findMount(adapter, root) {
  if (!root) return null;
  if (adapter && adapter.id === "kwikcart") {
    return queryInHost(root, ".gokwik-sidecart-container");
  }
  return root;
}

function stripHtml(view) {
  const tiered = !!(view && view.isTiered && view.rewardTiers && view.rewardTiers.length);
  return (
    '<div class="fgpb-strip-banner">' +
    '<p class="fgpb-strip-banner__title"></p>' +
    '<p class="fgpb-strip-banner__sub"></p>' +
    "</div>" +
    '<div class="fgpb-strip-body">' +
    '<p class="fgpb-progress-heading"></p>' +
    '<div class="fgpb-strip-rail' +
    (tiered ? " fgpb-strip-rail--tiers" : "") +
    '">' +
    '<div class="fgpb-progress-track" role="progressbar" aria-label="Free gift progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Free gift progress"><span class="fgpb-progress-fill" style="--fg-p:0"></span></div>' +
    (tiered
      ? '<div class="fgpb-strip-milestones" aria-hidden="true"></div>'
      : '<div class="fgpb-strip-mark" aria-hidden="true"><span class="fgpb-strip-mark__amount"></span><span class="fgpb-strip-mark__icon">' +
        GIFT_SVG +
        '</span><span class="fgpb-strip-mark__caption">Gift</span></div>') +
    "</div></div>"
  );
}

function paintView(el, view) {
  if (!el || !view) return;
  el.style.setProperty("--fg-h", view.height + "px");
  el.style.setProperty("--fg-b", view.barColor || "#5c4a3a");
  el.style.setProperty("--fg-t", view.textColor || "#1a1a1a");
  if (view.bannerBg) el.style.setProperty("--fg-strip-accent", view.bannerBg);
  if (view.bannerText) el.style.setProperty("--fg-strip-banner-text", view.bannerText);
  if (view.bodyBg) el.style.setProperty("--fg-strip-body-bg", view.bodyBg);

  const title = el.querySelector(".fgpb-strip-banner__title");
  const sub = el.querySelector(".fgpb-strip-banner__sub");
  const heading = el.querySelector(".fgpb-progress-heading");
  const fill = el.querySelector(".fgpb-progress-fill");
  const track = el.querySelector(".fgpb-progress-track");
  if (title) title.textContent = view.bannerTitle || "";
  if (sub) {
    sub.textContent = view.bannerSubtitle || "";
    sub.hidden = !view.bannerSubtitle;
  }
  if (heading) heading.textContent = view.heading || "";
  if (fill) fill.style.setProperty("--fg-p", String(Math.max(0, Math.min(1, view.progress / 100))));
  if (track && typeof track.setAttribute === "function") {
    const now = Math.max(0, Math.min(100, Math.round(Number(view.progress) || 0)));
    const text = String(view.heading || "").replace(/\s+/g, " ").trim() || (now >= 100 ? "Free gift unlocked" : now + " percent");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Free gift progress");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(now));
    track.setAttribute("aria-valuetext", text);
  }
  if (el.classList && typeof el.classList.toggle === "function") {
    el.classList.toggle("is-complete", view.progress >= 99.5 && view.remaining <= 0);
  }

  if (view.isTiered && view.rewardTiers && view.rewardTiers.length) {
    const host = el.querySelector(".fgpb-strip-milestones");
    if (host) {
      let maxTh = 0;
      for (let i = 0; i < view.rewardTiers.length; i++) {
        maxTh = Math.max(maxTh, num(view.rewardTiers[i].threshold, 0));
      }
      let html = "";
      for (let t = 0; t < view.rewardTiers.length; t++) {
        const th = num(view.rewardTiers[t].threshold, 0);
        const pct = maxTh > 0 ? Math.max(0, Math.min(100, (th / maxTh) * 100)) : 0;
        const unlocked = view.cartSubtotal + 1e-9 >= th;
        const label = t === view.rewardTiers.length - 1 ? view.finalTierLabel : view.tierLabel;
        html +=
          '<div class="fgpb-strip-mark fgpb-strip-mark--tier' +
          (unlocked ? " is-unlocked" : "") +
          '" style="left:' +
          pct +
          '%"><span class="fgpb-strip-mark__amount">' +
          formatMoneyLabel(th, view.currency) +
          '</span><span class="fgpb-strip-mark__icon">' +
          GIFT_SVG +
          '</span><span class="fgpb-strip-mark__caption">' +
          label +
          "</span></div>";
      }
      host.innerHTML = html;
    }
  } else {
    const amount = el.querySelector(".fgpb-strip-mark__amount");
    if (amount) amount.textContent = formatMoneyLabel(view.threshold, view.currency);
  }
}

/**
 * Pin or update the UpsellTrix strip inside a compat cart. Never mutates line HTML.
 * @returns {{ mounted: boolean, hidden: boolean, reason: string }}
 */
export function syncCompatProgressStrip(adapter, root, ws, cart, win) {
  if (!adapter || !adapter.capabilities?.mountProgressStrip || !root) {
    return { mounted: false, hidden: true, reason: "no-mount" };
  }
  const view = progressViewFromState(ws, cart);
  const open = isAdapterSurfaceOpen(adapter, root, win);
  const mount = findMount(adapter, root);
  if (!mount) {
    return { mounted: false, hidden: true, reason: "no-panel" };
  }

  try {
    if (root.shadowRoot) ensureShadowCss(root.shadowRoot);
  } catch {
    /* ignore */
  }

  let strip = null;
  try {
    strip = mount.querySelector(".fgpb-progress-card[" + STRIP_ATTR + "]");
  } catch {
    strip = null;
  }

  if (!view || !open) {
    if (strip) {
      strip.hidden = true;
      strip.setAttribute("data-fgpb-open", "0");
    }
    return { mounted: !!strip, hidden: true, reason: view ? "closed" : "no-state" };
  }

  const doc =
    (mount.ownerDocument || null) ||
    (root.ownerDocument || null) ||
    (typeof document !== "undefined" ? document : null);
  if (!strip && doc) {
    strip = doc.createElement("div");
    strip.className = "fgpb-progress-card fgpb-progress-strip is-compact";
    strip.setAttribute(STRIP_ATTR, "1");
    strip.setAttribute("data-fg-strip", "1");
    strip.setAttribute(SURFACE_OWNER_ATTR, SURFACE_OWNER_COMPAT);
    strip.innerHTML = stripHtml(view);
    try {
      mount.insertBefore(strip, mount.firstChild);
    } catch {
      mount.appendChild(strip);
    }
  } else if (strip) {
    const wantTiered = !!(view.isTiered && view.rewardTiers && view.rewardTiers.length);
    const hasTiered = !!strip.querySelector(".fgpb-strip-milestones");
    if (wantTiered !== hasTiered) strip.innerHTML = stripHtml(view);
  }
  if (!strip) return { mounted: false, hidden: true, reason: "create-failed" };

  strip.hidden = false;
  strip.setAttribute("data-fgpb-open", "1");
  paintView(strip, view);
  return { mounted: true, hidden: false, reason: "painted" };
}

export function removeCompatProgressStrip(root) {
  if (!root) return;
  const scopes = [root];
  try {
    if (root.shadowRoot) scopes.push(root.shadowRoot);
  } catch {
    /* ignore */
  }
  for (const scope of scopes) {
    try {
      scope.querySelectorAll(".fgpb-progress-card[" + STRIP_ATTR + "]").forEach((el) => el.remove());
    } catch {
      /* ignore */
    }
  }
}
