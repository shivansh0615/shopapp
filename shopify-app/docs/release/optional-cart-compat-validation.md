# Optional third-party cart compatibility — live validation notes

## Decision

Included as **Optional third-party cart compatibility (beta)** (Theme App Embed setting, **default false**).

Core `free-gift-progress-bar.js` does **not** contain third-party adapter code.

## Evidence

| Scenarios | Result |
|-----------|--------|
| A–D (below threshold, unlock, duplicate, qty) on controlled `#upc-cart` | PASS (prior live run) |
| E–I (threshold drop, same-SKU, refresh, mobile, disabled) | BLOCKED — Shopify bot / 429 rate limit |

## Limits

- Not universal drawer support
- Supported optional adapters: `upc-cart`, limited `cart-popup`
- Unknown drawers may need custom integration
- Accelerated checkout is not supported for Ajax gift insertion
