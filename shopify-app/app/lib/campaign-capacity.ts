import {
  isFreeGiftCampaignType,
  isTieredFreeGiftsCampaignType,
} from "../services/promotion-engine/campaign-types";

function isGiftCampaignType(campaignType: string): boolean {
  return isFreeGiftCampaignType(campaignType) || isTieredFreeGiftsCampaignType(campaignType);
}

/** Capacity concerns enabled campaigns, not whether their schedule is due yet. */
export function campaignCapacityError(
  active: ReadonlyArray<{ id: number; campaignType: string }>,
  campaignType: string,
  excludeId?: number,
): string | null {
  if (!isGiftCampaignType(campaignType)) {
    return "Only one gift campaign can be active.";
  }
  const others = active.filter((campaign) => campaign.id !== excludeId);
  if (others.length > 0) {
    return "Only one campaign can be active. Pause the active campaign before activating another.";
  }
  return null;
}
