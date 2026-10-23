import type { Campaign, CampaignRewardTier } from "@prisma/client";
import {
  DISCOUNT_CONFIG_SCHEMA_VERSION,
  normalizeVariantIdForDiscount,
  type DiscountCampaignConfig,
  type DiscountConfig,
  type FixedDiscountCampaignConfig,
  type FreeGiftDiscountCampaignConfig,
  type PercentageDiscountCampaignConfig,
  type TieredFreeGiftsDiscountCampaignConfig,
} from "./discount-config.schema";
import {
  isFixedDiscountCampaignType,
  isFreeGiftCampaignType,
  isPercentageDiscountCampaignType,
  isSupportedCampaignType,
  isTieredFreeGiftsCampaignType,
} from "../promotion-engine/campaign-types";
import { REWARD_TYPES } from "../promotion-engine.server";
import {
  DEFAULT_SHOP_CURRENCY,
  resolveCampaignThresholdMoney,
  resolveFixedDiscountMoney,
  resolveTierThresholdMoney,
  moneyToMajorNumber,
  toDiscountThresholdPayload,
} from "../../lib/money";

type CampaignForDiscount = Campaign & {
  rewardTiers?: CampaignRewardTier[];
};

function formatThresholdFromCampaign(campaign: CampaignForDiscount): {
  amount: string;
  currencyCode: string;
} {
  return toDiscountThresholdPayload(resolveCampaignThresholdMoney(campaign));
}

function buildFreeGiftConfig(campaign: CampaignForDiscount): FreeGiftDiscountCampaignConfig | null {
  const giftVariantId = normalizeVariantIdForDiscount(campaign.giftVariantId);
  if (!giftVariantId) return null;

  return {
    campaignId: String(campaign.id),
    rewardType: REWARD_TYPES.FREE_GIFT,
    threshold: formatThresholdFromCampaign(campaign),
    giftVariantIds: [giftVariantId],
    // Classic gifts have one unit, matching the evaluator and browser runner.
    maxGiftQuantity: 1,
  };
}

function buildTieredConfig(
  campaign: CampaignForDiscount,
): TieredFreeGiftsDiscountCampaignConfig | null {
  const tiersRaw = Array.isArray(campaign.rewardTiers) ? [...campaign.rewardTiers] : [];
  tiersRaw.sort((a, b) => a.position - b.position);
  if (!tiersRaw.length) return null;

  const currency = campaign.currencyCode || DEFAULT_SHOP_CURRENCY;
  const tiers: TieredFreeGiftsDiscountCampaignConfig["tiers"] = [];
  let previousMinor = -1n;
  for (const tier of tiersRaw) {
    const giftVariantId = normalizeVariantIdForDiscount(tier.giftVariantId);
    const money = resolveTierThresholdMoney(tier, currency);
    if (!giftVariantId || money.amountMinor <= 0n) return null;
    if (money.amountMinor <= previousMinor) return null;
    previousMinor = money.amountMinor;
    tiers.push({
      tierId: String(tier.id),
      threshold: toDiscountThresholdPayload(money),
      giftVariantId,
    });
  }

  return {
    campaignId: String(campaign.id),
    rewardType: REWARD_TYPES.TIERED_FREE_GIFTS,
    tiers,
  };
}

function buildPercentageConfig(campaign: CampaignForDiscount): PercentageDiscountCampaignConfig | null {
  const raw = campaign.discountPercentage;
  if (raw == null || !Number.isFinite(raw)) return null;
  const percentage = Math.trunc(raw);
  if (percentage < 1 || percentage > 100) return null;

  return {
    campaignId: String(campaign.id),
    rewardType: REWARD_TYPES.PERCENTAGE_DISCOUNT,
    threshold: formatThresholdFromCampaign(campaign),
    percentage,
  };
}

function buildFixedConfig(campaign: CampaignForDiscount): FixedDiscountCampaignConfig | null {
  const money = resolveFixedDiscountMoney(campaign);
  if (!money || money.amountMinor <= 0n) return null;

  return {
    campaignId: String(campaign.id),
    rewardType: REWARD_TYPES.FIXED_DISCOUNT,
    threshold: formatThresholdFromCampaign(campaign),
    amount: moneyToMajorNumber(money),
  };
}

/**
 * Build discount config for one campaign.
 * Selection (who wins) is owned by `selectWinningCampaign` in Discount Sync / App Proxy.
 * Builder only validates + emits; it does not choose a winner from a list.
 */
export function buildDiscountCampaignConfig(
  campaign: CampaignForDiscount,
): DiscountCampaignConfig | null {
  if (campaign.status !== "ACTIVE") return null;
  if (!isSupportedCampaignType(campaign.campaignType)) return null;

  if (isPercentageDiscountCampaignType(campaign.campaignType)) {
    return buildPercentageConfig(campaign);
  }
  if (isFixedDiscountCampaignType(campaign.campaignType)) {
    return buildFixedConfig(campaign);
  }
  if (isTieredFreeGiftsCampaignType(campaign.campaignType)) {
    return buildTieredConfig(campaign);
  }
  if (isFreeGiftCampaignType(campaign.campaignType)) {
    return buildFreeGiftConfig(campaign);
  }
  return null;
}

/**
 * Policy A — emit configuration for at most one campaign.
 * Pass the winning campaign from `selectWinningCampaign`, or null when none.
 */
export function buildDiscountConfig(input: {
  shopDomain: string;
  campaign: CampaignForDiscount | null;
  currencyCode?: string;
}): DiscountConfig {
  const currencyCode = input.currencyCode?.trim() || "INR";
  if (!input.campaign) {
    return buildInactiveDiscountConfig(input.shopDomain);
  }

  const built = buildDiscountCampaignConfig(input.campaign);
  if (!built) {
    return buildInactiveDiscountConfig(input.shopDomain);
  }

  if (built.rewardType === REWARD_TYPES.TIERED_FREE_GIFTS) {
    return {
      schemaVersion: DISCOUNT_CONFIG_SCHEMA_VERSION,
      shopDomain: input.shopDomain.trim(),
      activeCampaigns: [
        {
          ...built,
          tiers: built.tiers.map((tier) => ({
            ...tier,
            threshold: { ...tier.threshold, currencyCode },
          })),
        },
      ],
    };
  }

  return {
    schemaVersion: DISCOUNT_CONFIG_SCHEMA_VERSION,
    shopDomain: input.shopDomain.trim(),
    activeCampaigns: [
      {
        ...built,
        threshold: {
          ...built.threshold,
          currencyCode,
        },
      },
    ],
  };
}

export function buildInactiveDiscountConfig(shopDomain: string): DiscountConfig {
  return {
    schemaVersion: DISCOUNT_CONFIG_SCHEMA_VERSION,
    shopDomain: shopDomain.trim(),
    activeCampaigns: [],
  };
}
