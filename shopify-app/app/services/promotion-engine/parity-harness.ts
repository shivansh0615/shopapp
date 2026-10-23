/**
 * Phase 2D — Server ↔ storefront parity harness (verification only).
 *
 * Compares canonical Free Gift evaluation against storefront
 * `buildLocalEvaluation()` on identical cart + campaign inputs.
 *
 * Does not change storefront behavior. Development / test use only.
 */

import { eligibleSubtotal, findTaggedLine, findTaggedLines } from "../../../storefront-extension/src/core/cart-client.js";
import { state } from "../../../storefront-extension/src/core/state.js";
import { buildLocalEvaluation } from "../../../storefront-extension/src/core/widget-state.js";
import { RULE_TYPES } from "../cart-rules.server";
import { evaluateWithRegistry } from "./evaluate";
import { calculateQualifyingSubtotal } from "./qualifying-subtotal";
import type {
  CanonicalCartLine,
  PromotionEvaluationResult,
} from "./types";

function toCents(n: number): number {
  return Math.round((Number(n) || 0) * 100);
}

export type ParityCampaignConfig = {
  campaignId: number | string;
  threshold: number;
  giftVariantId: string;
  status?: string;
  campaignType?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  /** When false, mimics widget-state disabled / not loaded for storefront. */
  storefrontCampaignLoaded?: boolean;
  storefrontEnabled?: boolean;
};

export type ParityCartItem = {
  variantId: string;
  quantity: number;
  price: number;
  lineKey?: string;
  properties?: Record<string, string> | null;
};

export type ParitySnapshot = {
  eligible: boolean;
  unlocked: boolean;
  remaining: number;
  progress: number;
  percentage: number;
  threshold: number;
  giftPresent: boolean;
  giftLineCount: number;
  taggedQuantityInvalid: boolean;
  duplicateGiftLines: boolean;
  /** Storefront sync action, or canonical mapped to the same ADD/REMOVE/NONE contract. */
  syncAction: "ADD_GIFT" | "REMOVE_GIFT" | "NONE";
  qualifyingSubtotal: number;
};

export type ParityMismatch = {
  field: keyof ParitySnapshot;
  storefront: unknown;
  canonical: unknown;
  responsibleCalculation: string;
  suggestedFix: string;
};

export type ParityCompareResult = {
  ok: boolean;
  storefront: ParitySnapshot;
  canonical: ParitySnapshot;
  mismatches: ParityMismatch[];
  canonicalDiagnostic?: string;
  canonicalRaw: PromotionEvaluationResult;
  storefrontRaw: ReturnType<typeof buildLocalEvaluation>;
};

const FIELD_META: Record<
  keyof ParitySnapshot,
  { responsibleCalculation: string; suggestedFix: string }
> = {
  eligible: {
    responsibleCalculation: "threshold compare (cents vs major units)",
    suggestedFix: "Align FREE_GIFT SPEND_THRESHOLD eligibility with storefront toCents()",
  },
  unlocked: {
    responsibleCalculation: "unlocked === eligible for Free Gift",
    suggestedFix: "Keep unlocked mirrored to eligible on both sides",
  },
  remaining: {
    responsibleCalculation: "max(0, threshold - qualifyingSubtotal)",
    suggestedFix: "Use cent-rounded remaining like storefront (thC - paidC) / 100",
  },
  progress: {
    responsibleCalculation: "percentage fill 0–100",
    suggestedFix: "Compute progress from cent totals to match buildLocalEvaluation",
  },
  percentage: {
    responsibleCalculation: "same as progress for Free Gift",
    suggestedFix: "Mirror progress percentage from cent ratio",
  },
  threshold: {
    responsibleCalculation: "campaign threshold",
    suggestedFix: "Pass the same threshold into both evaluators",
  },
  giftPresent: {
    responsibleCalculation: "_fgpb_free_gift + _fgpb_campaign_id tagged line",
    suggestedFix: "Identify gifts by properties only, never by variant alone",
  },
  giftLineCount: {
    responsibleCalculation: "count of campaign-tagged gift lines",
    suggestedFix: "Use the same campaign-scoped tagged-line filter",
  },
  taggedQuantityInvalid: {
    responsibleCalculation: "tagged gift quantity > 1",
    suggestedFix: "Flag quantity > 1 on both sides (storefront via lines, canonical via diagnostic)",
  },
  duplicateGiftLines: {
    responsibleCalculation: "more than one tagged gift line",
    suggestedFix: "Count campaign-tagged lines the same way",
  },
  syncAction: {
    responsibleCalculation:
      "storefront buildLocalEvaluation action (ADD if eligible+absent, REMOVE if ineligible+present)",
    suggestedFix:
      "Map canonical gift presence to the same ADD/REMOVE/NONE sync contract (ignore NORMALIZE detail here)",
  },
  qualifyingSubtotal: {
    responsibleCalculation: "sum of untagged line totals",
    suggestedFix: "Keep calculateQualifyingSubtotal === eligibleSubtotal",
  },
};

