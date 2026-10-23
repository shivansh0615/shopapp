/**
 * Campaign type → registry key mapping.
 *
 * Supported live evaluators:
 * - "Spend X -> Free Gift" → FREE_GIFT
 * - "Tiered Free Gifts" → TIERED_FREE_GIFTS
 * - "Spend X -> Percentage Discount" → PERCENTAGE_DISCOUNT (runtime; merchant-hidden)
 * - "Spend X -> Fixed Discount" → FIXED_DISCOUNT (runtime; merchant-hidden)
 *
 * Do not silently coerce Mystery Gift / unknown types to FREE_GIFT.
 *
 * Merchant visibility is defined separately in `app/lib/merchant-campaign-types.ts`.
 */

export const LIVE_FREE_GIFT_CAMPAIGN_TYPE = "Spend X -> Free Gift" as const;
export const LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE = "Tiered Free Gifts" as const;
export const LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE =
  "Spend X -> Percentage Discount" as const;
export const LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE = "Spend X -> Fixed Discount" as const;

export const REGISTRY_TYPES = {
  FREE_GIFT: "FREE_GIFT",
  TIERED_FREE_GIFTS: "TIERED_FREE_GIFTS",
  PERCENTAGE_DISCOUNT: "PERCENTAGE_DISCOUNT",
  FIXED_DISCOUNT: "FIXED_DISCOUNT",
} as const;

export type RegistryCampaignType = (typeof REGISTRY_TYPES)[keyof typeof REGISTRY_TYPES];

/** Maps admin campaignType string → registry key, or null if unsupported. */
export function resolveRegistryCampaignType(
  campaignType: string,
): RegistryCampaignType | null {
  if (campaignType === LIVE_FREE_GIFT_CAMPAIGN_TYPE) {
    return REGISTRY_TYPES.FREE_GIFT;
  }
  if (campaignType === LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE) {
    return REGISTRY_TYPES.TIERED_FREE_GIFTS;
  }
  if (campaignType === LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE) {
    return REGISTRY_TYPES.PERCENTAGE_DISCOUNT;
  }
  if (campaignType === LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE) {
    return REGISTRY_TYPES.FIXED_DISCOUNT;
  }
  return null;
}

export function isSupportedCampaignType(campaignType: string): boolean {
  return resolveRegistryCampaignType(campaignType) !== null;
}

export function isFreeGiftCampaignType(campaignType: string): boolean {
  return resolveRegistryCampaignType(campaignType) === REGISTRY_TYPES.FREE_GIFT;
}

export function isTieredFreeGiftsCampaignType(campaignType: string): boolean {
  return resolveRegistryCampaignType(campaignType) === REGISTRY_TYPES.TIERED_FREE_GIFTS;
}

export function isPercentageDiscountCampaignType(campaignType: string): boolean {
  return resolveRegistryCampaignType(campaignType) === REGISTRY_TYPES.PERCENTAGE_DISCOUNT;
}

export function isFixedDiscountCampaignType(campaignType: string): boolean {
  return resolveRegistryCampaignType(campaignType) === REGISTRY_TYPES.FIXED_DISCOUNT;
}
