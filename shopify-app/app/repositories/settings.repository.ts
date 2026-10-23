import type { AppSettings, Prisma } from "@prisma/client";
import db from "../db.server";

export async function findSettingsByShop(shop: string): Promise<AppSettings | null> {
  return db.appSettings.findUnique({ where: { shop } });
}

export async function createSettings(shop: string, currencyCode?: string): Promise<AppSettings> {
  return db.appSettings.upsert({
    where: { shop },
    create: { shop, ...(currencyCode ? { currencyCode } : {}) },
    update: {},
  });
}

export async function updateSettings(
  shop: string,
  data: Prisma.AppSettingsUpdateInput,
): Promise<AppSettings> {
  return db.appSettings.update({
    where: { shop },
    data,
  });
}
