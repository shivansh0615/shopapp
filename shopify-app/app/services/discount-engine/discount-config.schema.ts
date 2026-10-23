import {
  FGPB_CAMPAIGN_ID_PROPERTY,
  FGPB_FREE_GIFT_PROPERTY,
  FGPB_TIER_ID_PROPERTY,
} from "../tagged-gift-cart.server";
import { REWARD_TYPES, type RewardType } from "../promotion-engine.server";

export const DISCOUNT_CONFIG_SCHEMA_VERSION = 1;

export const DISCOUNT_CONFIG_METAFIELD_NAMESPACE = "$app";
export const DISCOUNT_CONFIG_METAFIELD_KEY = "discount_config";

/** Title already installed on shops. Lookup still accepts it so a rename does not create a second discount. */
export const LEGACY_DISCOUNT_FUNCTION_TITLE = "Free Gift Progress Bar — Campaign Rewards";

/** Title written on create and on every later sync. */
export const DISCOUNT_FUNCTION_TITLE = "UpsellTrix Free Gift";

export const MANAGED_DISCOUNT_TITLES = [
  DISCOUNT_FUNCTION_TITLE,
  LEGACY_DISCOUNT_FUNCTION_TITLE,
] as const;

export function isManagedDiscountTitle(title: string): boolean {
  return (MANAGED_DISCOUNT_TITLES as readonly string[]).includes(title);
}

export type DiscountMoneyThreshold = {
  amount: string;
  currencyCode: string;
};

export type FreeGiftDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof REWARD_TYPES.FREE_GIFT;
  threshold: DiscountMoneyThreshold;
  giftVariantIds: string[];
  maxGiftQuantity: number;
};

export type TieredFreeGiftsDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof REWARD_TYPES.TIERED_FREE_GIFTS;
  tiers: Array<{
    tierId: string;
    threshold: DiscountMoneyThreshold;
    giftVariantId: string;
  }>;
};

export type PercentageDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof REWARD_TYPES.PERCENTAGE_DISCOUNT;
  threshold: DiscountMoneyThreshold;
  /** Integer 1–100. */
  percentage: number;
};

export type FixedDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof REWARD_TYPES.FIXED_DISCOUNT;
  threshold: DiscountMoneyThreshold;
  /** Fixed currency amount in major units (> 0). */
  amount: number;
};

export type DiscountCampaignConfig = (
  | FreeGiftDiscountCampaignConfig
  | TieredFreeGiftsDiscountCampaignConfig
  | PercentageDiscountCampaignConfig
  | FixedDiscountCampaignConfig) & { priority?: number };

export type DiscountConfig = {
  schemaVersion: typeof DISCOUNT_CONFIG_SCHEMA_VERSION;
  selectionPolicy?: "ELIGIBILITY_FIRST";
  shopDomain: string;
  activeCampaigns: DiscountCampaignConfig[];
};

export type DiscountCartLineAttributeInput = {
  key: string;
  value: string | null;
};

/** Minimal cart line shape mirrored from Discount Function input. */
export type DiscountCartLineInput = {
  id: string;
  quantity: number;
  merchandiseVariantId?: string | null;
  /** Line subtotal in major currency units when available from Function input. */
  lineSubtotal?: number | null;
  attributes: DiscountCartLineAttributeInput[];
};

export type DiscountLineTarget = {
  cartLineId: string;
  quantity: number;
  campaignId: string;
};

export type PercentageDiscountLineTarget = DiscountLineTarget & {
  percentage: number;
};

export type FixedDiscountLineTarget = DiscountLineTarget & {
  amount: number;
};

export type DiscountEvaluationResult = {
  targets: DiscountLineTarget[];
};

export type PercentageDiscountEvaluationResult = {
  targets: PercentageDiscountLineTarget[];
};

export type FixedDiscountEvaluationResult = {
  targets: FixedDiscountLineTarget[];
  /** Total fixed amount to apply once across entitled lines. */
  amount: number;
};

export function normalizeVariantIdForDiscount(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  if (raw.startsWith("gid://shopify/ProductVariant/")) {
    return raw.split("/").pop() ?? raw;
  }
  return raw;
}

