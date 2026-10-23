/**
 * Verify integer-money backfill completeness (no secrets printed).
 *
 * Usage: node --import tsx scripts/money-backfill-verify.mjs
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_SHOP_CURRENCY,
  formatMoneyDecimal,
  legacyFloatToMoney,
  resolveCampaignCurrency,
} from "../app/lib/money/index.ts";

async function main() {
  const prisma = new PrismaClient();
  const report = {
    campaignNullMinor: 0,
    campaignMismatch: 0,
    tierNullMinor: 0,
    tierMismatch: 0,
    settingsNullMinor: 0,
    settingsMismatch: 0,
    invalidCurrency: 0,
  };

  try {
    const campaigns = await prisma.campaign.findMany({
      select: {
        id: true,
        threshold: true,
        thresholdMinor: true,
        fixedDiscountAmount: true,
        fixedDiscountAmountMinor: true,
        currencyCode: true,
      },
    });
    for (const row of campaigns) {
      try {
        const currency = resolveCampaignCurrency(row.currencyCode || DEFAULT_SHOP_CURRENCY);
        if (row.thresholdMinor == null) {
          report.campaignNullMinor += 1;
          continue;
        }
        const expected = legacyFloatToMoney(row.threshold, currency);
        if (expected.amountMinor !== row.thresholdMinor) report.campaignMismatch += 1;
        if (row.fixedDiscountAmount != null && Number.isFinite(row.fixedDiscountAmount)) {
          const fx = legacyFloatToMoney(row.fixedDiscountAmount, currency);
          if (
            row.fixedDiscountAmountMinor == null ||
            row.fixedDiscountAmountMinor !== fx.amountMinor
          ) {
            report.campaignMismatch += 1;
          }
        }
        // touch format for sanity
        formatMoneyDecimal(expected);
      } catch {
        report.invalidCurrency += 1;
      }
    }

    const tiers = await prisma.campaignRewardTier.findMany({
      select: {
        id: true,
        threshold: true,
        thresholdMinor: true,
        campaign: { select: { currencyCode: true } },
      },
    });
    for (const tier of tiers) {
      try {
        const currency = resolveCampaignCurrency(
          tier.campaign.currencyCode || DEFAULT_SHOP_CURRENCY,
        );
        if (tier.thresholdMinor == null) {
          report.tierNullMinor += 1;
          continue;
        }
        const expected = legacyFloatToMoney(tier.threshold, currency);
        if (expected.amountMinor !== tier.thresholdMinor) report.tierMismatch += 1;
      } catch {
        report.invalidCurrency += 1;
      }
    }

    const settings = await prisma.appSettings.findMany({
      select: {
        id: true,
        defaultThreshold: true,
        defaultThresholdMinor: true,
        currencyCode: true,
      },
    });
    for (const row of settings) {
      try {
        const currency = resolveCampaignCurrency(row.currencyCode || DEFAULT_SHOP_CURRENCY);
        if (row.defaultThresholdMinor == null) {
          report.settingsNullMinor += 1;
          continue;
        }
        const expected = legacyFloatToMoney(row.defaultThreshold, currency);
        if (expected.amountMinor !== row.defaultThresholdMinor) report.settingsMismatch += 1;
      } catch {
        report.invalidCurrency += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const ok =
    report.campaignNullMinor === 0 &&
    report.campaignMismatch === 0 &&
    report.tierNullMinor === 0 &&
    report.tierMismatch === 0 &&
    report.settingsNullMinor === 0 &&
    report.settingsMismatch === 0 &&
    report.invalidCurrency === 0;

  console.log(JSON.stringify({ ok, report }));
  if (!ok) process.exitCode = 2;
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
