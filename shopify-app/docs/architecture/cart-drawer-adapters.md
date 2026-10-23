# Optional third-party cart drawer compatibility (beta)

Loaded **only** when the Theme App Embed setting `enable_third_party_cart_compatibility` is enabled (default **false**). Merchant label: **Optional third-party cart compatibility (beta)**.

Source lives under `storefront-extension/src/compat/` (contract, adapters, runtime). Entry: `storefront-extension/src/cart-drawer-compat.entry.js` → built asset `cart-drawer-compat.js`.

## Ownership

| Layer | Owns | Must not own |
|--------|------|----------------|
| **Core** (`free-gift-progress-bar.js`, `tiered-gift-sync.js`, `cart-page-progress.js`) | Reward Sync, Ajax cart mutations, Dawn/OS2 drawer UI, `__fgpbApplyCartSections`, gift qty=1 | TP adapter registry |
| **Optional compat** (`cart-drawer-compat.js`) | Detect, highlight, native/event refresh, `fgpb:cart-updated` | Cart mutations, Discount Function, Dawn section HTML into TP roots |
| **Liquid gate** | Load compat only if setting on | — |

Surface ownership is marked with `data-fgpb-surface-owner="core"|"compat"` so gift-line CSS cannot cross surfaces.

## Assets

| Asset | Role |
|--------|------|
| `free-gift-progress-bar.js` | Core Dawn/OS2 runtime. **No** TP adapter registry. |
| `cart-drawer-compat.js` | Optional compatibility asset (`kwikcart`, `#upc-cart`, limited `.cart-popup`). |

## Contract (`compat-contract.js`)

- `COMPATIBILITY_API_VERSION = 1`
- Statuses: `supported` | `limited` | `unknown` | `conflict` | `disabled` | `failed`
- Refresh strategies: `sections` (reserved) | `native` | `event-only` | `none`
- Line match: `exact` | `unambiguous_fallback` | `ambiguous` | `not_found` (only first two style)
- Capabilities: `canRefresh`, `canHighlightGiftRows`, `canDetectOpenState`, `acceptsShopifySections`, `refreshStrategy`, `limited`
- Lifecycle: `detect` → `install` → `activate` → `refresh` → `deactivate` → `destroy`

## Detection

All registered adapters are scored (unique id 100, data-attr/custom-el 90, root+child 80, generic class ≤30). Activate only above threshold (80). Tie above threshold → `conflict` (activate none). Forced mode: `window.__FGPB_FORCE_ADAPTER` or bootstrap `data-fgpb-force-adapter` — invalid/missing root → `failed`, no silent fallback.

## Line identity

No `textContent` / “Free Gift” heuristics in compat. Prefer Shopify line key; unambiguous single variant fallback only when unique.

## Section ownership (coexistence-safe)

Core never globally strips `cart-drawer` from section payloads when a TP adapter is active.

- Dawn section HTML still applies to genuine Dawn `<cart-drawer>`.
- Apply is skipped only when the resolved target has `data-fgpb-surface-owner="compat"` (or `ownsSurface(el)`).
- UPC / cart-popup refresh via adapter strategy (`native` / `event-only`), not Dawn section injection into TP roots.
- Compat `failed` / `conflict` / `none` / `disabled`: Dawn section refresh unchanged.

Helpers: `filterSectionsForAdapter` (passthrough), `isCompatOwnedSurface`, `shouldApplyCartDrawerSectionToTarget`.

## Event: `fgpb:cart-updated` (v1)

```js
{
  version: 1,
  adapterId: "kwikcart" | "upc-cart",
  adapterVersion: 1,
  status: "supported",
  reason: "native-refresh",
  limited: false,
  nativeRefreshRequested: true,
  mutationId: "fgpb-…",
  timestamp: 1710000000000
}
```

No cart token, customer data, titles, raw cart, or secrets. Compat never listens to its own `fgpb:cart-updated`.

## Diagnostics

| Source | Evidence |
|--------|----------|
| Admin server checks | Static “SERVER KNOWS” only (mode, asset sizes, registered adapter ids) |
| Browser `window.__fgpbDrawerCompat.getStatus()` | Runtime: contractVersion, adapterId, status, confidence, capabilities, lastRefreshResult, lastErrorCode, timestamp |

## Certification ladder

| Level | Meaning |
|--------|---------|
| **Experimental** | Fingerprint drafted; not shipped |
| **Beta** | Shipped behind optional flag; limited guarantees |
| **Compatible** | Scored detection + refresh + identity proven on live themes |

Current: **kwikcart = Beta (limited; checkout UI not integrated)**, **upc-cart = Beta**, **cart-popup = Beta (limited / event-only)**.

## Enablement

Theme editor → App embeds → Free Gift Progress Bar → **Optional third-party cart compatibility (beta)**.

## Live validation

Controlled unpublished theme probes may hit Shopify bot / rate limit (`BLOCKED_LIVE_VALIDATION`). Do not claim full third-party compatibility.

## Safety

- No document-wide MutationObserver
- No global fetch interception
- No Dawn `<cart-drawer>` section HTML into TP roots
- Gift rows matched by Shopify line key (or unambiguous tagged variant), never index
- Refresh coalescing (in-flight + pending + debounce); failure does not block Reward Sync
