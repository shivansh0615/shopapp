import type { Campaign, CampaignRewardTier, Prisma } from "@prisma/client";
import * as campaignRepository from "../repositories/campaign.repository";
import { campaignCapacityError } from "../lib/campaign-capacity";
import { assertMerchantMaySetCampaignType } from "../lib/merchant-campaign-types";
import {
  DEFAULT_SHOP_CURRENCY,
  dualWriteFixedDiscount,
  dualWriteThreshold,
  resolveCampaignCurrency,
} from "../lib/money";
import {
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
  isFixedDiscountCampaignType,
  isFreeGiftCampaignType,
  isPercentageDiscountCampaignType,
  isTieredFreeGiftsCampaignType,
} from "./promotion-engine/campaign-types";
import {
  validateTieredFreeGiftTiers,
  type ValidatedTier,
} from "./promotion-engine/tier-validation";

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED";

/** Persisted type allow-list (includes hidden runtime + placeholders). */
export const VALID_CAMPAIGN_TYPES = [
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
  "Buy X -> Get Y",
  "Tiered Rewards",
  "Free Shipping + Gift",
  "Mystery Gift",
] as const;

export type CampaignType = (typeof VALID_CAMPAIGN_TYPES)[number];

export type CampaignWithTiers = Campaign & {
  rewardTiers: CampaignRewardTier[];
};

export type CreateCampaignInput = {
  shop: string;
  name: string;
  campaignType: string;
  /** Major-unit number or decimal string from admin forms. */
  threshold: number | string;
  giftProductId: string;
  giftProductTitle?: string;
  giftProductImage?: string;
  giftVariantId?: string | null;
  giftQuantity: number;
  discountPercentage?: number | null;
  fixedDiscountAmount?: number | string | null;
  /** ISO shop currency; defaults to historical INR assumption. */
  currencyCode?: string;
  rewardTiers?: ValidatedTier[];
  placements: string[];
  widgetSettings?: unknown;
  status: CampaignStatus;
  ruleType?: string;
  triggerQuantity?: number;
  triggerProductIds?: string[];
  triggerCollectionIds?: string[];
  startDate?: Date | null;
  endDate?: Date | null;
  priority?: number;
  allowCustomerChoice?: boolean;
};

export type UpdateCampaignInput = Partial<Omit<CreateCampaignInput, "shop">>;

function normalizeStatus(status: string | null | undefined): CampaignStatus {
  if (status === "ACTIVE") return "ACTIVE";
  if (status === "PAUSED") return "PAUSED";
  return "DRAFT";
}

function isValidCampaignType(campaignType: string): campaignType is CampaignType {
  return VALID_CAMPAIGN_TYPES.includes(campaignType as CampaignType);
}

function normalizeDiscountPercentage(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  if (truncated < 1 || truncated > 100) return null;
  return truncated;
}

function normalizeFixedDiscountAmount(
  value: number | string | null | undefined,
  currencyCode: string,
): { fixedDiscountAmount: number; fixedDiscountAmountMinor: bigint } | null {
  if (value == null || value === "") return null;
  try {
    return dualWriteFixedDiscount(value, currencyCode);
  } catch {
    return null;
  }
}

function writeThreshold(
  value: number | string,
  currencyCode: string,
): { threshold: number; thresholdMinor: bigint; currencyCode: string } {
  return dualWriteThreshold(value, currencyCode);
}

function writeTierRows(
  tiers: ValidatedTier[],
  currencyCode: string,
): Prisma.CampaignRewardTierCreateWithoutCampaignInput[] {
  return tiers.map((tier) => {
    const money = dualWriteThreshold(tier.threshold, currencyCode);
    return {
      ...(tier.id ? { id: tier.id } : {}),
      threshold: money.threshold,
      thresholdMinor: money.thresholdMinor,
      giftProductId: tier.giftProductId,
      giftProductTitle: tier.giftProductTitle,
      giftProductImage: tier.giftProductImage,
      giftVariantId: tier.giftVariantId,
      position: tier.position,
    };
  });
}