export function readLineAttribute(
  attributes: DiscountCartLineAttributeInput[],
  key: string,
): string | null {
  const match = attributes.find((attribute) => attribute.key === key);
  if (!match || match.value === null || match.value === undefined) return null;
  const normalized = String(match.value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function isTaggedGiftCartLine(line: DiscountCartLineInput): boolean {
  return readLineAttribute(line.attributes, FGPB_FREE_GIFT_PROPERTY) === "true";
}

export function readTaggedCampaignId(line: DiscountCartLineInput): string | null {
  return readLineAttribute(line.attributes, FGPB_CAMPAIGN_ID_PROPERTY);
}

export function readTaggedTierId(line: DiscountCartLineInput): string | null {
  return readLineAttribute(line.attributes, FGPB_TIER_ID_PROPERTY);
}

function parseThreshold(threshold: unknown): DiscountMoneyThreshold | null {
  if (!threshold || typeof threshold !== "object" || Array.isArray(threshold)) return null;
  const thresholdRecord = threshold as Record<string, unknown>;
  if (typeof thresholdRecord.amount !== "string" || !thresholdRecord.amount.trim()) return null;
  if (typeof thresholdRecord.currencyCode !== "string" || !thresholdRecord.currencyCode.trim()) {
    return null;
  }
  return {
    amount: thresholdRecord.amount.trim(),
    currencyCode: thresholdRecord.currencyCode.trim(),
  };
}

function parseTieredCampaign(
  campaign: Record<string, unknown>,
): TieredFreeGiftsDiscountCampaignConfig | null {
  if (typeof campaign.campaignId !== "string" || !campaign.campaignId.trim()) return null;
  if (!Array.isArray(campaign.tiers) || !campaign.tiers.length) return null;

  const tiers: TieredFreeGiftsDiscountCampaignConfig["tiers"] = [];
  let previousCents = -1;
  for (const entry of campaign.tiers) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const threshold = parseThreshold(row.threshold);
    if (!threshold) return null;
    const tierId = String(row.tierId || "").trim();
    const giftVariantId = normalizeVariantIdForDiscount(String(row.giftVariantId || ""));
    if (!tierId || !giftVariantId) return null;
    const cents = Math.round(parseThresholdAmount(threshold.amount) * 100);
    if (cents <= 0 || cents <= previousCents) return null;
    previousCents = cents;
    tiers.push({ tierId, threshold, giftVariantId });
  }

  return {
    campaignId: campaign.campaignId.trim(),
    rewardType: REWARD_TYPES.TIERED_FREE_GIFTS,
    tiers,
  };
}

function parseFreeGiftCampaign(campaign: Record<string, unknown>): FreeGiftDiscountCampaignConfig | null {
  const threshold = parseThreshold(campaign.threshold);
  if (!threshold) return null;
  if (typeof campaign.campaignId !== "string" || !campaign.campaignId.trim()) return null;
  if (!Array.isArray(campaign.giftVariantIds)) return null;

  const giftVariantIds = campaign.giftVariantIds
    .map((variantId) => normalizeVariantIdForDiscount(String(variantId)))
    .filter((variantId) => variantId.length > 0);
  if (!giftVariantIds.length) return null;

  const maxGiftQuantity = Number(campaign.maxGiftQuantity);
  if (!Number.isFinite(maxGiftQuantity) || maxGiftQuantity < 1) return null;

  return {
    campaignId: campaign.campaignId.trim(),
    rewardType: REWARD_TYPES.FREE_GIFT,
    threshold,
    giftVariantIds,
    maxGiftQuantity: Math.trunc(maxGiftQuantity),
  };
}

function parsePercentageCampaign(
  campaign: Record<string, unknown>,
): PercentageDiscountCampaignConfig | null {
  const threshold = parseThreshold(campaign.threshold);
  if (!threshold) return null;
  if (typeof campaign.campaignId !== "string" || !campaign.campaignId.trim()) return null;

  const percentage = Number(campaign.percentage);
  if (!Number.isFinite(percentage)) return null;
  const truncated = Math.trunc(percentage);
  if (truncated < 1 || truncated > 100) return null;

  return {
    campaignId: campaign.campaignId.trim(),
    rewardType: REWARD_TYPES.PERCENTAGE_DISCOUNT,
    threshold,
    percentage: truncated,
  };
}

function parseFixedCampaign(
  campaign: Record<string, unknown>,
): FixedDiscountCampaignConfig | null {
  const threshold = parseThreshold(campaign.threshold);
  if (!threshold) return null;
  if (typeof campaign.campaignId !== "string" || !campaign.campaignId.trim()) return null;

  const amount = Number(campaign.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    campaignId: campaign.campaignId.trim(),
    rewardType: REWARD_TYPES.FIXED_DISCOUNT,
    threshold,
    amount,
  };
}

export function parseDiscountConfig(raw: unknown): DiscountConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== DISCOUNT_CONFIG_SCHEMA_VERSION) return null;
  if (typeof record.shopDomain !== "string" || !record.shopDomain.trim()) return null;
  if (!Array.isArray(record.activeCampaigns)) return null;

  const activeCampaigns: DiscountCampaignConfig[] = [];

  for (const entry of record.activeCampaigns) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

    const campaign = entry as Record<string, unknown>;
    if (campaign.rewardType === REWARD_TYPES.FREE_GIFT) {
      const parsed = parseFreeGiftCampaign(campaign);
      if (!parsed) return null;
      activeCampaigns.push(parsed);
      continue;
    }
    if (campaign.rewardType === REWARD_TYPES.TIERED_FREE_GIFTS) {
      const parsed = parseTieredCampaign(campaign);
      if (!parsed) return null;
      activeCampaigns.push(parsed);
      continue;
    }
    if (campaign.rewardType === REWARD_TYPES.PERCENTAGE_DISCOUNT) {
      const parsed = parsePercentageCampaign(campaign);
      if (!parsed) return null;
      activeCampaigns.push(parsed);
      continue;
    }
    if (campaign.rewardType === REWARD_TYPES.FIXED_DISCOUNT) {
      const parsed = parseFixedCampaign(campaign);
      if (!parsed) return null;
      activeCampaigns.push(parsed);
      continue;
    }
    return null;
  }

  return {
    schemaVersion: DISCOUNT_CONFIG_SCHEMA_VERSION,
    shopDomain: record.shopDomain.trim(),
    ...(record.selectionPolicy === "ELIGIBILITY_FIRST" ? { selectionPolicy: "ELIGIBILITY_FIRST" as const } : {}),
    activeCampaigns: activeCampaigns.map((campaign, index) => {
      const priority = (record.activeCampaigns as Array<{ priority?: number }>)[index]?.priority;
      return { ...campaign, ...(typeof priority === "number" && Number.isFinite(priority) ? { priority } : {}) };
    }),
  };
}

