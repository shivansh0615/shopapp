/**
 * Third-party cart drawer adapter registry + pure helpers.
 * Contract: ./compat-contract.js
 * UI-only — never mutates cart / campaigns / Reward Sync.
 */

import {
  ADAPTER_STATUS,
  COMPATIBILITY_API_VERSION,
  DETECTION_ACTIVATE_MIN,
  DETECTION_GENERIC_CLASS_MAX,
  LINE_MATCH,
  REFRESH_STRATEGY,
} from "./compat-contract.js";

/** @typedef {import("./compat-contract.js").CompatAdapterDef} CompatAdapterDef */
/** @typedef {import("./compat-contract.js").DetectionCandidate} DetectionCandidate */
/** @typedef {import("./compat-contract.js").DetectionResult} DetectionResult */
/** @typedef {import("./compat-contract.js").LineMatchKind} LineMatchKind */

/**
 * @typedef {object} GiftLineIdentity
 * @property {string} [key]
 * @property {number|string} [variantId]
 * @property {string} [sku]
 * @property {boolean} [isAppGift]
 */

/**
 * @typedef {object} LineMatchResult
 * @property {LineMatchKind} kind
 * @property {Element[]} elements
 */

/**
 * GoKwik KwikCart — optional presentation adapter only.
 * Verified live (MyAvni / kwikcart.gokwik.co): custom element `shadow-dom-container`
 * with open shadow, panel `.gokwik-sidecart-container`, public `refreshSideCart`.
 * Not `#upc-cart`. Checkout (`#gokwik-modal-wrapper`, `.gokwik-checkout`) is not this surface.
 *
 * @type {CompatAdapterDef}
 */
export const KWIKCART_ADAPTER = {
  id: "kwikcart",
  adapterVersion: 1,
  contractVersion: COMPATIBILITY_API_VERSION,
  capabilities: {
    canRefresh: true,
    canHighlightGiftRows: false,
    canDetectOpenState: true,
    acceptsShopifySections: false,
    refreshStrategy: REFRESH_STRATEGY.NATIVE,
    limited: true,
    mountProgressStrip: true,
  },
  fingerprint: {
    uniqueIds: [],
    dataAttrs: [],
    customElements: ["shadow-dom-container"],
    rootPlus: [".gokwik-sidecart-container"],
    genericClasses: [".sidecart", ".gokwik-checkout"],
    openSelectors: [],
    shadowHosts: ["shadow-dom-container"],
    runtimeAny: ["openGokwikSideCart", "refreshSideCart", "gk_cart_domain", "kwikCartActive"],
    scriptSrcIncludes: ["kwikcart.gokwik.co"],
  },
  rowSelectors: [],
  lineKeyStrategy: "none",
  nativeRefreshWindow: ["refreshSideCart"],
};

/**
 * @type {CompatAdapterDef}
 */
export const UPC_CART_ADAPTER = {
  id: "upc-cart",
  adapterVersion: 1,
  contractVersion: COMPATIBILITY_API_VERSION,
  capabilities: {
    canRefresh: true,
    canHighlightGiftRows: true,
    canDetectOpenState: true,
    acceptsShopifySections: false,
    refreshStrategy: REFRESH_STRATEGY.NATIVE,
    limited: false,
  },
  fingerprint: {
    uniqueIds: ["#upc-cart"],
    dataAttrs: ["[data-upc-cart]"],
    customElements: [],
    rootPlus: [".upc-line-item"],
    genericClasses: [".upc-drawer"],
    openSelectors: [
      "#upc-cart.upc-drawer--open",
      ".upc-drawer.upc-drawer--open",
      "[data-upc-cart].upc-drawer--open",
    ],
  },
  rowSelectors: [".upc-line-item"],
  lineKeyStrategy: "data-line-key",
};

/**
 * @type {CompatAdapterDef}
 */
