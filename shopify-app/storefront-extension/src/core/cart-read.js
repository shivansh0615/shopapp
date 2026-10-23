import {
  arr,
  CAMPAIGN_KEY,
  FREE_GIFT_KEY,
  qty,
  rec,
  str,
  unitPrice,
  variantId,
} from "../utils/util.js";
import { state } from "./state.js";

export function isTagged(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return false;
  const flag = props[FREE_GIFT_KEY];
  return flag === "true" || flag === true;
}

export function isCampaignTagged(item) {
  if (!isTagged(item.properties)) return false;
  const cid = state.campaign.campaignId;
  if (!cid) return true;
  const lineCid = item.properties?.[CAMPAIGN_KEY];
  return !lineCid || String(lineCid) === String(cid);
}

export function normalizeItem(item) {
  const d = rec(item);
  if (!d) return null;
  return {
    variantId: variantId(d.variant_id ?? d.variantId),
    quantity: qty(d.quantity),
    price: unitPrice(d),
    lineKey: str(d.key) || null,
    properties: rec(d.properties),
  };
}

export function normalizeCart(cart) {
  const c = rec(cart);
  if (!c) return { subtotal: 0, currency: "", items: [] };
  const items = (arr(c.items) || arr(c.line_items) || []).map(normalizeItem).filter(Boolean);
  return {
    subtotal: items.reduce((t, i) => t + i.quantity * i.price, 0),
    currency: str(c.currency ?? c.currencyCode) || "",
    items,
  };
}

export function eligibleSubtotal(cart) {
  return cart.items.reduce((t, item) => (isTagged(item.properties) ? t : t + item.quantity * item.price), 0);
}

export function findTaggedLines(cart) {
  return cart.items.filter(isCampaignTagged);
}

export function findTaggedLine(cart) {
  const items = cart?.items;
  if (!items || !items.length) return null;
  for (let i = 0; i < items.length; i++) {
    if (isCampaignTagged(items[i])) return items[i];
  }
  return null;
}

export async function requestJson(url, o = {}) {
  const m = String(o.method || "GET").toUpperCase();
  const h = { Accept: "application/json", ...o.headers };
  if (m != "GET" && m != "HEAD") h["Content-Type"] = "application/json";
  const r = await fetch(url, { ...o, headers: h });
  if (!r.ok) throw Object.assign(new Error("E" + r.status), { status: r.status });
  return r.json();
}

export async function fetchCart() {
  return requestJson("/cart.js", { cache: "no-store" });
}

export async function loadCart(override) {
  return normalizeCart(override || (await fetchCart()));
}
