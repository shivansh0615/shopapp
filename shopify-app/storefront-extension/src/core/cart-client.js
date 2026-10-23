/**
 * Cart mutations + gift-row chrome. Schema bundle imports cart-read.js only.
 * Tests / gift-sync keep using this module.
 */
import {
  ajaxVariantId,
  CAMPAIGN_KEY,
  FREE_GIFT_KEY,
  mountInDrawer,
  str,
  TIER_KEY,
  tripCartRateLimit,
  WIDGET_SEL,
} from "../utils/util.js";
import { state } from "./state.js";
import { invalidateWidgetCache } from "./widget-renderer.js";
import {
  fetchCart,
  findTaggedLine,
  findTaggedLines,
  isCampaignTagged,
  isTagged,
  loadCart,
  normalizeCart,
  normalizeItem,
  requestJson,
  eligibleSubtotal,
} from "./cart-read.js";

export {
  eligibleSubtotal,
  fetchCart,
  findTaggedLine,
  findTaggedLines,
  isCampaignTagged,
  isTagged,
  loadCart,
  normalizeCart,
  normalizeItem,
  requestJson,
};

const SECTIONS = "cart-drawer";

export function giftProperties() {
  const p = {
    [FREE_GIFT_KEY]: "true",
    "Free Gift": "UNLOCKED",
    [TIER_KEY]: "classic",
  };
  if (state.campaign.campaignId) p[CAMPAIGN_KEY] = String(state.campaign.campaignId);
  return p;
}

function ensureFreeGiftBadge(row) {
  if (!row || typeof row.querySelector !== "function") return;
  if (row.querySelector(".fgpb-free-gift-badge")) return;
  if (typeof document === "undefined" || typeof document.createElement !== "function") return;
  const badge = document.createElement("span");
  badge.className = "fgpb-free-gift-badge";
  badge.setAttribute("data-fgpb-free-gift-badge", "1");
  badge.textContent = "FREE GIFT";
  const details =
    row.querySelector(".cart-item__details") ||
    row.querySelector(".cart-item__name")?.parentElement ||
    row.querySelector(".product-option")?.parentElement ||
    row;
  if (details && typeof details.appendChild === "function") details.appendChild(badge);
}

function forceHideGiftControls(row) {
  if (!row || typeof row.querySelectorAll !== "function") return;
  const hide = row.querySelectorAll(
    "quantity-input, .quantity, .cart-item__quantity, .cart-item__quantity-wrapper, " +
      "cart-remove-button, .cart-remove, button[name='plus'], button[name='minus'], " +
      "input[name='updates[]'], input.quantity__input, .quantity-popover, " +
      "a[aria-label*='Remove'], a[aria-label*='remove']",
  );
  for (let i = 0; i < hide.length; i++) {
    hide[i].style.setProperty("display", "none", "important");
    hide[i].setAttribute("hidden", "true");
  }
  const clutter = row.querySelectorAll(
    ".product-option, dl.product-option, .discounts, .discounts__discount, " +
      ".cart-item__discounted, .cart-item__old-price, .cart-item__price, .cart-item__totals, " +
      ".price, .price-item, .unit-price, s",
  );
  for (let c = 0; c < clutter.length; c++) {
    clutter[c].style.setProperty("display", "none", "important");
  }
}

export function markTaggedLines(c) {
  if (!document?.querySelectorAll) return;
  if (state.rewardType === "TIERED_FREE_GIFTS") return;
  const G = "fgpb-gift-line";
  const items = c?.items;
  const taggedKeys = Object.create(null);
  const uniqueGiftVids = Object.create(null);
  const variantCounts = Object.create(null);
  let hasTagged = false;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const vid = str(items[i].variantId || items[i].variant_id);
      if (vid) variantCounts[vid] = (variantCounts[vid] || 0) + 1;
    }
    for (let j = 0; j < items.length; j++) {
      if (!isCampaignTagged(items[j])) continue;
      hasTagged = true;
      const key = str(items[j].lineKey || items[j].key);
      if (key) taggedKeys[key] = true;
      const vid = str(items[j].variantId || items[j].variant_id);
      if (vid && variantCounts[vid] === 1) uniqueGiftVids[vid] = true;
    }
  }
  const prev = document.querySelectorAll("." + G);
  if (!hasTagged && !prev.length) return;
  prev.forEach((n) => {
    n.classList.remove(G);
    n.querySelectorAll(".fgpb-free-gift-badge").forEach((b) => b.remove());
    n.querySelectorAll(".fgpb-gift-price").forEach((b) => b.remove());
    n.querySelectorAll(".fgpb-price-host").forEach((b) => b.classList.remove("fgpb-price-host"));
    n.querySelectorAll(".fgpb-free-gift-label").forEach((b) => b.classList.remove("fgpb-free-gift-label"));
  });
  if (!hasTagged || !items) return;

  function rowLineKey(row) {
    if (!row || typeof row.querySelector !== "function") return "";
    const keyEl = row.querySelector("[data-line-key], [data-cart-item-key], [data-key]");
    if (keyEl) {
      const raw =
        keyEl.getAttribute("data-line-key") ||
        keyEl.getAttribute("data-cart-item-key") ||
        keyEl.getAttribute("data-key");
      if (raw) return String(raw).trim();
    }
    const qtyInput = row.querySelector('input[name="updates[]"]');
    if (qtyInput?.getAttribute("data-line-key")) {
      return String(qtyInput.getAttribute("data-line-key")).trim();
    }
    const links = row.querySelectorAll('a[href*="/cart/change"], a[href*="/cart/update"]');
    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href") || "";
      const idMatch = href.match(/[?&]id=([^&]+)/);
      if (idMatch?.[1]) {
        try {
          return decodeURIComponent(idMatch[1]).trim();
        } catch (_e) {
          return String(idMatch[1]).trim();
        }
      }
    }
    return "";
  }

  function rowVariantId(row) {
    if (!row || typeof row.querySelector !== "function") return "";
    const el =
      row.querySelector("[data-quantity-variant-id]") ||
      row.querySelector("[data-variant-id]") ||
      row.querySelector("[data-product-id]");
    if (!el) return "";
    return String(
      el.getAttribute("data-quantity-variant-id") || el.getAttribute("data-variant-id") || "",
    ).trim();
  }

  const rows = document.querySelectorAll(
    ".cart-item, [id^='CartDrawer-Item-'], [id^='CartItem-'], .cart-drawer .cart-items tr",
  );
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const rowKey = rowLineKey(row);
    let isGift = !!(rowKey && taggedKeys[rowKey]);
    if (!isGift) {
      const vid = rowVariantId(row);
      if (vid && uniqueGiftVids[vid]) isGift = true;
    }
    if (!isGift) continue;
    row.classList.add(G);
    forceHideGiftControls(row);
    ensureFreeGiftBadge(row);
  }
}