export const CART_POPUP_ADAPTER = {
  id: "cart-popup",
  adapterVersion: 1,
  contractVersion: COMPATIBILITY_API_VERSION,
  capabilities: {
    canRefresh: false,
    canHighlightGiftRows: false,
    canDetectOpenState: true,
    acceptsShopifySections: false,
    refreshStrategy: REFRESH_STRATEGY.EVENT_ONLY,
    limited: true,
  },
  fingerprint: {
    uniqueIds: [],
    dataAttrs: ["[data-cart-popup-wrapper]", "[data-cart-popup]"],
    customElements: [],
    rootPlus: [".cart-popup-item", "[data-cart-popup-item]"],
    genericClasses: [".cart-popup-wrapper", ".cart-popup"],
    openSelectors: [
      ".cart-popup-wrapper:not(.cart-popup-wrapper--hidden)",
      "[data-cart-popup-wrapper]:not(.cart-popup-wrapper--hidden)",
    ],
  },
  rowSelectors: [".cart-popup-item", "[data-cart-popup-item]"],
  lineKeyStrategy: "none",
};

/**
 * Sentinel — never activates UI work.
 * @type {CompatAdapterDef}
 */
export const NONE_ADAPTER = {
  id: "none",
  adapterVersion: 1,
  contractVersion: COMPATIBILITY_API_VERSION,
  capabilities: {
    canRefresh: false,
    canHighlightGiftRows: false,
    canDetectOpenState: false,
    acceptsShopifySections: false,
    refreshStrategy: REFRESH_STRATEGY.NONE,
    limited: true,
  },
  fingerprint: {
    uniqueIds: [],
    dataAttrs: [],
    customElements: [],
    rootPlus: [],
    genericClasses: [],
    openSelectors: [],
  },
  rowSelectors: [],
  lineKeyStrategy: "none",
};

/** @type {CompatAdapterDef[]} */
export const COMPAT_ADAPTERS = [KWIKCART_ADAPTER, UPC_CART_ADAPTER, CART_POPUP_ADAPTER];

export function getCompatAdapters() {
  return COMPAT_ADAPTERS.slice();
}

/**
 * @param {string} id
 * @returns {CompatAdapterDef | null}
 */
export function getAdapterById(id) {
  if (!id || typeof id !== "string") return null;
  if (id === "none") return NONE_ADAPTER;
  return COMPAT_ADAPTERS.find((a) => a.id === id) || null;
}

/**
 * @param {Document | Element | null | undefined} root
 * @param {string} selector
 * @returns {Element | null}
 */
function safeQuery(root, selector) {
  if (!root || !selector) return null;
  try {
    return /** @type {Element | null} */ (root.querySelector(selector));
  } catch {
    return null;
  }
}

/**
 * @param {Document | Element | null | undefined} root
 * @param {string} selector
 * @returns {boolean}
 */
function safeMatches(root, selector) {
  if (!root || !selector || typeof /** @type {Element} */ (root).matches !== "function") {
    return false;
  }
  try {
    return /** @type {Element} */ (root).matches(selector);
  } catch {
    return false;
  }
}

/**
 * Query a host including its open shadow root (KwikCart panel lives in shadow).
 * @param {Element | Document | null | undefined} host
 * @param {string} selector
 * @returns {Element | null}
 */
