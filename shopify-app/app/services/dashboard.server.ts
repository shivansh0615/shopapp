import db from "../db.server";
import type { CampaignWithTiers } from "./campaign.server";

const rewardTiersInclude = {
  rewardTiers: { orderBy: { position: "asc" as const } },
};

export type DashboardSummary = {
  totalCampaigns: number;
  activeCampaigns: number;
  draftCampaigns: number;
  pausedCampaigns: number;
  latestCampaigns: CampaignWithTiers[];
  activeCampaignList: CampaignWithTiers[];
};

export async function getDashboardSummary(shop: string): Promise<DashboardSummary> {
  const [latestCampaigns, activeCampaignList, campaignCounts] =
    await Promise.all([
      db.campaign.findMany({
        where: { shop },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: rewardTiersInclude,
      }),
      db.campaign.findMany({
        where: { shop, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: rewardTiersInclude,
      }),
      db.campaign.groupBy({
        by: ["status"],
        where: { shop },
        _count: { _all: true },
      }),
    ]);

  const countByStatus = new Map(
    campaignCounts.map((entry) => [entry.status, entry._count._all]),
  );
  const totalCampaigns = campaignCounts.reduce(
    (total, entry) => total + entry._count._all,
    0,
  );
  const activeCampaigns = countByStatus.get("ACTIVE") ?? 0;
  const draftCampaigns = countByStatus.get("DRAFT") ?? 0;
  const pausedCampaigns = countByStatus.get("PAUSED") ?? 0;

  return {
    totalCampaigns,
    activeCampaigns,
    draftCampaigns,
    pausedCampaigns,
    latestCampaigns,
    activeCampaignList,
  };
}
