/**
 * Optional cart-drawer compatibility runtime (lifecycle + refresh isolation).
 * Loaded only when merchant enables theme-compat.cart_drawer_adapters.
 * Never patches fetch/XHR; never listens to fgpb:cart-updated (own echo).
 */

import {
  ADAPTER_STATUS,
  CART_UPDATED_EVENT,
  COMPATIBILITY_API_VERSION,
  REFRESH_STRATEGY,
  SURFACE_OWNER_ATTR,
  SURFACE_OWNER_COMPAT,
} from "./compat-contract.js";
import {
  KWIKCART_ADAPTER,
  detectBestAdapter,
  extractLineKey,
  extractVariantId,
  filterSectionsForAdapter as filterSectionsPure,
  findGiftRows,
  getAdapterById,
  getCompatAdapters,
  isCompatOwnedSurface,
  matchGiftRows,
  NONE_ADAPTER,
  queryRows,
  readRuntimeEvidence,
  selectCompatAdapter,
  shouldApplyCartDrawerSectionToTarget,
  shouldApplyDawnSections,
} from "./cart-drawer-adapters.js";
import { removeCompatProgressStrip, syncCompatProgressStrip } from "./compat-progress.js";

/** @typedef {import("./compat-contract.js").CompatAdapterDef} CompatAdapterDef */
/** @typedef {import("./compat-contract.js").CompatRuntimeStatus} CompatRuntimeStatus */
/** @typedef {import("./compat-contract.js").AdapterStatus} AdapterStatus */
/** @typedef {import("./cart-drawer-adapters.js").GiftLineIdentity} GiftLineIdentity */

export { CART_UPDATED_EVENT, COMPATIBILITY_API_VERSION };
export const BOOT_FLAG = "__FGPB_CART_DRAWER_COMPAT";

const GIFT_PROP = "_fgpb_free_gift";
const MUTATION_DEDUPE_MAX = 32;
const REFRESH_DEBOUNCE_MS = 40;

let lastEmitKey = "";
let lastEmitAt = 0;
const EMIT_DEDUP_MS = 400;

/**
 * @returns {string | null}
 */
function readForcedAdapterId() {
  try {
    if (typeof window !== "undefined" && window.__FGPB_FORCE_ADAPTER) {
      return String(window.__FGPB_FORCE_ADAPTER).trim() || null;
    }
  } catch {
    /* ignore */
  }
  try {
    const boot = document.getElementById("fgpb-bootstrap");
    const fromAttr = boot?.getAttribute("data-fgpb-force-adapter");
    if (fromAttr && fromAttr.trim()) return fromAttr.trim();
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {unknown} cart
 * @returns {GiftLineIdentity[]}
 */
function giftIdentitiesFromCart(cart) {
  const items =
    cart && Array.isArray(/** @type {{ items?: unknown }} */ (cart).items)
      ? /** @type {{ items: Array<Record<string, unknown>> }} */ (cart).items
      : [];
  /** @type {GiftLineIdentity[]} */
  const out = [];
  for (const item of items) {
    const props = /** @type {Record<string, unknown>} */ (item.properties || {});
    const flag = props[GIFT_PROP];
    const isGift = flag === true || flag === "true" || flag === 1 || flag === "1";
    if (!isGift) continue;
    out.push({
      key: item.key != null ? String(item.key) : undefined,
      variantId:
        item.variant_id != null
          ? Number(item.variant_id)
          : item.id != null
            ? Number(item.id)
            : undefined,
      sku: item.sku != null ? String(item.sku) : undefined,
      isAppGift: true,
    });
  }
  return out;
}

/**
 * @param {object | null | undefined} cart
 */
export function cartCompatMeta(cart) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  let giftCount = 0;
  const keys = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const props = (it && it.properties) || {};
    if (props._fgpb_free_gift === "true" || props._fgpb_free_gift === true) giftCount += 1;
    const k = it?.key || it?.lineKey;
    if (k) keys.push(String(k));
  }
  keys.sort();
  return {
    itemCount: items.length,
    giftCount,
    version: keys.join("|") + "#" + items.length + "#" + giftCount,
  };
}

