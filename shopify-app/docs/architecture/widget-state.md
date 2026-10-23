# Widget State Contract

**Status:** Canonical storefront render contract for the Promotion Engine path.
**Scope:** `FREE_GIFT`, `TIERED_FREE_GIFTS`, and planned `MYSTERY_GIFT` only.
**Code anchors:** `StorefrontWidgetStateResponse` in `app/services/widget.server.ts`; `toWidgetStateResponse` in `app/services/promotion-engine/route-adapters.ts`; `buildWidgetStateProxyResponse` in `app/services/proxy-evaluation.server.ts`.

---

## Role

Widget State is the **only** JSON contract Product Renderer and Drawer Renderer should use to paint progress UI.

It is produced after:

1. Campaign selection (Policy A / `supportedTypesOnly`).
2. `evaluateWithRegistry`.
3. Route adapter mapping (`toWidgetStateResponse`).

Reward Sync does **not** use Widget State as its eligibility authority; sync uses evaluation actions / evaluate-cart. Widget State may still expose fields (e.g. `rewardType`, gift ids) that help clients **gate** whether to call sync.

---

## Top-level shape

Type: `StorefrontWidgetStateResponse` (`widget.server.ts`).

| Field | Type | Meaning |
|---|---|---|
| `enabled` | `boolean` | Widget may render; `false` → hide / disabled UX |
| `campaignId` | `number \| null` | Winning campaign id |
| `threshold` | `number \| null` | Primary threshold (Free Gift / mystery-style single bar) |
| `heading` | `string \| null` | Merchant / campaign heading |
| `description` | `string \| null` | Supporting copy |
| `progress` | `number \| null` | 0–100 style progress for the active bar |
| `remaining` | `number \| null` | Amount remaining to next unlock (major units) |
| `eligible` | `boolean` | Engine says reward condition met |
| `cartSubtotal` | `number?` | Paid eligible subtotal (tiered milestone fill) |
| `rewardType` | `string \| null?` | Discriminator for clients (`FREE_GIFT`, `TIERED_FREE_GIFTS`, future mystery) |
| `gift` | `StorefrontWidgetGift \| null` | Primary gift preview (Free Gift / single selection) |
| `unlockedGifts` | array? | Tiered: unlocked gift lines |
| `nextTier` | object \| null? | Tiered: next locked tier |
| `rewardTiers` | array? | Tiered: all tiers for multi-milestone UI |
| `colors` | `WidgetColors` | Resolved presentation colors |
| `widgetSettings` | `WidgetSettings` | Merged settings |
| `template` | `string` | Template key for UI variants |
| `autoAddGift` | `boolean` | Whether auto-add sync is allowed by config |

`StorefrontWidgetGift`:

| Field | Type |
|---|---|
| `productId` | `string` |
| `variantId` | `string \| null` |
| `title` | `string` |
| `image` | `string \| null` |
| `quantity` | `number` |

---

## Per campaign type

### Spend X → Free Gift (`FREE_GIFT`)

**Required for a healthy enabled render:**

- `enabled: true`
- `rewardType` reflecting Free Gift (additive; Free Gift clients may ignore historically)
- `campaignId`, `threshold`, `progress`, `remaining`, `eligible`
- `gift` when a configured gift product/variant exists
- Presentation: `colors`, `widgetSettings`, `template`, `autoAddGift`

**Unused / ignore for Free Gift clients:**

- `unlockedGifts`, `nextTier`, `rewardTiers` (tiered-only; may be absent)

**Eligibility:** Driven by engine Free Gift evaluator (`free-gift-evaluator.ts`), not by comparing cart total in the browser against a hard-coded threshold.

---

### Tiered Free Gifts (`TIERED_FREE_GIFTS`)

**Required for a healthy enabled render:**

- `enabled: true`
- `rewardType` indicating tiered
- `campaignId`, `eligible`, `cartSubtotal` (for milestone fill)
- `unlockedGifts` — additive unlocked lines (`tierId`, `threshold`, `productId?`, `variantId`, `quantity: 1`)
- `nextTier` — next locked tier or `null` when fully unlocked
- `rewardTiers` — full tier list for multi-milestone drawer UI (`tierId`, `threshold`, `position`, `productId?`, `variantId?`)
- Progress fields (`progress`, `remaining`, `threshold`) as adapted from evaluation presentation
- Presentation fields as for Free Gift

**Gift preview:** Primary `gift` may still be present for compatibility; drawer/product UIs that understand tiers should prefer `rewardTiers` + `unlockedGifts` + `nextTier`.

**Eligibility / unlock set:** Entirely from `tieredFreeGiftsEvaluator` → adapter. Sync uses tier ids and gift properties (`_fgpb_tier_id`).

---

### Mystery Gift (planned)

**Not yet a live Widget State producer.** Admin shows Mystery Gift as merchant-visible coming-soon (`merchant-campaign-types.ts`); runtime maps it to unsupported (no registry key).

**Target contract when implemented (architecture intent):**

| Field | Expected use |
|---|---|
| `enabled` / `campaignId` / progress fields | Same pattern as Free Gift bar toward threshold |
| `rewardType` | Distinct mystery discriminator (e.g. `MYSTERY_GIFT`) |
| `eligible` | Threshold (or rule) met |
| `gift` | **Server-selected** reveal product/variant after eligibility — never client-picked |
| Pool metadata | Optional future fields (e.g. pool size) for UI copy only — not for client selection |

**Invariant:** Selection of which pool item the customer receives is **always server-side** (Promotion Engine). Widget State may display the chosen gift after evaluation; storefront must not randomly choose among variants.

Until the evaluator exists, App Proxy must not pretend Mystery Gift is Free Gift.

---

## Disabled / empty states

When there is no active supported campaign, or evaluation is inactive:

- Prefer an explicit disabled payload (`enabled: false`, null progress/gift fields) via existing helpers such as `buildDisabledWidgetState` / proxy disabled payloads (`proxy-route.server.ts` patterns).
- Renderers must hide or show inactive messaging; they must not invent a campaign.

Boot races (stale failed fetches overwriting good cache) are **implementation debt**, not part of this contract — see [deviations-and-roadmap.md](./deviations-and-roadmap.md).

---

## Consumer rules

1. **Product Renderer** — Consume Widget State for product/theme mounts only.
2. **Drawer Renderer** — Consume the same Widget State for drawer/cart-page strip; sole drawer owner.
3. Do not fork a second “truth” from raw cart JSON for eligibility.
4. Treat unknown `rewardType` values as non-rendering or safe fallback — never coerce Mystery → Free Gift in the client.

---

## Related docs

- [promotion-engine.md](./promotion-engine.md)
- [promotion-interface.md](./promotion-interface.md)
- [deviations-and-roadmap.md](./deviations-and-roadmap.md)
