# Promotion Interface (Evaluator / Registry Contract)

**Status:** Contract for campaign evaluators and the type registry.
**Scope:** Target product types Free Gift, Tiered Free Gifts, Mystery Gift; documents live registry as it exists today.
**Code anchors:** `app/services/promotion-engine/types.ts`, `evaluate.ts`, `campaign-types.ts`, per-type `*-evaluator.ts` files.

---

## Design rule

Register each reward type the same way — **no special cases in App Proxy**.
App Proxy always calls `evaluateWithRegistry(input)` (`evaluate.ts`). Unsupported types return an explicit diagnostic, never a silent Free Gift result.

---

## Registry

### Live registry map (`evaluate.ts`)

| Registry key | Evaluator module |
|---|---|
| `FREE_GIFT` | `free-gift-evaluator.ts` → `freeGiftEvaluator` |
| `TIERED_FREE_GIFTS` | `tiered-free-gifts-evaluator.ts` → `tieredFreeGiftsEvaluator` |
| `PERCENTAGE_DISCOUNT` | `percentage-discount-evaluator.ts` *(legacy deviation — not a target product type)* |
| `FIXED_DISCOUNT` | `fixed-discount-evaluator.ts` *(legacy deviation — not a target product type)* |

Helpers: `getCampaignEvaluator`, `listRegisteredCampaignTypes`.

### Admin type → registry key (`campaign-types.ts`)

| `campaign.type` string | Registry key |
|---|---|
| `Spend X -> Free Gift` | `FREE_GIFT` |
| `Tiered Free Gifts` | `TIERED_FREE_GIFTS` |
| `Spend X -> Percentage Discount` | `PERCENTAGE_DISCOUNT` (legacy) |
| `Spend X -> Fixed Discount` | `FIXED_DISCOUNT` (legacy) |
| `Mystery Gift` / unknown | `null` → unsupported |

`resolveRegistryCampaignType` returns `null` for Mystery Gift today. Do not coerce.

---

## Evaluation input

Defined in `types.ts` as `EvaluationInput` (and built via `toEvaluationInput` / `toCanonicalCampaign` in `adapters.ts`).

Conceptually:

- **Campaign** — canonical campaign (id, type, status, rules, gift/tier config, widget settings, schedule).
- **Cart** — `CanonicalCart`: `subtotal`, optional `currencyCode`, `lines: CanonicalCartLine[]`.
- Lines may include `variantId`, quantities, prices, `properties`, collection ids — used for gift detection and qualifying subtotal.

Subtotal resolution policy: `resolve-subtotal.ts` / `qualifying-subtotal.ts` (gift lines excluded by caller when required). Orchestration in `proxy-evaluation.server.ts`.

---

## CampaignEvaluator interface

Each registered type exports a `CampaignEvaluator` with an `evaluate(input) → PromotionEvaluationResult` method.

### `PromotionEvaluationResult` (canonical)

| Field | Role |
|---|---|
| `campaignId` | Evaluated campaign |
| `campaignType` | Admin/type string as evaluated |
| `active` | Campaign considered active |
| `supported` | `false` when no evaluator / unsupported type |
| `eligible` | Reward condition met |
| `diagnostic` | `{ code, message? }` — see diagnostic codes |
| `rewards` | Typed reward payloads |
| `actions` | Cart / discount instructions for sync (or `NO_ACTION`) |
| `presentation` | Optional `progress`, `widgetSettings` for adapters |

### Rewards (target + legacy)

Target product:

- `FreeGiftReward` — `type: "FREE_GIFT"`, `campaignId`, `variantId`, `quantity: 1`, optional `productId`
- `TieredFreeGiftsReward` — `type: "TIERED_FREE_GIFTS"`, `unlockedGifts[]`, optional `nextTier`

Planned:

- Mystery Gift reward shape — to be added with evaluator; must encode **server-chosen** variant(s), not a client-pickable pool alone.

Legacy (still typed today):

- `PercentageDiscountReward`, `FixedDiscountReward`

### Actions (gift-relevant)

Gift property keys (do not change): `_fgpb_free_gift`, `_fgpb_campaign_id`, optional `_fgpb_tier_id`.

| Action type | Use |
|---|---|
| `ADD_FREE_GIFT` | Add gift line with properties |
| `REMOVE_FREE_GIFT` | Remove gift line(s) for campaign/tier |
| `NORMALIZE_FREE_GIFT_QUANTITY` | Force quantity 1 |
| `NO_ACTION` | Nothing to sync |
| `APPLY_PERCENTAGE_DISCOUNT` / `APPLY_FIXED_DISCOUNT` | Legacy discount path |

Reward Sync consumes these; renderers do not apply them.

### Diagnostic codes (subset)

From `PromotionDiagnosticCode` in `types.ts`, including:

- `ELIGIBLE`, `THRESHOLD_NOT_MET`
- `CAMPAIGN_DISABLED`, `NOT_STARTED`, `EXPIRED`
- `UNSUPPORTED_CAMPAIGN_TYPE`
- `GIFT_ALREADY_PRESENT`, `GIFT_SHOULD_BE_ADDED`, `GIFT_SHOULD_BE_REMOVED`
- `DUPLICATE_GIFT_LINES`, `GIFT_QUANTITY_INVALID`
- `INVALID_CAMPAIGN_CONFIGURATION`, `NO_ACTIVE_CAMPAIGN`

Unsupported path in `evaluateWithRegistry` sets `supported: false`, `eligible: false`, `diagnostic.code: "UNSUPPORTED_CAMPAIGN_TYPE"`, `actions: [{ type: "NO_ACTION" }]`.

---

## Rules typing

`PromotionRule` union includes:

- `CART_SUBTOTAL` — live path for Free Gift / tiers (primary)
- `PRODUCT_QUANTITY`, `COLLECTION_QUANTITY` — typed stubs / future; Phase 2 live Free Gift focused on cart subtotal (`types.ts` comment)

Evaluators must validate configuration and emit `INVALID_CAMPAIGN_CONFIGURATION` when required gift/tier data is missing.

---

## Mystery Gift evaluator (contract intent)

When added:

1. Register under a new registry key (e.g. `MYSTERY_GIFT`) and map admin string `"Mystery Gift"` in `campaign-types.ts`.
2. Implement `CampaignEvaluator` that:
   - Evaluates threshold (or rules) like Free Gift.
   - **Selects** the gift from the merchant pool **on the server** (deterministic or random policy documented in code).
   - Emits rewards/actions with the chosen `variantId` and standard gift properties.
3. Never leave pool selection to Product Renderer or Drawer Renderer.
4. Wire `toWidgetStateResponse` / evaluate-cart adapters so `rewardType` and `gift` reflect the server choice.

Until then, Mystery Gift remains unsupported at runtime (`supported: false`).

---

## Route adapters

After evaluation:

- `toWidgetStateResponse` → storefront Widget State ([widget-state.md](./widget-state.md)).
- `toEvaluateCartResponse` / `toLegacyEvaluateCartAction` → cart evaluation / sync consumers.

Adapters translate engine results; they must not re-run eligibility logic.

---

## Package entry

Public exports: `app/services/promotion-engine/index.ts`.
Dependency direction: **Promotion Engine → Route Adapters → Storefront** (never reverse).

---

## Related docs

- [promotion-engine.md](./promotion-engine.md)
- [widget-state.md](./widget-state.md)
- [deviations-and-roadmap.md](./deviations-and-roadmap.md)
