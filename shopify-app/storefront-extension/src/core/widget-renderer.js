import { num, WIDGET_SEL } from "../utils/util.js";

const PROXY = "/apps/free-gift/widget-state";
const P = "fgpb-progress-";

/** Cached NodeList of progress cards; cleared when drawer HTML is replaced. */
let cachedWidgets = null;

export function invalidateWidgetCache() {
  cachedWidgets = null;
}

function isDrawerWidget(widget) {
  if (!widget) return false;
  if (widget.dataset?.fgAuto) return true;
  if (widget.getAttribute?.("data-fg-drawer") === "1") return true;
  return !!widget.closest?.("cart-drawer, #CartDrawer, .cart-drawer, [data-cart-drawer]");
}

function widgetParts(widget) {
  let parts = widget._fp;
  if (parts && parts.f?.isConnected !== false) return parts;
  parts = {
    f: widget.querySelector("." + P + "fill"),
    k: widget.querySelector("." + P + "track"),
    h: widget.querySelector("." + P + "heading"),
    t: widget.querySelector("." + P + "text"),
  };
  widget._fp = parts;
  return parts;
}

/**
 * Classic Free Gift runtime widgets only (product page / theme section blocks).
 * Cart drawer progress is owned exclusively by cart-page-progress.js — never mount there.
 */
export function getWidgets() {
  // Always re-check drawer ownership — a cached product/section card must never
  // be painted after it is (or appears) inside the cart drawer.
  if (
    cachedWidgets &&
    cachedWidgets.length &&
    cachedWidgets.every((w) => w.isConnected && !isDrawerWidget(w))
  ) {
    return cachedWidgets;
  }

  cachedWidgets = Array.from(document.querySelectorAll(WIDGET_SEL)).filter((w) => !isDrawerWidget(w));
  return cachedWidgets;
}

export function getContextAnchor() {
  return document.querySelector(WIDGET_SEL) || { dataset: { widgetStateUrl: PROXY } };
}

export function updateWidget(widget, cart, s) {
  if (!widget || !s) return;
  // Drawer chrome is owned by cart-page-progress.js — classic must not paint or hide it.
  if (isDrawerWidget(widget)) return;

  // Product / section bars stay visible when the campaign is on — even with an empty
  // cart (0% progress). Hiding on empty caused a flash-then-gone on product pages.
  if (s.enabled === false) {
    widget.hidden = true;
    widget.classList?.add?.("fgpb-hide-empty");
    widget._fs = "off";
    return;
  }
  widget.hidden = false;
  widget.classList?.remove?.("fgpb-hide-empty");
  const progress = Math.max(0, Math.min(100, num(s.progress) || 0));
  // Keep existing description while gift add is in flight — avoid "…" flash.
  const description = s.description || "";
  const heading = s.fallback ? null : s.heading || "";
  const c = s.colors;
  const ph = num(c && c.progressHeight) ?? 10;
  const sig = [s.fallback ? 1 : 0, heading, description, progress, ph, c?.barColor, c?.backgroundColor, c?.textColor, c?.borderRadius].join("|");
  if (widget._fs === sig) return;
  widget._fs = sig;

  const parts = widgetParts(widget);
  const st = widget.style;
  if (c) {
    if (c.barColor) {
      st.setProperty("--fg-b", c.barColor);
      if (parts.f) parts.f.style.background = c.barColor;
    }
    if (c.backgroundColor) st.setProperty("--fg-bg", c.backgroundColor);
    if (c.textColor) st.setProperty("--fg-t", c.textColor);
    if (c.borderRadius != null) st.setProperty("--fg-r", c.borderRadius + "px");
  }
  st.setProperty("--fg-h", ph + "px");
  if (parts.k) parts.k.style.height = ph + "px";
  if (s.fallback) {
    if (parts.t) parts.t.textContent = "…";
    return;
  }
  if (parts.h) parts.h.textContent = heading;
  if (parts.t) parts.t.textContent = description;
  if (parts.k) parts.k.setAttribute("aria-valuenow", "" + (progress + 0.5 | 0));
  if (parts.f && !widget.hasAttribute?.("data-fg-tiered-milestones")) {
    const v = String(progress / 100);
    if (typeof parts.f.style?.setProperty === "function") parts.f.style.setProperty("--fg-p", v);
    else if (parts.f.style) parts.f.style["--fg-p"] = v;
  }
}
