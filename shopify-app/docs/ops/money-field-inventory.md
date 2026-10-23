# Money field inventory (integer-money migration)

## Persisted merchant configuration — MIGRATE NOW

| Field | Model | Class | Action |
|---|---|---|---|
| `threshold` | Campaign | money (major Float) | Add `thresholdMinor` + dual-write; keep Float |
| `fixedDiscountAmount` | Campaign | money (major Float) | Add `fixedDiscountAmountMinor`; keep Float |
| `currencyCode` | Campaign | currency | Add (default `INR`) |
| `threshold` | CampaignRewardTier | money | Add `thresholdMinor`; keep Float |
| `defaultThreshold` | AppSettings | money | Add `defaultThresholdMinor` + `currencyCode` |

## Persisted — NOT money

| Field | Class | Action |
|---|---|---|
| `discountPercentage` | percentage 1–100 | **Do not convert** |
| `giftQuantity`, `priority`, `position`, `triggerQuantity` | quantity / rank | unchanged |
| `placements`, dates, status | non-money | unchanged |

## Analytics — DEFER

| Field | Location | Decision |
|---|---|---|
| `revenue` / cartSubtotal in `AnalyticsEvent.payload` | JSON | **Defer** — currency semantics unclear (shop vs presentment); High risk if aggregated blindly |
| Derived admin AOV / influenced revenue | computed | **Defer** |

## Transient Shopify / storefront — adapters only

| Source | Class | Action |
|---|---|---|
| Admin GraphQL MoneyV2 | decimal string + code | `fromShopifyMoneyV2` / `toShopifyMoneyV2` |
| Cart Ajax `*_price` | integer minor | `fromShopifyCartCents` |
| App Proxy `cartSubtotal` | major number query | `fromTransientMajorNumber` (compat) |
| Discount metafield threshold.amount | decimal string | format from minor units |
| Widget-state `threshold` major number | storefront contract | **preserve** major number derived from minor |

## Display-only

Admin form decimal inputs; currency symbols in UI — remain major-unit UX with server-side exact parse.
