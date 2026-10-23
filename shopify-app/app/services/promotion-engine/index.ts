/**
 * Phase 2 Promotion Engine package entry.
 *
 * Canonical ownership:
 * - Types: `./types`
 * - FREE_GIFT evaluator: `./free-gift-evaluator`
 * - PERCENTAGE_DISCOUNT evaluator: `./percentage-discount-evaluator`
 * - FIXED_DISCOUNT evaluator: `./fixed-discount-evaluator`
 * - Registry: `./evaluate` (`evaluateWithRegistry`)
 * - Selection policy: `./campaign-selection`
 * - Qualifying subtotal helper: `./qualifying-subtotal`
 * - Subtotal source policy: `./resolve-subtotal`
 * - App Proxy adapters: `./route-adapters` (widget-state / evaluate-cart)
 *
 * Live App Proxy orchestration: `../proxy-evaluation.server.ts`
 * → selectActiveCampaign({ supportedTypesOnly: true }) → evaluateWithRegistry → route adapters.
 *
 * `../gift-engine.server.ts` remains a thin wrapper for legacy gift-shaped state.
 * Storefront `buildLocalEvaluation()` is intentionally untouched in Phase 2C.
 *
 * Dependency direction (never reverse):
 *   Promotion Engine → Route Adapters → Storefront
 */

export type * from "./types";
export {
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
  REGISTRY_TYPES,
  isSupportedCampaignType,
  isFreeGiftCampaignType,
  isTieredFreeGiftsCampaignType,
  isPercentageDiscountCampaignType,
  isFixedDiscountCampaignType,
  resolveRegistryCampaignType,
} from "./campaign-types";
export { selectActiveCampaign, selectWinningCampaign } from "./campaign-selection";
export type {
  CampaignSelectionMeta,
  CampaignSelectionOptions,
  CampaignSelectionResult,
  SelectableCampaign,
} from "./campaign-selection";
export {
  calculateQualifyingSubtotal,
  calculateQualifyingSubtotalFromLines,
} from "./qualifying-subtotal";
export { evaluateFreeGift, freeGiftEvaluator } from "./free-gift-evaluator";
export {
  evaluateTieredFreeGifts,
  tieredFreeGiftsEvaluator,
} from "./tiered-free-gifts-evaluator";
export {
  evaluatePercentageDiscount,
  percentageDiscountEvaluator,
} from "./percentage-discount-evaluator";
export {
  evaluateFixedDiscount,
  fixedDiscountEvaluator,
} from "./fixed-discount-evaluator";
export {
  evaluateWithRegistry,
  getCampaignEvaluator,
  listRegisteredCampaignTypes,
} from "./evaluate";
export { toCanonicalCampaign, toEvaluationInput } from "./adapters";
export {
  toEvaluateCartResponse,
  toLegacyEvaluateCartAction,
  toWidgetStateResponse,
} from "./route-adapters";
export {
  canCalculateQualifyingSubtotalFromLines,
  resolveEvaluationSubtotal,
  SUBTOTAL_MISMATCH_TOLERANCE_CENTS,
} from "./resolve-subtotal";
export type {
  SubtotalDiagnostic,
  SubtotalDiagnosticCode,
  SubtotalSource,
} from "./resolve-subtotal";
export {
  compareLocalWithCanonical,
  compareQualifyingSubtotals,
  centsParityProbe,
} from "./parity-harness";
