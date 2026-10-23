# Free Gift Progress Bar — Private Beta Release Notes

**Status:** READY FOR PRIVATE BETA
**Date:** 2026-07-28
**Release:** `0.1.0-private-beta`

---

## New functionality

- Classic FREE_GIFT campaigns migrated onto Reward Sync (same path as Tiered Free Gifts)
- Unified gift reconciliation for unlock / lock / threshold changes
- Same-SKU support (gift product may match a paid cart line)
- Dashboard synchronization with the live cart
- Automatic section refresh after gift add / remove
- Duplicate gift prevention
- Refresh recovery after page reload or cart redraw
- 429 recovery improvements for cart Ajax rate limits

---

## Known limitations

- **Accelerated Checkout:** Buy it now / Shop Pay express / similar express flows may bypass Ajax cart reward synchronization. Prefer Add to cart → cart → checkout. See `docs/merchant/accelerated-checkout-limitation.md`.
- **GDPR webhooks:** Implemented in Phase 1 (`customers/data_request`, `customers/redact`, `shop/redact`) via `/webhooks/compliance`. Requires `shopify app deploy` to register on Shopify. See `docs/production-readiness-phase-1.md`.
- **Phase 1 is not App Store ready:** production hosting, Postgres cutover, billing, and listing work remain.
---

## Merchant onboarding checklist

- [ ] Install app
- [ ] Create campaign
- [ ] Verify gift product
- [ ] Test unlock
- [ ] Test checkout
- [ ] Verify threshold removal
- [ ] Understand accelerated checkout limitation
- [ ] Report issues with reproduction steps
