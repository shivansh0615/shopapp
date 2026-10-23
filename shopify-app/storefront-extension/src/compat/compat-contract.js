/**
 * Optional cart-drawer compatibility contract (single source of truth).
 * Storefront remains JavaScript — constants + JSDoc only.
 *
 * Adapters are UI-only. They must never mutate cart, evaluate campaigns,
 * or touch Reward Sync / Discount Function logic.
 */

/** @type {1} */
export const COMPATIBILITY_API_VERSION = 1;

export const CART_UPDATED_EVENT = "fgpb:cart-updated";
export const SURFACE_OWNER_ATTR = "data-fgpb-surface-owner";
export const SURFACE_OWNER_CORE = "core";
export const SURFACE_OWNER_COMPAT = "compat";

/** @typedef {"supported"|"limited"|"unknown"|"conflict"|"disabled"|"failed"} AdapterStatus */
export const ADAPTER_STATUS = Object.freeze({
  SUPPORTED: "supported",
  LIMITED: "limited",
  UNKNOWN: "unknown",
  CONFLICT: "conflict",
  DISABLED: "disabled",
  FAILED: "failed",
});

/** @typedef {"sections"|"native"|"event-only"|"none"} RefreshStrategy */
export const REFRESH_STRATEGY = Object.freeze({
  SECTIONS: "sections",
  NATIVE: "native",
  EVENT_ONLY: "event-only",
  NONE: "none",
});

/** @typedef {"exact"|"unambiguous_fallback"|"ambiguous"|"not_found"} LineMatchKind */
export const LINE_MATCH = Object.freeze({
  EXACT: "exact",
  UNAMBIGUOUS_FALLBACK: "unambiguous_fallback",
  AMBIGUOUS: "ambiguous",
  NOT_FOUND: "not_found",
});

/** Minimum score to activate an adapter (generic-class-only must stay below). */
export const DETECTION_ACTIVATE_MIN = 80;

/** Max score allowed for generic-class-only fingerprints. */
export const DETECTION_GENERIC_CLASS_MAX = 30;

/**
 * @typedef {object} AdapterCapabilities
 * @property {boolean} canRefresh
 * @property {boolean} canHighlightGiftRows
 * @property {boolean} canDetectOpenState
 * @property {boolean} acceptsShopifySections
 * @property {RefreshStrategy} refreshStrategy
 * @property {boolean} limited
 * @property {boolean} [mountProgressStrip]
 */

/**
 * Detection fingerprint weights (deterministic scoring).
 * @typedef {object} AdapterFingerprint
 * @property {string[]} [uniqueIds]       score 100 each hit (first)
 * @property {string[]} [dataAttrs]       score 90
 * @property {string[]} [customElements]  score 90
 * @property {string[]} [rootPlus]        secondary selectors under root — score 80 when root+child
 * @property {string[]} [genericClasses]  score 30 max (never "supported" alone)
 * @property {string[]} [openSelectors]   optional open-state probes (capability only)
 * @property {string[]} [shadowHosts]     open-shadow hosts that may contain rootPlus
 * @property {string[]} [runtimeAny]      window keys that must accompany DOM evidence
 * @property {string[]} [scriptSrcIncludes] script src needles that count as runtime evidence
 */

/**
 * @typedef {object} CompatAdapterDef
 * @property {string} id
 * @property {number} adapterVersion
 * @property {number} contractVersion
 * @property {AdapterCapabilities} capabilities
 * @property {AdapterFingerprint} fingerprint
 * @property {string[]} rowSelectors
 * @property {"data-line-key"|"none"} lineKeyStrategy
 * @property {string[]} [nativeRefreshWindow]
 */

/**
 * @typedef {object} DetectionCandidate
 * @property {CompatAdapterDef} adapter
 * @property {Element | null} root
 * @property {number} confidence
 * @property {string[]} reasons
 */

/**
 * @typedef {object} DetectionResult
 * @property {AdapterStatus} status
 * @property {CompatAdapterDef | null} adapter
 * @property {Element | null} root
 * @property {number} confidence
 * @property {DetectionCandidate[]} candidates
 * @property {string} [reason]
 */

/**
 * @typedef {object} CompatRuntimeStatus
 * @property {number} contractVersion
 * @property {string} adapterId
 * @property {number | null} adapterVersion
 * @property {AdapterStatus} status
 * @property {number} confidence
 * @property {AdapterCapabilities | null} capabilities
 * @property {RefreshStrategy | null} refreshStrategy
 * @property {string | null} lastRefreshResult
 * @property {string | null} lastErrorCode
 * @property {number} timestamp
 */

export const LIFECYCLE = Object.freeze({
  DETECT: "detect",
  INSTALL: "install",
  ACTIVATE: "activate",
  REFRESH: "refresh",
  DEACTIVATE: "deactivate",
  DESTROY: "destroy",
});

/**
 * @param {unknown} status
 * @returns {status is AdapterStatus}
 */
export function isAdapterStatus(status) {
  return (
    status === ADAPTER_STATUS.SUPPORTED ||
    status === ADAPTER_STATUS.LIMITED ||
    status === ADAPTER_STATUS.UNKNOWN ||
    status === ADAPTER_STATUS.CONFLICT ||
    status === ADAPTER_STATUS.DISABLED ||
    status === ADAPTER_STATUS.FAILED
  );
}

/**
 * @param {unknown} strategy
 * @returns {strategy is RefreshStrategy}
 */
export function isRefreshStrategy(strategy) {
  return (
    strategy === REFRESH_STRATEGY.SECTIONS ||
    strategy === REFRESH_STRATEGY.NATIVE ||
    strategy === REFRESH_STRATEGY.EVENT_ONLY ||
    strategy === REFRESH_STRATEGY.NONE
  );
}
