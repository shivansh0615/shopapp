/**
 * Canonical FREE_GIFT evaluator.
 *
 * Owns Free Gift decision-making for the Promotion Engine.
 * Does NOT import storefront modules — dependency flows engine → adapters → storefront.
 *
 * Gift line identity (unchanged):
 * - `_fgpb_free_gift` === "true"
 * - `_fgpb_campaign_id` === campaign id
 *
 * Same-SKU paid lines without those properties are never treated as free gifts.
 *
 * Cart actions here are internal canonical intent. Storefront continues to use
 * `buildLocalEvaluation()` for gift sync; routes adapt legacy action fields.
 *
 * Phase 2D: SPEND_THRESHOLD progress/eligibility uses integer cents to match
 * storefront `toCents()` / `buildLocalEvaluation()` (see parity.test.ts).
 */

import { evaluateRuleProgress, RULE_TYPES } from "../cart-rules.server";
import {
  FGPB_CAMPAIGN_ID_PROPERTY,
  FGPB_FREE_GIFT_PROPERTY,
  isTaggedFreeGiftLine,
} from "../tagged-gift-cart.server";
import { REGISTRY_TYPES } from "./campaign-types";
import { buildProgress, buildSpendThresholdProgress } from "./spend-threshold-progress";
import type {
  CampaignEvaluator,
  CanonicalCartLine,
  EvaluationInput,
  PromotionAction,
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

function isCampaignGiftLine(line: CanonicalCartLine, campaignId: string): boolean {
  if (!isTaggedFreeGiftLine(line.properties ?? null)) return false;
  const lineCampaignId = line.properties?.[FGPB_CAMPAIGN_ID_PROPERTY];
  if (!lineCampaignId) return true;
  return String(lineCampaignId) === String(campaignId);
}

function lineUnitPrice(line: CanonicalCartLine): number {
  if (line.finalLinePrice != null && line.quantity > 0) {
    return Math.max(0, line.finalLinePrice / line.quantity);
  }
  return Math.max(0, line.price ?? 0);
}

function buildGiftProperties(campaignId: string): {
  _fgpb_free_gift: "true";
  _fgpb_campaign_id: string;
} {
  return {
    [FGPB_FREE_GIFT_PROPERTY]: "true",
    [FGPB_CAMPAIGN_ID_PROPERTY]: String(campaignId),
  } as {
    _fgpb_free_gift: "true";
    _fgpb_campaign_id: string;
  };
}

function resolveActions(input: {
  campaignId: string;
  variantId: string;
  eligible: boolean;
  giftLines: CanonicalCartLine[];
}): { actions: PromotionAction[]; diagnostic: PromotionDiagnostic } {
  const { campaignId, variantId, eligible, giftLines } = input;

  if (giftLines.length > 1) {
    return {
      actions: [
        {
          type: "REMOVE_FREE_GIFT",
          campaignId,
          lineKeys: giftLines
            .slice(1)
            .map((line) => line.lineKey)
            .filter((key): key is string => Boolean(key)),
        },
        {
          type: "NORMALIZE_FREE_GIFT_QUANTITY",
          campaignId,
          lineKey: giftLines[0]?.lineKey,
          quantity: 1,
        },
      ],
      diagnostic: { code: "DUPLICATE_GIFT_LINES", message: "Multiple tagged gift lines present" },
    };
  }

  const primary = giftLines[0];
  if (primary && primary.quantity > 1) {
    return {
      actions: [
        {
          type: "NORMALIZE_FREE_GIFT_QUANTITY",
          campaignId,
          lineKey: primary.lineKey,
          quantity: 1,
        },
      ],
      diagnostic: {
        code: "GIFT_QUANTITY_INVALID",
        message: "Tagged gift quantity must be 1",
      },
    };
  }

  if (eligible && !primary) {
    return {
      actions: [
        {
          type: "ADD_FREE_GIFT",
          campaignId,
          variantId,
          quantity: 1,
          properties: buildGiftProperties(campaignId),
        },
      ],
      diagnostic: { code: "GIFT_SHOULD_BE_ADDED" },
    };
  }

  if (!eligible && primary) {
    return {
      actions: [
        {
          type: "REMOVE_FREE_GIFT",
          campaignId,
          lineKeys: primary.lineKey ? [primary.lineKey] : undefined,
        },
      ],
      diagnostic: { code: "GIFT_SHOULD_BE_REMOVED" },
    };
  }

  if (eligible && primary) {
    return {
      actions: [{ type: "NO_ACTION" }],
      diagnostic: { code: "GIFT_ALREADY_PRESENT" },
    };
  }

  return {
    actions: [{ type: "NO_ACTION" }],
    diagnostic: { code: "THRESHOLD_NOT_MET" },
  };
}

export function evaluateFreeGift(input: EvaluationInput): PromotionEvaluationResult {
  const { campaign, cart, now } = input;
  const campaignId = String(campaign.id);
  const campaignType = campaign.type;

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

  const variantId = String(campaign.giftVariantId || "").trim();
  const threshold = Math.max(0, campaign.threshold ?? 0);
  const ruleType = campaign.ruleType || RULE_TYPES.SPEND_THRESHOLD;
  const useCentSpendParity =
    ruleType === RULE_TYPES.SPEND_THRESHOLD || ruleType === "CART_SUBTOTAL";

  const spendParity = useCentSpendParity
    ? buildSpendThresholdProgress(Math.max(0, cart.subtotal), threshold)
    : null;

  const ruleProgress =
    spendParity ??
    (() => {
      const evaluated = evaluateRuleProgress({
        campaign: {
          ruleType,
          threshold: threshold > 0 ? threshold : 0,
          triggerQuantity: 1,
          triggerProductIds: [],
          triggerCollectionIds: [],
        },
        cartSubtotal: Math.max(0, cart.subtotal),
        cartLines: cart.lines.map((line) => ({
          variantId: line.variantId,
          productId: line.productId,
          quantity: line.quantity,
          price: lineUnitPrice(line),
          collectionIds: line.collectionIds,
        })),
      });
      return {
        eligible: evaluated.eligible,
        metric: evaluated.metric,
        progress: buildProgress(evaluated.metric, threshold, evaluated.eligible),
      };
    })();

  if (!variantId || threshold <= 0) {
    const progress = threshold > 0 ? ruleProgress.progress : undefined;
    return {
      ...base,
      active: true,
      progress,
      presentation: {
        progress,
        widgetSettings: campaign.widgetSettings ?? undefined,
      },
      diagnostic: {
        code: "INVALID_CAMPAIGN_CONFIGURATION",
        message: !variantId ? "Missing giftVariantId" : "Invalid threshold",
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
      type: "FREE_GIFT",
      campaignId,
      productId: campaign.giftProductId,
      variantId,
      quantity: 1,
    },
  ];

  const giftLines = cart.lines.filter((line) => isCampaignGiftLine(line, campaignId));
  const { actions, diagnostic: actionDiagnostic } = resolveActions({
    campaignId,
    variantId,
    eligible,
    giftLines,
  });

  let diagnostic: PromotionDiagnostic = actionDiagnostic;
  if (eligible && actionDiagnostic.code === "GIFT_ALREADY_PRESENT") {
    diagnostic = { code: "ELIGIBLE", message: "Threshold met; gift already present" };
  } else if (eligible && actionDiagnostic.code === "GIFT_SHOULD_BE_ADDED") {
    diagnostic = { code: "GIFT_SHOULD_BE_ADDED" };
  } else if (!eligible && actionDiagnostic.code === "THRESHOLD_NOT_MET") {
    diagnostic = { code: "THRESHOLD_NOT_MET" };
  } else if (!eligible && actionDiagnostic.code === "GIFT_SHOULD_BE_REMOVED") {
    diagnostic = { code: "GIFT_SHOULD_BE_REMOVED" };
  }

  return {
    campaignId,
    campaignType,
    active: true,
    supported: true,
    eligible,
    diagnostic,
    progress,
    rewards,
    actions,
    presentation: {
      progress,
      widgetSettings: campaign.widgetSettings ?? undefined,
    },
  };
}

export const freeGiftEvaluator: CampaignEvaluator = {
  type: REGISTRY_TYPES.FREE_GIFT,
  evaluate: evaluateFreeGift,
};
