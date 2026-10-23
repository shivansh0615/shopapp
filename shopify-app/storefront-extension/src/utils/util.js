export const GIFT_ADD_TIMEOUT_MS = 5e3;
export const FREE_GIFT_KEY = "_fgpb_free_gift";
export const CAMPAIGN_KEY = "_fgpb_campaign_id";
export const TIER_KEY = "_fgpb_tier_id";
export const WIDGET_SEL = ".fgpb-progress-card";
export const GIFT_ADD_ERROR_MESSAGE = "Failed";
export const CART_DEBOUNCE_MS = 60;
export const CART_MUTATION_URL = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/;
/** Shared with tiered-gift-sync.js — classic + tiered honor the same Shopify 429 cooldown. */
export const CART_RATE_KEY = "fgpb_cart_rate_until";
export const CART_RATE_COOLDOWN_MS = 120000;

export function isCartRateLimited() {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const until = Number(sessionStorage.getItem(CART_RATE_KEY) || 0);
    return Date.now() < until;
  } catch (_e) {
    return false;
  }
}

export function tripCartRateLimit() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CART_RATE_KEY, String(Date.now() + CART_RATE_COOLDOWN_MS));
    if (typeof window !== "undefined") window.__fgpbTieredSyncDisabled = true;
  } catch (_e) {}
}

export function isCartMutationUrl(url) {
  const s = String(url || "");
  // Fast reject: most storefront fetches are not cart mutations.
  if (s.indexOf("/cart/") === -1) return false;
  return CART_MUTATION_URL.test(s);
}

export function mountInDrawer(d, node) {
  const h = d.querySelector(".drawer__header");
  const s = h || d.querySelector("cart-drawer-items,.drawer__footer") || d.firstElementChild;
  (s?.parentNode || d).insertBefore(node, h ? h.nextSibling : s);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw Object.assign(new Error("T"), { code: "TIMEOUT" });
    }),
  ]);
}

export function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function qty(v) {
  const n = num(v);
  return n == null || n <= 0 ? 1 : Math.trunc(n);
}

export function arr(v) {
  return Array.isArray(v) ? v : null;
}

export function rec(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

export function variantId(v) {
  const raw = str(v);
  if (!raw) return "";
  return raw.includes("ProductVariant/") ? raw.split("/").pop() : raw;
}

export function ajaxVariantId(v) {
  const id = variantId(v);
  return /^\d+$/.test(id) ? id : id.match(/\d+$/)?.[0] || "";
}

/** {remaining} filler — value only. */
export function money(n) {
  const a = Math.round(Math.max(0, num(n) || 0) * 100) / 100;
  return a % 1 ? a.toFixed(2) : String(a);
}

export function unitPrice(item) {
  // Shopify Ajax `/cart.js` money fields are integer cents → major.
  const line = num(item.final_line_price ?? item.line_price);
  const q = Math.max(1, Math.trunc(num(item.quantity) || 1));
  if (line != null && Number.isFinite(line)) return Math.max(0, line / q / 100);
  const p = num(item.unit_price ?? item.unitPrice ?? item.price) || 0;
  return Math.max(0, p >= 1000 ? p / 100 : p);
}