export function serializeDiscountConfig(config: DiscountConfig): string {
  return JSON.stringify(config);
}

export function findActiveCampaignConfig(
  config: DiscountConfig,
  campaignId: string,
): DiscountCampaignConfig | null {
  return (
    config.activeCampaigns.find((campaign) => campaign.campaignId === String(campaignId)) ?? null
  );
}

/**
 * Policy A / legacy metafield compatibility:
 * New eligibility-first configs retain all candidates. Legacy metafields may list many —
 * deterministically keep only the first entry (array order as stored).
 */
export function canonicalizeDiscountConfig(config: DiscountConfig): DiscountConfig {
  if (config.selectionPolicy === "ELIGIBILITY_FIRST" || config.activeCampaigns.length <= 1) return config;
  return {
    ...config,
    activeCampaigns: [config.activeCampaigns[0]!],
  };
}

export function isSupportedRewardType(
  rewardType: RewardType,
): rewardType is
  | typeof REWARD_TYPES.FREE_GIFT
  | typeof REWARD_TYPES.TIERED_FREE_GIFTS
  | typeof REWARD_TYPES.PERCENTAGE_DISCOUNT
  | typeof REWARD_TYPES.FIXED_DISCOUNT {
  return (
    rewardType === REWARD_TYPES.FREE_GIFT ||
    rewardType === REWARD_TYPES.TIERED_FREE_GIFTS ||
    rewardType === REWARD_TYPES.PERCENTAGE_DISCOUNT ||
    rewardType === REWARD_TYPES.FIXED_DISCOUNT
  );
}

export function parseThresholdAmount(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Qualifying spend: non-gift line subtotals when present; else cart-level fallback. */
export function calculateFunctionQualifyingSubtotal(input: {
  lines: DiscountCartLineInput[];
  cartSubtotal?: number | null;
}): number {
  let hasLineAmounts = false;
  let hasPaidLines = false;
  let hasGiftLines = false;
  let sum = 0;
  for (const line of input.lines) {
    if (isTaggedGiftCartLine(line)) {
      hasGiftLines = true;
      continue;
    }
    hasPaidLines = true;
    if (line.lineSubtotal != null && Number.isFinite(line.lineSubtotal)) {
      hasLineAmounts = true;
      sum += Math.max(0, line.lineSubtotal);
    }
  }
  if (hasLineAmounts) return sum;
  // Without paid-line amounts, a cart total containing gifts cannot prove
  // qualifying spend. A gift-only cart must never qualify itself.
  if (!hasPaidLines || hasGiftLines) return 0;
  return Number.isFinite(input.cartSubtotal) ? Math.max(0, input.cartSubtotal ?? 0) : 0;
}
