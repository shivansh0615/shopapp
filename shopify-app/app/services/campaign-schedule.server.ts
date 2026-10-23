/** Schedule window fields — `undefined` treated as unset (same as `null`). */
export type CampaignScheduleFields = {
  startDate?: Date | null;
  endDate?: Date | null;
};

export function isCampaignWithinSchedule(
  campaign: CampaignScheduleFields,
  now: Date = new Date(),
): boolean {
  if (campaign.startDate && now < campaign.startDate) return false;
  if (campaign.endDate && now > campaign.endDate) return false;
  return true;
}

export function filterScheduledCampaigns<T extends CampaignScheduleFields>(
  campaigns: T[],
  now: Date = new Date(),
): T[] {
  return campaigns.filter((campaign) => isCampaignWithinSchedule(campaign, now));
}
