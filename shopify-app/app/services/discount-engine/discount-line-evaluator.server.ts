import {
  calculateFunctionQualifyingSubtotal,
  findActiveCampaignConfig,
  isTaggedGiftCartLine,
  normalizeVariantIdForDiscount,
  parseThresholdAmount,
  readTaggedCampaignId,
  readTaggedTierId,
  type DiscountCartLineInput,
  type DiscountConfig,
  type DiscountEvaluationResult,
  type DiscountLineTarget,
  type FixedDiscountEvaluationResult,
  type FixedDiscountLineTarget,
  type PercentageDiscountEvaluationResult,
  type PercentageDiscountLineTarget,
} from "./discount-config.schema";
import { REWARD_TYPES } from "../promotion-engine.server";

/**
 * Pure evaluator mirrored by the Shopify Discount Function.
 * Discounts ONLY tagged gift lines that match an active FREE_GIFT or TIERED_FREE_GIFTS campaign.
 */
export function evaluateTaggedGiftDiscounts(input: {
  lines: DiscountCartLineInput[];
  config: DiscountConfig;
  cartSubtotal?: number | null;
  presentmentCurrencyRate?: number;
}): DiscountEvaluationResult {
  const targets: DiscountLineTarget[] = [];
  const rewarded = new Map<string, number>();
  const qualifying = calculateFunctionQualifyingSubtotal({
    lines: input.lines,
    cartSubtotal: input.cartSubtotal,
  });
  const qualifyingCents = Math.round(qualifying * 100);

  for (const line of input.lines) {
    const target = evaluateTaggedGiftLine(
      line,
      input.config,
      qualifyingCents,
      input.presentmentCurrencyRate,
    );
    if (target) {
      const campaign = findActiveCampaignConfig(input.config, target.campaignId)!;
      const key = target.campaignId + ":" + (campaign.rewardType === REWARD_TYPES.TIERED_FREE_GIFTS ? readTaggedTierId(line) : "classic");
      const cap = campaign.rewardType === REWARD_TYPES.FREE_GIFT ? campaign.maxGiftQuantity : 1;
      const remaining = cap - (rewarded.get(key) ?? 0);
      if (remaining > 0) {
        const quantity = Math.min(target.quantity, remaining);
        targets.push({ ...target, quantity });
        rewarded.set(key, (rewarded.get(key) ?? 0) + quantity);
      }
    }
  }

  return { targets };
}

function evaluateTaggedGiftLine(
  line: DiscountCartLineInput,
  config: DiscountConfig,
  qualifyingCents: number,
  presentmentCurrencyRate = 1,
): DiscountLineTarget | null {
  if (!isTaggedGiftCartLine(line)) {
    return null;
  }

  const campaignId = readTaggedCampaignId(line);
  if (!campaignId) {
    return null;
  }

  const campaign = findActiveCampaignConfig(config, campaignId);
  if (!campaign) {
    return null;
  }

  if (campaign.rewardType === REWARD_TYPES.FREE_GIFT) {
    // Checkout must independently verify spend, including legacy metafields
    // that do not use cart-dependent campaign selection.
    const threshold = Number(campaign.threshold.amount);
    const thresholdCents = Math.round(threshold * presentmentCurrencyRate * 100);
    if (!Number.isFinite(thresholdCents) || thresholdCents <= 0 || qualifyingCents < thresholdCents) {
      return null;
    }

    const variantId = normalizeVariantIdForDiscount(line.merchandiseVariantId);
    if (!variantId || !campaign.giftVariantIds.includes(variantId)) {
      return null;
    }

    const quantity = Math.max(0, Math.trunc(line.quantity));
    if (quantity <= 0) {
      return null;
    }

    const discountedQuantity = Math.min(quantity, campaign.maxGiftQuantity);
    if (discountedQuantity <= 0) {
      return null;
    }

    return {
      cartLineId: line.id,
      quantity: discountedQuantity,
      campaignId: campaign.campaignId,
    };
  }

  if (campaign.rewardType === REWARD_TYPES.TIERED_FREE_GIFTS) {
    const tierId = readTaggedTierId(line);
    if (!tierId) return null;
    const tier = campaign.tiers.find((t) => t.tierId === tierId);
    if (!tier) return null;

    const thresholdCents = Math.round(
      parseThresholdAmount(tier.threshold.amount) * presentmentCurrencyRate * 100,
    );
    if (thresholdCents <= 0 || qualifyingCents < thresholdCents) return null;

    const variantId = normalizeVariantIdForDiscount(line.merchandiseVariantId);
    if (!variantId || variantId !== tier.giftVariantId) return null;

    const quantity = Math.max(0, Math.trunc(line.quantity));
    if (quantity <= 0) return null;

    return {
      cartLineId: line.id,
      quantity: Math.min(quantity, 1),
      campaignId: campaign.campaignId,
    };
  }

  return null;
}

