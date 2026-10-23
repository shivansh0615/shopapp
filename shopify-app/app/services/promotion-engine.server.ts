import type { Campaign } from "@prisma/client";
import { isFreeGiftCampaignType } from "./promotion-engine/campaign-types";
import { evaluateRuleProgress } from "./cart-rules.server";
import type { CartLineSnapshot } from "./cart-rules.server";
import {
  moneyToMajorNumber,
  resolveFixedDiscountMajor,
  resolveThresholdMajor,
  resolveTierThresholdMoney,
} from "../lib/money";

export type PromotionStatus = "LOCKED" | "UNLOCKED";

export const REWARD_TYPES = {
  FREE_GIFT: "FREE_GIFT",
  TIERED_FREE_GIFTS: "TIERED_FREE_GIFTS",
  PERCENTAGE_DISCOUNT: "PERCENTAGE_DISCOUNT",
  FIXED_DISCOUNT: "FIXED_DISCOUNT",
  BUY_X_GET_Y: "BUY_X_GET_Y",
  FREE_SHIPPING: "FREE_SHIPPING",
  /** Legacy placeholder — prefer PERCENTAGE_DISCOUNT / FIXED_DISCOUNT for live campaigns. */
  DISCOUNT: "DISCOUNT",
  TIERED_REWARD: "TIERED_REWARD",
  /** Unknown / not-yet-implemented campaign types (never coerced to FREE_GIFT). */
  UNSUPPORTED: "UNSUPPORTED",
} as const;

export type RewardType = (typeof REWARD_TYPES)[keyof typeof REWARD_TYPES];

export type ProgressResult = {
  progress: number;
  remaining: number;
  eligible: boolean;
};

export type WidgetSettings = {
  heading?: string;
  description?: string;
  unlockedHeading?: string;
  unlockedDescription?: string;
  template?: string;
  barColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  progressHeight?: number;
  widgetPadding?: number;
  buttonText?: string;
  cartProgressBar?: {
    enabled?: boolean;
    height?: number;
    borderRadius?: number;
    compact?: boolean;
    bannerTitle?: string;
  };
  cartRecommendations?: {
    enabled?: boolean;
    heading?: string;
    description?: string;
    products?: Array<{
      productId: string;
      variantId: string;
      title?: string;
      imageUrl?: string | null;
    }>;
    maxProducts?: number;
    buttonText?: string;
    backgroundColor?: string;
  };
  celebrationPopup?: Record<string, unknown>;
};

export type PromotionCampaignSnapshot = {
  id: number;
  name: string;
  campaignType: string;
  threshold: number;
  currencyCode?: string;
  status: string;
  giftProductId: string;
  giftProductTitle: string | null;
  giftProductImage: string | null;
  giftVariantId: string | null;
  giftQuantity: number;
  discountPercentage: number | null;
  fixedDiscountAmount: number | null;
  rewardTiers?: Array<{
    id: string;
    threshold: number;
    giftProductId: string | null;
    giftProductTitle: string | null;
    giftProductImage: string | null;
    giftVariantId: string;
    position: number;
  }>;
  ruleType: string;
  triggerQuantity: number;
  triggerProductIds: Campaign["triggerProductIds"];
  triggerCollectionIds: Campaign["triggerCollectionIds"];
  allowCustomerChoice: boolean;
  widgetSettings: WidgetSettings | null;
};

export type FreeGiftReward = {
  type: typeof REWARD_TYPES.FREE_GIFT;
  productId: string;
  title: string;
  image: string | null;
  quantity: number;
};

export type PercentageDiscountReward = {
  type: typeof REWARD_TYPES.PERCENTAGE_DISCOUNT;
  percentage: number;
};

export type FixedDiscountReward = {
  type: typeof REWARD_TYPES.FIXED_DISCOUNT;
  amount: number;
};

export type BuyXGetYReward = {
  type: typeof REWARD_TYPES.BUY_X_GET_Y;
};

export type FreeShippingReward = {
  type: typeof REWARD_TYPES.FREE_SHIPPING;
};

export type DiscountReward = {
  type: typeof REWARD_TYPES.DISCOUNT;
};

export type TieredRewardReward = {
  type: typeof REWARD_TYPES.TIERED_REWARD;
};

export type UnsupportedReward = {
  type: typeof REWARD_TYPES.UNSUPPORTED;
};

export type PromotionReward =
  | FreeGiftReward
  | PercentageDiscountReward
  | FixedDiscountReward
  | BuyXGetYReward
  | FreeShippingReward
  | DiscountReward
  | TieredRewardReward
  | UnsupportedReward;

export type PromotionEvaluation = {
  eligible: boolean;
  status: PromotionStatus;
  progress: number;
  remaining: number;
  rewardType: RewardType;
  reward: PromotionReward;
  campaign: PromotionCampaignSnapshot;
};

