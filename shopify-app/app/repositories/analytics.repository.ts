import type { AnalyticsEvent, Prisma } from "@prisma/client";
import db from "../db.server";
import { AppError } from "../lib/errors.server";

export type AnalyticsDb = {
  campaign: {
    findFirst: (args: {
      where: { id: number; shop: string };
      select?: { id?: boolean };
    }) => Promise<{ id: number } | null>;
  };
  analyticsEvent: {
    create: (args: {
      data: Prisma.AnalyticsEventUncheckedCreateInput;
    }) => Promise<AnalyticsEvent>;
    count: (args: {
      where: { shop: string; eventType: string };
    }) => Promise<number>;
    findMany: (args: {
      where: { shop: string; eventType?: string };
      select?: { payload?: boolean };
      orderBy?: unknown;
      take?: number;
    }) => Promise<Array<Pick<AnalyticsEvent, "payload"> | AnalyticsEvent>>;
  };
};

export async function assertCampaignOwnedByShop(
  shop: string,
  campaignId: number,
  client: AnalyticsDb = db as unknown as AnalyticsDb,
): Promise<void> {
  const normalizedShop = shop.trim();
  if (!normalizedShop) {
    throw new AppError({
      code: "SHOP_REQUIRED",
      message: "Shop is required.",
      errorClass: "validation",
    });
  }
  if (!Number.isInteger(campaignId) || campaignId < 1) {
    throw new AppError({
      code: "CAMPAIGN_ID_INVALID",
      message: "Campaign ID is required.",
      errorClass: "validation",
    });
  }

  const owned = await client.campaign.findFirst({
    where: { id: campaignId, shop: normalizedShop },
    select: { id: true },
  });
  if (!owned) {
    throw new AppError({
      code: "CAMPAIGN_NOT_OWNED",
      message: "Campaign not found for this shop.",
      errorClass: "validation",
      details: { shop: normalizedShop, campaignId },
    });
  }
}

export async function createAnalyticsEvent(
  data: Prisma.AnalyticsEventUncheckedCreateInput,
  client: AnalyticsDb = db as unknown as AnalyticsDb,
): Promise<AnalyticsEvent> {
  const shop = String(data.shop || "").trim();
  if (!shop) {
    throw new AppError({
      code: "SHOP_REQUIRED",
      message: "Shop is required.",
      errorClass: "validation",
    });
  }

  const campaignId =
    data.campaignId == null ? null : Number(data.campaignId);

  if (campaignId != null && Number.isFinite(campaignId) && campaignId > 0) {
    await assertCampaignOwnedByShop(shop, Math.trunc(campaignId), client);
  }

  return client.analyticsEvent.create({
    data: {
      ...data,
      shop,
      campaignId:
        campaignId != null && Number.isFinite(campaignId) && campaignId > 0
          ? Math.trunc(campaignId)
          : null,
    },
  });
}

export async function countEventsByType(
  shop: string,
  eventType: string,
  client: AnalyticsDb = db as unknown as AnalyticsDb,
): Promise<number> {
  const normalizedShop = shop.trim();
  return client.analyticsEvent.count({
    where: { shop: normalizedShop, eventType },
  });
}

export async function sumRevenueFromOrders(
  shop: string,
  client: AnalyticsDb = db as unknown as AnalyticsDb,
): Promise<number> {
  const events = await client.analyticsEvent.findMany({
    where: { shop: shop.trim(), eventType: "order_influenced" },
    select: { payload: true },
  });

  return events.reduce((total, event) => {
    const payload = event.payload as { revenue?: number } | null;
    const revenue = Number(payload?.revenue);
    return total + (Number.isFinite(revenue) ? revenue : 0);
  }, 0);
}

export async function findRecentEvents(
  shop: string,
  limit = 50,
  client: AnalyticsDb = db as unknown as AnalyticsDb,
): Promise<AnalyticsEvent[]> {
  return client.analyticsEvent.findMany({
    where: { shop: shop.trim() },
    orderBy: { createdAt: "desc" },
    take: limit,
  }) as Promise<AnalyticsEvent[]>;
}
