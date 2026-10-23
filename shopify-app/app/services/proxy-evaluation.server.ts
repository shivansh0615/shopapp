import { chooseCartCampaign } from "../../shared/campaign-policy";
import { buildDiscountConfig } from "./discount-engine/discount-config.builder";
/**
 * Shared App Proxy evaluation orchestration (Phase 2C / PR-1).
 *
 * Campaign selection → evaluateWithRegistry → route adapters.
 * Used by widget-state and evaluate-cart. Does not drive cart mutations.
 *
 * PR-1: App Proxy selection enables `supportedTypesOnly: true` so unsupported
 * ACTIVE campaign types cannot shadow a lower-priority Free Gift campaign.
 */

import type { Campaign, CampaignRewardTier } from "@prisma/client";
import { parseProxyCartLines, type ProxyCartLineSnapshot } from "../lib/cart-lines.server";
import { proxyDisabledPayload } from "../lib/proxy-route.server";
import { findGiftOptionsByCampaign } from "../repositories/gift-option.repository";
import { getActiveCampaigns } from "./campaign.server";
import { toCanonicalCampaign } from "./promotion-engine/adapters";
import {
  selectWinningCampaign,
  type CampaignSelectionResult,
  type SelectableCampaign,
} from "./promotion-engine/campaign-selection";
import { evaluateWithRegistry } from "./promotion-engine/evaluate";
import {
  toEvaluateCartResponse,
  toWidgetStateResponse,
  type EvaluateCartResponse,
} from "./promotion-engine/route-adapters";
import {
  resolveEvaluationSubtotal,
  type SubtotalDiagnostic,
} from "./promotion-engine/resolve-subtotal";
import type { CanonicalCartLine, PromotionEvaluationResult } from "./promotion-engine/types";
import { toPromotionCampaignSnapshot } from "./promotion-engine.server";
import { getSettings } from "./settings.server";
import type { StorefrontWidgetStateResponse } from "../lib/storefront-contract";
import type { PromotionCampaignSnapshot } from "./promotion-engine.server";

/** Internal selection diagnostics — never serialized into App Proxy JSON. */
export type ProxySelectionDiagnostics = {
  candidateCount: number;
  supportedCount: number;
  selectedCampaignId: number | string | null;
  selectedCampaignType: string | null;
  selectionReason: string;
  unsupportedSkipped: Array<{
    id?: number | string;
    campaignType: string;
    priority: number;
  }>;
};

export type ProxyEvaluationBundle = {
  campaign: Campaign | null;
  result: PromotionEvaluationResult | null;
  subtotal: number;
  subtotalSource: "legacy_caller_subtotal" | "calculated_from_cart_lines";
  currency: string;
  presentmentRate: number;
  snapshot: PromotionCampaignSnapshot | null;
  /** Internal only — not passed to route adapters / public JSON. */
  selectionDiagnostics: ProxySelectionDiagnostics;
  /** Internal only — set on SUBTOTAL_CALLER_MISMATCH; never public JSON. */
  subtotalDiagnostic?: SubtotalDiagnostic;
};

export function readCallerSubtotal(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get("cartSubtotal") || 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  // The proxy contract uses major units. Magnitude cannot identify the unit.
  return raw;
}

function readCurrency(request: Request): string {
  return (new URL(request.url).searchParams.get("currency") || "").trim().toUpperCase();
}

function readPresentmentRate(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get("currencyRate") || 1);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Convert shop-currency campaign money into the cart's presentment currency. */
export function toPresentmentSnapshot(
  snapshot: PromotionCampaignSnapshot,
  cartCurrency: string,
  presentmentRate: number,
): PromotionCampaignSnapshot {
  const campaignCurrency = String(snapshot.currencyCode || "").trim().toUpperCase();
  const targetCurrency = String(cartCurrency || campaignCurrency).trim().toUpperCase();
  const rate = Number.isFinite(presentmentRate) && presentmentRate > 0 ? presentmentRate : 1;
  if (!campaignCurrency || !targetCurrency || campaignCurrency === targetCurrency) return snapshot;
  const convert = (amount: number | null) =>
    amount == null ? null : Math.max(0, amount) * rate;
  return {
    ...snapshot,
    currencyCode: targetCurrency,
    threshold: convert(snapshot.threshold) ?? 0,
    fixedDiscountAmount: convert(snapshot.fixedDiscountAmount),
    rewardTiers: snapshot.rewardTiers?.map((tier) => ({
      ...tier,
      threshold: convert(tier.threshold) ?? 0,
    })),
  };
}

function toCanonicalLines(lines: ProxyCartLineSnapshot[]): CanonicalCartLine[] {
  return lines.map((line) => ({
    variantId: line.variantId,
    productId: line.productId,
    quantity: line.quantity,
    price: line.price,
    collectionIds: line.collectionIds,
    properties: line.properties,
    lineKey: line.lineKey,
  }));
}

function toProxySelectionDiagnostics<T extends SelectableCampaign>(
  selection: CampaignSelectionResult<T>,
): ProxySelectionDiagnostics {
  const selected = selection.campaign;
  const meta = selection.meta;
  return {
    candidateCount: meta?.candidateCount ?? 0,
    supportedCount: meta?.supportedCount ?? 0,
    selectedCampaignId: selected?.id ?? null,
    selectedCampaignType: selected?.campaignType ?? null,
    selectionReason: meta?.selectionReason ?? selection.diagnostic.code,
    unsupportedSkipped: meta?.unsupportedSkipped ?? [],
  };
}

