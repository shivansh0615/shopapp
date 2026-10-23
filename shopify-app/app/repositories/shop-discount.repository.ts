import type { ShopDiscount } from "@prisma/client";
import db from "../db.server";

export type DiscountSyncStatus =
  | "pending"
  | "syncing"
  | "active"
  | "inactive"
  | "retry_scheduled"
  | "failed";

export async function findShopDiscountByShop(shop: string): Promise<ShopDiscount | null> {
  return db.shopDiscount.findUnique({ where: { shop } });
}

export async function upsertShopDiscount(shop: string, discountGid: string): Promise<ShopDiscount> {
  return db.shopDiscount.upsert({
    where: { shop },
    create: { shop, discountGid, syncStatus: "pending" },
    update: { discountGid },
  });
}

export async function upsertShopDiscountSyncState(
  shop: string,
  state: {
    syncStatus: DiscountSyncStatus;
    lastSyncErrorCode?: string | null;
    lastSyncedAt?: Date | null;
    discountGid?: string;
  },
): Promise<void> {
  const existing = await db.shopDiscount.findUnique({ where: { shop } });
  if (!existing) {
    if (!state.discountGid) return;
    await db.shopDiscount.create({
      data: {
        shop,
        discountGid: state.discountGid,
        syncStatus: state.syncStatus,
        lastSyncErrorCode: state.lastSyncErrorCode ?? null,
        lastSyncedAt: state.lastSyncedAt ?? null,
      },
    });
    return;
  }

  await db.shopDiscount.update({
    where: { shop },
    data: {
      syncStatus: state.syncStatus,
      lastSyncErrorCode:
        state.lastSyncErrorCode === undefined
          ? undefined
          : state.lastSyncErrorCode,
      lastSyncedAt:
        state.lastSyncedAt === undefined ? undefined : state.lastSyncedAt,
      ...(state.discountGid ? { discountGid: state.discountGid } : {}),
    },
  });
}

export async function deleteShopDiscountByShop(shop: string): Promise<number> {
  const result = await db.shopDiscount.deleteMany({ where: { shop } });
  return result.count;
}
