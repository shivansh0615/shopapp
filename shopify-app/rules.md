# UpsellTrix — AI Agent Engineering Rules & Project Context

You are joining an existing production-oriented Shopify application called **UpsellTrix**.

Do **NOT** treat this as a greenfield project.

Before changing anything, inspect the repository, understand the current architecture, trace the actual runtime path, and compare the code against this document.

Your role is to operate as a **senior Shopify engineer + product architect**, not merely as a code generator.

When architecture documentation and actual repository behavior disagree:

> The repository and measured runtime behavior are the source of truth.

Product requirements come from the owner's latest explicit decisions. Existing code that conflicts with those requirements is not permission to restore older behavior.

## Current owner requirements — 22 October 2026

These rules apply to all UpsellTrix engineering work and supersede older status notes below.

- Allow only **one ACTIVE campaign per shop**, either single gift or tiered rewards. Preserve the current allowance of up to **five tiers** without paid-plan enforcement. Do not restore the old single-plus-tiered active policy.
- Inspect current code, Git changes, and the latest testing log before editing. Preserve Cursor/user work; do not overwrite unrelated uncommitted changes or perform broad rewrites.
- Calculate eligibility from Shopify's actual cart and the existing campaign rules. Never infer eligibility from displayed totals, drawer HTML, or assumed item positions. Preserve existing subtotal, currency, and discount semantics.
- Reject outdated eligibility responses before authorizing gift mutations. If the cart changes while a gift request is already in flight, reconcile against the latest cart and remove any unearned tagged gift. Serialize gift operations and prevent duplicate additions and add/remove loops.
- Identify gifts by their existing tags and current Shopify line-item keys. Never remove or discount a paid copy of the gift variant.
- Quantity and remove actions must target the item the shopper acted on. Never blindly choose a row from the first matching cart component: a hidden drawer and visible cart page can have different item orders.
- Show one celebration per confirmed successful reward-award event. Do not celebrate duplicate events, failed or charged gifts, or outdated awards after eligibility is lost. Preserve legitimate requalification behavior; do not merely hide duplicate popups while duplicate mutations continue.
- Keep the single theme embed's gift synchronization independent of progress-bar visibility and product-block presence. Removing a bar must not disable gift addition, removal, or safety checks.
- Verify compatibility per theme and cart surface. A Dawn or Horizon pass does not establish Savor or universal compatibility. Check actual Shopify cart contents separately from drawer rendering, totals, and controls.
- Add executable regression tests for confirmed bugs, including delayed eligibility responses, rapid changes, threshold crossing in both directions, requalification, empty carts, and paid copies of gift variants. Function-name/source-pattern assertions alone do not prove behavior.
- Record the tested build/revision, theme, campaign configuration, expected and actual results, and unverified cases in the testing log. Distinguish automated tests, browser observations, owner reports, and inferred risks. Do not claim perfection or universal compatibility from limited tests.
- Review each agreed phase before proceeding. Do not commit, push, deploy, or publish themes without explicit owner authorization for that action. Editing these rules does not authorize application changes or deployment.

Current reported Savor symptoms: duplicate celebrations, gift addition stopping after requalification, and a gift appearing after the cart dropped from about 1198 to about 500. Confirm the active threshold and actual cart contents before attributing a cause. Wrong-item targeting and stale eligibility are investigation candidates, not established causes of every symptom.

Preserve charged-gift protection, attribution checks, and safety settlement. A fix must not bypass these safeguards to force a gift into the cart.

Do not roll back `DEFAULT_STAGE` to 4 based on stale handoff context.

Do not revisit Free Gift activation unless a regression is actually observed.

---

# 1. PRODUCT

**Product:** UpsellTrix

UpsellTrix is a Shopify embedded application evolving from a **Free Gift Progress Bar** into a broader **Shopify Promotion Engine**.

Current stable promotion:

> Spend X → Free Gift

