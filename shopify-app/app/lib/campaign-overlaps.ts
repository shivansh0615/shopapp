import {
  moneyToMajorNumber,
  resolveThresholdMajor,
  resolveTierThresholdMoney,
  type CampaignMoneyFields,
  type TierMoneyFields,
} from "./money";
import { isSupportedCampaignType, isTieredFreeGiftsCampaignType } from "../services/promotion-engine/campaign-types";

type Schedule = { startDate?: Date | null; endDate?: Date | null };

type CampaignOverlapSource = CampaignMoneyFields & Schedule & {
  id: number;
  name: string;
  status: string;
  campaignType: string;
  priority: number;
  rewardTiers: TierMoneyFields[];
};

export type CampaignOverlapSummary = {
  id: number;
  name: string;
  priority: number;
  spendGoals: number[];
  currencyCode: string | null;
  startsLater: boolean;
};

/** Only future portions of schedules matter when warning before activation. */
function remainingWindow(campaign: Schedule, now: number): [number, number] | null {
  const start = campaign.startDate?.getTime() ?? now;
  const end = campaign.endDate?.getTime() ?? Infinity;
  if (!Number.isFinite(start) || Number.isNaN(end) || end < Math.max(start, now)) return null;
  return [Math.max(start, now), end];
}

/** Pass rows from a tenant-scoped query; this helper never queries other stores. */
export function getCampaignOverlapSummaries(
  campaigns: CampaignOverlapSource[],
  current?: Schedule & { id?: number },
  now = new Date(),
): CampaignOverlapSummary[] {
  const currentWindow = remainingWindow(current ?? {}, now.getTime());
  if (!currentWindow) return [];

  return campaigns
    .filter((campaign) => {
      if (campaign.id === current?.id || campaign.status !== "ACTIVE" || !isSupportedCampaignType(campaign.campaignType)) return false;
      const window = remainingWindow(campaign, now.getTime());
      return window !== null && Math.max(window[0], currentWindow[0]) <= Math.min(window[1], currentWindow[1]);
    })
    .sort((a, b) => b.priority - a.priority || a.id - b.id)
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name || "Untitled campaign",
      priority: campaign.priority,
      spendGoals: isTieredFreeGiftsCampaignType(campaign.campaignType)
        ? campaign.rewardTiers.map((tier) => moneyToMajorNumber(resolveTierThresholdMoney(tier, campaign.currencyCode))).sort((a, b) => a - b)
        : [resolveThresholdMajor(campaign)],
      currencyCode: campaign.currencyCode ?? null,
      startsLater: Boolean(campaign.startDate && campaign.startDate > now),
    }));
}

export function parseCampaignPriority(value: FormDataEntryValue | null, fallback = 0): number {
  const priority = value === null ? fallback : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(priority) || priority < 0 || priority > 1000) {
    throw new Error("Campaign priority must be a whole number from 0 to 1000.");
  }
  return priority;
}
