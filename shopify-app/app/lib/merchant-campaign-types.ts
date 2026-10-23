/**
 * Authoritative merchant-facing campaign type availability.
 *
 * Runtime-supported types (registry) ≠ merchant-visible types.
 * Percentage / Fixed Discount stay runtime-supported for existing campaigns
 * and tests, but are hidden from create/selector UIs.
 *
 * Edit behavior for hidden types:
 * - Existing Percentage / Fixed campaigns remain readable and editable.
 * - Their type is preserved unless the merchant explicitly switches to a
 *   merchant-creatable type (Tiered Free Gifts or Spend X → Free Gift).
 * - Reward fields for the preserved type stay intact (no silent wipe).
 * - Form controls for the preserved type remain available on edit.
 * - Merchants cannot create new hidden types or switch an existing campaign
 *   *to* a hidden type via crafted form posts (server rejects).
 */

import {
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
} from "../services/promotion-engine/campaign-types";

/** Types merchants may create or switch into. */
export const MERCHANT_CREATABLE_CAMPAIGN_TYPES = [
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
] as const;

export type MerchantCreatableCampaignType =
  (typeof MERCHANT_CREATABLE_CAMPAIGN_TYPES)[number];

/** Types shown in the selector. Unfinished types stay off this list. */
export const MERCHANT_VISIBLE_CAMPAIGN_TYPES = [
  ...MERCHANT_CREATABLE_CAMPAIGN_TYPES,
] as const;

export type MerchantVisibleCampaignType =
  (typeof MERCHANT_VISIBLE_CAMPAIGN_TYPES)[number];

/** Runtime-supported but merchant-hidden (backward compatible). */
export const MERCHANT_HIDDEN_RUNTIME_CAMPAIGN_TYPES = [
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
] as const;

export type PromotionTypeOption = {
  title: string;
  description: string;
  /** Creatable / selectable for new campaigns. */
  available: boolean;
  /** Existing campaign type preserved on edit but not creatable. */
  legacyPreserved?: boolean;
};

const OPTION_META: Record<string, { description: string }> = {
  [LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE]: {
    description: "Unlock cumulative free gifts as cart spend climbs across tiers.",
  },
  [LIVE_FREE_GIFT_CAMPAIGN_TYPE]: {
    description: "Unlock a free gift when cart spend reaches a threshold.",
  },
  [LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE]: {
    description: "Unlock a percentage off when cart spend reaches a threshold.",
  },
  [LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE]: {
    description: "Unlock a fixed amount off when cart spend reaches a threshold.",
  },
};

export function isMerchantCreatableCampaignType(campaignType: string): boolean {
  return (MERCHANT_CREATABLE_CAMPAIGN_TYPES as readonly string[]).includes(campaignType);
}

export function isMerchantHiddenRuntimeCampaignType(campaignType: string): boolean {
  return (MERCHANT_HIDDEN_RUNTIME_CAMPAIGN_TYPES as readonly string[]).includes(campaignType);
}

/**
 * Selector options for create/edit.
 * Create: Tiered Free Gifts and Spend X → Free Gift.
 * Edit of a hidden runtime type: includes that type as legacy-preserved.
 */
export function getMerchantPromotionTypeOptions(input?: {
  mode?: "create" | "edit";
  currentType?: string;
}): PromotionTypeOption[] {
  const mode = input?.mode ?? "create";
  const currentType = input?.currentType?.trim() || "";

  const options: PromotionTypeOption[] = [
    {
      title: LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
      description: OPTION_META[LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE]!.description,
      available: true,
    },
    {
      title: LIVE_FREE_GIFT_CAMPAIGN_TYPE,
      description: OPTION_META[LIVE_FREE_GIFT_CAMPAIGN_TYPE]!.description,
      available: true,
    },
  ];

  if (
    mode === "edit" &&
    currentType &&
    isMerchantHiddenRuntimeCampaignType(currentType) &&
    !options.some((o) => o.title === currentType)
  ) {
    options.unshift({
      title: currentType,
      description:
        OPTION_META[currentType]?.description ??
        "Existing campaign type — preserved; not available for new campaigns.",
      available: false,
      legacyPreserved: true,
    });
  }

  return options;
}

/** Reject create of non-creatable types (including Percentage / Fixed / Mystery). */
export function assertMerchantMayCreateCampaignType(campaignType: string): void {
  if (!isMerchantCreatableCampaignType(campaignType)) {
    throw new Error(
      "This promotion type is not available for new campaigns. Choose Tiered Free Gifts or Spend X → Free Gift.",
    );
  }
}

/**
 * Reject type *changes* into non-creatable types.
 * Keeping an existing hidden type (from === to) is allowed.
 */
export function assertMerchantMaySetCampaignType(input: {
  nextType: string;
  previousType?: string | null;
  isCreate: boolean;
}): void {
  const { nextType, previousType, isCreate } = input;
  if (isCreate) {
    assertMerchantMayCreateCampaignType(nextType);
    return;
  }
  if (previousType && nextType === previousType) {
    return;
  }
  if (!isMerchantCreatableCampaignType(nextType)) {
    throw new Error(
      "Cannot change campaign type to a hidden promotion type. Choose Tiered Free Gifts or Spend X → Free Gift.",
    );
  }
}