export type EvaluatePromotionInput = {
  campaign: PromotionCampaignSnapshot;
  cartSubtotal: number;
  currency: string;
  cartLines?: CartLineSnapshot[];
};

export type PromotionEligibilityOptions = {
  campaignStatus?: string;
};

const DEFAULT_CURRENCY = "₹";

export function normalizeCartSubtotal(cartSubtotal: number): number {
  if (!Number.isFinite(cartSubtotal)) return 0;
  return Math.max(0, cartSubtotal);
}

export function normalizeThreshold(threshold: number): number {
  if (!Number.isFinite(threshold) || threshold <= 0) return 0;
  return threshold;
}

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

export function parseWidgetSettings(value: unknown): WidgetSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as WidgetSettings;
}

export function toPromotionCampaignSnapshot(campaign: Campaign & {
  rewardTiers?: Array<{
    id: string;
    threshold: number;
    giftProductId: string | null;
    giftProductTitle?: string | null;
    giftProductImage?: string | null;
    giftVariantId: string;
    position: number;
  }>;
}): PromotionCampaignSnapshot {
  const currencyCode =
    "currencyCode" in campaign && typeof (campaign as { currencyCode?: string }).currencyCode === "string"
      ? (campaign as { currencyCode: string }).currencyCode
      : undefined;
  return {
    id: campaign.id,
    name: campaign.name,
    campaignType: campaign.campaignType,
    threshold: resolveThresholdMajor({
      threshold: campaign.threshold,
      thresholdMinor: (campaign as { thresholdMinor?: bigint | null }).thresholdMinor,
      currencyCode,
    }),
    currencyCode,
    status: campaign.status,
    giftProductId: campaign.giftProductId,
    giftProductTitle: campaign.giftProductTitle,
    giftProductImage: campaign.giftProductImage,
    giftVariantId: campaign.giftVariantId,
    giftQuantity: isFreeGiftCampaignType(campaign.campaignType) ? 1 : campaign.giftQuantity,
    discountPercentage:
      campaign.discountPercentage == null || !Number.isFinite(campaign.discountPercentage)
        ? null
        : campaign.discountPercentage,
    fixedDiscountAmount: resolveFixedDiscountMajor({
      threshold: campaign.threshold,
      fixedDiscountAmount: campaign.fixedDiscountAmount,
      fixedDiscountAmountMinor: (campaign as { fixedDiscountAmountMinor?: bigint | null })
        .fixedDiscountAmountMinor,
      currencyCode,
    }),
    rewardTiers: Array.isArray(campaign.rewardTiers)
      ? campaign.rewardTiers.map((tier) => ({
          id: String(tier.id),
          threshold: moneyToMajorNumber(
            resolveTierThresholdMoney(
              {
                threshold: tier.threshold,
                thresholdMinor: (tier as { thresholdMinor?: bigint | null }).thresholdMinor,
              },
              currencyCode,
            ),
          ),
          giftProductId: tier.giftProductId ?? null,
          giftProductTitle: tier.giftProductTitle ?? null,
          giftProductImage: tier.giftProductImage ?? null,
          giftVariantId: String(tier.giftVariantId),
          position: tier.position,
        }))
      : undefined,
    ruleType: campaign.ruleType,
    triggerQuantity: campaign.triggerQuantity,
    triggerProductIds: campaign.triggerProductIds,
    triggerCollectionIds: campaign.triggerCollectionIds,
    allowCustomerChoice: campaign.allowCustomerChoice,
    widgetSettings: parseWidgetSettings(campaign.widgetSettings),
  };
}

/**
 * Maps admin `campaignType` → reward type.
 * Canonical evaluators live in `./promotion-engine/` — see `evaluateWithRegistry`.
 */
export function resolveRewardType(campaignType: string): RewardType {
  switch (campaignType) {
    case "Spend X -> Free Gift":
      return REWARD_TYPES.FREE_GIFT;
    case "Tiered Free Gifts":
      return REWARD_TYPES.TIERED_FREE_GIFTS;
    case "Spend X -> Percentage Discount":
      return REWARD_TYPES.PERCENTAGE_DISCOUNT;
    case "Spend X -> Fixed Discount":
      return REWARD_TYPES.FIXED_DISCOUNT;
    case "Tiered Rewards":
      return REWARD_TYPES.TIERED_REWARD;
    case "Free Shipping + Gift":
      return REWARD_TYPES.FREE_SHIPPING;
    case "Buy X -> Get Y":
      return REWARD_TYPES.BUY_X_GET_Y;
    case "Mystery Gift":
    case "Spend X -> Discount":
    default:
      return REWARD_TYPES.UNSUPPORTED;
  }
}

