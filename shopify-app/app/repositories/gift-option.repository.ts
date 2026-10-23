import type { GiftOption, Prisma } from "@prisma/client";
import db from "../db.server";
import { ownedCampaignWhere } from "./campaign.repository";

export async function findGiftOptionsByCampaign(
  campaignId: number,
  shop: string,
): Promise<GiftOption[]> {
  const owned = await db.campaign.findFirst({
    where: ownedCampaignWhere(campaignId, shop),
    select: { id: true },
  });
  if (!owned) return [];

  return db.giftOption.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Replace gift options only after proving the campaign belongs to `shop`.
 * Delete + create run in one transaction to avoid orphan/partial option sets.
 */
export async function replaceGiftOptions(
  campaignId: number,
  shop: string,
  options: Omit<Prisma.GiftOptionUncheckedCreateInput, "campaignId">[],
): Promise<GiftOption[] | null> {
  const where = ownedCampaignWhere(campaignId, shop);

  return db.$transaction(async (tx) => {
    const owned = await tx.campaign.findFirst({
      where,
      select: { id: true },
    });
    if (!owned) return null;

    await tx.giftOption.deleteMany({ where: { campaignId } });
    if (!options.length) return [];

    await tx.giftOption.createMany({
      data: options.map((option, index) => ({
        campaignId,
        productId: option.productId,
        productTitle: option.productTitle ?? null,
        productImage: option.productImage ?? null,
        variantId: option.variantId ?? null,
        sortOrder: option.sortOrder ?? index,
      })),
    });

    return tx.giftOption.findMany({
      where: { campaignId },
      orderBy: { sortOrder: "asc" },
    });
  });
}