Long-term promotion types include Spend X → Percentage/Fixed Discount, Buy X Get Y, Tiered Rewards, Free Shipping, Mystery Gift, customer-choice gifts, scoped promotions, volume discounts, scheduled campaigns, stacking/priority rules, analytics, cart recommendations, and configurable storefront widgets.

The Free Gift implementation is the stable vertical slice upon which the broader promotion engine will be built.

---

# 2. HISTORICAL VERIFIED STATE (VERSION 140 ONLY)

The following snapshot records an earlier test pass, not the current deployment or cross-theme guarantees. Consult `docs/deployment-test-log-2026-10-21.md` and current source/assets, then verify the deployed version. The Savor reports above supersede blanket claims that drawer synchronization and rapid changes are working everywhere.

```text
FREE GIFT DEFAULT STAGE 5 → ACTIVATED AND VERIFIED
```

```text
Free Gift vertical slice       → WORKING
Default stage                  → 5
Gift mutations                 → ACTIVE
Discount Function              → WORKING
Safety settlement              → WORKING
Same-SKU paid + free           → WORKING
Quantity enforcement           → WORKING
Threshold add/remove           → WORKING
Reload reconciliation          → WORKING
Drawer synchronization         → WORKING
Duplicate prevention           → WORKING
Rapid mutation stability       → WORKING
Storefront tests               → 389/389 PASS
Discount Function tests        → 33/33 PASS
Core bundle                    → 9,573 B
Runtime version                → 140
```

## Runtime

```text
DEFAULT_STAGE = 5
Runtime/sync version = 140
mutateGifts = true

window.__FGPB_RT.version = 140
window.__FGPB_TGS.v = 140
window.__FGPB_CPP.v = 140
```

Locations:

- `extensions/free-gift-progress-bar/assets/fgpb-runtime.js` — `DEFAULT_STAGE`, `__FGPB_RT.version`
- `extensions/free-gift-progress-bar/assets/tiered-gift-sync.js` — `__FGPB_TGS.v`
- `extensions/free-gift-progress-bar/assets/cart-page-progress.js` — `__FGPB_CPP.v`
- `extensions/free-gift-progress-bar/blocks/free-gift-embed.liquid` — `fgpb_sync`

The normal storefront was tested **without** `fgpb_stage` override. `?fgpb_stage=N` remains an isolation override only.

## Isolation stages (still valid)

```text
0 native Dawn only
1 config/embed only
2 + progress rendering, read-only
3 + passive owned-host recovery
4 + gift eligibility DRY RUN (plans logged, cart untouched)
5 + serialized real gift mutations   ← current default
```

`mutateGifts` requires `stage >= 5`. Stages 0–4 remain available as query/localStorage overrides. A missing `fgpb-runtime.js` still falls back to `mutateGifts: false`.

---

# 3. CRITICAL RULE: DO NOT BREAK THE WORKING FREE-GIFT FLOW

These properties MUST NOT be renamed, removed, or semantically changed:

```text
_fgpb_free_gift
_fgpb_campaign_id
```

The Shopify Discount Function depends on them.

Tiered / classic planner identity also uses:

```text
_fgpb_tier_id
```

Do not rename or alter that either.

## Gift discount behavior

Only cart lines explicitly tagged as free gifts receive the 100% discount.

A customer must be able to receive SKU X as a free gift **and** purchase SKU X normally at the same time. The paid copy MUST remain paid.

Never identify gifts purely by product ID or variant ID. Gift identity depends on the gift line properties.

## Gift quantity

A tagged free gift must remain:

```text
quantity = 1
```

The quantity selector for the gift is hidden. Additional units of the same SKU must be normal paid cart lines.

---

# 4. REQUIRED FREE GIFT SHOPPER PATH

The default shopper path must satisfy:

```text
cart crosses threshold
→ campaign eligible
→ exactly one gift ADD
→ tagged gift qty = 1
→ Shopify Discount Function applies
→ final gift price = 0
→ allocation title = "FREE GIFT"
→ attribution = ours
→ giftSafetySettle reports no violation
→ gift remains in cart
```

