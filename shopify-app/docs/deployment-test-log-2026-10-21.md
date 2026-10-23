# UpsellTrix deployment test log

Planned test date: 21 October 2026

## Codex / next-agent status — 21 October 2026

Read this section first. It is the handoff from the Cursor storefront pass on
`algorithmtrix-development.myshopify.com`. Do not treat checkout “This store
can’t accept payments” or a blank Shopify-admin iframe as UpsellTrix bugs.

**Store:** `algorithmtrix-development.myshopify.com`  
**Campaign in play:** id `24`, name `aa`, Spend X → Free Gift, threshold **$999**,
gift **The Collection Snowboard Black and White: Liquid** (variant `50822538625271`).
Campaign `26` (tiered, $1500 rosemary) was paused so this shop has one active
campaign. A tiered campaign may use up to **5** thresholds until billing exists.
Plan ladder kept for later: free **2**, paid **3**, top **5**.  
Paid test product: clove essential oil variant `51107811033335` at $279.  
**Local preview:** `http://127.0.0.1:9293` (host theme `#181845655799`, cart type
**drawer**). Live theme is `test-data` `#178031460599`.  
**App origin:** `https://upselltrixapp.algorithmtrix.com`  
**Deploy command for theme/extension:** `npm run deploy`
(`shopify app deploy --config release`). Git push and GitLab CI do **not** ship
the storefront theme. Use `shopify.app.release.toml` only; do not point
`shopify app dev` at `shopify.app.upselltrix.toml` or Partner URLs get rewritten
to example.com.

Theme release **upselltrix-16** is live on Shopify. Git is behind that release.
`origin/main` is `f8a120b` (`stale product widget fix`), pushed 21 Oct. That commit
does not contain the cart-page fix, the one-active-campaign rule, or `fgpb=157`.
Those files are still uncommitted. Do not commit unless asked. A git push does
not publish the theme, and this release does not need a second `npm run deploy`
unless the theme or app config changes again.

### Live vs local right now

