import { eligibleSubtotal, findTaggedLine } from "./cart-read.js";
import { state } from "./state.js";
import { money, num } from "../utils/util.js";

function proxyUrl(w, n) {
  const b = w?.dataset?.widgetStateUrl || "/apps/free-gift/widget-state";
  return n === "evaluate" ? b.replace("widget-state", "evaluate-cart") : b;
}

export async function fetchProxy(url, subtotal, currency) {
  let currencyRate = 1;
  try {
    const candidate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate);
    if (Number.isFinite(candidate) && candidate > 0) currencyRate = candidate;
  } catch (_e) {}
  try {
    const res = await fetch(
      url +
        (url.includes("?") ? "&" : "?") +
        "cartSubtotal=" +
        Math.max(0, subtotal) +
        "&currency=" +
        encodeURIComponent(currency || "") +
        "&currencyRate=" +
        encodeURIComponent(String(currencyRate)),
    );
    return res.ok ? await res.json() : null;
  } catch (_e) {
    return null;
  }
}

function applyDesign(p) {
  if (!p) return;
  const w = p.widgetSettings || {};
  if (w.heading) state.ht = w.heading;
  else if (p.heading) state.ht = p.heading;
  if (w.description) state.ds = w.description;
  else if (p.description) state.ds = p.description;
  if (w.unlockedHeading) state.uh = w.unlockedHeading;
  if (w.unlockedDescription) state.ud = w.unlockedDescription;
  if (w.cartProgressBar) {
    const b = w.cartProgressBar;
    state.cb = { h: num(b.height), r: num(b.borderRadius) };
  }
  if (p.colors) state.cl = p.colors;
}

function setPromo(p) {
  state.sv = 1;
  state.se = p && p.eligible ? 1 : 0;
  state.sr = p ? Math.max(0, num(p.remaining) || 0) : 0;
  state.sp = p ? Math.max(0, Math.min(100, num(p.progress) || 0)) : 0;
}

function hydrate(p, fromEval) {
  if (p == null) return;
  state.campaignLoaded = true;
  if (!fromEval && p.autoAddGift != null) state.autoAddGift = p.autoAddGift !== false;
  if (p.enabled === false || (!fromEval && !p.enabled)) {
    state.campaign.enabled = false;
    setPromo(null);
    return;
  }
  state.campaign.enabled = true;
  if (p.rewardType) state.rewardType = p.rewardType;
  else if (p.gift?.variantId) state.rewardType = "FREE_GIFT";
  if (p.unlockedGifts) state.unlockedGifts = p.unlockedGifts;
  if (p.nextTier !== undefined) state.nextTier = p.nextTier;
  if (Array.isArray(p.rewardTiers)) state.rewardTiers = p.rewardTiers;
  const giftId = p.gift?.variantId || (!fromEval && state.knownGiftVariantId);
  if (giftId) {
    state.knownGiftVariantId = giftId;
    state.campaign.giftVariantId = giftId;
  }
  const th = num(p.threshold);
  if (!fromEval) state.campaign.threshold = Math.max(0, th || 0);
  else if (th != null && th > 0) state.campaign.threshold = th;
  if (fromEval && p.campaign?.id) state.campaign.campaignId = num(p.campaign.id);
  else if (!fromEval) state.campaign.campaignId = num(p.campaignId) || state.campaign.campaignId;
  applyDesign(p);
  setPromo(p);
}

export function cacheFromWidgetState(ws) {
  hydrate(ws, false);
}

export function cacheFromEvaluation(e) {
  if (!e) return;
  hydrate(e, true);
}

function isGiftReward() {
  if (state.rewardType === "FREE_GIFT") return true;
  if (state.rewardType) return false; // Percentage / Fixed / Tiered / etc.
  // rewardType not loaded yet: never treat Tiered payloads as Free Gift
  // (that path spams /cart/add and triggers Shopify "Too many attempts").
  if ((state.unlockedGifts && state.unlockedGifts.length) || state.nextTier != null) return false;
  return true;
}

/**
 * Local reconciliation against cached server promo fields.
 * Gift actions only for Free Gift; Percentage Discount is progress-only.
 */