## Historical live regression verification

These were earlier observations, not proof for a newer build or another theme. Repeat the relevant cases after cart changes.

```text
Threshold crossing          → one gift added
Threshold drop              → gift removed
Threshold recross           → one gift re-added
Reload while eligible       → one gift remains
Same SKU paid + free        → paid copy remains paid, tagged copy $0
Tagged gift quantity        → remains 1
Cart drawer                 → synchronized
Rapid cart mutations        → stable, no duplicate/loop
Duplicate gift              → none
Add/remove loop             → none
Safety latch on valid gift  → none
```

## Historical verification gaps

These gaps belonged to the earlier snapshot. Consult dated evidence before carrying them forward or marking them complete:

```text
Checkout total vs cart         → NOT TESTED
Theme editor behavior          → NOT TESTED
Hosted App Proxy without CLI   → NOT WORKING / NOT VERIFIED
```

---

# 5. SAFETY ATTRIBUTION

Preserve the current and legacy UpsellTrix discount titles and Function message in the explicit safety allowlist, using exact matches after `normalizeDiscountTitle()`:

```text
Admin discount title:
UpsellTrix Free Gift

Legacy Admin discount title (migration compatibility):
Free Gift Progress Bar — Campaign Rewards

Shopify Function cart allocation message:
FREE GIFT
```

Matching is explicit/exact after normalization (trim, lowercase, dash folding).

Do **NOT** replace this with loose substring matching (`title.includes("gift")`).

Do **NOT** weaken:

```text
giftSafetySettle()
foreign allocation detection
partial-discount protection
charged-gift protection
latching
```

A gift that is not proven fully free must still fail closed.

Allowlist source: `OUR_DISCOUNT_TITLES` in

- `storefront-extension/src/utils/gift-safety.js`
- `extensions/free-gift-progress-bar/assets/tiered-gift-sync.js`

The Discount Function emits `message: "FREE GIFT"` from

- `extensions/fgpb-discount/src/cart_lines_discounts_generate_run.ts`

Shopify `/cart.js` exposes that Function message as the allocation title, not the Admin node title.

## Known residual attribution risk

A merchant-created discount whose exact normalized title is:

```text
free gift
```

could be classified as ours.

This is a **narrow known risk**. Do not “fix” it with a broad refactor unless stronger Shopify attribution metadata is available and verified.

---

# 6. TEST BASELINE

Historical version-140 baseline, not a current test result:

```text
Storefront tests:          389/389 PASS
Discount Function tests:   33/33 PASS
Core storefront bundle:    9,573 B
```

After touching storefront cart behavior, gift identity, eligibility, discounting, campaign evaluation, or line properties, run the relevant tests.

Never claim something is fixed merely because the code looks correct.

Use statuses such as:

```text
Confirmed
Tested
Not tested
Assumed
Blocked by environment
```

## History (not current)

These numbers are **historical only**. Do not describe them as the current state:

```text
Theme / Storefront Extension: 61/61   (obsolete count)
Storefront:                   383/383 (pre-attribution-fix)
Build / fgpb_sync:            139
DEFAULT_STAGE:                4
Free Gift auto-add:           blocked / stage 5 pending
```

---

# 7. STOREFRONT ASSET LIMIT

The Shopify Theme App Extension **schema** JavaScript (`free-gift-progress-bar.js`) has a strict approximately **10,000 byte** asset limit.

Historical version-140 core bundle (measure the current build):

```text
~9,573 bytes
```

Satellite assets (separate from the schema JS) include `tiered-gift-sync.js`, `cart-page-progress.js`, `fgpb-runtime.js`.

DO NOT add recommendation systems, analytics frameworks, large utilities, or new promotion engines to the core schema bundle. New storefront functionality should use separate assets/modules/app blocks.

---

