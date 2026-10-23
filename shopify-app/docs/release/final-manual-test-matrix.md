# Final controlled test matrix (manual)

Environment: staging or controlled dev store. Do not publish live themes. Do not deploy from this checklist alone.

## Admin

| Check | Result |
|-------|--------|
| Install / open embedded app | |
| Dashboard load | |
| `/app/compatibility` diagnostics + Refresh | |
| Create / edit / enable / disable campaigns | |
| Campaign duplication | |
| Threshold edits | |
| Gift selection | |
| Discount sync status | |
| App embed deep link | |
| Help: accelerated checkout limitation copy | |

## Classic FREE_GIFT

Below / exact / above threshold · duplicate protection · drop below · requalify · hard refresh · same-SKU paid copy · qty enforcement · cart page · cart drawer · checkout discount.

## Tiered Free Gifts

Tier 1–3 · upgrade · downgrade · same gift variant across tiers · same-SKU · refresh · drawer/cart page · checkout.

## Infrastructure

`/health/live` · `/health/ready` · Neon · worker empty queue · uninstall/reinstall · compliance webhook auth boundary.

## Themes

Dawn/OS2 · draft theme · optional `upc-cart` beta (if available) · compatibility disabled · mobile/desktop.

## Explicit non-support

Accelerated checkout: verify limitation copy only — do not treat Buy it now as supported.