export function buildLocalEvaluation(cart) {
  const c = state.campaign;
  const threshold = Math.max(0, c.threshold || 0);
  if (!state.campaignLoaded || threshold <= 0 || !state.sv) {
    return { enabled: false, eligible: false, action: "NONE", gift: null, threshold, progress: 0, remaining: threshold };
  }

  // Empty cart: never show unlock / gift actions from a previous cart snapshot.
  if (!cart?.items?.length) {
    return {
      enabled: true,
      eligible: false,
      action: "NONE",
      threshold,
      progress: 0,
      remaining: threshold,
      gift: null,
      rewardType: state.rewardType || "FREE_GIFT",
    };
  }

  if (!isGiftReward()) {
    return {
      enabled: true,
      eligible: !!state.se,
      action: "NONE",
      threshold,
      progress: state.sp,
      remaining: state.sr,
      gift: null,
      rewardType: state.rewardType,
    };
  }

  const giftId = c.giftVariantId || state.knownGiftVariantId;
  if (!giftId) {
    return { enabled: false, eligible: false, action: "NONE", gift: null, threshold, progress: 0, remaining: threshold };
  }
  const eligible = !!state.se;
  const tagged = findTaggedLine(cart);
  let action = "NONE";
  if (eligible && !tagged) action = "ADD_GIFT";
  else if (!eligible && tagged) action = "REMOVE_GIFT";
  return {
    enabled: true,
    eligible,
    action,
    threshold,
    progress: state.sp,
    remaining: state.sr,
    gift: { variantId: giftId },
    rewardType: "FREE_GIFT",
  };
}

export function buildWidgetState(cart, evaluation) {
  const c = state.campaign;
  if (!state.campaignLoaded) return { enabled: true, fallback: true, progress: 0, colors: state.cl };
  const ev = evaluation || buildLocalEvaluation(cart);
  const th = Math.max(0, c.threshold || 0);
  const paid = cart?.items?.length ? eligibleSubtotal(cart) : 0;
  const tiers = Array.isArray(state.rewardTiers) ? state.rewardTiers : null;
  // Tiered: "unlocked" copy only when EVERY tier is done (no next threshold).
  const isTiered =
    state.rewardType === "TIERED_FREE_GIFTS" ||
    state.nextTier != null ||
    (Array.isArray(state.unlockedGifts) && state.unlockedGifts.length > 0 && tiers);
  // Display remaining/progress from the live cart so product cards do not freeze
  // on the first widget-state snapshot while the drawer already moved on.
  let remainingAmt = Math.max(0, num(ev.remaining) || 0);
  let progress = ev.progress;
  let on;
  if (isTiered && tiers && tiers.length) {
    let maxTh = 0;
    let nextTh = 0;
    for (let i = 0; i < tiers.length; i++) {
      const t = num(tiers[i].threshold) || 0;
      if (t > maxTh) maxTh = t;
      if (!nextTh && paid + 1e-9 < t) nextTh = t;
    }
    if (maxTh > 0) progress = Math.max(0, Math.min(100, (paid / maxTh) * 100));
    remainingAmt = nextTh > 0 ? nextTh - paid : 0;
    on = !nextTh;
  } else if (th > 0) {
    remainingAmt = Math.max(0, th - paid);
    progress = Math.max(0, Math.min(100, (paid / th) * 100));
    on = remainingAmt < 0.005;
  } else {
    on = !!(ev.eligible || remainingAmt < 0.005);
  }

  const rem = money(remainingAmt);
  const fill = (t) => (t ? String(t).replace(/\{remaining\}/gi, rem) : "");
  const fb = on ? "Unlocked!" : "You are " + rem + " away";

  function resolveCopy(template, fallback) {
    const raw = fill(template);
    return !raw || raw.indexOf("{") >= 0 || /You are\s*!/i.test(raw) || /Rs|\$/.test(raw)
      ? fallback
      : raw;
  }

  return {
    enabled: c.enabled !== false,
    heading: resolveCopy(on ? state.uh : state.ht, fb),
    description: resolveCopy(on ? state.ud : state.ds, on ? "Unlocked!" : "Add more to your cart to unlock your gift."),
    progress,
    colors: state.cl,
  };
}

export async function loadContext(widget, cart) {
  const paid = eligibleSubtotal(cart);
  const [ws, ev] = await Promise.all([
    fetchProxy(proxyUrl(widget, "state"), paid, cart.currency),
    fetchProxy(proxyUrl(widget, "evaluate"), paid, cart.currency),
  ]);
  let ok = false;
  if (ws != null) {
    cacheFromWidgetState(ws);
    ok = true;
  }
  if (ev != null) {
    cacheFromEvaluation(ev);
    ok = true;
  }
  return { ok };
}