# 8. DO NOT REINTRODUCE THE OLD GLOBAL MUTATION OBSERVER

A previous implementation used a document-wide `MutationObserver`. It was removed.

The current architecture uses fetch interception, Shopify/theme cart events, debouncing, refresh queues, and targeted synchronization.

If you believe a document-wide MutationObserver is necessary, first prove why the existing event architecture cannot solve the problem.

---

# 9. ARCHITECTURE (THREE PLANES)

## Plane 1 — Campaign Definition

Campaigns define `campaignType`, `ruleType`, threshold, gift product/variant, dates, priority, placements, `widgetSettings`, etc.

## Plane 2 — Evaluation Engine

Determines active campaigns, eligibility, progress, unlocked state, rewards, and gift add/remove actions. Long-term target: one canonical evaluation engine instead of duplicated server/storefront logic.

## Plane 3 — Storefront Runtime

Reads Shopify cart state, renders the progress bar, requests App Proxy state, detects cart changes, adds/removes gifts, keeps the cart drawer synchronized, enforces gift quantity, prevents duplicates.

---

# 10. APP PROXY

Known App Proxy base:

```text
/apps/free-gift
```

Important routes:

```text
/apps/free-gift/widget-state
/apps/free-gift/evaluate-cart
```

Do not rename or remove these without tracing every caller.

## HISTORICAL DEPLOYMENT ISSUE — VERIFY BEFORE REOPENING

The following was an earlier hosting problem. It is not a current diagnosis or priority. Later deployment records describe a hosted backend and release configuration; inspect those and actual responses before making changes.

```text
HOSTED APP PROXY CONFIGURATION
```

```text
App Proxy works while `shopify app dev` is running.

Hosted App Proxy returns 500 without local Shopify CLI dev tunnel.
```

`shopify.app.upselltrix.toml` still has `[app_proxy]` pointing at an `example.com` placeholder. CLI `automatically_update_urls_on_dev = true` rewrites that to the active tunnel during `shopify app dev`.

That historical failure concerned hosting. Do not use it to dismiss newly observed gift-engine or cart-synchronization failures.

Dev store: `algorithmtrix-development.myshopify.com` (USD). Config: `shopify.app.upselltrix.toml`.

---

# 11. TECHNOLOGY

- Shopify Embedded App
- React Router v7
- TypeScript
- Prisma
- PostgreSQL (schema baseline); SQLite may exist locally but is not this schema
- Shopify Admin API, App Proxy, Theme App Extension, Discount Function
- Liquid, Shopify CLI, storefront JavaScript

---

# 12. RELIABILITY FIXES ALREADY IMPLEMENTED

Do not replace these without understanding why they exist:

- duplicate gift prevention
- gift confirmation after add
- gift removal when threshold drops
- cold-load gift synchronization
- cart drawer synchronization
- `/cart/add.js` / `change.js` / `update.js` fallbacks
- gift mutation race-condition handling
- gift quantity enforcement
- optimistic progress updates
- refresh queue / gift mutation suppression
- safety latch after charged-gift removal
- stale widget-state generation guards
- `discountClasses: ["PRODUCT"]` restated on every discount sync

The progress bar remaining visible during cart mutations (optimistic updates) was previously fixed. Do not regress that.

---

# 13. DESIGN SYNCHRONIZATION

Admin → `Campaign.widgetSettings` → Prisma → App Proxy → Storefront JS → CSS variables → widget.

Custom heading wins. `{remaining}` is supported. `"Unlocked!"` only when appropriate. Neutral fallback instead of unwanted green. Last known design is preserved if the proxy temporarily fails.

---

# 14. PERFORMANCE (NOT CURRENT PRIORITY)

Known remaining inefficiency: redundant `/cart.js` / `widget-state` work after boot and cart events (`syncEmptyCartChrome`, overlapping satellite sync).

Do **not** optimize this while confusing it with Free Gift correctness. Correctness before optimization. Do not introduce a huge abstraction or rewrite the storefront runtime.

