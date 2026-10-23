import { loadCart } from "./core/cart-read.js";
import { state } from "./core/state.js";
import { buildWidgetState, buildLocalEvaluation, loadContext } from "./core/widget-state.js";
import { getContextAnchor, getWidgets, updateWidget } from "./core/widget-renderer.js";
import { CART_DEBOUNCE_MS } from "./utils/util.js";
import { isThemeEditor } from "./utils/design-mode.js";

let refreshTimer = null;
let refreshInFlight = null;
let refreshQueued = false;

function scheduleRefresh(delay) {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refresh().catch(() => {});
  }, delay ?? CART_DEBOUNCE_MS);
}

function notifySatellites() {
  try {
    document.dispatchEvent(new CustomEvent("fgpb:cart"));
  } catch (_e) {}
}

/** Drawer/cart-page chrome is owned by the Liquid satellite, not this schema asset. */
function satelliteOwnsStorefront() {
  return typeof window !== "undefined" && !!window.__FGPB_CPP && getWidgets().length === 0;
}

function paint(cart, evaluation, opts) {
  state.lc = cart;
  const display = buildWidgetState(cart, evaluation);
  getWidgets().forEach((w) => updateWidget(w, cart, display));
  // One satellite wake per refresh (not per optimistic + server paint).
  if (!opts || !opts.silent) notifySatellites();
}

function onCartMutation() {
  if (state.suppressCartRefresh) return;
  if (satelliteOwnsStorefront()) return;
  scheduleRefresh();
}

async function refreshOnce(cartOverride) {
  if (satelliteOwnsStorefront()) return;
  const anchor = getContextAnchor();
  let cart = await loadCart(cartOverride || window.__fgpbLastKnownCart || undefined);
  paint(cart, buildLocalEvaluation(cart), { silent: true });
  await loadContext(anchor, cart);
  cart = state.lc || cart;
  paint(cart, buildLocalEvaluation(cart));
}

export async function refresh(cartOverride) {
  if (refreshInFlight) {
    refreshQueued = true;
    return refreshInFlight;
  }
  refreshInFlight = refreshOnce(cartOverride)
    .catch(() => {})
    .finally(() => {
      refreshInFlight = null;
      if (refreshQueued) {
        refreshQueued = false;
        scheduleRefresh(0);
      }
    });
  return refreshInFlight;
}

function installCartListeners() {
  if (state.cartListenersInstalled || typeof window === "undefined") return;
  if (isThemeEditor(window)) return;
  state.cartListenersInstalled = true;

  for (const n of ["cart:updated", "cart:change"]) {
    document.addEventListener(n, onCartMutation);
  }
  document.addEventListener("fgpb:cart", (e) => {
    const d = e?.detail;
    if (d?.cart || d?.mutationId) onCartMutation();
  });
  if (typeof window.publish === "function" && !window.__fgpbMainPublishWrapped) {
    window.__fgpbMainPublishWrapped = true;
    const originalPublish = window.publish;
    window.publish = function (eventName) {
      const ret = originalPublish.apply(this, arguments);
      try {
        const cartEv = window.PUB_SUB_EVENTS?.cartUpdate || "cart-update";
        if (eventName === cartEv || eventName === "cart-update" || eventName === "cart-updated") {
          onCartMutation();
        }
      } catch (_e) {}
      return ret;
    };
  }
  if (typeof window.subscribe === "function") {
    const names = new Set(["cart-update", "cart-updated"]);
    try {
      if (window.PUB_SUB_EVENTS?.cartUpdate) names.add(window.PUB_SUB_EVENTS.cartUpdate);
    } catch (_e) {}
    for (const name of names) {
      try {
        window.subscribe(name, onCartMutation);
      } catch (_e2) {}
    }
  }
}

installCartListeners();
scheduleRefresh(0);
