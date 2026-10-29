import {
  isFreeGiftCampaignType,
  isTieredFreeGiftsCampaignType,
} from "../services/promotion-engine/campaign-types";

export function isGiftCampaignType(campaignType: string): boolean {
  return isFreeGiftCampaignType(campaignType) || isTieredFreeGiftsCampaignType(campaignType);
}

/**
 * Only gift campaigns may hold the active slot.
 * A second gift campaign no longer fails here — the repository pauses the others.
 */
export function campaignCapacityError(
  _active: ReadonlyArray<{ id: number; campaignType: string }>,
  campaignType: string,
  _excludeId?: number,
): string | null {
  if (!isGiftCampaignType(campaignType)) {
    return "Only one gift campaign can be active.";
  }
  return null;
}
