/**
 * Helpers to build EvaluationInput / CanonicalCampaign from legacy snapshots.
 */

import type { PromotionCampaignSnapshot } from "../promotion-engine.server";
import {
  isFixedDiscountCampaignType,
  isFreeGiftCampaignType,
  isPercentageDiscountCampaignType,
  isTieredFreeGiftsCampaignType,
} from "./campaign-types";
import type {
  CanonicalCampaign,
  CanonicalCart,
  CanonicalCartLine,
  CanonicalRewardTier,
  EvaluationInput,
  PromotionReward,
} from "./types";

function mapSnapshotTiers(
  snapshot: PromotionCampaignSnapshot,
): CanonicalRewardTier[] | undefined {
  if (!Array.isArray(snapshot.rewardTiers) || !snapshot.rewardTiers.length) return undefined;
  return snapshot.rewardTiers.map((tier) => ({
    id: String(tier.id),
    threshold: tier.threshold,
    giftProductId: tier.giftProductId,
    giftVariantId: tier.giftVariantId,
    position: tier.position,
  }));
}

function buildCanonicalRewards(snapshot: PromotionCampaignSnapshot): PromotionReward[] {
  const campaignId = String(snapshot.id);

  if (isPercentageDiscountCampaignType(snapshot.campaignType)) {
    const percentage = snapshot.discountPercentage;
    if (
      percentage == null ||
      !Number.isFinite(percentage) ||
      percentage < 1 ||
      percentage > 100
    ) {
      return [];
    }
    return [
      {
        type: "PERCENTAGE_DISCOUNT",
        campaignId,
        percentage: Math.trunc(percentage),
      },
    ];
  }

  if (isFixedDiscountCampaignType(snapshot.campaignType)) {
    const amount = snapshot.fixedDiscountAmount;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) {
      return [];
    }
    return [
      {
        type: "FIXED_DISCOUNT",
        campaignId,
        amount,
      },
    ];
  }

  if (isTieredFreeGiftsCampaignType(snapshot.campaignType)) {
    return [
      {
        type: "TIERED_FREE_GIFTS",
        campaignId,
        unlockedGifts: [],
        nextTier: null,
      },
    ];
  }

  if (isFreeGiftCampaignType(snapshot.campaignType) && snapshot.giftVariantId) {
    return [
      {
        type: "FREE_GIFT",
        campaignId,
        productId: snapshot.giftProductId,
        variantId: snapshot.giftVariantId,
        quantity: 1,
      },
    ];
  }

  return [];
}

export function toCanonicalCampaign(
  snapshot: PromotionCampaignSnapshot,
  options: {
    startDate?: Date | null;
    endDate?: Date | null;
    priority?: number;
  } = {},
): CanonicalCampaign {
  return {
    id: String(snapshot.id),
    type: snapshot.campaignType,
    status: snapshot.status,
    priority: options.priority,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    rules: [
      {
        type: "CART_SUBTOTAL",
        minimumAmount: snapshot.threshold,
      },
    ],
    rewards: buildCanonicalRewards(snapshot),
    threshold: snapshot.threshold,
    giftVariantId: snapshot.giftVariantId,
    giftProductId: snapshot.giftProductId,
    giftQuantity: snapshot.giftQuantity,
    discountPercentage: snapshot.discountPercentage ?? null,
    fixedDiscountAmount: snapshot.fixedDiscountAmount ?? null,
    rewardTiers: mapSnapshotTiers(snapshot),
    ruleType: snapshot.ruleType,
    widgetSettings: snapshot.widgetSettings,
  };
}

export function toEvaluationInput(input: {
  campaign: PromotionCampaignSnapshot;
  cartSubtotal: number;
  lines?: CanonicalCartLine[];
  now?: Date;
  startDate?: Date | null;
  endDate?: Date | null;
  priority?: number;
  currencyCode?: string;
}): EvaluationInput {
  const cart: CanonicalCart = {
    subtotal: Math.max(0, input.cartSubtotal),
    currencyCode: input.currencyCode,
    lines: input.lines ?? [],
  };

  return {
    campaign: toCanonicalCampaign(input.campaign, {
      startDate: input.startDate,
      endDate: input.endDate,
      priority: input.priority,
    }),
    cart,
    now: input.now ?? new Date(),
  };
}
