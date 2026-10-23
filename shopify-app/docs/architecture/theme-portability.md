# Theme compatibility and verification

Updated: 22 October 2026.

The single embed loads gift synchronization independently of the visible bar.
Shopify cart contents, theme-rendered drawer HTML, and checkout discounts are
separate verification surfaces.

## Current boundaries

- Product app blocks and automatic product placement have distinct paths.
  Verify the merchant's chosen placement and avoid duplicate widgets.
- The current runtime restricts its owned drawer strip to detected Dawn markup.
  Non-Dawn drawers must not be treated as Dawn merely because CSS names overlap.
- Removing the bar from Dawn too is a planned phase, not a completed change.
- Full cart-page and unsupported-drawer fallback behavior must be tested on each
  supported theme; generic selectors do not establish universal compatibility.
- Optional third-party cart compatibility remains limited and default-off.
- Runtime sources live under `storefront-extension/src/runtime/`; do not edit
  generated extension copies independently.

## Known verification gaps

The owner reported Savor wrong-item/removal behavior, repeated celebrations and
a gift appearing after a cart reduction. Inspect current fixes and reproduce
before assigning a cause or declaring them resolved. A below-threshold Horizon
add/remove pass does not prove its gift-threshold transition works.

Quantity/remove actions must target the initiating surface's intended item.
A hidden drawer and visible cart page may have different row orders. Never
resolve an action using the first arbitrary matching cart component.

## Required acceptance

For Dawn, Horizon, Savor and any additionally supported theme, record build,
theme ID, campaign threshold and currency. Test below threshold -> qualify ->
reduce below threshold -> requalify -> empty cart, including rapid changes and
delayed responses. Preserve paid/free copies of the same variant.

Confirm actual cart lines, gift price, visible totals, quantity/remove controls,
one celebration per valid award, mobile layout and checkout independently.
Unrun tests remain unverified. Accelerated product checkout may bypass automatic
gift insertion; see the [merchant limitation](../merchant/accelerated-checkout-limitation.md).
