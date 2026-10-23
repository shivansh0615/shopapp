/**
 * Phase 2C / 3A / Tiered — App Proxy compatibility adapters.
 *
 * Canonical `PromotionEvaluationResult` → existing storefront JSON contracts.
 * Additive fields for Tiered Free Gifts: unlockedGifts, nextTier.
 */

import type { AppSettings, Campaign, GiftOption } from "@prisma/client";
import { proxyDisabledPayload } from "../../lib/proxy-route.server";
import {
  buildDescription,
  buildHeading,
  getRewardTitle,
  REWARD_TYPES,
  type PromotionCampaignSnapshot,
  type PromotionStatus,
} from "../promotion-engine.server";
import {
  mergeWidgetSettings,
  resolveWidgetColors,
  type WidgetColors,
} from "../widget-presentation.server";
import type { WidgetSettings } from "../gift-engine.server";
import type { StorefrontWidgetStateResponse } from "../../lib/storefront-contract";
import type { SubtotalSource } from "./resolve-subtotal";
import type {
  PromotionEvaluationResult,
  PromotionReward,
  TieredFreeGiftsReward,
  TieredNextTier,
  TieredUnlockedGift,
} from "./types";

export type EvaluateCartAction = "ADD_GIFT" | "REMOVE_GIFT" | "NONE";

export type PublicUnlockedGift = {
  tierId: string;
  threshold: number;
  productId?: string;
  variantId: string;
  quantity: 1;
};

export type PublicNextTier = {
  tierId: string;
  threshold: number;
  remaining: number;
  productId?: string;
  variantId: string;
} | null;

export type PublicRewardTier = {
  tierId: string;
  threshold: number;
  position: number;
  productId?: string;
  variantId?: string;
};

export type EvaluateCartResponse = {
  enabled: boolean;
  eligible: boolean;
  action: EvaluateCartAction;
  threshold: number | null;
  progress: number;
  remaining: number;
  /** Paid eligible subtotal used for evaluation (tiered milestone fill). */
  cartSubtotal?: number;
  rewardType: string | null;
  gift: {
    productId: string;
    variantId: string | null;
    title: string;
    image: string | null;
  } | null;
  giftOptions?: GiftOption[];
  maxGiftQuantity?: number;
  allowCustomerChoice?: boolean;
  unlockedGifts?: PublicUnlockedGift[];
  nextTier?: PublicNextTier;
  /** All configured tiers (ordered) for multi-milestone drawer UI. */
  rewardTiers?: PublicRewardTier[];
  campaign: { id: number; name: string } | null;
  heading?: string;
  description?: string;
  colors?: WidgetColors;
  widgetSettings?: WidgetSettings;
  autoAddGift?: boolean;
  currency?: string;
};

export type RouteAdapterContext = {
  campaign: Campaign;
  snapshot: PromotionCampaignSnapshot;
  settings: AppSettings;
  currency?: string;
  giftOptions?: GiftOption[];
  /** Internal only — omitted from public JSON unless includeDiagnostics. */
  subtotalSource?: SubtotalSource;
  includeDiagnostics?: boolean;
};

function statusFromResult(result: PromotionEvaluationResult): PromotionStatus {
  return result.eligible ? "UNLOCKED" : "LOCKED";
}

function progressPercent(result: PromotionEvaluationResult): number {
  return result.progress?.percentage ?? 0;
}

function remainingAmount(result: PromotionEvaluationResult): number {
  return result.progress?.remaining ?? 0;
}

function primaryReward(result: PromotionEvaluationResult): PromotionReward | null {
  return result.rewards[0] ?? null;
}

function asTieredReward(result: PromotionEvaluationResult): TieredFreeGiftsReward | null {
  const reward = primaryReward(result);
  return reward?.type === "TIERED_FREE_GIFTS" ? reward : null;
}

function publicRewardType(result: PromotionEvaluationResult): string {
  const reward = primaryReward(result);
  if (reward?.type === "PERCENTAGE_DISCOUNT") return REWARD_TYPES.PERCENTAGE_DISCOUNT;
  if (reward?.type === "FIXED_DISCOUNT") return REWARD_TYPES.FIXED_DISCOUNT;
  if (reward?.type === "TIERED_FREE_GIFTS") return REWARD_TYPES.TIERED_FREE_GIFTS;
  if (reward?.type === "FREE_GIFT") return REWARD_TYPES.FREE_GIFT;
  return REWARD_TYPES.FREE_GIFT;
}

function isNonGiftReward(result: PromotionEvaluationResult): boolean {
  const type = publicRewardType(result);
  return (
    type === REWARD_TYPES.PERCENTAGE_DISCOUNT || type === REWARD_TYPES.FIXED_DISCOUNT
  );
}