function nearlyEqual(a: number, b: number, epsilon = 1e-9): boolean {
  return Math.abs(a - b) <= epsilon;
}

/** Mutable view of storefront module state (JS-inferred `null` literals). */
type ParityStorefrontCampaign = {
  enabled: boolean;
  threshold: number;
  giftVariantId: string | null;
  campaignId: string | number | null;
};

type ParityStorefrontState = {
  campaign: ParityStorefrontCampaign;
  knownGiftVariantId: string | null;
  campaignLoaded: boolean;
  sv: number;
  se: number;
  sr: number;
  sp: number;
};

export function resetStorefrontCampaignState(config: ParityCampaignConfig): void {
  const loaded = config.storefrontCampaignLoaded !== false;
  const enabled = config.storefrontEnabled !== false;
  const storefront = state as ParityStorefrontState;
  storefront.campaignLoaded = loaded;
  storefront.campaign.enabled = enabled;
  storefront.campaign.threshold = config.threshold;
  storefront.campaign.giftVariantId = config.giftVariantId;
  storefront.campaign.campaignId = Number(config.campaignId) || config.campaignId;
  storefront.knownGiftVariantId = config.giftVariantId;
  // Phase 2E: parity seeds server promotion numbers to match canonical cents math.
  storefront.sv = 0;
  storefront.se = 0;
  storefront.sr = 0;
  storefront.sp = 0;
}

export function toStorefrontCart(items: ParityCartItem[]) {
  return {
    subtotal: items.reduce((t, i) => t + i.quantity * i.price, 0),
    currency: "INR",
    items: items.map((item, index) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      price: item.price,
      lineKey: item.lineKey ?? `line-${index}`,
      properties: item.properties ?? {},
    })),
  };
}

export function toCanonicalLines(items: ParityCartItem[]): CanonicalCartLine[] {
  return items.map((item, index) => ({
    variantId: item.variantId,
    quantity: item.quantity,
    price: item.price,
    lineKey: item.lineKey ?? `line-${index}`,
    properties: item.properties === null ? undefined : (item.properties ?? {}),
  }));
}

function mapCanonicalSyncAction(
  result: PromotionEvaluationResult,
  giftPresent: boolean,
): ParitySnapshot["syncAction"] {
  if (!result.supported || !result.active) return "NONE";
  if (result.eligible && !giftPresent) return "ADD_GIFT";
  if (!result.eligible && giftPresent) return "REMOVE_GIFT";
  return "NONE";
}

function snapshotFromStorefront(
  config: ParityCampaignConfig,
  items: ParityCartItem[],
): { snapshot: ParitySnapshot; raw: ReturnType<typeof buildLocalEvaluation> } {
  resetStorefrontCampaignState(config);
  const cart = toStorefrontCart(items);
  const qualifying = eligibleSubtotal(cart);
  // Seed App Proxy promotion fields as evaluate-cart would for this cart.
  if (config.storefrontCampaignLoaded !== false && config.storefrontEnabled !== false) {
    const paidC = toCents(qualifying);
    const thC = toCents(config.threshold);
    const eligible = thC > 0 && paidC >= thC;
    state.sv = 1;
    state.se = eligible ? 1 : 0;
    state.sr = thC > 0 ? Math.max(0, thC - paidC) / 100 : 0;
    state.sp = thC > 0 ? Math.min(100, Math.max(0, (paidC / thC) * 100)) : 0;
  }
  const raw = buildLocalEvaluation(cart);
  const tagged = findTaggedLines(cart) as Array<{ quantity: number }>;
  const giftPresent = !!findTaggedLine(cart);
  const action = raw.action;
  const syncAction: ParitySnapshot["syncAction"] =
    action === "ADD_GIFT" || action === "REMOVE_GIFT" || action === "NONE"
      ? action
      : "NONE";

  return {
    raw,
    snapshot: {
      eligible: !!raw.eligible,
      unlocked: !!raw.eligible,
      remaining: Number(raw.remaining) || 0,
      progress: Number(raw.progress) || 0,
      percentage: Number(raw.progress) || 0,
      threshold: Number(raw.threshold) || 0,
      giftPresent,
      giftLineCount: tagged.length,
      taggedQuantityInvalid: tagged.some((line) => line.quantity > 1),
      duplicateGiftLines: tagged.length > 1,
      syncAction,
      qualifyingSubtotal: qualifying,
    },
  };
}

