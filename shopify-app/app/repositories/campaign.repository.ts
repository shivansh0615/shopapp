import type { Campaign, CampaignRewardTier, Prisma } from "@prisma/client";
import db from "../db.server";
import { campaignCapacityError } from "../lib/campaign-capacity";
import { filterScheduledCampaigns } from "../services/campaign-schedule.server";

export type CampaignWithTiers = Campaign & {
  rewardTiers: CampaignRewardTier[];
};

const withTiers = {
  rewardTiers: { orderBy: { position: "asc" as const } },
};

/** Transaction-scoped database lock; shared by every campaign write path. */
async function lockCampaignCapacity(tx: Prisma.TransactionClient, shop: string) {
  if (!shop.trim()) throw new Error("shop is required for campaign ownership.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`campaign-capacity:${shop}`}))`;
}

async function assertCapacity(
  tx: Prisma.TransactionClient, shop: string, status: string, campaignType: string, excludeId?: number,
) {
  if (status !== "ACTIVE") return;
  const active = await tx.campaign.findMany({
    where: { shop, status: "ACTIVE" },
    select: { id: true, campaignType: true },
  });
  const error = campaignCapacityError(active, campaignType, excludeId);
  if (error) throw new Error(error);
}

function nextString(value: string | { set?: string } | undefined, current: string): string {
  return typeof value === "string" ? value : value?.set ?? current;
}

/** Tenant-scoped campaign identity — never mutate by id alone. */
export function ownedCampaignWhere(id: number, shop: string): { id: number; shop: string } {
  const normalizedShop = shop.trim();
  if (!Number.isInteger(id) || id < 1) {
    throw new Error("Invalid campaign id.");
  }
  if (!normalizedShop) {
    throw new Error("shop is required for campaign ownership.");
  }
  return { id, shop: normalizedShop };
}

function normalizeJsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function normalizeCreateInput(
  data: Prisma.CampaignUncheckedCreateInput,
): Prisma.CampaignUncheckedCreateInput {
  return {
    ...data,
    placements: normalizeJsonArray(data.placements),
    triggerProductIds: normalizeJsonArray(data.triggerProductIds),
    triggerCollectionIds: normalizeJsonArray(data.triggerCollectionIds),
    ruleType: data.ruleType || "SPEND_THRESHOLD",
    triggerQuantity: data.triggerQuantity ?? 1,
    priority: data.priority ?? 0,
    allowCustomerChoice: data.allowCustomerChoice ?? false,
  };
}

function normalizeUpdateInput(
  data: Prisma.CampaignUpdateInput,
): Prisma.CampaignUpdateInput {
  const next = { ...data };
  if ("placements" in data && data.placements !== undefined) {
    next.placements = normalizeJsonArray(data.placements);
  }
  if ("triggerProductIds" in data && data.triggerProductIds !== undefined) {
    next.triggerProductIds = normalizeJsonArray(data.triggerProductIds);
  }
  if ("triggerCollectionIds" in data && data.triggerCollectionIds !== undefined) {
    next.triggerCollectionIds = normalizeJsonArray(data.triggerCollectionIds);
  }
  return next;
}

function mapTierCreateRows(
  campaignId: number,
  tiers: Prisma.CampaignRewardTierCreateWithoutCampaignInput[],
) {
  return tiers.map((tier) => ({
    id: typeof tier.id === "string" ? tier.id : undefined,
    campaignId,
    threshold: Number(tier.threshold),
    thresholdMinor:
      tier.thresholdMinor === null || tier.thresholdMinor === undefined
        ? null
        : typeof tier.thresholdMinor === "bigint"
          ? tier.thresholdMinor
          : BigInt(tier.thresholdMinor as number | string),
    giftProductId:
      tier.giftProductId === null || tier.giftProductId === undefined
        ? null
        : String(tier.giftProductId),
    giftProductTitle:
      tier.giftProductTitle === null || tier.giftProductTitle === undefined
        ? null
        : String(tier.giftProductTitle),
    giftProductImage:
      tier.giftProductImage === null || tier.giftProductImage === undefined
        ? null
        : String(tier.giftProductImage),
    giftVariantId: String(tier.giftVariantId),
    position: Number(tier.position),
  }));
}

export async function createCampaign(
  data: Prisma.CampaignUncheckedCreateInput,
): Promise<Campaign> {
  const shop = data.shop.trim();
  return db.$transaction(async (tx) => {
    await lockCampaignCapacity(tx, shop);
    await assertCapacity(tx, shop, data.status, data.campaignType);
    return tx.campaign.create({ data: normalizeCreateInput({ ...data, shop }) });
  }, { isolationLevel: "ReadCommitted" });
}

export async function createCampaignWithTiers(
  data: Prisma.CampaignUncheckedCreateInput & {
    rewardTiers?: { create: Prisma.CampaignRewardTierCreateWithoutCampaignInput[] };
  },
): Promise<CampaignWithTiers> {
  const { rewardTiers, ...rest } = data;
  const shop = data.shop.trim();
  return db.$transaction(async (tx) => {
    await lockCampaignCapacity(tx, shop);
    await assertCapacity(tx, shop, data.status, data.campaignType);
    return tx.campaign.create({
      data: {
        ...normalizeCreateInput({ ...rest, shop }),
        ...(rewardTiers ? { rewardTiers } : {}),
      },
      include: withTiers,
    });
  }, { isolationLevel: "ReadCommitted" });
}

export async function findCampaignsByShop(shop: string): Promise<CampaignWithTiers[]> {
  return db.campaign.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    include: withTiers,
  });
}

