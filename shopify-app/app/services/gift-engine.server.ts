/**
 * Compatibility wrapper over the Promotion Engine.
 *
 * Canonical Free Gift evaluation / registry live in `./promotion-engine/`.
 * This module must remain a thin adapter for gift-shaped widget state —
 * do not re-implement threshold or gift-action logic here.
 */
import type { Campaign } from "@prisma/client";
import {
  buildDescription,
  buildHeading,
  buildLockedDescription,
  buildLockedHeading,
  buildUnlockedDescription,
  buildUnlockedHeading,
  evaluatePromotion,
  type FreeGiftReward,
  type PromotionCampaignSnapshot,
  type PromotionReward,
  type PromotionStatus,
  type ProgressResult,
  type WidgetSettings,
  REWARD_TYPES,
  calculateProgress,
  formatCurrencyAmount,
  getRemainingAmount,
  parseWidgetSettings,
  toPromotionCampaignSnapshot,
} from "./promotion-engine.server";

export type GiftStatus = PromotionStatus;

export type GiftProduct = {
  id: string;
  title: string;
  image: string | null;
  quantity: number;
};

export type GiftCampaignSnapshot = PromotionCampaignSnapshot;

export type GiftState = {
  heading: string;
  description: string;
  progress: number;
  remaining: number;
  eligible: boolean;
  status: GiftStatus;
  gift: GiftProduct;
  campaign: GiftCampaignSnapshot;
};

export type BuildGiftStateInput = {
  cartSubtotal: number;
  campaign: GiftCampaignSnapshot;
  currencySymbol?: string;
};

export {
  REWARD_TYPES,
  buildDescription,
  buildHeading,
  buildLockedDescription,
  buildLockedHeading,
  buildUnlockedDescription,
  buildUnlockedHeading,
  calculateProgress,
  formatCurrencyAmount,
  getRemainingAmount,
  parseWidgetSettings,
  type ProgressResult,
  type WidgetSettings,
};

export function toGiftCampaignSnapshot(campaign: Campaign): GiftCampaignSnapshot {
  return toPromotionCampaignSnapshot(campaign);
}

function freeGiftRewardToGiftProduct(reward: FreeGiftReward): GiftProduct {
  return {
    id: reward.productId,
    title: reward.title,
    image: reward.image,
    quantity: reward.quantity,
  };
}

function promotionRewardToGiftProduct(reward: PromotionReward): GiftProduct {
  if (reward.type === REWARD_TYPES.FREE_GIFT) {
    return freeGiftRewardToGiftProduct(reward);
  }

  return {
    id: "",
    title: "Free Gift",
    image: null,
    quantity: 1,
  };
}

export function buildGiftState(input: BuildGiftStateInput): GiftState {
  const { cartSubtotal, campaign, currencySymbol } = input;
  const evaluation = evaluatePromotion({
    campaign,
    cartSubtotal,
    currency: currencySymbol ?? "₹",
  });

  const gift = promotionRewardToGiftProduct(evaluation.reward);
  const rewardTitle = gift.title;

  return {
    heading: buildHeading({
      remaining: evaluation.remaining,
      status: evaluation.status,
      campaign: evaluation.campaign,
      currency: currencySymbol,
    }),
    description: buildDescription({
      status: evaluation.status,
      campaign: evaluation.campaign,
      rewardTitle,
      remaining: evaluation.remaining,
      currency: currencySymbol,
    }),
    progress: evaluation.progress,
    remaining: evaluation.remaining,
    eligible: evaluation.eligible,
    status: evaluation.status,
    gift,
    campaign: evaluation.campaign,
  };
}

export type { EvaluatePromotionInput, PromotionCampaignSnapshot, PromotionEvaluation, PromotionReward, PromotionStatus, RewardType } from "./promotion-engine.server";
export { evaluatePromotion } from "./promotion-engine.server";