| Surface | Version | Notes |
|---|---|---|
| Released theme | **upselltrix-16** (`fgpb=157`) | Released 21 Oct 2026, before 15:47 IST. Version [1175605411841](https://dev.shopify.com/dashboard/215127165/apps/407260594177/versions/1175605411841). Message: “Stop the cart password redirect loop and announce the cart-page total”. Includes the accessibility work from `fgpb=155` plus the cart-page fix in section 7. |
| Published-store check | **pass, 21 Oct ~18:00 IST** | `https://algorithmtrix-development.myshopify.com/cart` served `cdn.shopify.com` scripts with `fgpb=157` and `__fgpbPasswordGuard`. Cart was empty. Added one clove oil, plus `1→2` (line `$558.00`, live region `New subtotal: $558.00 USD`, server `55800`), minus `2→1` (subtotal `$279.00 USD`, live region matched, Check out present). Max event-loop lag 15ms. Removed the oil; server `item_count` back to 0. This theme labels the footer **Subtotal**, not Estimated total. |
| Local preview | **fgpb=157** | Cart quantity 5→4 verified on 9293. See section 7. |
| Node host | redeployed from `d9f2199` | 21 Oct ~18:06 IST: `/health/live` is `ok`, `/health/ready` is `ready`. The live campaign-form script contains “Only one campaign can be active” and “up to 5 thresholds”. The activate-a-second-campaign click was not run: the open browser is signed into a Shopify account that cannot open `algorithmtrix-development`. |
| Git | `f8a120b` on `origin/main` | Working tree after that commit is uncommitted. See the file list in section 7. |

---

### Issues found (Chrome storefront, 21 Oct)

Original must-fix list from the live Chrome pass, plus leftovers found while
closing them.

1. **Product-page progress widget froze** after cart crossed $999. Drawer said
   unlocked; product card still said “You are $162.00 away”.
2. **Remaining copy showed currency** (`$162.00` / `₹162`) instead of a bare
   number. App Proxy JSON on the Node host lagged the theme.
3. **`/cart` leftover gift row** after qty 4→3: `cart.js` already $837 / no gift,
   page still showed snowboard at $110 and footer/live region **$947**. Empty cart
   could leave drawer rows and a stale total.
4. **Cart drawer layout broke after quantity change:** extra “Your cart” /
   Continue shopping, Check out vanished or disabled, gift row crushed (qty
   buttons + Regular $110). Root causes: Dawn `is-empty` sticking, gift rows not
   identified (drawer qty input is `name="updates[]"` with no line key), stale
   empty footer HTML replacing Check out.
5. **Progress bar accessibility:** Liquid shipped `aria-valuenow="0"` and empty
   `aria-valuetext`. Screen readers heard **0%** until a later cart event. Drawer
   strip track had **no `role="progressbar"`**, so AT never saw the bar.

Not this app:

- Checkout: “This store can’t accept payments right now.”
- UpsellTrix admin screen blank inside the browser-automation iframe.

---

### What was fixed, and results

**1. Product widget freeze** — remaining/progress for `data-pp="1"` now come from
the live cart via `paintMerchantProductCard`. Verified live on **upselltrix-5**:
$837 → “162 away” (84%); $1,116 → unlocked (100%); no reload.

**2. Bare remaining number** — `money()` / `formatAmount` / Node
`formatCurrencyAmount` no longer prefix `$`/`₹`. Theme copy is a number.
Requires the **Node host** rebuild as well as theme deploy. Confirm
`/apps/free-gift/widget-state?cartSubtotal=837` `heading` has no `₹`.

**3. Cart leftover gift / $947 / empty chrome** — gift POST requests live
`data-id` sections on `/cart`; prune stale keys; reindex Dawn `data-index`;
`syncDawnCartChrome` copies visible total into `#cart-live-region-text` and
toggles `is-empty`. Local 9293: 4→3 gift gone, footer **$837**, empty cart shows
“Your cart is empty” with no leftover rows.

**4. Drawer layout after qty change (upselltrix-15 / fgpb=154)** —
`taggedGiftItemForRow` identifies Dawn drawer gifts by line key, then
`data-index`+variant, then unique tagged variant. Gift row gets `.fgpb-gift-line`
(FREE GIFT, no qty, no $110). Do not copy empty footer HTML over Check out, or
cart-page `.title-wrapper-with-link` into the drawer. Local 4→3→4: one “Your
cart” heading, Check out visible, gift row name + FREE GIFT, oil qty 4,
**$1,116.00 USD**.

**5. Progress bar accessibility (fgpb=155, shipped inside upselltrix-16 as fgpb=157)** —
`syncProgressA11y` sets `role="progressbar"`, `aria-valuemin/max/now`, and a
non-empty `aria-valuetext` (the visible heading). Product card, drawer strip,
tiered strip, Liquid, and compat strip all use it. First paint matches fill;
never leave AT on `0` while the bar is 84/100.

Local Chrome audit on 9293 with `fgpb=155`, campaign 24, 4 oils + gift then
minus to 3 oils:

| State | Product bar | Drawer bar | A11y errors |
|---|---|---|---|
| Load, 4 oils + gift ($1,116) | now=100, valuetext “You've unlocked your free gift!” | same | **0** |
| After minus to 3 oils ($837) | now=84, valuetext “You are 162 away from your free gift” | now=84, valuetext “Add 162 more to earn Free Gift” | **0** |

No sample in the 4s window after minus showed `aria-valuenow="0"` or empty
valuetext. Storefront suite: **420 pass / 0 fail**. Core schema asset **9956**
bytes (budget 10000). Chrome’s a11y snapshot may still show `valuetext=""` when
it matches the heading; the DOM attribute is populated — trust `getAttribute`.

**6. Tiered + second classic (this change, local 9293)** —
The shop only had classic `24`. Capacity already allowed one tiered partner;
activating a second classic or a second tiered is blocked. Created ACTIVE
tiered campaign **26** (priority 0, tier $1500 rosemary) and rejected a second
classic ACTIVE, a draft-classic activate, and a second tiered ACTIVE against
the live database (admin iframe still blank). Same-slot matching now uses
registry kind, not only exact type strings.

Tie-breaker (equal priority): highest reached threshold, then lowest campaign
ID. Widget-state / drawer on 9293:

| Cart | Winner | Gift | Notes |
|---|---|---|---|
| 3 oils $837 | classic 24 | none | remaining **162** toward $999 |
| 4 oils $1,116 | classic 24 | snowboard FREE GIFT | only classic qualifies |
| 5 oils $1,395 | classic 24 | snowboard FREE GIFT | still below $1500 |
| 6 oils $1,674 | tiered 26 | rosemary FREE GIFT | both qualify; $1500 > $999 |

Dropping 6→5 removed rosemary and restored snowboard. Dropping 4→3 removed the
gift; drawer settled at **$837.00** with Check out visible. A Shopify `5XX`
on the first discount-sync attempt left rosemary unpaid until retry succeeded
(`discount-sync:once` processed 1). Until that metafield update, gift-safety
correctly stripped the tagged line. Do not treat a full-price tagged gift as a
storefront bug when Function sync is still pending.

New tests: `app/lib/campaign-capacity.test.ts`, `app/lib/campaign-policy.test.ts`,
classic+tiered cases in `discount-sync.server.test.ts` and `fgpb-discount`
arbitration. Capacity + selection suites **40 pass / 0 fail**; Function suite
**39 pass / 0 fail**. Accessibility and this selection work shipped later in **upselltrix-16** (`fgpb=157`). The both-active browser table above is historical: the product rule changed immediately after it.

**Rule change after that pass:** only one campaign may be active. Classic and
tiered no longer run together. Threshold allowance is in
`app/lib/plan-tier-allowance.ts`. Billing is off, so the limit enforced today
is 5. Campaign 26 was paused after this change.

---

**7. Cart page unresponsive, then deploy (owner request, upselltrix-16 / fgpb=157)**

What the owner asked, in order:

1. Do not run a single-reward campaign and a tiered campaign together. They
   could not see a way for both to stay consistent.
2. One campaign active at a time. Threshold ladder for later billing: free **2**,
   paid **3**, top **5**. Billing is not being sold now, so allow **5** thresholds
   for now. The last 2–3 thresholds become paid when billing exists.
3. Fix the cart page that stops responding, then deploy.
4. After the release: a git push does not require another deploy.
5. See the release on the real store, not the local preview.

What was wrong with `/cart`:

Dawn’s quantity update posts `/cart/change.js` with `Accept: application/json`.
UpsellTrix also fetches `/cart.js` and `/apps/free-gift/*` with that header. On
this password-protected store, a request without the storefront password cookie
gets `302 Location: /password`. `/password`, when `Accept` is `application/json`,
responds `302 Location: /password`. Chrome follows that chain (about 20 hops).
The cart input can change while the footer never updates, and the tab stops
answering. This is not the old cart-form MutationObserver. That observer stays
removed.

Observed on local `9293` before the fix, campaign 24 active, 3 clove oils:

- `GET /cart.js` with `Accept: application/json` was `302` to `/password`, then
  a chain of `/password` → `/password`. The request cookie had the cart cookie
  and no storefront password cookie. The HTML cart had still rendered because
  the theme dev proxy authenticates document loads.
- In-page plus moved the quantity input `3` → `4` and left the footer at
  `$837.00`. The page was not a frozen main thread yet; the cart update never
  completed.

What changed:

- `storefront-extension/src/runtime/fgpb-runtime.js` installs
  `installPasswordRedirectGuard` before the other assets. Cart and app-proxy
  fetches (`/cart.js`, `/cart/*`, `/apps/free-gift/*`, `/password`) use
  `redirect: "manual"`. A hop to `/password` returns `401` JSON
  `{ message: "password" }` and stops. A real `200` is returned unchanged.
- `tiered-gift-sync.js` keeps that guard. `requestJson` and the Dawn `fetch`
  wrapper call `window.__fgpbGuardFetch`, because that file replaces
  `window.fetch` after the runtime and would otherwise drop the guard. Dawn’s
  outgoing add/change body is still not rewritten.
- `visibleCartTotalText` in `cart-page-progress.js` reads
  `#main-cart-footer` on `/cart`. Document order was picking the closed
  drawer’s stale `.totals__total-value` and copying it into
  `#cart-live-region-text`. Seen before this line: footer `$1,395.00 USD`, live
  region still `New estimated total: $1,116.00 USD`.
- Liquid cache bust in `free-gift-embed.liquid` and
  `free-gift-progress-bar.liquid`: `fgpb_sync` `155` → `157`. `156` was only
  the intermediate bump before the live-region line; the release is `157`.

Local result on `9293` after `fgpb=157` loaded, password accepted, campaign 24:

- Guard probe: a fake `302` to `/password` came back `401` in **one** hop, with
  `redirect: "manual"`.
- Oil minus `5` → `4`: footer `$1,116.00 USD`, live region
  `New estimated total: $1,116.00 USD`, server `total_price` `111600`, paid
  quantity `4`, two cart-page rows (snowboard gift + oil), Check out present,
  cart not left in `loading`. The settling sample’s event-loop lag was 1ms.

Tests run for this fix, not a full-repo suite:

- `native-cart-interceptor.test.js`, `cart-coordinator.test.js`,
  `dawn-progress-runtime.test.js`: **92 pass / 0 fail** after the guard.
- `cart-coordinator.test.js` again after the footer-total selector: **66 pass /
  0 fail**.
- Deploy prebuild kept `free-gift-progress-bar.js` at **9956** bytes.

Deploy, 21 Oct 2026, before 15:47 IST, from `shopify-app`:

```text
npm run deploy -- --allow-updates --no-input --message "Stop the cart password redirect loop and announce the cart-page total"
```

`predeploy` ran storefront build, asset check, and
`scripts/validate-upselltrix-release.mjs`. Config was
`shopify.app.release.toml` (not `shopify.app.upselltrix.toml`). Shopify reported
a new version released to users: **upselltrix-16**, version id
`1175605411841`. That command releases the theme extension and the Discount
Function. It does not deploy the Node web app and it does not commit git.

Published-store check, 21 Oct ~18:00 IST, passed. See the live-vs-local table.
The 9293 pass was a separate preview.

Uncommitted after `f8a120b`, which is what a later commit must include if the
owner asks. Do not treat this list as a commit request.

- One campaign / five thresholds: `app/lib/campaign-capacity.ts`,
  `app/lib/plan-tier-allowance.ts` (untracked),
  `app/lib/plan-tier-allowance.test.ts` (untracked),
  `app/lib/campaign-capacity.test.ts` (untracked),
  `app/lib/campaign-policy.test.ts` (untracked),
  `app/services/campaign-capacity.server.test.ts`,
  `app/services/campaign.server.ts`,
  `app/services/promotion-engine/tier-validation.ts`,
  `app/components/campaigns/CampaignBuilderForm.tsx`,
  `app/components/campaigns/CampaignCompetitionNotice.tsx`,
  `docs/campaign-policy-progress.md`.
- Cart fix and `fgpb=157`: `storefront-extension/src/runtime/fgpb-runtime.js`,
  `tiered-gift-sync.js`, `cart-page-progress.js`, the matching files under
  `extensions/free-gift-progress-bar/assets/`, both Liquid blocks, and
  `storefront-extension/src/tests/cart-coordinator.test.js`,
  `native-cart-interceptor.test.js`.
- This log.

---

### Where we are, and what is next

**Done and released (theme only)**

- Owner asked to fix the unresponsive `/cart` page, then deploy. That is
  **upselltrix-16** / `fgpb=157`. Details are section 7.
- Accessibility from section 5 is in that same release. It is no longer local-only.
- Owner then asked whether a git push requires another deploy. It does not.
  GitLab CI validates, tests, and builds. It does not publish the theme or
  restart the Node host.
- Published cart check passed 21 Oct ~18:00 IST. Shopify’s CDN served
  `fgpb=157`. Quantity up and down updated the line, the Subtotal, and the
  live region, and the page stayed clickable. The test oil was removed
  afterward, so the cart is empty again.

**Next priority**

1. **Click the server block once, in the development-store admin.** The host
   is serving the new screen. Sign into `algorithmtrix-development`, leave
   campaign 24 active, and activate another campaign. It must show “Only one
   campaign can be active. Pause the active campaign before activating another.”
2. **Git commit, only when asked.** Commit the uncommitted working tree so
   `origin/main` matches upselltrix-16. Pushing that commit still does not
   require a new theme deploy.

**Still open, not the next priority**

1. **Discount campaigns** (percent / fixed) were not storefront-tested today.
2. **Campaign-capacity concurrent activate** needs a real PostgreSQL
   two-connection test (harness only so far).
3. **Schedule worker** on the host: future start / inclusive end without opening
   the campaign. Code fix from 20 Oct; confirm the separate worker process is
   running the new build. Web deploy alone does not start it.
4. **Product vs drawer remaining sentence** still differs (“You are 162 away…”
   vs “Add 162 more…”). Amounts match; wording is two templates. Optional polish.

**Not UpsellTrix**

5. Shopify checkout payments on this development store.
6. Blank embedded admin iframe in headless Chrome. Capacity was verified through
   the live campaign service, not the admin UI.

**Do not regress**

- Dawn drawer gift identity must not mark a paid same-SKU line.
- Do not write cart-page HTML into `cart-drawer-items`.
- Do not restore a MutationObserver on the cart form (hangs `/cart`).
- Do not grow `free-gift-progress-bar.js` past 10000 bytes (a11y and the
  password guard live in satellites for that reason). Core stayed **9956** bytes
  at the upselltrix-16 build.
- One ACTIVE campaign only. Do not turn campaign 26 back on beside campaign 24.
- A full-price tagged gift while discount sync is pending or `5XX` is a sync
  lag, not a theme bug.

---

## Before deployment

- Run the full automated test suite.
- Run TypeScript validation and lint.
- Build the backend.
- Build the Shopify Discount Function.
- Build and verify the storefront assets.
- Confirm the working tree contains the campaign-limit changes.

## After deployment

The checklist under this heading was written when two campaigns were allowed to
be active together. That plan is superseded. The rule now is one ACTIVE
campaign. Do not activate campaign 24 and campaign 26 together to “complete”
the old selection checks.

Use a Shopify development store with one active gift campaign. Pause it before
activating a different one.

### Campaign activation

These checks apply only after the Node host is rebuilt. The current host does
not enforce them.

- With no active campaign, activate one classic or one tiered campaign. It should succeed.
- With that campaign still active, activating any second campaign must be blocked. Classic plus tiered is blocked too.
- A self-edit of the active campaign must succeed.
- Pause the active campaign, then activate the other one. It should succeed.
- A tiered campaign may save 5 thresholds today. A 6th must be rejected. The stored ladder remains free 2, paid 3, top 5 for when billing exists.

### Campaign selection

- Run one campaign at a time. Below its threshold, no gift. At its threshold, that campaign’s gift only.
- Do not use the old both-active tie-breaker as a storefront test. Selection code still has it, but activation no longer allows two winners.

### Cart changes

- Increase the cart until the selected campaign qualifies.
- Decrease the cart below its threshold. The gift must be removed.
- Change the cart while a gift update is processing. No stale gift may remain.
- Remove the paid product. The gift must disappear and the paid product must remain unaffected.
- Confirm that a paid item with the same variant as the gift is not removed or discounted incorrectly.

### Checkout

- Proceed through checkout using the normal Add to cart flow.
- Verify the selected gift is free at checkout.
- Verify an unqualified or stale gift is not free at checkout.
- Verify duplicate gift lines do not create duplicate free quantities.
- Verify Buy it now / accelerated checkout remains documented as unsupported for automatic gift insertion.

### Theme and mobile checks

- Confirm the theme embed loads when enabled.
- Confirm turning the embed off removes storefront behavior after saving the theme.
- Check a product page and cart drawer in Chrome and Edge.
- Check the campaign form at 320px, 375px, and desktop width.
- Confirm there is no horizontal overflow and the campaign-limit message is readable.

## Result fields

Record for each check: date/time, store domain, browser, campaign IDs, expected result, actual result, pass/fail, and screenshot or console evidence.

upselltrix-16 passed on the published cart. Local 9293 evidence is in section 7.
The published pass is in the live-vs-local table.

## Campaign capacity fix — 21 October

- All 400 backend tests passed, including 13 new capacity regression tests.
- Type checking, ESLint, production build and whitespace checks passed.
- The check and write now share a PostgreSQL transaction and a shop-scoped
  transaction advisory lock. Explicit Read Committed isolation makes the waiting
  request see the previous request's committed campaign before checking capacity.
- Covered service create, edit-to-ACTIVE, activation, type changes, future/expired
  ACTIVE schedules, self-edits, pausing, shop isolation and simulated concurrent
  requests. The concurrency harness simulates lock behavior; a real PostgreSQL
  multi-connection test has not been run locally (no Docker/psql available).
- No migration or storefront/Function asset change is required for this fix.

After backend deployment:

1. Activate one campaign. A second campaign, classic or tiered, must be blocked until the first is paused.
2. Attempt another campaign of either type, including a future-start campaign.
   The app should show the existing capacity message and leave the campaign unsaved
   or in its previous state.
3. From two tabs, activate two draft classic campaigns together with the classic
   slot empty. Exactly one may succeed. Repeat for tiered campaigns.
4. Edit the existing active campaign; it must not count itself as a competitor.
5. Pause the active campaign, then activate its replacement.
6. Confirm rejected edits do not change saved gifts or tiers.

Future and expired campaigns still marked ACTIVE reserve their slot until paused
or saved as drafts. Existing excess campaigns are not automatically paused or
deleted. Pause any extras before testing; rollout across old and new backend
versions must finish before relying on the new limit.

## Local cleanup checks — 20 October

976 automated tests passed (373 backend, 17 compliance, 138 promotion,
38 Function, 410 storefront). Type checking, ESLint, production app build,
storefront asset verification and whitespace checks passed.
See `docs/development/cleanup-2026-10-20.md` for cleanup details.

The scheduled-campaign scanner was previously skipped by both worker CLIs because
they supply a database client. Fixed locally on 20 October; not yet deployed.

After redeployment, test a future campaign start and an end boundary
without opening or saving the campaign. Verify the worker updates Shopify's
discount configuration and the storefront and checkout agree after each transition.
Record expected/actual results; do not infer success from local test counts.

## Schedule synchronization fix — local verification, 20 October

- 387 backend tests passed, including 14 new regression tests.
- Focused discount-sync suite: 63 passed (overlaps backend; not additional tests).
- Type checking, ESLint and production app build passed.
- No database migration or storefront/Function bundle change is needed for this fix.
- Live database concurrency and Shopify responses were not tested; automated
  checks use fake stores, local locks and mocked Shopify responses.

Deployment checks:

1. Confirm the separate worker runs the updated code with the correct database
   and Shopify credentials. Web deployment alone does not start it.
2. Watch mode checks every configured poll interval (default five seconds).
   Scheduled run-once checks on its hosting schedule. Queue backlog, retries and
   Shopify latency can delay application; this is not exact-time enforcement.
3. Create a future-start campaign; leave the app closed. Check before and after
   start that both cart eligibility and checkout discounts are correct.
4. Repeat for the end boundary. The existing end time is inclusive.
5. When the active campaign ends, the slot must be free. A second campaign must stay blocked until that happens. Do not leave two campaigns active to test this.
6. Check that a transient sync error retains its retry delay rather than retrying
   on every scan. Terminal errors require operator attention.

## Item 1 — gift add and remove without a progress bar — 22 October 2026

No storefront code was changed for this item. The single theme embed already
loads `tiered-gift-sync.js`. That script reads `/cart.js` and the app-proxy
widget state, then adds or removes tagged gifts by Shopify line-item key.
It does not read a progress card, a product-page app block, or prices painted
in the theme. The classic bundle does not also mutate the cart in the browser.
Uncommitted Horizon and Savor cart edits were left as they were. Nothing was
committed, pushed, deployed, or published, and no campaign was activated.

### Before and after

Before this check, gift sync and the progress bar were already separate: the
bar is paint, and the embed is what puts the gift in the cart and takes it
out. After the check, that is still the behavior. Hiding the bar does not
stop the gift.

### Automated tests

`node --test` on these files, 22 Oct 2026, exit 0:

- `storefront-extension/src/tests/tiered-gift-sync.runtime.test.js`
- `storefront-extension/src/tests/tiered-gift-sync.test.js`
- `storefront-extension/src/tests/cart-coordinator.test.js`
- `storefront-extension/src/tests/native-cart-interceptor.test.js`
- `storefront-extension/src/tests/gift-safety.test.js`

208 passed, 0 failed. The runtime file boots the shipped
`tiered-gift-sync.js` with `querySelector` returning null, so there is no
progress bar and no product block in that sandbox. It covers one gift on
crossing the threshold, removal when spend drops, no duplicate while still
eligible, a paid line of the gift variant left untouched, stale widget-state
ignored, and the full-price safety removal. The planner file covers tiered
rewards in isolation: three tiers add three gifts, dropping below a middle
tier removes only the higher gifts, duplicates are removed, and a paid
same-SKU line is kept. No second campaign was turned on in the shop.

### Storefront cart API, bars absent

Development store `algorithmtrix-development.myshopify.com`, Horizon theme
`178031395063`, released embed `fgpb=162`. Local `http://127.0.0.1:9293` was
not serving a preview, and `shopify app dev` was not started. The product-page
app block was not in the page (`[data-fgpb-section-boot]` absent). The embed
bootstrap was present. `renderProgress` and `progressRecovery` were turned off
in the page, and every `.fgpb-progress-card` was removed. The bar count stayed
0 for the whole run. Active campaign left as campaign 24 (threshold $999,
gift variant `50822538625271`). Paid product: clove oil variant
`51107811033335` at $279. Results are from `/cart.js`, not from the drawer.

| Step | `/cart.js` |
|---|---|
| Qty 3 clove ($837, below $999) | 3 paid lines, total 83700, no tagged gift |
| Qty 4 clove ($1,116) | tagged gift qty 1 at 0, clove qty 4 at 111600, total 111600 |
| Rapid change 2, then 6, then 1, then wait | settled at clove qty 1, total 27900, no gift |
| Qty 4 again, then add the gift variant as a normal paid line | paid snowboard qty 1 at 11000 (not tagged), tagged gift qty 1 at 0, clove qty 4 at 111600, total 122600 |
| Clove back to qty 1 (below threshold) | paid snowboard kept at 11000, clove qty 1 at 27900, tagged gift gone, total 38900 |
| Clear cart | item_count 0, total 0 |

### Remaining gaps

- Drawer HTML was not used as evidence and was not treated as fixed.
- Checkout was not opened. This store still cannot accept payments. The cart
  API showed the tagged gift at 0 and the paid copy of that variant at 11000.
- Tiered rewards were not exercised on the live shop, because that would mean
  activating a second campaign. They were exercised only in the isolated
  planner tests.
- The rapid-change check records the settled cart, not every intermediate
  request. The settled cart had one paid line and no gift.

## Savor line targeting and the gift after a drop — 22 October 2026

Not deployed. The shop is still on released `fgpb=162` (upselltrix-21).
Progress bars were not removed. Campaign 24 was left active. Nothing was
committed.

### Line targeting

Reproduced before the fix. The shipped rewrite walked every
`cart-items-component` and kept the first row at that line number. With a
hidden drawer ordered gift-then-paid and a visible cart page ordered
paid-then-gift, a cart-page quantity change for line 1 sent the gift key
`50822538625271:gift-row`. A change that named no surface was also rewritten
to that hidden row.

The rewrite now uses the section id Savor puts first in `sections` (the
component that handled the click). If two surfaces share that id, it uses the
`cart-items-component` that dispatched `shopify:cart:lines-update`. It does
not take a row from another surface. One component still rewrites, which is
the product-page drawer. No component leaves Dawn's `{line, quantity}` body
unchanged.

### The gift after $1,198 fell

Campaign 24, threshold $999, gift variant `50822538625271`. On Savor
`181880652023` the cart was the chilli pack of 3 at $649
(`51107811590391`) plus the pepper pack of 3 at $549 (`51107811197175`),
total $1,198. The free snowboard was already in `/cart.js` at final price 0
(discount $110). The cart page showed Estimated total $1,198.00.

Removing the chilli sent `{line:3, quantity:0}` and the live rewrite turned
that into the chilli's own line key. This cart template has one
`cart-items-component`, so the first-component bug did not pick a different
item. The change response still contained the snowboard, now at $110, and the
page drew Estimated total $659.00. Widget-state for that cart returned
`cartSubtotal=549`, `eligible=false`, `threshold=999`. No gift add followed.
Sync removed the tagged gift. `/cart.js` then had only the pepper pack, total
54900. The page kept the $659 total and the $110 snowboard until a reload.

Adding the chilli back put the free gift in `/cart.js` again (final 0,
discount 11000, total 119800). The stale page still showed $659 until reload.
A fresh load showed the free gift at $0.00 and Estimated total $1,198.00.
Clearing the cart left `/cart.js` at count 0 and total 0, and a fresh load
showed "Your cart is empty". One unlock popup appeared on the first qualify.
The second qualify fired one `fgpb:gift-added` and did not leave a second
open popup.

### Automated tests

`node --test` on the line-target file before the fix: 2 passed, 3 failed.
The cart-page line 1 quantity was sent as the hidden drawer's gift key.
A change that named no surface was rewritten the same way. The drawer-only
and Dawn cases already passed.

After the fix, the same command on these files, exit 0:

- `storefront-extension/src/tests/savor-line-target.test.js`
- `storefront-extension/src/tests/tiered-gift-sync.runtime.test.js`
- `storefront-extension/src/tests/native-cart-interceptor.test.js`
- `storefront-extension/src/tests/cart-coordinator.test.js`

136 passed, 0 failed. The new runtime cases hold the qualifying response
until the cart is below the threshold, then release it, and hold the gift
add until the cart has dropped. The final cart has no tagged gift, the paid
copy of the gift variant stays, and `fgpb:gift-added` does not fire. A gift
that is still earned still fires that event once.

### Remaining gaps

- The local line-mapping and celebration changes are not on the shop. The
  browser pass used released `fgpb=162`.
- Savor's cart template did not have a hidden drawer and a cart page in the
  DOM together, so the two-surface mismatch was not clicked through in the
  browser. It was executed in the sandbox test.
- After the gift was removed, the cart page kept the pre-removal section HTML
  ($659 and the snowboard at $110) because the removal asked for
  `cart-drawer,cart-icon-bubble` and not this cart section. That display is
  not fixed.
- Checkout was not opened. A duplicate popup was not reproduced; one popup
  showed on the first unlock.

## Savor cart-page refresh after a gift mutation — 22 October 2026

Not deployed. The shop is still on released `fgpb=162`. Nothing was
committed. Campaign 24 was not changed.

### Cause

The gift add and remove already corrected `/cart.js`. The mutation asked
only for `cart-drawer,cart-icon-bubble`. Savor's cart page has no
`#main-cart-items`. Its items, empty state, and estimated total live in the
`cart-items-component` section (`data-section-id`, on this cart template
`template--27410053333239__cart-section`). That id was not requested, so the
page kept the intermediate HTML: the snowboard at $110 and Estimated total
$659.00.

### What the local change does

A gift mutation now also requests the section id of every
`cart-items-component` actually on the document. Dawn's `#main-cart-items`
and `#main-cart-footer` are still added only when those elements exist on
`/cart`. A Dawn lookup that throws does not drop the component ids.

When the mutation response contains HTML for one of those ids, and the cart
generation still matches the generation captured when the request started,
the runtime dispatches `shopify:cart:lines-update` on the document. The
promise resolves to `{ cart: { totalQuantity }, detail: { sections, itemCount } }`.
Savor morphs that section, which replaces the rows and the estimated total.
Horizon's cart icon reads `totalQuantity`, then `itemCount`. The event is
not dispatched on the component and carries no line id, so it is not treated
as a shopper click. Dawn still receives the same response through
`__fgpbApplyCartSections`. `cart-drawer` and `cart-icon-bubble` are still
requested.

An older response is not applied: `shouldApplyGiftCartSections` compares the
generation from the start of the gift POST with `__fgpbCartUiGen`. A shopper
mutation bumps that generation. Missing or empty section HTML is not
dispatched, because an empty payload makes Savor fetch the section again and
can paint an older cart. No second cart observer was added.

### Automated tests

`node --test` on these files, exit 0:

- `storefront-extension/src/tests/savor-line-target.test.js`
- `storefront-extension/src/tests/tiered-gift-sync.runtime.test.js`
- `storefront-extension/src/tests/native-cart-interceptor.test.js`
- `storefront-extension/src/tests/cart-coordinator.test.js`
- `storefront-extension/src/tests/tiered-section-refresh.test.js`
- `storefront-extension/src/tests/dawn-progress-runtime.test.js`
- `storefront-extension/src/tests/cart-drawer-adapters.test.js`
- `storefront-extension/src/tests/tiered-429-recovery.test.js`
- `storefront-extension/src/tests/tiered-gift-sync.test.js`

227 passed, 0 failed. The four files from the earlier 136-test run are
included. The new runtime cases use threshold $999. After gift removal the
fixture page changes from `Estimated total $659.00` and the snowboard to
`Estimated total $549.00` with no snowboard, and the icon count becomes 1.
Requalification paints the free gift and `$1198.00` once. Removing the paid
lines and then the tagged gift paints "Your cart is empty" and icon count 0.
An empty section response leaves the stale markup and does not post again.
A held response cannot paint `STALE-GIFT-MARKUP` after the cart has moved on.
Two quantity changes while still eligible leave one gift and one
`fgpb:gift-added`. The two-surface line-target file passed again.

`node scripts/storefront-assets.mjs --check` passed. Core
`free-gift-progress-bar.js` is 9956 bytes, under the 10000-byte limit.
`cart-drawer-compat.js` is 29608 bytes. `tiered-gift-sync.js` is 107850 bytes
and is not the core app-block file.

### Not tested

The rendered Savor cart page was not opened with this change. Checkout was
not opened. Other themes were not clicked through. Focus after Savor's own
morph was not measured in a browser.

## Fast gift sync — 22 October 2026

Not deployed. The shop is still on released `fgpb=162`. Nothing was committed.
The Savor section refresh from the previous section is unchanged: the live
`cart-items-component` section id is requested, and non-empty HTML is
delivered with `shopify:cart:lines-update`. Dawn still uses its own section
writer.

### Request counts

For one qualifying change after a warm boot, the previous sync read
`/cart.js` four times (plan, safety, reconcile, trailing read) and
widget-state twice (plan and reconcile), plus one gift POST. The section
HTML was already applied inside that POST.

The fast path, measured by
`qualifies and disqualifies with one cart read and one eligibility check`,
does this for both the rise ($549 to $1,198 at threshold $999) and the drop
back to $549:

- 1× `/cart.js` (the safety read after the gift POST)
- 1× widget-state (background confirmation)
- 1× gift POST

An empty cart that no longer contains a gift does not add a `/cart.js` read.
A product add that returns only the new line still fetches `/cart.js` before
planning. A currency or presentment-rate change still asks widget-state
before the gift POST and does not add a `/cart.js` for that check.

### Automated tests

`node --test` on the same nine files as the section-refresh run, exit 0.
232 passed, 0 failed. That is the previous 227 plus the fast-path cases:
qualification and disqualification request counts, both tiers, a currency
and rate miss, a partial product add, a failed eligibility request, the
campaign switch, and the Savor morph cases.

`node scripts/storefront-assets.mjs --check` passed. Core
`free-gift-progress-bar.js` is 9956 bytes. `cart-drawer-compat.js` is 29608
bytes. `tiered-gift-sync.js` is 115696 bytes and is not the core app-block
file.

### Not tested

No live Savor, Dawn, or Horizon page was opened with this build. Checkout
was not opened. The shop is still serving `fgpb=162`.

## Released for owner testing — 22 October 2026

Owner asked to deploy. From `shopify-app`:

```text
npm run deploy -- --allow-updates --no-input --message "Refresh the Savor cart with the gift and sync gifts from the cart already in hand"
```

`predeploy` passed. Core stayed 9956 bytes; compatibility stayed 29608 bytes.
Config was `shopify.app.release.toml`. Shopify released **upselltrix-22**,
version id [1177234636801](https://dev.shopify.com/dashboard/215127165/apps/407260594177/versions/1177234636801).
Liquid cache bust is `fgpb=163` in `free-gift-embed.liquid` and
`free-gift-progress-bar.liquid`. This publishes the theme extension and the
Discount Function. It does not deploy the Node web app and it does not commit
git. The owner is testing it. Checkout and a live browser pass were not done
in this step.

## Owner storefront report — 22 October 2026

Owner report on released **upselltrix-22** / `fgpb=163`. Not an agent browser pass.

- Savor: owner said the cart works perfectly (add and remove).
- Dawn: owner said the cart works perfectly fine.
- Horizon: owner said add and remove are very slow. The gift still changes; this was not reported as a failure to appear.

Checkout price, theme ids, and campaign settings were not included in these reports. Horizon speed is still open. Do not read these reports as universal theme compatibility.

## Free gifts count and simpler create page — 22 October 2026

Owner asked to publish. Storefront cache bust is `fgpb=164` in `free-gift-embed.liquid` and `free-gift-progress-bar.liquid`. After a gift add succeeds, the storefront posts one `gift_added` event per added variant to `/apps/free-gift/track-event`. The admin Free gifts page counts those events. It does not count orders, and gifts added before this release are not included. Create campaign now asks for the name, offer, spend goal, and gift. Design, placement, and review steps stay on the edit page.

`node --test storefront-extension/src/tests/tiered-gift-sync.runtime.test.js` passed: 61 tests, 0 failed. A qualifying add recorded one `track-event` request and did not add an eligibility read.

Released **upselltrix-23**, version id [1177290342401](https://dev.shopify.com/dashboard/215127165/apps/407260594177/versions/1177290342401). `npm run deploy -- --allow-updates --no-input --message "Count each free gift added to a cart"`. This publishes the theme extension and the Discount Function. It does not deploy the Node web app and it does not commit git. The Free gifts page and the simpler create-campaign screen need the ApiCloud web app rebuilt from this code before they appear in the admin.
