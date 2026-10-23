/**
 * Canonical TIERED_FREE_GIFTS evaluator.
 *
 * Cumulative unlocks: spend ≥ tier N threshold → unlocks tiers 1..N.
 * Gift line identity: `_fgpb_free_gift` + `_fgpb_campaign_id` + `_fgpb_tier_id`.
 * Same-SKU paid lines without tags are never treated as gifts.
 */

import {
  FGPB_CAMPAIGN_ID_PROPERTY,
  FGPB_FREE_GIFT_PROPERTY,
  FGPB_TIER_ID_PROPERTY,
  isTaggedFreeGiftLine,
} from "../tagged-gift-cart.server";
import { REGISTRY_TYPES } from "./campaign-types";
import { buildSpendThresholdProgress, toCents } from "./spend-threshold-progress";
import type {
  CampaignEvaluator,
  CanonicalCartLine,
  CanonicalRewardTier,
  EvaluationInput,
  FreeGiftLineProperties,
  PromotionAction,
  PromotionDiagnostic,
  PromotionEvaluationResult,
  PromotionProgress,
  TieredFreeGiftsReward,
  TieredUnlockedGift,
} from "./types";

function isWithinSchedule(
  campaign: EvaluationInput["campaign"],
  now: Date,
): PromotionDiagnostic | null {
  if (campaign.startDate && now < campaign.startDate) {
    return { code: "NOT_STARTED", message: "Campaign has not started" };
  }
  if (campaign.endDate && now > campaign.endDate) {
    return { code: "EXPIRED", message: "Campaign has ended" };
  }
  return null;
}

function normalizeTiers(campaign: EvaluationInput["campaign"]): CanonicalRewardTier[] {
  const raw = Array.isArray(campaign.rewardTiers) ? campaign.rewardTiers : [];
  return [...raw]
    .filter((tier) => tier && String(tier.giftVariantId || "").trim() && tier.threshold > 0)
    .map((tier) => ({
      id: String(tier.id),
      threshold: tier.threshold,
      giftProductId: tier.giftProductId ?? null,
      giftVariantId: String(tier.giftVariantId).trim(),
      position: tier.position,
    }))
    .sort((a, b) => a.position - b.position || toCents(a.threshold) - toCents(b.threshold));
}

function isCampaignGiftLine(line: CanonicalCartLine, campaignId: string): boolean {
  if (!isTaggedFreeGiftLine(line.properties ?? null)) return false;
  const lineCampaignId = line.properties?.[FGPB_CAMPAIGN_ID_PROPERTY];
  if (!lineCampaignId) return true;
  return String(lineCampaignId) === String(campaignId);
}

function lineTierId(line: CanonicalCartLine): string {
  return String(line.properties?.[FGPB_TIER_ID_PROPERTY] || "").trim();
}

function buildTierGiftProperties(campaignId: string, tierId: string): FreeGiftLineProperties {
  return {
    [FGPB_FREE_GIFT_PROPERTY]: "true",
    [FGPB_CAMPAIGN_ID_PROPERTY]: String(campaignId),
    [FGPB_TIER_ID_PROPERTY]: String(tierId),
  } as FreeGiftLineProperties;
}

function progressTowardNext(
  subtotal: number,
  unlockedCount: number,
  tiers: CanonicalRewardTier[],
): PromotionProgress {
  if (!tiers.length) {
    return { current: subtotal, target: 0, remaining: 0, percentage: 0, unlocked: false };
  }
  if (unlockedCount >= tiers.length) {
    const last = tiers[tiers.length - 1]!;
    return {
      current: subtotal,
      target: last.threshold,
      remaining: 0,
      percentage: 100,
      unlocked: true,
    };
  }
  const next = tiers[unlockedCount]!;
  return buildSpendThresholdProgress(subtotal, next.threshold).progress;
}

function resolveTierActions(input: {
  campaignId: string;
  unlocked: CanonicalRewardTier[];
  giftLines: CanonicalCartLine[];
}): { actions: PromotionAction[]; diagnostic: PromotionDiagnostic } {
  const { campaignId, unlocked, giftLines } = input;
  const actions: PromotionAction[] = [];
  const unlockedIds = new Set(unlocked.map((t) => t.id));

  // Remove locked / stale / missing-tier tagged lines for this campaign.
  const removeKeys: string[] = [];
  const linesByTier = new Map<string, CanonicalCartLine[]>();

  for (const line of giftLines) {
    const tierId = lineTierId(line);
    if (!tierId || !unlockedIds.has(tierId)) {
      if (line.lineKey) removeKeys.push(line.lineKey);
      continue;
    }
    const list = linesByTier.get(tierId) ?? [];
    list.push(line);
    linesByTier.set(tierId, list);
  }

  if (removeKeys.length) {
    actions.push({
      type: "REMOVE_FREE_GIFT",
      campaignId,
      lineKeys: removeKeys,
    });
  }

  for (const tier of unlocked) {
    const lines = linesByTier.get(tier.id) ?? [];
    if (lines.length > 1) {
      actions.push({
        type: "REMOVE_FREE_GIFT",
        campaignId,
        tierId: tier.id,
        lineKeys: lines
          .slice(1)
          .map((l) => l.lineKey)
          .filter((k): k is string => Boolean(k)),
      });
    }
    const primary = lines[0];
    if (primary && primary.quantity > 1) {
      actions.push({
        type: "NORMALIZE_FREE_GIFT_QUANTITY",
        campaignId,
        tierId: tier.id,
        lineKey: primary.lineKey,
        quantity: 1,
      });
    }
    if (!primary) {
      actions.push({
        type: "ADD_FREE_GIFT",
        campaignId,
        variantId: tier.giftVariantId,
        quantity: 1,
        tierId: tier.id,
        properties: buildTierGiftProperties(campaignId, tier.id),
      });
    }
  }

  if (!actions.length) {
    return {
      actions: [{ type: "NO_ACTION" }],
      diagnostic:
        unlocked.length > 0
          ? { code: "GIFT_ALREADY_PRESENT", message: "All unlocked tier gifts present" }
          : { code: "THRESHOLD_NOT_MET" },
    };
  }

  const hasAdd = actions.some((a) => a.type === "ADD_FREE_GIFT");
  const hasRemove = actions.some((a) => a.type === "REMOVE_FREE_GIFT");
  if (hasAdd) {
    return { actions, diagnostic: { code: "GIFT_SHOULD_BE_ADDED" } };
  }
  if (hasRemove && unlocked.length === 0) {
    return { actions, diagnostic: { code: "GIFT_SHOULD_BE_REMOVED" } };
  }
  if (hasRemove) {
    return { actions, diagnostic: { code: "DUPLICATE_GIFT_LINES" } };
  }
  return { actions, diagnostic: { code: "GIFT_QUANTITY_INVALID" } };
}