function snapshotFromCanonical(
  config: ParityCampaignConfig,
  items: ParityCartItem[],
  now: Date,
): { snapshot: ParitySnapshot; raw: PromotionEvaluationResult } {
  const lines = toCanonicalLines(items);
  const qualifying = calculateQualifyingSubtotal({ subtotal: 0, lines });

  const raw = evaluateWithRegistry({
    campaign: {
      id: String(config.campaignId),
      type: config.campaignType ?? "Spend X -> Free Gift",
      status: config.status ?? "ACTIVE",
      startDate: config.startDate ?? null,
      endDate: config.endDate ?? null,
      rules: [{ type: "CART_SUBTOTAL", minimumAmount: config.threshold }],
      rewards: [
        {
          type: "FREE_GIFT",
          campaignId: String(config.campaignId),
          variantId: config.giftVariantId,
          quantity: 1,
        },
      ],
      threshold: config.threshold,
      giftVariantId: config.giftVariantId,
      ruleType: RULE_TYPES.SPEND_THRESHOLD,
    },
    cart: {
      // Match production: storefront sends eligibleSubtotal as cartSubtotal.
      subtotal: qualifying,
      lines,
    },
    now,
  });

  const giftLines = lines.filter((line) => {
    if (line.properties?.["_fgpb_free_gift"] !== "true") return false;
    const lineCid = line.properties?.["_fgpb_campaign_id"];
    if (!lineCid) return true;
    return String(lineCid) === String(config.campaignId);
  });
  const giftPresent = giftLines.length > 0;

  // Unsupported / inactive campaigns: storefront treats as disabled (not eligible).
  const inactive =
    !raw.supported ||
    !raw.active ||
    raw.diagnostic.code === "CAMPAIGN_DISABLED" ||
    raw.diagnostic.code === "NOT_STARTED" ||
    raw.diagnostic.code === "EXPIRED" ||
    raw.diagnostic.code === "UNSUPPORTED_CAMPAIGN_TYPE" ||
    raw.diagnostic.code === "INVALID_CAMPAIGN_CONFIGURATION";

  const eligible = inactive ? false : !!raw.eligible;
  const progress = inactive ? 0 : (raw.progress?.percentage ?? 0);
  const remaining = inactive ? (config.threshold || 0) : (raw.progress?.remaining ?? 0);

  return {
    raw,
    snapshot: {
      eligible,
      unlocked: eligible,
      remaining,
      progress,
      percentage: progress,
      threshold: config.threshold,
      giftPresent,
      giftLineCount: giftLines.length,
      taggedQuantityInvalid:
        raw.diagnostic.code === "GIFT_QUANTITY_INVALID" ||
        giftLines.some((line) => line.quantity > 1),
      duplicateGiftLines:
        raw.diagnostic.code === "DUPLICATE_GIFT_LINES" || giftLines.length > 1,
      syncAction: inactive ? "NONE" : mapCanonicalSyncAction(raw, giftPresent),
      qualifyingSubtotal: qualifying,
    },
  };
}

/**
 * Development-only comparison: legacy storefront vs canonical engine.
 * Never logs in production — callers (tests) assert on the result.
 */
export function compareLocalWithCanonical(input: {
  campaign: ParityCampaignConfig;
  items: ParityCartItem[];
  now?: Date;
  /** Skip fields that are intentionally divergent (document in Phase 2D report). */
  ignoreFields?: Array<keyof ParitySnapshot>;
}): ParityCompareResult {
  const now = input.now ?? new Date("2026-07-15T12:00:00Z");
  const storefront = snapshotFromStorefront(input.campaign, input.items);
  const canonical = snapshotFromCanonical(input.campaign, input.items, now);
  const ignore = new Set(input.ignoreFields ?? []);

  const mismatches: ParityMismatch[] = [];
  (Object.keys(storefront.snapshot) as Array<keyof ParitySnapshot>).forEach((field) => {
    if (ignore.has(field)) return;
    const left = storefront.snapshot[field];
    const right = canonical.snapshot[field];
    const equal =
      typeof left === "number" && typeof right === "number"
        ? nearlyEqual(left, right)
        : left === right;
    if (!equal) {
      mismatches.push({
        field,
        storefront: left,
        canonical: right,
        ...FIELD_META[field],
      });
    }
  });

  return {
    ok: mismatches.length === 0,
    storefront: storefront.snapshot,
    canonical: canonical.snapshot,
    mismatches,
    canonicalDiagnostic: canonical.raw.diagnostic.code,
    canonicalRaw: canonical.raw,
    storefrontRaw: storefront.raw,
  };
}

/** Prove storefront eligibleSubtotal matches server qualifying helper. */
export function compareQualifyingSubtotals(items: ParityCartItem[]): {
  ok: boolean;
  storefront: number;
  canonical: number;
} {
  const cart = toStorefrontCart(items);
  const storefront = eligibleSubtotal(cart);
  const canonical = calculateQualifyingSubtotal({
    subtotal: 0,
    lines: toCanonicalLines(items),
  });
  return {
    ok: nearlyEqual(storefront, canonical),
    storefront,
    canonical,
  };
}

export function centsParityProbe(subtotal: number, threshold: number): {
  storefrontEligible: boolean;
  majorUnitEligible: boolean;
  diverges: boolean;
} {
  const paidC = toCents(subtotal);
  const thC = toCents(threshold);
  const storefrontEligible = thC > 0 && paidC >= thC;
  const majorUnitEligible = threshold > 0 && subtotal >= threshold;
  return {
    storefrontEligible,
    majorUnitEligible,
    diverges: storefrontEligible !== majorUnitEligible,
  };
}
