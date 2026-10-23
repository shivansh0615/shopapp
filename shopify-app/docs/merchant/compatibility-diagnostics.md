# Compatibility diagnostics (merchant)

Embedded admin page: **Compatibility** → `/app/compatibility`.

## What it checks

1. Backend health (config + database)
2. Shopify installation (session + required scopes; webhook topics from app config)
3. Campaign readiness (active supported campaigns, gift variant, threshold, discount mapping/jobs)
4. Storefront communication (`ShopIntegrationStatus.lastWidgetStateAt`)
5. Theme app embed guidance (deep link; never falsely “Enabled”)
6. App Proxy path from config (`/apps/free-gift`)
7. Storefront compatibility mode (Dawn/OS2 core; optional third-party beta; accelerated-checkout limitation)
8. Storefront asset / Theme Check size warning (from static manifest)
9. Discount Function readiness (read-only mapping/sync state)

## Overall states

- `READY`
- `READY_WITH_LIMITATIONS`
- `ACTION_REQUIRED`
- `UNABLE_TO_VERIFY`

Does **not** claim universal theme compatibility.

## Safety

- Authenticated shop only (no request-controlled shop parameter)
- No secrets, tokens, cookies, or customer data
- No Shopify Admin mutations
- No cart mutations
- Refresh is manual only (no polling)
