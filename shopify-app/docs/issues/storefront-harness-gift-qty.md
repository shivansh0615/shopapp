# Deferred Issue: Storefront Harness Gift Quantity

**Status:** Classified — **HARNESS_METHODOLOGY_DEFECT** (primary), with intermittent **SHOPIFY_RATE_LIMIT / bot challenge** on the Node cart API harness.
**Not** a confirmed production storefront Reward Sync regression.
**Do not** start money-model migration from this issue alone.

## Observed failure (historical)

Automated harness `_validate_newish.mjs` (2026-07-30):

1. Cookies refreshed successfully (7 cookies).
2. Most classic + tiered checks **PASS**.
3. **FAIL** `Classic gift qty enforcement — qty=2` (expected gift line quantity enforcement; observed qty=2).
4. Later error: `Expected JSON, got: …` while reading cart JSON (non-JSON response).

## Controlled validation (2026-07-31)

New harness: `scripts/storefront-validation/`.

### Environment

- Store: `newish-app-test.myshopify.com` (controlled test store, password-protected).
- Theme: preview `192969933166` only (not published by harness).
- Local app / Postgres / app proxy: **down** → widget-state returned empty **500** → proxy scenarios **BLOCKED**.
- Cart API initially reachable with valid JSON (currency INR, empty cart).

### Qty=2 evidence (valid JSON, before rate limit)

Line-merge case `two_identical_gift_props`: two `/cart/add.js` with identical `_fgpb_free_gift` + `_fgpb_campaign_id` properties produced:

- **one tagged gift line**
- **quantity 2**
- `shapes.oneTaggedQty2: true`
- Valid cart JSON snapshot step `merge.after_identical_gifts`

This is **Shopify Ajax cart line merging**, not browser Reward Sync. The Node harness never executes `tiered-gift-sync.js`.

### Old harness defect

`_validate_newish.mjs` Scenario “qty enforcement”:

1. Manually adds tagged gift via API.
2. Calls `/cart/change.js` quantity 2.
3. Immediately reads `/cart.js` and expects quantity **1**.

Quantity clamp to 1 lives in storefront JS (`planTieredGiftSync` NORMALIZE / source `enforceGiftLimit`). **It does not run in the Node API harness.** Expecting clamp without a browser is a methodology defect. The harness even commented: “if theme JS absent, cart may allow 2”.

### Non-JSON responses

Classified as **HTML_BOT_CHALLENGE** / **429** (“Verifying your connection…”) and empty **500** on app proxy when tunnel/app down. New `safeRequest` classifies these instead of throwing bare `JSON.parse` errors. Bounded retry on 429.

### Verdict

**HARNESS DEFECT CONFIRMED** (expects Reward Sync without running it).
**ENVIRONMENT ISSUE** secondary (proxy down; Shopify bot/rate limit mid-run).
**NOT** `REAL_RUNTIME_REGRESSION` — no browser Reward Sync trace with valid post-sync qty=2.

## Next

1. Optional: Playwright/browser scenario that loads draft theme embed and asserts clamp after `/cart/change.js`.
2. Keep Node harness for merge/auth/JSON classification only.
3. Proceed to deferred work (e.g. PostgreSQL integer-money) when storefront validation is closed.