function mapUnlockedGifts(gifts: TieredUnlockedGift[]): PublicUnlockedGift[] {
  return gifts.map((g) => ({
    tierId: g.tierId,
    threshold: g.threshold,
    productId: g.productId,
    variantId: g.variantId,
    quantity: 1 as const,
  }));
}

function mapNextTier(next: TieredNextTier | null | undefined): PublicNextTier {
  if (!next) return null;
  return {
    tierId: next.tierId,
    threshold: next.threshold,
    remaining: next.remaining,
    productId: next.productId,
    variantId: next.variantId,
  };
}

function mapRewardTiers(snapshot: PromotionCampaignSnapshot): PublicRewardTier[] | undefined {
  const raw = Array.isArray(snapshot.rewardTiers) ? snapshot.rewardTiers : [];
  if (!raw.length) return undefined;
  return [...raw]
    .filter((t) => t && Number(t.threshold) > 0)
    .sort((a, b) => a.position - b.position || a.threshold - b.threshold)
    .map((t) => ({
      tierId: String(t.id),
      threshold: Number(t.threshold),
      position: Number(t.position) || 0,
      productId: t.giftProductId ? String(t.giftProductId) : undefined,
      variantId: t.giftVariantId ? String(t.giftVariantId) : undefined,
    }));
}

function rewardTitleForAdapter(
  result: PromotionEvaluationResult,
  snapshot: PromotionCampaignSnapshot,
): string {
  const reward = primaryReward(result);
  if (reward?.type === "PERCENTAGE_DISCOUNT") {
    return getRewardTitle({
      type: REWARD_TYPES.PERCENTAGE_DISCOUNT,
      percentage: reward.percentage,
    });
  }
  if (reward?.type === "FIXED_DISCOUNT") {
    return getRewardTitle({
      type: REWARD_TYPES.FIXED_DISCOUNT,
      amount: reward.amount,
    });
  }
  if (reward?.type === "TIERED_FREE_GIFTS") {
    const n = reward.unlockedGifts.length;
    return n > 0 ? `${n} tier gift${n === 1 ? "" : "s"}` : "Tiered free gifts";
  }
  return getRewardTitle({
    type: REWARD_TYPES.FREE_GIFT,
    productId: snapshot.giftProductId,
    title: snapshot.giftProductTitle ?? "Free Gift",
    image: snapshot.giftProductImage,
    quantity: snapshot.giftQuantity,
  });
}

/**
 * Tiered progress copy uses merchant widgetSettings (same path as Free Gift).
 * While a next tier remains, treat status as LOCKED so heading/description with
 * {remaining} target the next unlock. When all tiers unlock → UNLOCKED templates.
 */
function tieredPresentationStatus(result: PromotionEvaluationResult): PromotionStatus {
  const tiered = asTieredReward(result);
  if (!tiered) return statusFromResult(result);
  // Still progressing toward a higher tier.
  if (tiered.nextTier) return "LOCKED";
  // nextTier null with zero unlocks = empty/invalid tiers — never show "all unlocked".
  if (!tiered.unlockedGifts.length) return "LOCKED";
  return "UNLOCKED";
}

/**
 * Legacy evaluate-cart action contract:
 * - Free Gift: eligible → ADD_GIFT, else → REMOVE_GIFT
 * - Tiered Free Gifts: NONE (storefront uses unlockedGifts sync)
 * - Percentage / Fixed Discount: always NONE
 */
export function toLegacyEvaluateCartAction(
  result: PromotionEvaluationResult,
): EvaluateCartAction {
  if (!result.supported || !result.active) return "NONE";
  const reward = primaryReward(result);
  if (
    reward?.type === "PERCENTAGE_DISCOUNT" ||
    reward?.type === "FIXED_DISCOUNT" ||
    reward?.type === "TIERED_FREE_GIFTS"
  ) {
    return "NONE";
  }
  return result.eligible ? "ADD_GIFT" : "REMOVE_GIFT";
}

function shouldReturnDisabled(result: PromotionEvaluationResult): boolean {
  if (!result.supported) return true;
  if (result.diagnostic.code === "NO_ACTIVE_CAMPAIGN") return true;
  if (result.diagnostic.code === "UNSUPPORTED_CAMPAIGN_TYPE") return true;
  return false;
}

