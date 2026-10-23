import type { AppSettings, Prisma } from "@prisma/client";
import * as settingsRepository from "../repositories/settings.repository";
import {
  DEFAULT_SHOP_CURRENCY,
  dualWriteThreshold,
  resolveCampaignCurrency,
} from "../lib/money";

export type UpdateSettingsInput = Partial<{
  defaultThreshold: number | string;
  defaultWidgetTemplate: string;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  autoAddGift: boolean;
  currencyCode: string;
}>;

function validateSettingsUpdate(data: UpdateSettingsInput) {
  if (data.defaultThreshold !== undefined) {
    try {
      dualWriteThreshold(
        data.defaultThreshold,
        resolveCampaignCurrency(data.currencyCode ?? DEFAULT_SHOP_CURRENCY),
      );
    } catch {
      throw new Error("Default threshold must be a valid money amount greater than 0.");
    }
  }
  if (data.defaultWidgetTemplate !== undefined && !data.defaultWidgetTemplate.trim()) {
    throw new Error("Default widget template is required.");
  }
}

export async function getSettings(shop: string, currencyCode?: string): Promise<AppSettings> {
  let settings = await settingsRepository.findSettingsByShop(shop);
  if (!settings) {
    settings = await settingsRepository.createSettings(shop, currencyCode);
  }
  return settings;
}

export async function updateSettings(shop: string, data: UpdateSettingsInput): Promise<AppSettings> {
  const existing = await getSettings(shop, data.currencyCode);
  const currency = resolveCampaignCurrency(data.currencyCode ?? existing.currencyCode);
  validateSettingsUpdate({ ...data, currencyCode: currency });

  const next: Prisma.AppSettingsUpdateInput = {};
  if (data.defaultWidgetTemplate !== undefined) next.defaultWidgetTemplate = data.defaultWidgetTemplate;
  if (data.primaryColor !== undefined) next.primaryColor = data.primaryColor;
  if (data.backgroundColor !== undefined) next.backgroundColor = data.backgroundColor;
  if (data.textColor !== undefined) next.textColor = data.textColor;
  if (data.autoAddGift !== undefined) next.autoAddGift = data.autoAddGift;
  if (data.defaultThreshold !== undefined) {
    const money = dualWriteThreshold(data.defaultThreshold, currency);
    next.defaultThreshold = money.threshold;
    next.defaultThresholdMinor = money.thresholdMinor;
    next.currencyCode = currency;
  } else if (data.currencyCode !== undefined) {
    const money = dualWriteThreshold(existing.defaultThreshold, currency);
    next.defaultThresholdMinor = money.thresholdMinor;
    next.currencyCode = currency;
  }

  return settingsRepository.updateSettings(shop, next);
}