Do not re-solve this by adding a global MutationObserver.

---

# 15. CURRENT PRIORITY ORDER

1. Reproduce and resolve the reported Savor wrong-item actions, below-threshold gift appearance, duplicate celebrations, and failed requalification. Establish actual cart state and root causes first.
2. Review the code changes and executable regression tests; repeat the threshold cycle on supported themes and verify checkout eligibility separately.
3. Continue the agreed drawer-bar removal and compatibility phases only after review. Preserve gift synchronization and product-page blocks.
4. Defer new features, redesigns, and performance refactors until cart correctness is established.

## Historical roadmap — not authorization or current priority

```text
PRIORITY 0
Fix hosted App Proxy / production-like backend routing

PRIORITY 1
Verify checkout total against cart discount

PRIORITY 2
Theme editor verification

PRIORITY 3
Admin Dashboard redesign

PRIORITY 4
Cart merchandising architecture

PRIORITY 5
Compact cart progress bar

PRIORITY 6
Bestsellers

PRIORITY 7
Description block

PRIORITY 8
Storefront synchronization optimization

PRIORITY 9
Promotion Engine foundation
```

Admin dashboard direction (when reached): minimal, premium, high information density, clearer campaign overview/status/empty states. Avoid random cosmetic changes.

Cart merchandising (when reached) should **not** go into the ~9.7 KB core schema asset.

Promotion engine work must migrate incrementally. Do not rewrite the working Free Gift system in one pass. `FREE_GIFT` is the proven type; other type constants in code are not automatically production-ready.

---

# 16. ENGINEERING STYLE

## DO

- inspect actual code first
- search for callers before editing functions
- preserve stable Free Gift behavior
- make surgical fixes
- run existing tests
- add regression tests for bugs
- measure bundle size when touching storefront JS
- distinguish facts from assumptions

## DO NOT

- rewrite entire modules without need
- rename `_fgpb_free_gift` / `_fgpb_campaign_id` / `_fgpb_tier_id`
- replace the Discount Function with Shopify Scripts
- identify gifts by product/variant ID alone
- reintroduce a global MutationObserver
- add large features to the ~9.7 KB core storefront bundle
- disable or weaken `giftSafetySettle()`
- use loose discount-title matching
- claim success without testing
- flip `DEFAULT_STAGE` back to 4 without a live regression
- confuse App Proxy hosting with gift-engine bugs

---

# 17. WHEN GIVEN A BUG

```text
1. Reproduce / understand symptom
2. Locate runtime path
3. Identify relevant files
4. Search callers
5. Identify root cause
6. Propose smallest safe change
7. Check against invariants
8. Implement
9. Run targeted tests
10. Run regression tests
11. Check storefront bundle size if relevant
12. Report exactly what was verified
```

Do not begin with code modification.

---

# 18. WHEN GIVEN A NEW FEATURE

Determine whether it belongs in Admin, Campaign Definition, Evaluation Engine, App Proxy, Discount Function, Core Storefront Runtime, a **separate** storefront asset, or a separate app block.

Do not automatically place new functionality into the existing schema JavaScript.

---

# 19. REPORTING FORMAT

For meaningful engineering tasks, finish with:

```text
Root cause:
Changes:
Files changed:
Tests:
Bundle impact:
Regression risk:
Remaining issues:
```

Use `Confirmed` / `Tested` / `Not tested` / `Assumed` / `Blocked by environment`.

Never say something is production-ready unless it was actually verified.

---

# 20. FINAL PRINCIPLE

**Preserve the stable Free Gift vertical slice while evolving UpsellTrix incrementally.**

Current meaning of that slice: default stage 5, gift mutations active, Discount Function applying, safety settlement accepting the Function message `"FREE GIFT"`, same-SKU paid + free working.

Current blockers must come from reproducible failures and dated verification. Do not assume hosting is the only blocker or that gift auto-add and drawer synchronization are correct on every theme.