function thresholdAsPositiveNumber(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function validateCreateCampaign(input: CreateCampaignInput) {
  if (!input.name.trim()) {
    throw new Error("Campaign name is required.");
  }
  if (!isValidCampaignType(input.campaignType)) {
    throw new Error("Campaign type is invalid.");
  }
  assertMerchantMaySetCampaignType({
    nextType: input.campaignType,
    isCreate: true,
  });
  if (!["DRAFT", "ACTIVE", "PAUSED"].includes(input.status)) {
    throw new Error("Status must be DRAFT, ACTIVE, or PAUSED.");
  }

  const currency = resolveCampaignCurrency(input.currencyCode ?? DEFAULT_SHOP_CURRENCY);

  if (isTieredFreeGiftsCampaignType(input.campaignType)) {
    const tiers = validateTieredFreeGiftTiers(input.rewardTiers ?? []);
    if (thresholdAsPositiveNumber(input.threshold) <= 0) {
      if (!(tiers[0]!.threshold > 0)) {
        throw new Error("Threshold must be greater than 0.");
      }
    }
    return;
  }

  try {
    writeThreshold(input.threshold, currency);
  } catch {
    throw new Error("Threshold must be a valid money amount greater than 0.");
  }

  if (isPercentageDiscountCampaignType(input.campaignType)) {
    const percentage = normalizeDiscountPercentage(input.discountPercentage);
    if (percentage == null) {
      throw new Error("Discount percentage must be between 1 and 100.");
    }
    return;
  }

  if (isFixedDiscountCampaignType(input.campaignType)) {
    const amount = normalizeFixedDiscountAmount(input.fixedDiscountAmount, currency);
    if (amount == null) {
      throw new Error("Fixed discount amount must be greater than 0.");
    }
    return;
  }

  if (isFreeGiftCampaignType(input.campaignType)) {
    if (input.giftQuantity !== 1) {
      throw new Error("Classic free gifts support exactly one unit per cart.");
    }
    if (!String(input.giftProductId || "").trim()) {
      throw new Error("Gift product is required.");
    }
  } else if (input.giftQuantity < 1) {
    throw new Error("Gift quantity must be at least 1.");
  }
}

function validateUpdateCampaign(
  updates: UpdateCampaignInput,
  existingType: string,
  existingCurrency: string,
) {
  if ("name" in updates && updates.name !== undefined && !updates.name.trim()) {
    throw new Error("Campaign name is required.");
  }
  if ("campaignType" in updates && updates.campaignType !== undefined) {
    if (!isValidCampaignType(updates.campaignType)) {
      throw new Error("Campaign type is invalid.");
    }
    assertMerchantMaySetCampaignType({
      nextType: updates.campaignType,
      previousType: existingType,
      isCreate: false,
    });
  }
  const currency = resolveCampaignCurrency(updates.currencyCode ?? existingCurrency);
  if ("threshold" in updates && updates.threshold !== undefined) {
    try {
      writeThreshold(updates.threshold, currency);
    } catch {
      throw new Error("Threshold must be a valid money amount greater than 0.");
    }
  }
  if (
    "status" in updates &&
    updates.status !== undefined &&
    !["DRAFT", "ACTIVE", "PAUSED"].includes(updates.status)
  ) {
    throw new Error("Status must be DRAFT, ACTIVE, or PAUSED.");
  }

  const nextType = updates.campaignType ?? existingType;

  if (isTieredFreeGiftsCampaignType(nextType) && "rewardTiers" in updates) {
    validateTieredFreeGiftTiers(updates.rewardTiers ?? []);
    return;
  }

  if (isPercentageDiscountCampaignType(nextType)) {
    if ("discountPercentage" in updates) {
      const percentage = normalizeDiscountPercentage(updates.discountPercentage);
      if (percentage == null) {
        throw new Error("Discount percentage must be between 1 and 100.");
      }
    }
    return;
  }

  if (isFixedDiscountCampaignType(nextType)) {
    if ("fixedDiscountAmount" in updates) {
      const amount = normalizeFixedDiscountAmount(updates.fixedDiscountAmount, currency);
      if (amount == null) {
        throw new Error("Fixed discount amount must be greater than 0.");
      }
    }
    return;
  }

  if ("giftQuantity" in updates && updates.giftQuantity !== undefined && updates.giftQuantity !== 1) {
    throw new Error("Classic free gifts support exactly one unit per cart.");
  }
}

export async function createCampaign(input: CreateCampaignInput): Promise<CampaignWithTiers> {
  validateCreateCampaign(input);
  const currency = resolveCampaignCurrency(input.currencyCode ?? DEFAULT_SHOP_CURRENCY);
  const isTiered = isTieredFreeGiftsCampaignType(input.campaignType);
  const tiers = isTiered ? validateTieredFreeGiftTiers(input.rewardTiers ?? []) : [];
  const discountPercentage = isPercentageDiscountCampaignType(input.campaignType)
    ? normalizeDiscountPercentage(input.discountPercentage)
    : null;
  const fixed = isFixedDiscountCampaignType(input.campaignType)
    ? normalizeFixedDiscountAmount(input.fixedDiscountAmount, currency)
    : null;

  const tierRows = isTiered ? writeTierRows(tiers, currency) : [];
  const thresholdWrite = isTiered && tierRows[0]
    ? {
        threshold: Number(tierRows[0].threshold),
        thresholdMinor: tierRows[0].thresholdMinor as bigint,
      }
    : writeThreshold(input.threshold, currency);

  const firstTier = tiers[0];
  return campaignRepository.createCampaignWithTiers({
    shop: input.shop,
    name: input.name,
    campaignType: input.campaignType,
    threshold: thresholdWrite.threshold,
    thresholdMinor: thresholdWrite.thresholdMinor,
    currencyCode: currency,
    giftProductId: isTiered ? firstTier?.giftProductId || "" : input.giftProductId || "",
    giftProductTitle: isTiered
      ? firstTier?.giftProductTitle ?? undefined
      : input.giftProductTitle,
    giftProductImage: isTiered
      ? firstTier?.giftProductImage ?? undefined
      : input.giftProductImage,
    giftVariantId: isTiered ? firstTier?.giftVariantId ?? null : input.giftVariantId,
    giftQuantity: Math.max(1, input.giftQuantity || 1),
    discountPercentage,
    fixedDiscountAmount: fixed?.fixedDiscountAmount ?? null,
    fixedDiscountAmountMinor: fixed?.fixedDiscountAmountMinor ?? null,
    placements: input.placements,
    widgetSettings: input.widgetSettings ?? undefined,
    status: normalizeStatus(input.status),
    ruleType: input.ruleType,
    triggerQuantity: input.triggerQuantity,
    triggerProductIds: input.triggerProductIds,
    triggerCollectionIds: input.triggerCollectionIds,
    startDate: input.startDate,
    endDate: input.endDate,
    priority: input.priority,
    allowCustomerChoice: input.allowCustomerChoice,
    rewardTiers: isTiered ? { create: tierRows } : undefined,
  });
}

export async function getCampaigns(shop: string): Promise<CampaignWithTiers[]> {
  return campaignRepository.findCampaignsByShop(shop);
}

export async function getCampaign(id: number, shop: string): Promise<CampaignWithTiers | null> {
  return campaignRepository.findCampaignById(id, shop);
}

export async function updateCampaign(
  id: number,
  shop: string,
  updates: UpdateCampaignInput,
): Promise<CampaignWithTiers | null> {
  const existing = await getCampaign(id, shop);
  if (!existing) return null;

  const existingCurrency = resolveCampaignCurrency(existing.currencyCode);
  validateUpdateCampaign(updates, existing.campaignType, existingCurrency);

  const currency = resolveCampaignCurrency(updates.currencyCode ?? existingCurrency);
  const normalizedStatus = updates.status ? normalizeStatus(updates.status) : undefined;
  const nextType = updates.campaignType ?? existing.campaignType;
  const isTiered = isTieredFreeGiftsCampaignType(nextType);
  const tiers =
    isTiered && "rewardTiers" in updates
      ? validateTieredFreeGiftTiers(updates.rewardTiers ?? [])
      : null;

  const discountPercentage = isPercentageDiscountCampaignType(nextType)
    ? normalizeDiscountPercentage(
        "discountPercentage" in updates
          ? updates.discountPercentage
          : existing.discountPercentage,
      )
    : null;
  const fixed = isFixedDiscountCampaignType(nextType)
    ? normalizeFixedDiscountAmount(
        "fixedDiscountAmount" in updates
          ? updates.fixedDiscountAmount
          : existing.fixedDiscountAmount,
        currency,
      )
    : null;

  const firstTier = tiers?.[0];
  const fieldUpdates: Prisma.CampaignUpdateInput = {
    name: updates.name,
    campaignType: updates.campaignType,
    giftProductId:
      tiers != null ? firstTier?.giftProductId || "" : updates.giftProductId,
    giftProductTitle:
      tiers != null ? firstTier?.giftProductTitle ?? null : updates.giftProductTitle,
    giftProductImage:
      tiers != null ? firstTier?.giftProductImage ?? null : updates.giftProductImage,
    giftVariantId: tiers != null ? firstTier?.giftVariantId ?? null : updates.giftVariantId,
    giftQuantity: updates.giftQuantity,
    discountPercentage,
    fixedDiscountAmount: isFixedDiscountCampaignType(nextType)
      ? (fixed?.fixedDiscountAmount ?? null)
      : null,
    fixedDiscountAmountMinor: isFixedDiscountCampaignType(nextType)
      ? (fixed?.fixedDiscountAmountMinor ?? null)
      : null,
    currencyCode: currency,
    placements: updates.placements ?? undefined,
    widgetSettings: updates.widgetSettings ?? undefined,
    status: normalizedStatus,
    ruleType: updates.ruleType,
    triggerQuantity: updates.triggerQuantity,
    triggerProductIds: updates.triggerProductIds,
    triggerCollectionIds: updates.triggerCollectionIds,
    startDate: updates.startDate,
    endDate: updates.endDate,
    priority: updates.priority,
    allowCustomerChoice: updates.allowCustomerChoice,
  };

  let replaceTiers: Prisma.CampaignRewardTierCreateWithoutCampaignInput[] | undefined;
  if (tiers != null) {
    replaceTiers = writeTierRows(tiers, currency);
    const th = replaceTiers[0]
      ? {
          threshold: Number(replaceTiers[0].threshold),
          thresholdMinor: replaceTiers[0].thresholdMinor as bigint,
        }
      : writeThreshold(updates.threshold ?? existing.threshold, currency);
    fieldUpdates.threshold = th.threshold;
    fieldUpdates.thresholdMinor = th.thresholdMinor;
  } else if (updates.threshold !== undefined) {
    const th = writeThreshold(updates.threshold, currency);
    fieldUpdates.threshold = th.threshold;
    fieldUpdates.thresholdMinor = th.thresholdMinor;
  } else if (
    !isTiered &&
    "campaignType" in updates &&
    updates.campaignType &&
    isTieredFreeGiftsCampaignType(existing.campaignType)
  ) {
    replaceTiers = [];
  }

  for (const key of Object.keys(fieldUpdates) as Array<keyof Prisma.CampaignUpdateInput>) {
    if (fieldUpdates[key] === undefined) delete fieldUpdates[key];
  }

  return campaignRepository.updateOwnedCampaign(id, shop, {
    data: fieldUpdates,
    replaceTiers,
  });
}

export async function deleteCampaign(id: number, shop: string): Promise<boolean> {
  return campaignRepository.deleteCampaign(id, shop);
}

export async function getActiveCampaign(shop: string): Promise<CampaignWithTiers | null> {
  return campaignRepository.findActiveCampaignByShop(shop);
}

export async function getActiveCampaigns(shop: string): Promise<CampaignWithTiers[]> {
  return campaignRepository.findActiveCampaignsByShop(shop);
}

/**
 * One campaign can be active per shop. This is an early UI check only; the
 * repository enforces the same rule atomically inside every create/update
 * transaction.
 */
export async function validateActivationCapacity(
  shop: string,
  campaignType: string,
  excludeId?: number,
): Promise<string | null> {
  return campaignCapacityError(
    await campaignRepository.findEnabledCampaignsByShop(shop), campaignType, excludeId,
  );
}

export async function pauseCampaign(id: number, shop: string): Promise<CampaignWithTiers | null> {
  return updateCampaign(id, shop, { status: "PAUSED" });
}

export async function activateCampaign(id: number, shop: string): Promise<CampaignWithTiers | null> {
  // The repository reads current type/status under the capacity lock.
  return campaignRepository.activateCampaign(id, shop);
}

export {
  LIVE_FREE_GIFT_CAMPAIGN_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_FIXED_DISCOUNT_CAMPAIGN_TYPE,
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE,
};
