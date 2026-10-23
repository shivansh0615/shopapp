export const FGPB_FREE_GIFT_PROPERTY = "_fgpb_free_gift";
export const FGPB_CAMPAIGN_ID_PROPERTY = "_fgpb_campaign_id";
export const FGPB_TIER_ID_PROPERTY = "_fgpb_tier_id";
export const FREE_GIFT_REWARD_TYPE = "FREE_GIFT";
export const TIERED_FREE_GIFTS_REWARD_TYPE = "TIERED_FREE_GIFTS";
export const PERCENTAGE_DISCOUNT_REWARD_TYPE = "PERCENTAGE_DISCOUNT";
export const FIXED_DISCOUNT_REWARD_TYPE = "FIXED_DISCOUNT";
export const DISCOUNT_CONFIG_SCHEMA_VERSION = 1;

export type DiscountCartLineAttributeInput = {
  key: string;
  value: string | null;
};

export type DiscountCartLineInput = {
  id: string;
  quantity: number;
  merchandiseVariantId?: string | null;
  lineSubtotal?: number | null;
  attributes: DiscountCartLineAttributeInput[];
};

export type DiscountMoneyThreshold = {
  amount: string;
  currencyCode: string;
};

export type FreeGiftDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof FREE_GIFT_REWARD_TYPE;
  threshold: DiscountMoneyThreshold;
  giftVariantIds: string[];
  maxGiftQuantity: number;
};

export type TieredFreeGiftsDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof TIERED_FREE_GIFTS_REWARD_TYPE;
  tiers: Array<{
    tierId: string;
    threshold: DiscountMoneyThreshold;
    giftVariantId: string;
  }>;
};

export type PercentageDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof PERCENTAGE_DISCOUNT_REWARD_TYPE;
  threshold: DiscountMoneyThreshold;
  percentage: number;
};

export type FixedDiscountCampaignConfig = {
  campaignId: string;
  rewardType: typeof FIXED_DISCOUNT_REWARD_TYPE;
  threshold: DiscountMoneyThreshold;
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
  amount: number;
};

export type FunctionCartLineInput = {
  id: string;
  quantity: number;
  freeGift?: { value?: string | null } | null;
  campaignId?: { value?: string | null } | null;
  tierId?: { value?: string | null } | null;
  cost?: {
    subtotalAmount?: { amount?: string | null } | null;
  } | null;
  merchandise?: {
    __typename?: string;
    id?: string;
  } | null;
};

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
    rewardType: TIERED_FREE_GIFTS_REWARD_TYPE,
    tiers,
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

    if (campaign.rewardType === TIERED_FREE_GIFTS_REWARD_TYPE) {
      const parsed = parseTieredCampaign(campaign);
      if (!parsed) return null;
      activeCampaigns.push(parsed);
      continue;
    }

    const threshold = parseThreshold(campaign.threshold);
    if (!threshold) return null;
    if (typeof campaign.campaignId !== "string" || !campaign.campaignId.trim()) return null;

    if (campaign.rewardType === FREE_GIFT_REWARD_TYPE) {
      if (!Array.isArray(campaign.giftVariantIds)) return null;
      const giftVariantIds = campaign.giftVariantIds
        .map((variantId) => normalizeVariantIdForDiscount(String(variantId)))
        .filter((variantId) => variantId.length > 0);
      if (!giftVariantIds.length) return null;
      const maxGiftQuantity = Number(campaign.maxGiftQuantity);
      if (!Number.isFinite(maxGiftQuantity) || maxGiftQuantity < 1) return null;
      activeCampaigns.push({
        campaignId: campaign.campaignId.trim(),
        rewardType: FREE_GIFT_REWARD_TYPE,
        threshold,
        giftVariantIds,
        maxGiftQuantity: Math.trunc(maxGiftQuantity),
      });
      continue;
    }

    if (campaign.rewardType === PERCENTAGE_DISCOUNT_REWARD_TYPE) {
      const percentage = Number(campaign.percentage);
      if (!Number.isFinite(percentage)) return null;
      const truncated = Math.trunc(percentage);
      if (truncated < 1 || truncated > 100) return null;
      activeCampaigns.push({
        campaignId: campaign.campaignId.trim(),
        rewardType: PERCENTAGE_DISCOUNT_REWARD_TYPE,
        threshold,
        percentage: truncated,
      });
      continue;
    }

    if (campaign.rewardType === FIXED_DISCOUNT_REWARD_TYPE) {
      const amount = Number(campaign.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      activeCampaigns.push({
        campaignId: campaign.campaignId.trim(),
        rewardType: FIXED_DISCOUNT_REWARD_TYPE,
        threshold,
        amount,
      });
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
 * Does not re-run App Proxy priority selection at checkout.
 */
export function canonicalizeDiscountConfig(config: DiscountConfig): DiscountConfig {
  if (config.selectionPolicy === "ELIGIBILITY_FIRST" || config.activeCampaigns.length <= 1) return config;
  return {
    ...config,
    activeCampaigns: [config.activeCampaigns[0]!],
  };
}

export function parseThresholdAmount(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

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

export function mapCartLineFromInput(line: FunctionCartLineInput): DiscountCartLineInput {
  const amountRaw = line.cost?.subtotalAmount?.amount;
  const parsed = amountRaw != null ? Number.parseFloat(String(amountRaw)) : NaN;
  return {
    id: line.id,
    quantity: line.quantity,
    merchandiseVariantId:
      line.merchandise?.__typename === "ProductVariant" ? line.merchandise.id ?? null : null,
    lineSubtotal: Number.isFinite(parsed) ? parsed : null,
    attributes: [
      { key: FGPB_FREE_GIFT_PROPERTY, value: line.freeGift?.value ?? null },
      { key: FGPB_CAMPAIGN_ID_PROPERTY, value: line.campaignId?.value ?? null },
      { key: FGPB_TIER_ID_PROPERTY, value: line.tierId?.value ?? null },
    ],
  };
}

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
      const key = target.campaignId + ":" + (campaign.rewardType === TIERED_FREE_GIFTS_REWARD_TYPE ? readTaggedTierId(line) : "classic");
      const cap = campaign.rewardType === FREE_GIFT_REWARD_TYPE ? campaign.maxGiftQuantity : 1;
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

  if (campaign.rewardType === FREE_GIFT_REWARD_TYPE) {
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

  if (campaign.rewardType === TIERED_FREE_GIFTS_REWARD_TYPE) {
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
    if (campaign.rewardType !== PERCENTAGE_DISCOUNT_REWARD_TYPE) continue;

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
    if (campaign.rewardType !== FIXED_DISCOUNT_REWARD_TYPE) continue;

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
