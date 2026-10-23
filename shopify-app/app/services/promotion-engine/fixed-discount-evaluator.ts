/**
 * Canonical FIXED_DISCOUNT evaluator.
 *
 * Spend X → fixed amount off qualifying cart (Discount Function applies the amount).
 * Reuses shared spend-threshold progress — no duplicated eligibility math.
 * No gift-line actions. No storefront / widget / Function presentation logic.
 */

import { REGISTRY_TYPES } from "./campaign-types";
import { buildSpendThresholdProgress } from "./spend-threshold-progress";
import type {
  CampaignEvaluator,
  EvaluationInput,
  PromotionDiagnostic,
  PromotionEvaluationResult,
  PromotionReward,
} from "./types";

function isWithinSchedule(
  campaign: EvaluationInput["campaign"],
  now: Date,
): PromotionDiagnostic | null {
  if (campaign.startDate && now < campaign.startDate) {
    return { code: "NOT_STARTED", message: "Campaign has not started" };
  }
  if (campaign.endDate && now > campaign.endDate) {
    return { code: "EXPIRED", message: "Campaign has ended" };
  }
  return null;
}

/** Fixed discount amount must be finite and > 0. */
function normalizeFixedAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}

export function evaluateFixedDiscount(input: EvaluationInput): PromotionEvaluationResult {
  const { campaign, cart, now } = input;
  const campaignId = String(campaign.id);
  const campaignType = campaign.type;
  const amount = normalizeFixedAmount(campaign.fixedDiscountAmount);
  const threshold = Math.max(0, campaign.threshold ?? 0);

  const base = {
    campaignId,
    campaignType,
    active: false,
    supported: true,
    eligible: false,
    rewards: [] as PromotionReward[],
    actions: [{ type: "NO_ACTION" as const }],
    presentation: {
      widgetSettings: campaign.widgetSettings ?? undefined,
    },
  };

  const scheduleDiagnostic = isWithinSchedule(campaign, now);
  if (scheduleDiagnostic) {
    return { ...base, diagnostic: scheduleDiagnostic };
  }

  if (campaign.status !== "ACTIVE") {
    return {
      ...base,
      diagnostic: { code: "CAMPAIGN_DISABLED", message: `Campaign status is ${campaign.status}` },
    };
  }

  const ruleProgress = buildSpendThresholdProgress(Math.max(0, cart.subtotal), threshold);

  if (amount == null || threshold <= 0) {
    return {
      ...base,
      active: true,
      progress: threshold > 0 ? ruleProgress.progress : undefined,
      presentation: {
        progress: threshold > 0 ? ruleProgress.progress : undefined,
        widgetSettings: campaign.widgetSettings ?? undefined,
      },
      diagnostic: {
        code: "INVALID_CAMPAIGN_CONFIGURATION",
        message:
          amount == null
            ? "Missing or invalid fixedDiscountAmount (must be > 0)"
            : "Invalid threshold",
      },
    };
  }

  const eligible = ruleProgress.eligible;
  const progress = {
    ...ruleProgress.progress,
    unlocked: eligible,
  };

  const rewards: PromotionReward[] = [
    {
      type: "FIXED_DISCOUNT",
      campaignId,
      amount,
    },
  ];

  if (eligible) {
    return {
      campaignId,
      campaignType,
      active: true,
      supported: true,
      eligible: true,
      diagnostic: { code: "ELIGIBLE", message: "Spend threshold met for fixed discount" },
      progress,
      rewards,
      actions: [
        {
          type: "APPLY_FIXED_DISCOUNT",
          campaignId,
          amount,
        },
      ],
      presentation: {
        progress,
        widgetSettings: campaign.widgetSettings ?? undefined,
      },
    };
  }

  return {
    campaignId,
    campaignType,
    active: true,
    supported: true,
    eligible: false,
    diagnostic: { code: "THRESHOLD_NOT_MET" },
    progress,
    rewards,
    actions: [{ type: "NO_ACTION" }],
    presentation: {
      progress,
      widgetSettings: campaign.widgetSettings ?? undefined,
    },
  };
}

export const fixedDiscountEvaluator: CampaignEvaluator = {
  type: REGISTRY_TYPES.FIXED_DISCOUNT,
  evaluate: evaluateFixedDiscount,
};