/**
 * Canonical App Proxy campaign selection (PR-1).
 * Always enables supportedTypesOnly — does not change selectActiveCampaign defaults.
 * Diagnostics stay on the return value only (no production request logging).
 */
export function selectCampaignForProxyEvaluation<T extends SelectableCampaign>(
  campaigns: T[],
  options: { now?: Date; shop?: string } = {},
): {
  selection: CampaignSelectionResult<T>;
  diagnostics: ProxySelectionDiagnostics;
} {
  const selection = selectWinningCampaign(campaigns, {
    now: options.now,
  });
  return {
    selection,
    diagnostics: toProxySelectionDiagnostics(selection),
  };
}

/** Pure cart selection, shared by both proxy routes and independently testable. */
export function selectCartCampaignForProxy(
  campaigns: Array<Campaign & { rewardTiers?: CampaignRewardTier[] }>,
  input: { shop: string; subtotal: number; currency?: string; presentmentRate?: number },
): Campaign | null {
  const built = campaigns.flatMap((candidate) =>
    buildDiscountConfig({ shopDomain: input.shop, campaign: candidate }).activeCampaigns
      .map((config) => {
        const rate = input.currency && input.currency.toUpperCase() === candidate.currencyCode?.toUpperCase() ? 1 : input.presentmentRate ?? 1;
        const convert = (threshold: { amount: string }) => ({ ...threshold, amount: String(Number(threshold.amount) * rate) });
        return { ...config, ...("threshold" in config ? { threshold: convert(config.threshold) } : {}),
          ...("tiers" in config ? { tiers: config.tiers.map(tier => ({ ...tier, threshold: convert(tier.threshold) })) } : {}),
          priority: candidate.priority, candidate };
      }));
  return chooseCartCampaign(built, input.subtotal, 1, true)?.candidate ?? null;
}

/** Load ACTIVE scheduled campaigns, resolve cart eligibility, then evaluate. */
export async function evaluateProxyRequest(
  shop: string,
  request: Request,
  options: { now?: Date } = {},
): Promise<ProxyEvaluationBundle> {
  const now = options.now ?? new Date();
  const currency = readCurrency(request);
  const presentmentRate = readPresentmentRate(request);
  const callerSubtotal = readCallerSubtotal(request);
  const cartLines = toCanonicalLines(parseProxyCartLines(request));
  const resolvedSubtotal = resolveEvaluationSubtotal({
    callerSubtotal,
    lines: cartLines,
  });
  const { subtotal, source } = resolvedSubtotal;

  const campaigns = await getActiveCampaigns(shop);
  const { selection, diagnostics } = selectCampaignForProxyEvaluation(campaigns, {
    now,
    shop,
  });
  const campaign = selectCartCampaignForProxy(selection.candidates, { shop, subtotal, currency, presentmentRate });
  diagnostics.selectedCampaignId = campaign?.id ?? null;
  diagnostics.selectedCampaignType = campaign?.campaignType ?? null;
  diagnostics.selectionReason = "ELIGIBILITY_FIRST";

  if (!campaign) {
    return {
      campaign: null,
      result: null,
      subtotal,
      subtotalSource: source,
      currency,
      presentmentRate,
      snapshot: null,
      selectionDiagnostics: diagnostics,
      subtotalDiagnostic: resolvedSubtotal.diagnostic,
    };
  }

  const snapshot = toPresentmentSnapshot(
    toPromotionCampaignSnapshot(campaign),
    currency,
    presentmentRate,
  );
  const result = evaluateWithRegistry({
    campaign: toCanonicalCampaign(snapshot, {
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      priority: campaign.priority,
    }),
    cart: {
      subtotal,
      currencyCode: currency || undefined,
      lines: cartLines,
    },
    now,
  });

  return {
    campaign,
    result,
    subtotal,
    subtotalSource: source,
    currency,
    presentmentRate,
    snapshot,
    selectionDiagnostics: diagnostics,
    subtotalDiagnostic: resolvedSubtotal.diagnostic,
  };
}

export async function buildWidgetStateProxyResponse(
  shop: string,
  request: Request,
): Promise<StorefrontWidgetStateResponse> {
  const settings = await getSettings(shop);
  const bundle = await evaluateProxyRequest(shop, request);

  if (!bundle.campaign || !bundle.result) {
    return proxyDisabledPayload("widget-state");
  }

  const snapshot = bundle.snapshot!;
  return toWidgetStateResponse(bundle.result, {
    campaign: bundle.campaign,
    snapshot,
    settings,
    currency: bundle.currency || undefined,
    subtotalSource: bundle.subtotalSource,
  });
}

export async function buildEvaluateCartProxyResponse(
  shop: string,
  request: Request,
): Promise<EvaluateCartResponse> {
  const settings = await getSettings(shop);
  const bundle = await evaluateProxyRequest(shop, request);

  if (!bundle.campaign || !bundle.result) {
    return proxyDisabledPayload("evaluate-cart");
  }

  const snapshot = bundle.snapshot!;
  const giftOptions = snapshot.allowCustomerChoice
    ? await findGiftOptionsByCampaign(snapshot.id, shop)
    : [];

  return toEvaluateCartResponse(bundle.result, {
    campaign: bundle.campaign,
    snapshot,
    settings,
    currency: bundle.currency || undefined,
    giftOptions,
    subtotalSource: bundle.subtotalSource,
  });
}
