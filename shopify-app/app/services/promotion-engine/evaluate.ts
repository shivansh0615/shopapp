/**
 * Campaign type registry.
 *
 * Register each reward type the same way — no special cases in App Proxy.
 */

import { resolveRegistryCampaignType, REGISTRY_TYPES } from "./campaign-types";
import { freeGiftEvaluator } from "./free-gift-evaluator";
import { fixedDiscountEvaluator } from "./fixed-discount-evaluator";
import { percentageDiscountEvaluator } from "./percentage-discount-evaluator";
import { tieredFreeGiftsEvaluator } from "./tiered-free-gifts-evaluator";
import type {
  CampaignEvaluator,
  EvaluationInput,
  PromotionEvaluationResult,
} from "./types";

const evaluators = new Map<string, CampaignEvaluator>([
  [REGISTRY_TYPES.FREE_GIFT, freeGiftEvaluator],
  [REGISTRY_TYPES.TIERED_FREE_GIFTS, tieredFreeGiftsEvaluator],
  [REGISTRY_TYPES.PERCENTAGE_DISCOUNT, percentageDiscountEvaluator],
  [REGISTRY_TYPES.FIXED_DISCOUNT, fixedDiscountEvaluator],
]);

export function getCampaignEvaluator(registryType: string): CampaignEvaluator | null {
  return evaluators.get(registryType) ?? null;
}

export function listRegisteredCampaignTypes(): string[] {
  return [...evaluators.keys()];
}

function unsupportedResult(
  input: EvaluationInput,
  message?: string,
): PromotionEvaluationResult {
  return {
    campaignId: String(input.campaign.id),
    campaignType: input.campaign.type,
    active: input.campaign.status === "ACTIVE",
    supported: false,
    eligible: false,
    diagnostic: {
      code: "UNSUPPORTED_CAMPAIGN_TYPE",
      message: message ?? `No evaluator for campaign type "${input.campaign.type}"`,
    },
    rewards: [],
    actions: [{ type: "NO_ACTION" }],
    presentation: {
      widgetSettings: input.campaign.widgetSettings ?? undefined,
    },
  };
}

/**
 * Canonical evaluation entry: resolve registry type → evaluator.
 * Unsupported campaign types return an explicit diagnostic (never Free Gift).
 */
export function evaluateWithRegistry(input: EvaluationInput): PromotionEvaluationResult {
  const registryType = resolveRegistryCampaignType(input.campaign.type);
  if (!registryType) {
    return unsupportedResult(input);
  }

  const evaluator = getCampaignEvaluator(registryType);
  if (!evaluator) {
    return unsupportedResult(input, `Registry type "${registryType}" has no evaluator`);
  }

  return evaluator.evaluate(input);
}