export function resetEmitDedup() {
  lastEmitKey = "";
  lastEmitAt = 0;
}

/**
 * Versioned compatibility event — no cart token, PII, titles, or secrets.
 * @param {{
 *   adapterId?: string,
 *   adapterVersion?: number | null,
 *   status?: string,
 *   reason?: string,
 *   limited?: boolean,
 *   nativeRefreshRequested?: boolean,
 *   mutationId?: string | null,
 *   cart?: object,
 * }} opts
 */
export function emitCartUpdated(opts) {
  if (typeof document === "undefined") return false;
  const adapterId = opts?.adapterId || "none";
  const reason = opts?.reason || "update";
  const mutationId = opts?.mutationId || null;
  const key = mutationId
    ? `m:${mutationId}:${adapterId}:${reason}`
    : `${adapterId}:${cartCompatMeta(opts?.cart).version}:${reason}`;
  const now = Date.now();
  if (key === lastEmitKey && now - lastEmitAt < EMIT_DEDUP_MS) return false;
  lastEmitKey = key;
  lastEmitAt = now;
  try {
    document.dispatchEvent(
      new CustomEvent(CART_UPDATED_EVENT, {
        detail: {
          version: COMPATIBILITY_API_VERSION,
          adapterId,
          adapterVersion: opts?.adapterVersion ?? null,
          status: opts?.status || ADAPTER_STATUS.UNKNOWN,
          reason,
          limited: !!opts?.limited,
          nativeRefreshRequested: !!opts?.nativeRefreshRequested,
          mutationId,
          timestamp: now,
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Never inject Dawn cart-drawer section HTML into third-party roots.
 * @param {CompatAdapterDef | null | undefined} adapter
 * @param {object | null | undefined} sections
 */
export function filterSectionsForAdapter(adapter, sections) {
  return filterSectionsPure(adapter, sections);
}

/**
 * @param {CompatAdapterDef | null | undefined} adapter
 * @param {object | null | undefined} cart
 */
export function refreshNativeDrawer(adapter, cart) {
  if (!adapter) {
    return { ok: false, limited: true, reason: "no-adapter", nativeRefreshRequested: false };
  }
  const strategy = adapter.capabilities?.refreshStrategy || REFRESH_STRATEGY.NONE;
  if (strategy === REFRESH_STRATEGY.NATIVE) {
    let requested = false;
    try {
      if (
        typeof window !== "undefined" &&
        window.__tpCart &&
        typeof window.__tpCart.refresh === "function"
      ) {
        requested = true;
        window.__tpCart.refresh(true);
        emitCartUpdated({
          adapterId: adapter.id,
          adapterVersion: adapter.adapterVersion,
          status: adapter.capabilities.limited
            ? ADAPTER_STATUS.LIMITED
            : ADAPTER_STATUS.SUPPORTED,
          reason: "native-refresh",
          limited: !!adapter.capabilities.limited,
          nativeRefreshRequested: true,
          cart,
        });
        return { ok: true, limited: !!adapter.capabilities.limited, reason: "native-refresh", nativeRefreshRequested: true };
      }
    } catch {
      /* fall through */
    }
    const names = adapter.nativeRefreshWindow || [];
    for (const name of names) {
      try {
        const fn = typeof window !== "undefined" ? window[name] : null;
        if (typeof fn === "function") {
          requested = true;
          fn.call(window);
          emitCartUpdated({
            adapterId: adapter.id,
            adapterVersion: adapter.adapterVersion,
            status: adapter.capabilities.limited
              ? ADAPTER_STATUS.LIMITED
              : ADAPTER_STATUS.SUPPORTED,
            reason: "native-refresh",
            limited: !!adapter.capabilities.limited,
            nativeRefreshRequested: true,
            cart,
          });
          return { ok: true, limited: !!adapter.capabilities.limited, reason: "native-refresh", nativeRefreshRequested: true };
        }
      } catch {
        /* next */
      }
    }
    emitCartUpdated({
      adapterId: adapter.id,
      adapterVersion: adapter.adapterVersion,
      status: ADAPTER_STATUS.LIMITED,
      reason: "native-refresh-unavailable",
      limited: true,
      nativeRefreshRequested: requested,
      cart,
    });
    return {
      ok: false,
      limited: true,
      reason: "native-refresh-unavailable",
      nativeRefreshRequested: requested,
    };
  }
  if (strategy === REFRESH_STRATEGY.EVENT_ONLY) {
    emitCartUpdated({
      adapterId: adapter.id,
      adapterVersion: adapter.adapterVersion,
      status: ADAPTER_STATUS.LIMITED,
      reason: "event-only",
      limited: true,
      nativeRefreshRequested: false,
      cart,
    });
    return { ok: true, limited: true, reason: "event-only", nativeRefreshRequested: false };
  }
  return { ok: false, limited: true, reason: "unsupported", nativeRefreshRequested: false };
}

/**
 * Highlight gift rows via contract matcher — no textContent heuristics.
 * @param {object | null | undefined} cart
 * @param {Document | null | undefined} doc
 */
export function highlightCompatGiftRows(cart, doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d) return { adapterId: "none", highlighted: 0, limited: true };
  const { adapter, root } = selectCompatAdapter(d);
  if (!adapter.capabilities.canHighlightGiftRows || !root) {
    return {
      adapterId: adapter.id,
      highlighted: 0,
      limited: adapter.capabilities.limited,
    };
  }

  const gifts = giftIdentitiesFromCart(cart);
  const rows = queryRows(adapter, root);
  for (let c = 0; c < rows.length; c++) {
    rows[c].classList && rows[c].classList.remove && rows[c].classList.remove("fgpb-gift-line");
  }

  const styleable = findGiftRows(root, adapter, gifts);
  for (let i = 0; i < styleable.length; i++) {
    if (styleable[i].classList && styleable[i].classList.add) {
      styleable[i].classList.add("fgpb-gift-line");
    }
  }
  return {
    adapterId: adapter.id,
    highlighted: styleable.length,
    limited: !!adapter.capabilities.limited,
  };
}

/**
 * @returns {{
 *   detect: Function,
 *   install: Function,
 *   activate: Function,
 *   refresh: Function,
 *   deactivate: Function,
 *   destroy: Function,
 *   getStatus: Function,
 *   filterSectionsForAdapter: typeof filterSectionsForAdapter,
 *   matchGiftRows: typeof matchGiftRows,
 *   findGiftRows: typeof findGiftRows,
 *   adapter: CompatAdapterDef | null,
 *   root: Element | null,
 * }}
 */
export function createDrawerCompatManager() {
  /** @type {AbortController | null} */
  let abort = null;
  /** @type {CompatAdapterDef | null} */
  let activeAdapter = null;
  /** @type {Element | null} */
  let activeRoot = null;
  /** @type {AdapterStatus} */
  let status = ADAPTER_STATUS.DISABLED;
  let confidence = 0;
  /** @type {string | null} */
  let lastRefreshResult = null;
  /** @type {string | null} */
  let lastErrorCode = null;
  let installed = false;
  let destroyed = false;

  /** @type {Set<string>} */
  const seenMutationIds = new Set();
  /** @type {string[]} */
  const mutationIdOrder = [];

  let refreshInFlight = false;
  let refreshPending = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let refreshTimer = null;
  /** @type {unknown} */
  let pendingCart = null;
  /** @type {string | null} */
  let pendingMutationId = null;
  /** @type {string} */
  let pendingReason = "coalesced";
  /** @type {MutationObserver | null} */
  let hostObs = null;
  /** @type {MutationObserver | null} */
  let bodyWaitObs = null;

  function getStatus() {
    return {
      contractVersion: COMPATIBILITY_API_VERSION,
      adapterId: activeAdapter?.id || "none",
      adapterVersion: activeAdapter?.adapterVersion ?? null,
      status,
      confidence,
      capabilities: activeAdapter?.capabilities ? { ...activeAdapter.capabilities } : null,
      refreshStrategy: activeAdapter?.capabilities?.refreshStrategy ?? null,
      lastRefreshResult,
      lastErrorCode,
      timestamp: Date.now(),
    };
  }

  function stopHostObserver() {
    if (hostObs) {
      try {
        hostObs.disconnect();
      } catch {
        /* ignore */
      }
      hostObs = null;
    }
  }

  function stopBodyWaitObserver() {
    if (bodyWaitObs) {
      try {
        bodyWaitObs.disconnect();
      } catch {
        /* ignore */
      }
      bodyWaitObs = null;
    }
  }

  function watchActiveRoot() {
    stopHostObserver();
    if (!activeRoot || typeof MutationObserver === "undefined") return;
    hostObs = new MutationObserver(() => {
      scheduleRefresh(null, "compat-root", null);
    });
    try {
      hostObs.observe(activeRoot, { childList: true, subtree: false });
    } catch {
      /* ignore */
    }
    try {
      if (activeRoot.shadowRoot) {
        hostObs.observe(activeRoot.shadowRoot, { childList: true, subtree: false });
      }
    } catch {
      /* ignore */
    }
  }

  function waitForCompatRoot() {
    if (bodyWaitObs || typeof MutationObserver === "undefined") return;
    if (!document.body) return;
    const fp = KWIKCART_ADAPTER.fingerprint;
    if (!readRuntimeEvidence(fp, document, typeof window !== "undefined" ? window : null).hit) return;
    bodyWaitObs = new MutationObserver(() => {
      activateFromDetection();
      if (activeRoot && activeAdapter && activeAdapter.id !== "none") {
        stopBodyWaitObserver();
        watchActiveRoot();
        scheduleRefresh(null, "late-root", null);
      }
    });
    try {
      bodyWaitObs.observe(document.body, { childList: true, subtree: false });
    } catch {
      stopBodyWaitObserver();
    }
  }

  function rememberMutationId(mutationId) {
    if (!mutationId) return false;
    if (seenMutationIds.has(mutationId)) return true;
    seenMutationIds.add(mutationId);
    mutationIdOrder.push(mutationId);
    while (mutationIdOrder.length > MUTATION_DEDUPE_MAX) {
      const old = mutationIdOrder.shift();
      if (old) seenMutationIds.delete(old);
    }
    return false;
  }

  function clearSurfaceOwner() {
    if (!activeRoot) return;
    try {
      if (activeRoot.getAttribute(SURFACE_OWNER_ATTR) === SURFACE_OWNER_COMPAT) {
        activeRoot.removeAttribute(SURFACE_OWNER_ATTR);
      }
    } catch {
      /* ignore */
    }
  }

  function markSurfaceOwner() {
    if (!activeRoot) return;
    try {
      activeRoot.setAttribute(SURFACE_OWNER_ATTR, SURFACE_OWNER_COMPAT);
    } catch {
      /* ignore */
    }
  }

  function highlightGiftRows(gifts) {
    if (!activeAdapter || !activeRoot) return;
    if (!activeAdapter.capabilities.canHighlightGiftRows) return;
    try {
      activeRoot
        .querySelectorAll(".fgpb-gift-line")
        .forEach((el) => el.classList.remove("fgpb-gift-line"));
    } catch {
      /* ignore */
    }
    const rows = findGiftRows(activeRoot, activeAdapter, gifts);
    for (const row of rows) {
      try {
        row.classList.add("fgpb-gift-line");
      } catch {
        /* ignore */
      }
    }
  }

  async function fetchCartJson() {
    try {
      const res = await fetch("/cart.js", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function tryNativeRefresh() {
    if (!activeAdapter) return false;
    if (activeAdapter.capabilities.refreshStrategy !== REFRESH_STRATEGY.NATIVE) return false;
    try {
      if (
        typeof window !== "undefined" &&
        window.__tpCart &&
        typeof window.__tpCart.refresh === "function"
      ) {
        window.__tpCart.refresh(true);
        return true;
      }
    } catch {
      /* try adapter window methods */
    }
    const names = activeAdapter.nativeRefreshWindow || [];
    for (const name of names) {
      try {
        const fn = typeof window !== "undefined" ? window[name] : null;
        if (typeof fn === "function") {
          fn.call(window);
          return true;
        }
      } catch {
        /* next */
      }
    }
    if (!activeRoot) return false;
    const el = /** @type {HTMLElement & Record<string, unknown>} */ (activeRoot);
    for (const name of ["refresh", "renderContents", "update"]) {
      try {
        const fn = el[name];
        if (typeof fn === "function") {
          fn.call(el);
          return true;
        }
      } catch {
        /* next */
      }
    }
    return false;
  }

  async function runRefresh(cart, meta = {}) {
    if (destroyed || !activeAdapter || activeAdapter.id === "none") {
      lastRefreshResult = "skipped-inactive";
      return;
    }
    if (
      status === ADAPTER_STATUS.UNKNOWN ||
      status === ADAPTER_STATUS.CONFLICT ||
      status === ADAPTER_STATUS.FAILED ||
      status === ADAPTER_STATUS.DISABLED
    ) {
      lastRefreshResult = "skipped-status";
      return;
    }

    let cartData = cart;
    if (!cartData) cartData = await fetchCartJson();
    const gifts = giftIdentitiesFromCart(cartData);
    highlightGiftRows(gifts);

    let ws = null;
    try {
      ws = typeof window !== "undefined" ? window.__fgpbLastWidgetState : null;
    } catch {
      ws = null;
    }
    if (activeAdapter.capabilities.mountProgressStrip) {
      try {
        syncCompatProgressStrip(activeAdapter, activeRoot, ws, cartData, typeof window !== "undefined" ? window : null);
      } catch {
        /* presentation only */
      }
    }

    let nativeRefreshRequested = false;
    const strategy = activeAdapter.capabilities.refreshStrategy;
    if (strategy === REFRESH_STRATEGY.NATIVE) {
      nativeRefreshRequested = tryNativeRefresh();
      lastRefreshResult = nativeRefreshRequested ? "native" : "native-miss";
    } else if (strategy === REFRESH_STRATEGY.EVENT_ONLY) {
      lastRefreshResult = "event-only";
    } else {
      lastRefreshResult = "none";
    }

    emitCartUpdated({
      adapterId: activeAdapter.id,
      adapterVersion: activeAdapter.adapterVersion,
      status,
      reason: meta.reason || "refresh",
      limited: !!activeAdapter.capabilities.limited,
      nativeRefreshRequested,
      mutationId: meta.mutationId || null,
      cart: /** @type {object} */ (cartData) || undefined,
    });
  }

  function scheduleRefresh(cart, reason, mutationId) {
    pendingCart = cart ?? pendingCart;
    pendingReason = reason || pendingReason;
    pendingMutationId = mutationId || pendingMutationId;

    if (refreshInFlight) {
      refreshPending = true;
      return;
    }

    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void flushRefresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  async function flushRefresh() {
    if (refreshInFlight) {
      refreshPending = true;
      return;
    }
    refreshInFlight = true;
    const cart = pendingCart;
    const reason = pendingReason;
    const mutationId = pendingMutationId;
    pendingCart = null;
    pendingMutationId = null;
    pendingReason = "coalesced";
    refreshPending = false;
    try {
      await runRefresh(cart, { reason, mutationId });
    } catch (err) {
      lastErrorCode = "refresh-error";
      lastRefreshResult = "error";
      status = ADAPTER_STATUS.LIMITED;
      try {
        console.warn("[fgpb-compat] refresh failed", err);
      } catch {
        /* ignore */
      }
    } finally {
      refreshInFlight = false;
      if (refreshPending) {
        refreshPending = false;
        scheduleRefresh(null, "pending", null);
      }
    }
  }

  function detect() {
    const forceAdapterId = readForcedAdapterId();
    const result = detectBestAdapter(document, { forceAdapterId });
    confidence = result.confidence;
    if (result.status === ADAPTER_STATUS.FAILED) {
      status = ADAPTER_STATUS.FAILED;
      lastErrorCode = result.reason || "detect-failed";
      activeAdapter = result.adapter;
      activeRoot = null;
    } else if (result.status === ADAPTER_STATUS.CONFLICT) {
      status = ADAPTER_STATUS.CONFLICT;
      lastErrorCode = result.reason || "conflict";
      activeAdapter = null;
      activeRoot = null;
    } else if (
      result.status === ADAPTER_STATUS.UNKNOWN ||
      !result.adapter ||
      result.adapter.id === "none"
    ) {
      status = ADAPTER_STATUS.UNKNOWN;
      activeAdapter = NONE_ADAPTER;
      activeRoot = null;
    } else {
      status = result.status;
      activeAdapter = result.adapter;
      activeRoot = result.root;
      lastErrorCode = null;
    }
    return result;
  }

  function deactivate() {
    stopHostObserver();
    if (activeRoot) {
      try {
        removeCompatProgressStrip(activeRoot);
      } catch {
        /* ignore */
      }
    }
    clearSurfaceOwner();
    if (activeRoot && activeAdapter?.capabilities?.canHighlightGiftRows) {
      try {
        activeRoot
          .querySelectorAll(".fgpb-gift-line")
          .forEach((el) => el.classList.remove("fgpb-gift-line"));
      } catch {
        /* ignore */
      }
    }
    activeAdapter = NONE_ADAPTER;
    activeRoot = null;
    status = ADAPTER_STATUS.DISABLED;
    confidence = 0;
  }

  function activateFromDetection() {
    clearSurfaceOwner();
    const result = detect();
    if (
      status === ADAPTER_STATUS.FAILED ||
      status === ADAPTER_STATUS.CONFLICT ||
      status === ADAPTER_STATUS.UNKNOWN ||
      !activeAdapter ||
      activeAdapter.id === "none" ||
      !activeRoot
    ) {
      stopHostObserver();
      return result;
    }
    markSurfaceOwner();
    watchActiveRoot();
    stopBodyWaitObserver();
    return result;
  }

  function install() {
    if (destroyed) return;
    if (installed) return;
    installed = true;
    abort = new AbortController();
    const { signal } = abort;

    activateFromDetection();
    if (!activeRoot) waitForCompatRoot();
    // none/unknown: no boot emit, no DOM/section/native refresh

    const onFgpbCart = (ev) => {
      const detail = /** @type {CustomEvent} */ (ev).detail || {};
      const mutationId =
        detail && typeof detail === "object" && detail.mutationId
          ? String(detail.mutationId)
          : null;
      if (mutationId && rememberMutationId(mutationId)) return;
      const cart = detail && typeof detail === "object" ? detail.cart : null;
      scheduleRefresh(cart, "fgpb:cart", mutationId);
    };

    document.addEventListener("fgpb:cart", onFgpbCart, { signal });
    document.addEventListener(
      "cart:updated",
      (ev) => {
        const detail = /** @type {CustomEvent} */ (ev).detail || {};
        const mutationId =
          detail && typeof detail === "object" && detail.mutationId
            ? String(detail.mutationId)
            : null;
        if (mutationId && rememberMutationId(`cart:${mutationId}`)) return;
        const cart = detail && typeof detail === "object" ? detail.cart : null;
        scheduleRefresh(cart, "cart:updated", mutationId);
      },
      { signal },
    );
    document.addEventListener(
      "cart:change",
      (ev) => {
        const detail = /** @type {CustomEvent} */ (ev).detail || {};
        const mutationId =
          detail && typeof detail === "object" && detail.mutationId
            ? String(detail.mutationId)
            : null;
        if (mutationId && rememberMutationId(`change:${mutationId}`)) return;
        scheduleRefresh(null, "cart:change", mutationId);
      },
      { signal },
    );

    document.addEventListener(
      "shopify:section:load",
      () => {
        if (destroyed) return;
        clearSurfaceOwner();
        activateFromDetection();
        if (!activeRoot) waitForCompatRoot();
      },
      { signal },
    );
    try {
      window.addEventListener(
        "popstate",
        () => {
          scheduleRefresh(null, "popstate", null);
        },
        { signal },
      );
    } catch {
      /* ignore */
    }
  }

  function refresh(cart, meta = {}) {
    if (destroyed) return;
    scheduleRefresh(cart, meta.reason || "manual", meta.mutationId || null);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    refreshPending = false;
    refreshInFlight = false;
    stopHostObserver();
    stopBodyWaitObserver();
    if (abort) {
      try {
        abort.abort();
      } catch {
        /* ignore */
      }
      abort = null;
    }
    deactivate();
    installed = false;
    seenMutationIds.clear();
    mutationIdOrder.length = 0;
    lastRefreshResult = null;
  }

  return {
    detect,
    install,
    activate: activateFromDetection,
    refresh,
    deactivate,
    destroy,
    getStatus,
    filterSectionsForAdapter,
    matchGiftRows,
    findGiftRows,
    get adapter() {
      return activeAdapter;
    },
    get root() {
      return activeRoot;
    },
  };
}

/**
 * Install listeners once. Idempotent via BOOT_FLAG.
 * @returns {{ installed: boolean, reason: string, duplicate?: boolean }}
 */
export function installCartDrawerCompat() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { installed: false, reason: "no-dom" };
  }
  if (window[BOOT_FLAG]) {
    return { installed: false, reason: "already-loaded", duplicate: true };
  }
  window[BOOT_FLAG] = true;

  // Destroy previous manager if any (test / hot reload)
  try {
    const prev = window.__fgpbDrawerCompat;
    if (prev && typeof prev.destroy === "function") prev.destroy();
  } catch {
    /* ignore */
  }

  const manager = createDrawerCompatManager();
  manager.install();

  window.__fgpbDrawerCompat = {
    version: COMPATIBILITY_API_VERSION,
    eventName: CART_UPDATED_EVENT,
    adapters: () => getCompatAdapters(),
    resolve: () => selectCompatAdapter(document),
    emitCartUpdated,
    refreshNativeDrawer,
    highlightCompatGiftRows,
    filterSectionsForAdapter,
    shouldApplyDawnSections,
    isCompatOwnedSurface,
    shouldApplyCartDrawerSectionToTarget: (target) =>
      shouldApplyCartDrawerSectionToTarget(manager.adapter, target),
    getStatus: () => manager.getStatus(),
    refresh: (cart, meta) => manager.refresh(cart, meta),
    destroy: () => {
      manager.destroy();
      window[BOOT_FLAG] = false;
    },
    /**
     * Core handshake — sections stay intact (Dawn coexistence).
     * Use ownsSurface / shouldApplyCartDrawerSectionToTarget at apply-time.
     */
    filterSections(sections) {
      const { sections: next } = filterSectionsForAdapter(manager.adapter, sections);
      return next;
    },
    ownsSurface(el) {
      return isCompatOwnedSurface(el);
    },
    get adapter() {
      return manager.adapter;
    },
    get status() {
      return manager.getStatus();
    },
  };

  return { installed: true, reason: "ok", duplicate: false };
}

export {
  selectCompatAdapter,
  extractLineKey,
  extractVariantId,
  queryRows,
  NONE_ADAPTER,
  getCompatAdapters,
  shouldApplyDawnSections,
  matchGiftRows,
  findGiftRows,
  detectBestAdapter,
  getAdapterById,
  isCompatOwnedSurface,
  shouldApplyCartDrawerSectionToTarget,
};
