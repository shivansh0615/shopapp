/**
 * Campaign selection policy — matches production repository behavior exactly.
 *
 * Production (`campaign.repository.findActiveCampaignByShop`):
 *   1. Load campaigns with status === "ACTIVE"
 *   2. Exclude campaigns outside their schedule window
 *   3. Sort by priority DESC, then createdAt DESC
 *   4. Select the first campaign
 *
 * Phase 2B notes:
 * - Does NOT introduce stacking or multiple-widget behavior.
 * - Optional `supportedTypesOnly` excludes unsupported campaign types.
 * - App Proxy + Discount Sync use `selectWinningCampaign` (Policy A).
 * - Schedule uses the same rules as `campaign-schedule.server`.
 */

import { filterScheduledCampaigns } from "../campaign-schedule.server";
import { isSupportedCampaignType } from "./campaign-types";
import type { PromotionDiagnostic } from "./types";

export type SelectableCampaign = {
  /** Optional; used only for internal selection diagnostics. */
  id?: number | string;
  status: string;
  startDate?: Date | null;
  endDate?: Date | null;
  priority?: number | null;
  createdAt?: Date | null;
  campaignType: string;
};

export type CampaignSelectionOptions = {
  now?: Date;
  /**
   * When true, exclude campaign types that have no registry evaluator.
   * Default false to mirror raw repository ordering when callers already
   * filtered ACTIVE rows.
   */
  supportedTypesOnly?: boolean;
};

/** Internal diagnostics — never part of App Proxy JSON contracts. */
export type CampaignSelectionMeta = {
  candidateCount: number;
  supportedCount: number;
  selectionReason: string;
  unsupportedSkipped: Array<{
    id?: number | string;
    campaignType: string;
    priority: number;
  }>;
};

export type CampaignSelectionResult<T extends SelectableCampaign> = {
  campaign: T | null;
  candidates: T[];
  diagnostic: PromotionDiagnostic;
  /**
   * Additive diagnostics. Always populated by `selectActiveCampaign`.
   * Callers are not required to read or forward this field.
   */
  meta: CampaignSelectionMeta;
};

function comparePriorityThenCreatedAt(a: SelectableCampaign, b: SelectableCampaign): number {
  const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;

  const aCreated = a.createdAt?.getTime() ?? 0;
  const bCreated = b.createdAt?.getTime() ?? 0;
  return bCreated - aCreated;
}

function skippedEntry(campaign: SelectableCampaign) {
  return {
    id: campaign.id,
    campaignType: campaign.campaignType,
    priority: campaign.priority ?? 0,
  };
}

function emptyMeta(selectionReason: string): CampaignSelectionMeta {
  return {
    candidateCount: 0,
    supportedCount: 0,
    selectionReason,
    unsupportedSkipped: [],
  };
}

/**
 * Explicit production selection policy.
 * Callers typically pass already-ACTIVE campaigns; status is re-checked defensively.
 * Default behavior (supportedTypesOnly unset/false) is unchanged.
 */
export function selectActiveCampaign<T extends SelectableCampaign>(
  campaigns: T[],
  options: CampaignSelectionOptions = {},
): CampaignSelectionResult<T> {
  const now = options.now ?? new Date();

  const active = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  if (!active.length) {
    return {
      campaign: null,
      candidates: [],
      diagnostic: { code: "NO_ACTIVE_CAMPAIGN", message: "No ACTIVE campaigns" },
      meta: emptyMeta("NO_ACTIVE_CAMPAIGN"),
    };
  }

  const scheduled = filterScheduledCampaigns(active, now);
  if (!scheduled.length) {
    const sample = active[0];
    const notStarted = sample.startDate && now < sample.startDate;
    const code = notStarted ? "NOT_STARTED" : "EXPIRED";
    return {
      campaign: null,
      candidates: [],
      diagnostic: {
        code,
        message: "No ACTIVE campaigns within schedule",
      },
      meta: emptyMeta(code),
    };
  }

  let candidates = [...scheduled].sort(comparePriorityThenCreatedAt);
  const candidateCount = candidates.length;
  const unsupportedAmongCandidates = candidates.filter(
    (c) => !isSupportedCampaignType(c.campaignType),
  );
  const supportedAmongCandidates = candidates.filter((c) =>
    isSupportedCampaignType(c.campaignType),
  );

  if (options.supportedTypesOnly) {
    if (!supportedAmongCandidates.length) {
      return {
        campaign: null,
        candidates: [],
        diagnostic: {
          code: "UNSUPPORTED_CAMPAIGN_TYPE",
          message: "Active campaigns exist but none have a supported evaluator",
        },
        meta: {
          candidateCount,
          supportedCount: 0,
          selectionReason: "UNSUPPORTED_CAMPAIGN_TYPE",
          unsupportedSkipped: unsupportedAmongCandidates.map(skippedEntry),
        },
      };
    }
    candidates = supportedAmongCandidates;
  }

  const selected = candidates[0] ?? null;
  const selectionReason = selected
    ? options.supportedTypesOnly && unsupportedAmongCandidates.length
      ? "SUPPORTED_TYPES_ONLY_HIGHEST_PRIORITY"
      : "HIGHEST_PRIORITY_SCHEDULED_ACTIVE"
    : "NO_ACTIVE_CAMPAIGN";

  return {
    campaign: selected,
    candidates,
    diagnostic: selected
      ? { code: "ELIGIBLE", message: "Selected highest-priority scheduled ACTIVE campaign" }
      : { code: "NO_ACTIVE_CAMPAIGN" },
    meta: {
      candidateCount,
      supportedCount: supportedAmongCandidates.length,
      selectionReason,
      unsupportedSkipped: options.supportedTypesOnly
        ? unsupportedAmongCandidates.map(skippedEntry)
        : [],
    },
  };
}

/**
 * Policy A — single winning campaign for App Proxy + Discount Sync.
 * Same semantics everywhere: supportedTypesOnly + ACTIVE + schedule + priority + tie-break.
 */
export function selectWinningCampaign<T extends SelectableCampaign>(
  campaigns: T[],
  options: { now?: Date } = {},
): CampaignSelectionResult<T> {
  return selectActiveCampaign(campaigns, {
    now: options.now,
    supportedTypesOnly: true,
  });
}