/**
 * Apply percentage discount to non-gift lines when spend threshold is met.
 */
export function evaluatePercentageDiscounts(input: {
  lines: DiscountCartLineInput[];
  config: DiscountConfig;
  cartSubtotal?: number | null;
  presentmentCurrencyRate?: number;
}): PercentageDiscountEvaluationResult {
  const qualifying = calculateFunctionQualifyingSubtotal({
    lines: input.lines,
    cartSubtotal: input.cartSubtotal,
  });
  const qualifyingCents = Math.round(qualifying * 100);

  const targets: PercentageDiscountLineTarget[] = [];

  for (const campaign of input.config.activeCampaigns) {
    if (campaign.rewardType !== REWARD_TYPES.PERCENTAGE_DISCOUNT) continue;

    const thresholdCents = Math.round(
      parseThresholdAmount(campaign.threshold.amount) * (input.presentmentCurrencyRate || 1) * 100,
    );
    if (thresholdCents <= 0 || qualifyingCents < thresholdCents) continue;

    for (const line of input.lines) {
      if (isTaggedGiftCartLine(line)) continue;
      const quantity = Math.max(0, Math.trunc(line.quantity));
      if (quantity <= 0) continue;

      targets.push({
        cartLineId: line.id,
        quantity,
        campaignId: campaign.campaignId,
        percentage: campaign.percentage,
      });
    }
  }

  return { targets };
}

export function evaluateFixedDiscounts(input: {
  lines: DiscountCartLineInput[];
  config: DiscountConfig;
  cartSubtotal?: number | null;
  presentmentCurrencyRate?: number;
}): FixedDiscountEvaluationResult {
  const qualifying = calculateFunctionQualifyingSubtotal({
    lines: input.lines,
    cartSubtotal: input.cartSubtotal,
  });
  const qualifyingCents = Math.round(qualifying * 100);

  const targets: FixedDiscountLineTarget[] = [];
  let amount = 0;

  for (const campaign of input.config.activeCampaigns) {
    if (campaign.rewardType !== REWARD_TYPES.FIXED_DISCOUNT) continue;

    const rate = input.presentmentCurrencyRate || 1;
    const thresholdCents = Math.round(parseThresholdAmount(campaign.threshold.amount) * rate * 100);
    if (thresholdCents <= 0 || qualifyingCents < thresholdCents) continue;

    amount = campaign.amount * rate;
    for (const line of input.lines) {
      if (isTaggedGiftCartLine(line)) continue;
      const quantity = Math.max(0, Math.trunc(line.quantity));
      if (quantity <= 0) continue;

      targets.push({
        cartLineId: line.id,
        quantity,
        campaignId: campaign.campaignId,
        amount: campaign.amount * rate,
      });
    }
  }

  return { targets, amount };
}

export function toDiscountCartLineFromProperties(input: {
  id: string;
  quantity: number;
  merchandiseVariantId?: string | null;
  properties?: Record<string, string> | null;
  lineSubtotal?: number | null;
}): DiscountCartLineInput {
  const attributes = Object.entries(input.properties ?? {}).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  return {
    id: input.id,
    quantity: input.quantity,
    merchandiseVariantId: input.merchandiseVariantId,
    lineSubtotal: input.lineSubtotal ?? null,
    attributes,
  };
}