export function queryInHost(host, selector) {
  const light = safeQuery(host, selector);
  if (light) return light;
  try {
    const sr = /** @type {Element & { shadowRoot?: ShadowRoot | null }} */ (host).shadowRoot;
    if (sr) return safeQuery(sr, selector);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Runtime evidence is required for adapters that declare runtimeAny / scriptSrcIncludes.
 * @param {import("./compat-contract.js").AdapterFingerprint} fp
 * @param {Document | null | undefined} doc
 * @param {Window | typeof globalThis | null | undefined} [win]
 * @returns {{ hit: boolean, reason: string | null }}
 */
export function readRuntimeEvidence(fp, doc, win) {
  const keys = fp?.runtimeAny || [];
  const scripts = fp?.scriptSrcIncludes || [];
  if (!keys.length && !scripts.length) return { hit: true, reason: null };

  const w = win || (typeof window !== "undefined" ? window : null);
  for (const k of keys) {
    try {
      const v = w && /** @type {Record<string, unknown>} */ (w)[k];
      if (v === true || typeof v === "function" || (typeof v === "string" && v.length > 0)) {
        return { hit: true, reason: `runtime:${k}` };
      }
    } catch {
      /* ignore */
    }
  }

  if (scripts.length && doc && typeof doc.querySelectorAll === "function") {
    try {
      const nodes = doc.querySelectorAll("script[src]");
      for (let i = 0; i < nodes.length; i++) {
        const src = nodes[i].getAttribute && nodes[i].getAttribute("src");
        if (!src) continue;
        for (const needle of scripts) {
          if (src.indexOf(needle) !== -1) return { hit: true, reason: `script:${needle}` };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { hit: false, reason: null };
}

function adapterRequiresRuntime(fp) {
  return Boolean((fp?.runtimeAny && fp.runtimeAny.length) || (fp?.scriptSrcIncludes && fp.scriptSrcIncludes.length));
}

/**
 * Whether the adapter's cart UI is open. Never uses generic `.cart-drawer`.
 * @param {CompatAdapterDef | null | undefined} adapter
 * @param {Element | null | undefined} root
 * @param {Window | typeof globalThis | null} [win]
 */
export function isAdapterSurfaceOpen(adapter, root, win) {
  if (!adapter || !root) return false;
  const w = win || (typeof window !== "undefined" ? window : null);
  if (adapter.id === "kwikcart") {
    try {
      if (w && w.history && w.history.state && /** @type {{ sideCart?: boolean }} */ (w.history.state).sideCart) {
        return true;
      }
    } catch {
      /* ignore */
    }
    const overlay = queryInHost(root, ".sidecart-overlay");
    if (overlay) {
      if (/** @type {HTMLElement} */ (overlay).hidden) return false;
      try {
        if (w && typeof w.getComputedStyle === "function") {
          const cs = w.getComputedStyle(overlay);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
        }
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }
  const fp = adapter.fingerprint || {};
  for (const sel of fp.openSelectors || []) {
    if (safeQuery(root, sel) || safeMatches(root, sel)) return true;
  }
  return false;
}

/**
 * @param {ParentNode | null | undefined} doc
 * @param {string[]} selectors
 * @returns {Element | null}
 */
export function queryFirst(doc, selectors) {
  if (!doc || typeof doc.querySelector !== "function") return null;
  const list = Array.isArray(selectors) ? selectors : [];
  for (let i = 0; i < list.length; i++) {
    const el = safeQuery(/** @type {Document|Element} */ (doc), list[i]);
    if (el) return el;
  }
  return null;
}

/**
 * Score one adapter against the document. Pure detection — no activation.
 * @param {CompatAdapterDef} adapter
 * @param {Document} [doc]
 * @returns {DetectionCandidate}
 */
export function scoreAdapter(adapter, doc = document) {
  /** @type {string[]} */
  const reasons = [];
  let confidence = 0;
  /** @type {Element | null} */
  let root = null;
  const fp = adapter.fingerprint || {};
  let hadStrongSignal = false;

  for (const sel of fp.uniqueIds || []) {
    const el = safeQuery(doc, sel);
    if (el) {
      confidence = Math.max(confidence, 100);
      root = root || el;
      reasons.push(`unique-id:${sel}`);
      hadStrongSignal = true;
      break;
    }
  }

  for (const sel of fp.dataAttrs || []) {
    const el = safeQuery(doc, sel);
    if (el) {
      confidence = Math.max(confidence, 90);
      root = root || el;
      reasons.push(`data-attr:${sel}`);
      hadStrongSignal = true;
    }
  }

  for (const sel of fp.customElements || []) {
    const el = safeQuery(doc, sel);
    if (el) {
      confidence = Math.max(confidence, 90);
      root = root || el;
      reasons.push(`custom-el:${sel}`);
      hadStrongSignal = true;
    }
  }

  if (root && (fp.rootPlus || []).length) {
    for (const childSel of fp.rootPlus) {
      if (queryInHost(root, childSel)) {
        confidence = Math.max(confidence, 80);
        reasons.push(`root+child:${childSel}`);
        hadStrongSignal = true;
        break;
      }
    }
  }

  if (!root) {
    for (const sel of fp.genericClasses || []) {
      const el = safeQuery(doc, sel);
      if (el) {
        confidence = Math.max(confidence, DETECTION_GENERIC_CLASS_MAX);
        root = el;
        reasons.push(`generic-class:${sel}`);
        break;
      }
    }
  } else if (!hadStrongSignal) {
    confidence = Math.min(confidence, DETECTION_GENERIC_CLASS_MAX);
  }

  // Open-state probes: capability evidence only (do not raise activate score alone)
  for (const sel of fp.openSelectors || []) {
    if (safeQuery(doc, sel) || (root && safeMatches(root, sel))) {
      reasons.push(`open:${sel}`);
      break;
    }
  }

  if (adapterRequiresRuntime(fp)) {
    const runtime = readRuntimeEvidence(fp, /** @type {Document} */ (doc), typeof window !== "undefined" ? window : null);
    if (!runtime.hit) {
      confidence = Math.min(confidence, DETECTION_GENERIC_CLASS_MAX);
      reasons.push("runtime-missing");
    } else if (runtime.reason) {
      reasons.push(runtime.reason);
      if (root) {
        confidence = Math.max(confidence, 100);
        hadStrongSignal = true;
      }
    }
  }

  return { adapter, root, confidence, reasons };
}

/**
 * Score all adapters; resolve winner / conflict / unknown.
 * Forced mode: invalid id → failed; missing root → failed (no silent fallback).
 *
 * @param {Document} [doc]
 * @param {{ forceAdapterId?: string | null }} [opts]
 * @returns {DetectionResult}
 */
export function detectBestAdapter(doc = document, opts = {}) {
  const forceId =
    typeof opts.forceAdapterId === "string" && opts.forceAdapterId.trim()
      ? opts.forceAdapterId.trim()
      : null;

  if (forceId) {
    const forced = getAdapterById(forceId);
    if (!forced || forced.id === "none") {
      return {
        status: ADAPTER_STATUS.FAILED,
        adapter: null,
        root: null,
        confidence: 0,
        candidates: [],
        reason: `force-invalid:${forceId}`,
      };
    }
    const scored = scoreAdapter(forced, doc);
    if (!scored.root) {
      return {
        status: ADAPTER_STATUS.FAILED,
        adapter: forced,
        root: null,
        confidence: 0,
        candidates: [scored],
        reason: `force-missing-root:${forceId}`,
      };
    }
    return {
      status: forced.capabilities.limited
        ? ADAPTER_STATUS.LIMITED
        : ADAPTER_STATUS.SUPPORTED,
      adapter: forced,
      root: scored.root,
      confidence: Math.max(scored.confidence, DETECTION_ACTIVATE_MIN),
      candidates: [scored],
      reason: `forced:${forceId}`,
    };
  }

  /** @type {DetectionCandidate[]} */
  const candidates = COMPAT_ADAPTERS.map((a) => scoreAdapter(a, doc)).sort(
    (a, b) => b.confidence - a.confidence || a.adapter.id.localeCompare(b.adapter.id),
  );

  const above = candidates.filter((c) => c.confidence >= DETECTION_ACTIVATE_MIN && c.root);

  if (above.length >= 2) {
    const top = above[0].confidence;
    const tied = above.filter((c) => c.confidence === top);
    if (tied.length >= 2) {
      return {
        status: ADAPTER_STATUS.CONFLICT,
        adapter: null,
        root: null,
        confidence: top,
        candidates,
        reason: `conflict:${tied.map((t) => t.adapter.id).join(",")}`,
      };
    }
  }

  if (above.length === 0) {
    return {
      status: ADAPTER_STATUS.UNKNOWN,
      adapter: NONE_ADAPTER,
      root: null,
      confidence: candidates[0]?.confidence || 0,
      candidates,
      reason: "no-adapter-above-threshold",
    };
  }

  const winner = above[0];
  return {
    status: winner.adapter.capabilities.limited
      ? ADAPTER_STATUS.LIMITED
      : ADAPTER_STATUS.SUPPORTED,
    adapter: winner.adapter,
    root: winner.root,
    confidence: winner.confidence,
    candidates,
    reason: winner.reasons.join("|") || winner.adapter.id,
  };
}

/**
 * Backward-compatible resolver used by tests / thin wrappers.
 * @param {Document} [doc]
 * @returns {{ adapter: CompatAdapterDef, root: Element | null, confidence?: number, status?: string }}
 */
export function selectCompatAdapter(doc = document) {
  const result = detectBestAdapter(doc);
  if (
    !result.adapter ||
    result.status === ADAPTER_STATUS.UNKNOWN ||
    result.status === ADAPTER_STATUS.CONFLICT ||
    result.status === ADAPTER_STATUS.FAILED
  ) {
    return { adapter: NONE_ADAPTER, root: null, confidence: result.confidence, status: result.status };
  }
  return {
    adapter: result.adapter,
    root: result.root,
    confidence: result.confidence,
    status: result.status,
  };
}

/**
 * @param {CompatAdapterDef} adapter
 * @param {ParentNode | null | undefined} root
 * @returns {Element[]}
 */
export function queryRows(adapter, root) {
  if (!adapter || !root || typeof root.querySelectorAll !== "function") return [];
  /** @type {Element[]} */
  const rows = [];
  const scopes = [root];
  try {
    if (/** @type {Element & { shadowRoot?: ShadowRoot | null }} */ (root).shadowRoot) {
      scopes.push(/** @type {Element} */ (/** @type {unknown} */ (root.shadowRoot)));
    }
  } catch {
    /* ignore */
  }
  for (const scope of scopes) {
    for (const sel of adapter.rowSelectors || []) {
      try {
        scope.querySelectorAll(sel).forEach((el) => {
          if (!rows.includes(el)) rows.push(el);
        });
      } catch {
        /* ignore */
      }
    }
  }
  return rows;
}

/**
 * Shopify line key only — never CartItem-N / data-index.
 * @param {Element | null | undefined} row
 * @param {CompatAdapterDef} adapter
 */
export function extractLineKey(row, adapter) {
  if (!row || !adapter || adapter.lineKeyStrategy === "none") return "";
  if (typeof row.getAttribute === "function") {
    const onRow =
      row.getAttribute("data-line-key") ||
      row.getAttribute("data-cart-item-key") ||
      row.getAttribute("data-key");
    if (onRow) return String(onRow).trim();
  }
  if (typeof row.querySelector === "function") {
    const keyEl = row.querySelector("[data-line-key], [data-cart-item-key], [data-key]");
    if (keyEl) {
      const raw =
        keyEl.getAttribute("data-line-key") ||
        keyEl.getAttribute("data-cart-item-key") ||
        keyEl.getAttribute("data-key");
      if (raw) return String(raw).trim();
    }
  }
  return "";
}

/**
 * @param {Element | null | undefined} row
 */
export function extractVariantId(row) {
  if (!row || typeof row.getAttribute !== "function") return "";
  const onRow = row.getAttribute("data-variant-id") || row.getAttribute("data-quantity-variant-id");
  if (onRow) return String(onRow).trim();
  if (typeof row.querySelector !== "function") return "";
  const el = row.querySelector("[data-quantity-variant-id], [data-variant-id]");
  if (!el) return "";
  return String(
    el.getAttribute("data-quantity-variant-id") || el.getAttribute("data-variant-id") || "",
  ).trim();
}

/**
 * Section payload ownership (coexistence-safe).
 *
 * NEVER globally strip `cart-drawer` merely because a TP adapter is active —
 * Dawn must still receive section HTML when a genuine Dawn drawer exists.
 * Injection into TP roots is prevented at apply-time via {@link isCompatOwnedSurface}.
 *
 * @param {CompatAdapterDef | null | undefined} _adapter
 * @param {Record<string, string> | null | undefined} sections
 * @returns {{ sections: Record<string, string> | null, stripped: boolean }}
 */
export function filterSectionsForAdapter(_adapter, sections) {
  if (!sections || typeof sections !== "object") {
    return { sections: sections || null, stripped: false };
  }
  return { sections: { ...sections }, stripped: false };
}

/**
 * True when the element is (or is inside) a compat-owned surface.
 * Core must not apply Dawn section HTML into these roots.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function isCompatOwnedSurface(el) {
  if (!el) return false;
  try {
    const attr = "data-fgpb-surface-owner";
    if (typeof el.getAttribute === "function" && el.getAttribute(attr) === "compat") {
      return true;
    }
    if (typeof el.closest === "function") {
      const host = el.closest(`[${attr}="compat"]`);
      if (host) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Whether core may apply Dawn `cart-drawer` section HTML to this target element.
 * @param {CompatAdapterDef | null | undefined} _adapter
 * @param {Element | null | undefined} target
 * @returns {boolean}
 */
export function shouldApplyCartDrawerSectionToTarget(_adapter, target) {
  if (!target) return false;
  return !isCompatOwnedSurface(target);
}

/**
 * Match gift cart lines to DOM rows. No textContent heuristics.
 * Only exact | unambiguous_fallback may be styled by callers.
 *
 * @param {Element | null | undefined} root
 * @param {CompatAdapterDef} adapter
 * @param {GiftLineIdentity[]} giftLines
 * @returns {LineMatchResult[]}
 */
export function matchGiftRows(root, adapter, giftLines) {
  if (!root || !adapter || !Array.isArray(giftLines) || !giftLines.length) {
    return [];
  }

  const rows = queryRows(adapter, root);
  if (!rows.length) {
    return giftLines.map(() => ({ kind: LINE_MATCH.NOT_FOUND, elements: [] }));
  }

  return giftLines.map((gift) => {
    if (!gift || gift.isAppGift === false) {
      return { kind: LINE_MATCH.NOT_FOUND, elements: [] };
    }

    if (gift.key && adapter.lineKeyStrategy === "data-line-key") {
      const exact = rows.filter((row) => extractLineKey(row, adapter) === String(gift.key));
      if (exact.length === 1) {
        return { kind: LINE_MATCH.EXACT, elements: exact };
      }
      if (exact.length > 1) {
        return { kind: LINE_MATCH.AMBIGUOUS, elements: exact };
      }
    }

    /** @type {Element[]} */
    let candidates = [];
    if (gift.variantId != null && gift.variantId !== "") {
      const vid = String(gift.variantId);
      candidates = rows.filter((row) => extractVariantId(row) === vid);
    } else if (gift.sku) {
      const sku = String(gift.sku);
      candidates = rows.filter((row) => {
        const attr = row.getAttribute("data-sku") || "";
        return attr && attr === sku;
      });
    }

    if (candidates.length === 1) {
      return { kind: LINE_MATCH.UNAMBIGUOUS_FALLBACK, elements: candidates };
    }
    if (candidates.length > 1) {
      return { kind: LINE_MATCH.AMBIGUOUS, elements: candidates };
    }
    return { kind: LINE_MATCH.NOT_FOUND, elements: [] };
  });
}

/**
 * Flat list of styleable elements only (exact + unambiguous_fallback).
 * @param {Element | null | undefined} root
 * @param {CompatAdapterDef} adapter
 * @param {GiftLineIdentity[]} giftLines
 * @returns {Element[]}
 */
export function findGiftRows(root, adapter, giftLines) {
  const matches = matchGiftRows(root, adapter, giftLines);
  /** @type {Element[]} */
  const out = [];
  for (const m of matches) {
    if (m.kind === LINE_MATCH.EXACT || m.kind === LINE_MATCH.UNAMBIGUOUS_FALLBACK) {
      for (const el of m.elements) {
        if (!out.includes(el)) out.push(el);
      }
    }
  }
  return out;
}

export function shouldApplyDawnSections(adapter) {
  return Boolean(adapter?.capabilities?.acceptsShopifySections);
}

export function adapterAcceptsSections(adapter) {
  return shouldApplyDawnSections(adapter);
}

/**
 * Legacy refreshStrategy label for logs.
 * @param {CompatAdapterDef | null | undefined} adapter
 * @returns {string}
 */
export function adapterRefreshStrategy(adapter) {
  if (!adapter) return REFRESH_STRATEGY.NONE;
  const s = adapter.capabilities.refreshStrategy;
  if (s === REFRESH_STRATEGY.NATIVE) return "native-refresh";
  return s;
}