export function toWidgetStateResponse(
  result: PromotionEvaluationResult,
  context: RouteAdapterContext,
): StorefrontWidgetStateResponse {
  if (shouldReturnDisabled(result)) {
    return proxyDisabledPayload("widget-state");
  }

  const { snapshot, settings, currency } = context;
  const widgetSettings = mergeWidgetSettings(snapshot.widgetSettings, settings);
  const campaignWithWidget = { ...snapshot, widgetSettings };
  const remaining = remainingAmount(result);
  const progress = progressPercent(result);
  const rewardType = publicRewardType(result);
  const isNonGift = isNonGiftReward(result);
  const tiered = asTieredReward(result);
  const status = tiered ? tieredPresentationStatus(result) : statusFromResult(result);

  const heading = buildHeading({
    remaining,
    status,
    campaign: campaignWithWidget,
    currency: currency || undefined,
  });
  const description = buildDescription({
    status,
    campaign: campaignWithWidget,
    rewardTitle: rewardTitleForAdapter(result, snapshot),
    remaining,
    currency: currency || undefined,
  });

  const response: StorefrontWidgetStateResponse = {
    enabled: true,
    campaignId: snapshot.id,
    placements: Array.isArray(context.campaign.placements) ? context.campaign.placements.filter((value): value is string => typeof value === "string") : [],
    threshold: tiered?.nextTier?.threshold ?? snapshot.threshold,
    heading,
    description,
    progress,
    remaining,
    eligible: result.eligible,
    cartSubtotal: result.progress?.current ?? 0,
    rewardType,
    gift: isNonGift || tiered
      ? null
      : {
          productId: snapshot.giftProductId,
          variantId: snapshot.giftVariantId ?? null,
          title: snapshot.giftProductTitle ?? "Free Gift",
          image: snapshot.giftProductImage,
          quantity: 1,
        },
    unlockedGifts: tiered ? mapUnlockedGifts(tiered.unlockedGifts) : undefined,
    nextTier: tiered ? mapNextTier(tiered.nextTier) : undefined,
    rewardTiers: tiered ? mapRewardTiers(snapshot) : undefined,
    colors: resolveWidgetColors(widgetSettings, settings),
    widgetSettings,
    template: widgetSettings.template ?? settings.defaultWidgetTemplate,
    autoAddGift: isNonGift ? false : settings.autoAddGift,
    currency: currency || snapshot.currencyCode,
  };

  return response;
}

export function toEvaluateCartResponse(
  result: PromotionEvaluationResult,
  context: RouteAdapterContext,
): EvaluateCartResponse {
  if (shouldReturnDisabled(result)) {
    return proxyDisabledPayload("evaluate-cart");
  }

  const { snapshot, settings, currency, giftOptions = [] } = context;
  const widgetSettings = mergeWidgetSettings(snapshot.widgetSettings, settings);
  const campaignWithWidget = { ...snapshot, widgetSettings };
  const remaining = remainingAmount(result);
  const progress = progressPercent(result);
  const action = toLegacyEvaluateCartAction(result);
  const rewardType = publicRewardType(result);
  const isNonGift = isNonGiftReward(result);
  const tiered = asTieredReward(result);
  const status = tiered ? tieredPresentationStatus(result) : statusFromResult(result);

  const heading = buildHeading({
    remaining,
    status,
    campaign: campaignWithWidget,
    currency: currency || undefined,
  });
  const description = buildDescription({
    status,
    campaign: campaignWithWidget,
    rewardTitle: rewardTitleForAdapter(result, snapshot),
    remaining,
    currency: currency || undefined,
  });

  return {
    enabled: true,
    eligible: result.eligible,
    action,
    threshold: tiered?.nextTier?.threshold ?? snapshot.threshold,
    progress,
    remaining,
    cartSubtotal: result.progress?.current ?? 0,
    rewardType,
    gift: isNonGift || tiered
      ? null
      : {
          productId: snapshot.giftProductId,
          variantId: snapshot.giftVariantId,
          title: snapshot.giftProductTitle ?? "Free Gift",
          image: snapshot.giftProductImage,
        },
    giftOptions: isNonGift || tiered ? [] : snapshot.allowCustomerChoice ? giftOptions : [],
    maxGiftQuantity: isNonGift || tiered ? undefined : snapshot.giftQuantity,
    allowCustomerChoice: isNonGift || tiered ? false : snapshot.allowCustomerChoice,
    unlockedGifts: tiered ? mapUnlockedGifts(tiered.unlockedGifts) : undefined,
    nextTier: tiered ? mapNextTier(tiered.nextTier) : undefined,
    rewardTiers: tiered ? mapRewardTiers(snapshot) : undefined,
    campaign: {
      id: snapshot.id,
      name: snapshot.name,
    },
    heading,
    description,
    colors: resolveWidgetColors(widgetSettings, settings),
    widgetSettings,
    autoAddGift: isNonGift ? false : settings.autoAddGift,
    currency: currency || snapshot.currencyCode,
  };
}