export function buildFreeGiftReward(campaign: PromotionCampaignSnapshot): FreeGiftReward {
  return {
    type: REWARD_TYPES.FREE_GIFT,
    productId: campaign.giftProductId,
    title: campaign.giftProductTitle ?? "Free Gift",
    image: campaign.giftProductImage,
    quantity: campaign.giftQuantity,
  };
}

export function buildPercentageDiscountReward(
  campaign: PromotionCampaignSnapshot,
): PercentageDiscountReward {
  const raw = campaign.discountPercentage;
  const percentage =
    raw != null && Number.isFinite(raw) ? Math.max(1, Math.min(100, Math.trunc(raw))) : 10;
  return {
    type: REWARD_TYPES.PERCENTAGE_DISCOUNT,
    percentage,
  };
}

export function buildFixedDiscountReward(
  campaign: PromotionCampaignSnapshot,
): FixedDiscountReward {
  const raw = campaign.fixedDiscountAmount;
  const amount = raw != null && Number.isFinite(raw) && raw > 0 ? raw : 100;
  return {
    type: REWARD_TYPES.FIXED_DISCOUNT,
    amount,
  };
}

export function buildPromotionReward(
  rewardType: RewardType,
  campaign: PromotionCampaignSnapshot,
): PromotionReward {
  switch (rewardType) {
    case REWARD_TYPES.BUY_X_GET_Y:
      return { type: REWARD_TYPES.BUY_X_GET_Y };
    case REWARD_TYPES.FREE_SHIPPING:
      return { type: REWARD_TYPES.FREE_SHIPPING };
    case REWARD_TYPES.DISCOUNT:
      return { type: REWARD_TYPES.DISCOUNT };
    case REWARD_TYPES.PERCENTAGE_DISCOUNT:
      return buildPercentageDiscountReward(campaign);
    case REWARD_TYPES.FIXED_DISCOUNT:
      return buildFixedDiscountReward(campaign);
    case REWARD_TYPES.TIERED_FREE_GIFTS:
      return { type: REWARD_TYPES.TIERED_REWARD };
    case REWARD_TYPES.TIERED_REWARD:
      return { type: REWARD_TYPES.TIERED_REWARD };
    case REWARD_TYPES.UNSUPPORTED:
      return { type: REWARD_TYPES.UNSUPPORTED };
    case REWARD_TYPES.FREE_GIFT:
      return buildFreeGiftReward(campaign);
    default:
      return { type: REWARD_TYPES.UNSUPPORTED };
  }
}

export function formatCurrencyAmount(amount: number, _currency = DEFAULT_CURRENCY): string {
  const n = Math.max(0, Number(amount) || 0);
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return rounded.toFixed(2);
}

export function calculateProgress(cartSubtotal: number, threshold: number): ProgressResult {
  const subtotal = normalizeCartSubtotal(cartSubtotal);
  const effectiveThreshold = normalizeThreshold(threshold);

  if (effectiveThreshold === 0) {
    return { progress: 0, remaining: 0, eligible: false };
  }

  const remaining = Math.max(effectiveThreshold - subtotal, 0);
  const progress = clampProgress((subtotal / effectiveThreshold) * 100);
  const eligible = Math.round(subtotal * 100) >= Math.round(effectiveThreshold * 100);

  return { progress, remaining, eligible };
}

export function getRemainingAmount(cartSubtotal: number, threshold: number): number {
  return calculateProgress(cartSubtotal, threshold).remaining;
}

export function isPromotionEligible(
  cartSubtotal: number,
  threshold: number,
  options: PromotionEligibilityOptions = {},
): boolean {
  const { eligible } = calculateProgress(cartSubtotal, threshold);
  if (!eligible) return false;

  if (options.campaignStatus !== undefined && options.campaignStatus !== "ACTIVE") {
    return false;
  }

  return true;
}

export function getPromotionStatus(
  cartSubtotal: number,
  threshold: number,
  options: PromotionEligibilityOptions = {},
): PromotionStatus {
  return isPromotionEligible(cartSubtotal, threshold, options) ? "UNLOCKED" : "LOCKED";
}

export function buildLockedHeading(
  remaining: number,
  currency = DEFAULT_CURRENCY,
): string {
  return `You are ${formatCurrencyAmount(remaining, currency)} away from your free gift`;
}

export function buildUnlockedHeading(): string {
  return "You've unlocked your free gift!";
}

export function buildLockedDescription(remaining: number, currency = DEFAULT_CURRENCY): string {
  return `Add ${formatCurrencyAmount(remaining, currency)} more to unlock your free gift.`;
}

export function buildUnlockedDescription(rewardTitle: string): string {
  void rewardTitle;
  return "You've unlocked your free gift!";
}