/** @deprecated No-op — reordering cart rows breaks theme line indexes. */
export function promoteGiftLinesToTop() {}

export function applySections(sections) {
  if (!sections?.["cart-drawer"]) return;
  const d = document.querySelector("cart-drawer");
  if (!d) return;
  const keep = d.querySelector?.(WIDGET_SEL);
  const n = new DOMParser().parseFromString(sections["cart-drawer"], "text/html").querySelector("cart-drawer");
  if (!n) return;

  const nextItems =
    typeof n.querySelector === "function"
      ? n.querySelector("cart-drawer-items") ||
        n.querySelector(".cart-drawer-items") ||
        n.querySelector("#CartDrawer-CartItems")
      : null;
  const curItems =
    typeof d.querySelector === "function"
      ? d.querySelector("cart-drawer-items") ||
        d.querySelector(".cart-drawer-items") ||
        d.querySelector("#CartDrawer-CartItems")
      : null;
  const nextFooter =
    typeof n.querySelector === "function"
      ? n.querySelector(".cart-drawer__footer") || n.querySelector(".drawer__footer")
      : null;
  const curFooter =
    typeof d.querySelector === "function"
      ? d.querySelector(".cart-drawer__footer") || d.querySelector(".drawer__footer")
      : null;

  if (nextItems && curItems) {
    curItems.innerHTML = nextItems.innerHTML;
    if (nextFooter && curFooter) curFooter.innerHTML = nextFooter.innerHTML;
  } else {
    d.innerHTML = n.innerHTML;
    if (keep) mountInDrawer(d, keep);
  }
  invalidateWidgetCache();
  try {
    document.dispatchEvent(new CustomEvent("fgpb:cart"));
  } catch (_e) {}
}

async function cartPost(url, body) {
  let response;
  try {
    response = await requestJson(url, {
      method: "POST",
      body: JSON.stringify({ ...body, sections: SECTIONS }),
    });
  } catch (e) {
    if (e && (e.status === 429 || e.status === 430)) {
      tripCartRateLimit();
      throw e;
    }
    try {
      response = await requestJson(url, { method: "POST", body: JSON.stringify(body) });
    } catch (e2) {
      if (e2 && (e2.status === 429 || e2.status === 430)) tripCartRateLimit();
      throw e2;
    }
  }
  applySections(response.sections);
  return response;
}

export async function addGift(variantIdRaw) {
  const id = ajaxVariantId(variantIdRaw);
  if (!id || !(+id > 0)) throw new Error("id");
  return cartPost("/cart/add.js", { items: [{ id: +id, quantity: 1, properties: giftProperties() }] });
}

export async function removeGift(lineKey) {
  return setLineQty(lineKey, 0);
}

export async function setLineQty(lineKey, quantity) {
  if (!str(lineKey)) throw new Error("key");
  return cartPost("/cart/update.js", { updates: { [lineKey]: quantity } });
}

export async function enforceGiftLimit(cart) {
  const tagged = findTaggedLines(cart);
  if (!tagged.length) return cart;
  for (let i = 1; i < tagged.length; i++) {
    if (tagged[i].lineKey) await setLineQty(tagged[i].lineKey, 0);
  }
  let next = tagged.length > 1 ? await loadCart() : cart;
  const k = findTaggedLine(next);
  if (k?.lineKey && k.quantity > 1) {
    await setLineQty(k.lineKey, 1);
    next = await loadCart();
  }
  return next;
}
