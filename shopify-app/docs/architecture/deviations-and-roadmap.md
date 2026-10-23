# Deviations and Roadmap

**Status:** Architecture audit — decisions vs temporary debt vs legacy deviations.
**Scope:** Establish Promotion Engine architecture for Spend X → Free Gift, Tiered Free Gifts, and Mystery Gift only.
**Non-goals of this doc set:** No code changes, no debug removal, no Mystery Gift implementation in this phase.

---

## How to read this file

| Category | Meaning |
|---|---|
| **Architectural decision** | Intentional, keep |
| **Temporary debt** | Known divergence from target architecture; fix later without changing product scope |
| **Legacy deviation** | Exists in code for backward compatibility; **not** a future product feature for this engine |

Percentage Discount and Fixed Discount are **legacy deviations only**. They are not roadmap features for the Promotion Engine product defined here.

---

## Architectural decisions (keep)

1. **Promotion Engine is eligibility authority**
   Selection + `evaluateWithRegistry` in `app/services/promotion-engine/`; orchestration in `proxy-evaluation.server.ts`.

2. **Policy A / `supportedTypesOnly: true` on App Proxy**
   Unsupported ACTIVE types must not shadow supported campaigns (`proxy-evaluation.server.ts`).

3. **Widget State is the render contract**
   `StorefrontWidgetStateResponse` + `toWidgetStateResponse`; Product and Drawer renderers consume it.

4. **Reward Sync is parallel to rendering**
   Sync applies evaluation actions; it does not compute eligibility and does not own drawer/product paint.

5. **Product Renderer ≠ Drawer Renderer**
   - Product: `free-gift-progress-bar.js` (and classic theme surfaces) — never drawer owner.
   - Drawer: `cart-page-progress.js` — sole cart-drawer + cart-page strip owner.

6. **Gift line properties are stable**
   `_fgpb_free_gift`, `_fgpb_campaign_id`, `_fgpb_tier_id` (tiered) — documented in `types.ts`.

7. **Mystery Gift selection is server-side**
   When built, pool choice happens in the engine, not in storefront JS.

8. **Merchant visibility ≠ runtime registry**
   `merchant-campaign-types.ts`: merchants create Free Gift / Tiered; Mystery is visible coming-soon; Percentage/Fixed are hidden but may still evaluate for existing campaigns.

9. **No silent coerce of unknown types to Free Gift**
   `resolveRegistryCampaignType` returns `null`; registry returns `UNSUPPORTED_CAMPAIGN_TYPE`.

---

## Temporary debt (fix later; do not treat as architecture)

These are implementation leftovers from drawer/product ownership and loading races. **Do not remove debug instrumentation in this documentation phase.**

1. **Drawer script load path / inject loader**
   Classic bundle may inject `cart-page-progress.js` (`ensureCartPageProgress` in storefront classic `index.js`) because theme/app-embed load order was unreliable. Target: reliable first-party load without fighting Product Renderer. Treat inject as **temporary debt**, not the long-term ownership model.

2. **Historical dual ownership of cart drawer**
   Product Renderer and Drawer Renderer both mounted into Dawn’s drawer → flicker, blank UI, wrong classic card. Ownership is now decided (CPP sole owner); residual guards / purge / re-park logic may still exist until a focused cleanup pass.

3. **Widget-state boot races**
   Failed or `enabled: false` responses can clobber a good cached config and hide the drawer strip. Contract is clear; client boot hardening is debt.

4. **Debug instrumentation still present**
   Markers such as `__FGPB_DBG`, ingest, `/apps/free-gift/debug-log`, inject version tags — intentional until a dedicated cleanup. **Not** part of the Promotion Engine contract.

5. **Legacy gift-engine wrapper path**
   `gift-engine.server.ts` remains a thin wrapper for legacy gift-shaped state (`promotion-engine/index.ts` notes). New work should not expand it as a second engine.

6. **Storefront `buildLocalEvaluation()`**
   Intentionally untouched in Phase 2C package notes — local evaluation is debt relative to “engine-only eligibility” and should be retired or strictly demoted when renderers are fully Widget State–driven.

7. **Mystery Gift UI without evaluator**
   Merchant-visible “Mystery Gift” with runtime unsupported is expected interim product state — complete via roadmap below, not by client faking Free Gift.

---

## Legacy deviations (not product roadmap)

| Item | Where | Notes |
|---|---|---|
| Percentage Discount evaluator | `percentage-discount-evaluator.ts`, registry | Runtime + tests; merchant-hidden; **not** a target architecture feature |
| Fixed Discount evaluator | `fixed-discount-evaluator.ts`, registry | Same as above |
| Discount actions / rewards in `types.ts` | `APPLY_*`, `PERCENTAGE_DISCOUNT`, `FIXED_DISCOUNT` | Support legacy campaigns only |
| Hidden runtime types list | `MERCHANT_HIDDEN_RUNTIME_CAMPAIGN_TYPES` | Backward compatible edit of existing campaigns |

Do **not** plan new storefront Widget State work or marketing features around Percentage/Fixed as part of Free Gift / Tiered / Mystery architecture.

---

## Roadmap (documentation → implementation order)

Implementation work starts **only after** these architecture docs are reviewed and approved.

### 1. Spend X → Free Gift (harden to invariants)

- Confirm App Proxy → engine → Widget State → Product Renderer path.
- Confirm Reward Sync uses actions only.
- Eliminate remaining Product Renderer drawer mounts if any remain after review.
- Align client boot with Widget State contract (no eligibility inventing).

### 2. Tiered Free Gifts (same invariants)

- Confirm tier fields on Widget State (`unlockedGifts`, `nextTier`, `rewardTiers`).
- Confirm `_fgpb_tier_id` sync behavior via tiered sync path.
- Drawer Renderer remains sole multi-milestone drawer UI owner.

### 3. Mystery Gift (new capability)

- Add registry type + `campaign-types` mapping.
- Implement server-side pool selection evaluator.
- Extend Widget State + adapters (`rewardType`, server-chosen `gift`).
- Merchant create flow from coming-soon → creatable.
- Storefront: render only; never select from pool.

### Explicitly out of order / out of scope

- Percentage / Fixed Discount as new product features.
- Debug strip / inject cleanup as a prerequisite to documenting architecture (cleanup is a later debt pass).
- Broad refactors unrelated to the three gift products.

---

## Review checklist (before any implementation)

- [ ] [promotion-engine.md](./promotion-engine.md) — responsibilities, flow, ownership, core invariants accepted
- [ ] [widget-state.md](./widget-state.md) — schema for three types accepted
- [ ] [promotion-interface.md](./promotion-interface.md) — evaluator contract accepted
- [ ] This file — decisions vs debt vs legacy vs roadmap accepted
- [ ] No code changes in the documentation phase

---

## Related docs

- [promotion-engine.md](./promotion-engine.md)
- [widget-state.md](./widget-state.md)
- [promotion-interface.md](./promotion-interface.md)