export function getRewardTitle(reward: PromotionReward): string {
  if (reward.type === REWARD_TYPES.FREE_GIFT) {
    return reward.title;
  }
  if (reward.type === REWARD_TYPES.PERCENTAGE_DISCOUNT) {
    return `${reward.percentage}% discount`;
  }
  if (reward.type === REWARD_TYPES.FIXED_DISCOUNT) {
    return `${formatCurrencyAmount(reward.amount)} off`;
  }

  switch (reward.type) {
    case REWARD_TYPES.BUY_X_GET_Y:
      return "Buy X Get Y offer";
    case REWARD_TYPES.FREE_SHIPPING:
      return "Free shipping";
    case REWARD_TYPES.DISCOUNT:
      return "Discount reward";
    case REWARD_TYPES.TIERED_REWARD:
      return "Tiered reward";
    case REWARD_TYPES.UNSUPPORTED:
      return "Unsupported promotion";
    default:
      return "Promotion reward";
  }
}

function isNonGiftDiscountCampaign(campaign: PromotionCampaignSnapshot): boolean {
  const type = resolveRewardType(campaign.campaignType);
  return type === REWARD_TYPES.PERCENTAGE_DISCOUNT || type === REWARD_TYPES.FIXED_DISCOUNT;
}

export function buildHeading(input: {
  remaining: number;
  status: PromotionStatus;
  campaign: PromotionCampaignSnapshot;
  currency?: string;
}): string {
  const { remaining, status, campaign, currency = DEFAULT_CURRENCY } = input;
  const settings = campaign.widgetSettings;
  const customHeading =
    status === "UNLOCKED"
      ? settings?.unlockedHeading?.trim()
      : settings?.heading?.trim();

  if (customHeading) {
    return customHeading.replace(/\{remaining\}/gi, formatCurrencyAmount(remaining, currency));
  }

  if (isNonGiftDiscountCampaign(campaign)) {
    if (status === "UNLOCKED") {
      return "You've unlocked your discount!";
    }
    return `You are ${formatCurrencyAmount(remaining, currency)} away from your discount`;
  }

  if (status === "UNLOCKED") {
    return buildUnlockedHeading();
  }

  return buildLockedHeading(remaining, currency);
}

export function buildDescription(input: {
  status: PromotionStatus;
  campaign: PromotionCampaignSnapshot;
  rewardTitle: string;
  remaining?: number;
  currency?: string;
}): string {
  const { status, campaign, rewardTitle, remaining = 0, currency = DEFAULT_CURRENCY } = input;
  const settings = campaign.widgetSettings;
  const customDescription =
    status === "UNLOCKED"
      ? settings?.unlockedDescription?.trim()
      : settings?.description?.trim();

  if (customDescription) {
    return customDescription.replace(/\{remaining\}/gi, formatCurrencyAmount(remaining, currency));
  }

  if (isNonGiftDiscountCampaign(campaign)) {
    if (status === "UNLOCKED") {
      return `You've unlocked ${rewardTitle}!`;
    }
    return `Add ${formatCurrencyAmount(remaining, currency)} more to unlock ${rewardTitle}.`;
  }

  return status === "UNLOCKED"
    ? buildUnlockedDescription(rewardTitle)
    : buildLockedDescription(remaining, currency);
}

/**
 * Legacy evaluation entry used by gift-engine + App Proxy routes (unchanged JSON contracts).
 *
 * Canonical Free Gift evaluation with typed actions/diagnostics lives in
 * `./promotion-engine/evaluate.ts` (`evaluateWithRegistry`). Phase 2C will adapt
 * routes onto that result; Phase 2B keeps this signature and progress semantics.
 *
 * Unsupported campaign types no longer unlock as FREE_GIFT.
 */
export function evaluatePromotion(input: EvaluatePromotionInput): PromotionEvaluation {
  const { campaign, cartSubtotal, cartLines } = input;
  const { progress, remaining, eligible } = evaluateRuleProgress({
    campaign: {
      ruleType: campaign.ruleType,
      threshold: campaign.threshold,
      triggerQuantity: campaign.triggerQuantity,
      triggerProductIds: campaign.triggerProductIds,
      triggerCollectionIds: campaign.triggerCollectionIds,
    },
    cartSubtotal,
    cartLines,
  });
  const rewardType = resolveRewardType(campaign.campaignType);
  const reward = buildPromotionReward(rewardType, campaign);
  const canUnlock = rewardType !== REWARD_TYPES.UNSUPPORTED;
  const status =
    eligible && campaign.status === "ACTIVE" && canUnlock ? "UNLOCKED" : "LOCKED";
  const effectiveEligible = eligible && status === "UNLOCKED";

  return {
    eligible: effectiveEligible,
    status,
    progress,
    remaining,
    rewardType,
    reward,
    campaign,
  };
}