export function evaluateTieredFreeGifts(input: EvaluationInput): PromotionEvaluationResult {
  const { campaign, cart, now } = input;
  const campaignId = String(campaign.id);
  const campaignType = campaign.type;

  const base = {
    campaignId,
    campaignType,
    active: false,
    supported: true,
    eligible: false,
    rewards: [] as PromotionEvaluationResult["rewards"],
    actions: [{ type: "NO_ACTION" as const }],
    presentation: {
      widgetSettings: campaign.widgetSettings ?? undefined,
    },
  };

  const scheduleDiagnostic = isWithinSchedule(campaign, now);
  if (scheduleDiagnostic) {
    return { ...base, diagnostic: scheduleDiagnostic };
  }

  if (campaign.status !== "ACTIVE") {
    return {
      ...base,
      diagnostic: { code: "CAMPAIGN_DISABLED", message: `Campaign status is ${campaign.status}` },
    };
  }

  const tiers = normalizeTiers(campaign);
  if (!tiers.length) {
    return {
      ...base,
      active: true,
      diagnostic: {
        code: "INVALID_CAMPAIGN_CONFIGURATION",
        message: "Missing or invalid reward tiers",
      },
    };
  }

  // Strictly increasing thresholds required for evaluation.
  for (let i = 1; i < tiers.length; i++) {
    if (toCents(tiers[i]!.threshold) <= toCents(tiers[i - 1]!.threshold)) {
      return {
        ...base,
        active: true,
        diagnostic: {
          code: "INVALID_CAMPAIGN_CONFIGURATION",
          message: "Tier thresholds must be strictly increasing",
        },
      };
    }
  }

  const subtotal = Math.max(0, cart.subtotal);
  const subtotalCents = toCents(subtotal);
  const unlocked = tiers.filter((tier) => subtotalCents >= toCents(tier.threshold));
  const next = tiers[unlocked.length] ?? null;
  const eligible = unlocked.length > 0;
  const progress = progressTowardNext(subtotal, unlocked.length, tiers);

  const unlockedGifts: TieredUnlockedGift[] = unlocked.map((tier) => ({
    tierId: tier.id,
    threshold: tier.threshold,
    productId: tier.giftProductId ? String(tier.giftProductId) : undefined,
    variantId: tier.giftVariantId,
    quantity: 1 as const,
  }));

  const reward: TieredFreeGiftsReward = {
    type: "TIERED_FREE_GIFTS",
    campaignId,
    unlockedGifts,
    nextTier: next
      ? {
          tierId: next.id,
          threshold: next.threshold,
          remaining: Math.max(0, (toCents(next.threshold) - subtotalCents) / 100),
          productId: next.giftProductId ? String(next.giftProductId) : undefined,
          variantId: next.giftVariantId,
        }
      : null,
  };

  const giftLines = cart.lines.filter((line) => isCampaignGiftLine(line, campaignId));
  const { actions, diagnostic: actionDiagnostic } = resolveTierActions({
    campaignId,
    unlocked,
    giftLines,
  });

  let diagnostic: PromotionDiagnostic = actionDiagnostic;
  if (eligible && actionDiagnostic.code === "GIFT_ALREADY_PRESENT") {
    diagnostic = { code: "ELIGIBLE", message: "Threshold met; tier gifts present" };
  } else if (!eligible && actionDiagnostic.code === "THRESHOLD_NOT_MET") {
    diagnostic = { code: "THRESHOLD_NOT_MET" };
  }

  return {
    campaignId,
    campaignType,
    active: true,
    supported: true,
    eligible,
    diagnostic,
    progress,
    rewards: [reward],
    actions,
    presentation: {
      progress,
      widgetSettings: campaign.widgetSettings ?? undefined,
    },
  };
}

export const tieredFreeGiftsEvaluator: CampaignEvaluator = {
  type: REGISTRY_TYPES.TIERED_FREE_GIFTS,
  evaluate: evaluateTieredFreeGifts,
};