export async function findCampaignById(
  id: number,
  shop: string,
): Promise<CampaignWithTiers | null> {
  return db.campaign.findFirst({
    where: ownedCampaignWhere(id, shop),
    include: withTiers,
  });
}

export type UpdateOwnedCampaignOptions = {
  data: Prisma.CampaignUpdateInput;
  /**
   * `undefined` — leave tiers unchanged.
   * array (including empty) — replace all tiers atomically with campaign fields.
   */
  replaceTiers?: Prisma.CampaignRewardTierCreateWithoutCampaignInput[];
};

/**
 * Shop-scoped campaign mutation. Ownership is enforced inside the transaction
 * before any write; tier replace + field update commit together or not at all.
 */
export async function updateOwnedCampaign(
  id: number,
  shop: string,
  options: UpdateOwnedCampaignOptions,
): Promise<CampaignWithTiers | null> {
  const where = ownedCampaignWhere(id, shop);

  return db.$transaction(async (tx) => {
    await lockCampaignCapacity(tx, where.shop);
    const owned = await tx.campaign.findFirst({
      where,
      select: { id: true, status: true, campaignType: true },
    });
    if (!owned) return null;
    // Shop ownership cannot be changed through a campaign edit.
    if (options.data.shop !== undefined && nextString(options.data.shop, where.shop) !== where.shop) {
      throw new Error("Campaigns cannot be moved between shops.");
    }
    await assertCapacity(tx, where.shop,
      nextString(options.data.status, owned.status),
      nextString(options.data.campaignType, owned.campaignType), id);

    if (options.replaceTiers !== undefined) {
      await tx.campaignRewardTier.deleteMany({ where: { campaignId: id } });
      if (options.replaceTiers.length) {
        await tx.campaignRewardTier.createMany({
          data: mapTierCreateRows(id, options.replaceTiers),
        });
      }
    }

    await tx.campaign.update({
      where: { id },
      data: normalizeUpdateInput(options.data),
    });

    return tx.campaign.findFirst({
      where,
      include: withTiers,
    });
  }, { isolationLevel: "ReadCommitted" });
}

/** @deprecated Prefer updateOwnedCampaign — kept for narrow call sites. */
export async function updateCampaign(
  id: number,
  shop: string,
  data: Prisma.CampaignUpdateInput,
): Promise<CampaignWithTiers | null> {
  return updateOwnedCampaign(id, shop, { data });
}

export async function replaceCampaignTiers(
  campaignId: number,
  shop: string,
  tiers: Prisma.CampaignRewardTierCreateWithoutCampaignInput[],
): Promise<boolean> {
  const updated = await updateOwnedCampaign(campaignId, shop, {
    data: {},
    replaceTiers: tiers,
  });
  return updated != null;
}

export async function deleteCampaign(id: number, shop: string): Promise<boolean> {
  const result = await db.campaign.deleteMany({
    where: ownedCampaignWhere(id, shop),
  });
  return result.count > 0;
}

export async function findActiveCampaignsByShop(shop: string): Promise<CampaignWithTiers[]> {
  const campaigns = await db.campaign.findMany({
    where: { shop, status: "ACTIVE" },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: withTiers,
  });
  return filterScheduledCampaigns(campaigns) as CampaignWithTiers[];
}

/** Includes future and expired schedules while their saved status is ACTIVE. */
export async function findEnabledCampaignsByShop(shop: string) {
  return db.campaign.findMany({
    where: { shop: shop.trim(), status: "ACTIVE" },
    select: { id: true, campaignType: true },
  });
}

export async function findActiveCampaignByShop(shop: string): Promise<CampaignWithTiers | null> {
  const campaigns = await findActiveCampaignsByShop(shop);
  return campaigns[0] ?? null;
}

export async function activateCampaign(
  id: number,
  shop: string,
): Promise<CampaignWithTiers | null> {
  return updateOwnedCampaign(id, shop, {
    data: { status: "ACTIVE" },
  });
}
