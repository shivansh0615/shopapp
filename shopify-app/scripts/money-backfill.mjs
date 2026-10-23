/**
 * Idempotent integer-money backfill (Stage B).
 *
 * Usage:
 *   node --import tsx scripts/money-backfill.mjs --dry-run
 *   node --import tsx scripts/money-backfill.mjs --execute
 *
 * Does not print merchant-sensitive payloads. Batched transactions.
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_SHOP_CURRENCY,
  legacyFloatToMoney,
  resolveCampaignCurrency,
} from "../app/lib/money/index.ts";

const DRY_RUN = process.argv.includes("--dry-run") || !process.argv.includes("--execute");
const BATCH = Math.max(1, Number(process.env.MONEY_BACKFILL_BATCH || 50));
const DEFAULT_CURRENCY = resolveCampaignCurrency(
  process.env.MONEY_BACKFILL_CURRENCY || DEFAULT_SHOP_CURRENCY,
);

const stats = {
  campaignsScanned: 0,
  campaignsUpdated: 0,
  campaignsSkipped: 0,
  tiersScanned: 0,
  tiersUpdated: 0,
  tiersSkipped: 0,
  settingsScanned: 0,
  settingsUpdated: 0,
  settingsSkipped: 0,
  invalid: 0,
  overflow: 0,
  precisionMismatch: 0,
};

function classifyError(err) {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  if (name === "MoneyOverflowError") return "overflow";
  if (name === "MoneyParseError" || name === "UnsupportedCurrencyError") return "invalid";
  return "other";
}

async function main() {
  const prisma = new PrismaClient();
  console.log(
    JSON.stringify({
      mode: DRY_RUN ? "dry-run" : "execute",
      batch: BATCH,
      defaultCurrency: DEFAULT_CURRENCY,
    }),
  );

  try {
    let cursor;
    for (;;) {
      const rows = await prisma.campaign.findMany({
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          threshold: true,
          thresholdMinor: true,
          fixedDiscountAmount: true,
          fixedDiscountAmountMinor: true,
          currencyCode: true,
        },
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;

      for (const row of rows) {
        stats.campaignsScanned += 1;
        const currency = resolveCampaignCurrency(row.currencyCode || DEFAULT_CURRENCY);
        try {
          const th = legacyFloatToMoney(row.threshold, currency);
          const fixed =
            row.fixedDiscountAmount == null || !Number.isFinite(row.fixedDiscountAmount)
              ? null
              : legacyFloatToMoney(row.fixedDiscountAmount, currency);

          const needs =
            row.thresholdMinor == null ||
            row.thresholdMinor !== th.amountMinor ||
            (fixed != null &&
              (row.fixedDiscountAmountMinor == null ||
                row.fixedDiscountAmountMinor !== fixed.amountMinor)) ||
            row.currencyCode !== currency;

          if (!needs) {
            stats.campaignsSkipped += 1;
            continue;
          }

          if (!DRY_RUN) {
            await prisma.campaign.update({
              where: { id: row.id },
              data: {
                thresholdMinor: th.amountMinor,
                fixedDiscountAmountMinor: fixed?.amountMinor ?? null,
                currencyCode: currency,
              },
            });
          }
          stats.campaignsUpdated += 1;
        } catch (err) {
          const kind = classifyError(err);
          if (kind === "overflow") stats.overflow += 1;
          else stats.invalid += 1;
          console.error(JSON.stringify({ entity: "campaign", id: row.id, error: kind }));
        }
      }
    }

    let tierCursor;
    for (;;) {
      const tiers = await prisma.campaignRewardTier.findMany({
        take: BATCH,
        ...(tierCursor ? { skip: 1, cursor: { id: tierCursor } } : {}),
        orderBy: { id: "asc" },
        select: {
          id: true,
          campaignId: true,
          threshold: true,
          thresholdMinor: true,
          campaign: { select: { currencyCode: true } },
        },
      });
      if (!tiers.length) break;
      tierCursor = tiers[tiers.length - 1].id;

      for (const tier of tiers) {
        stats.tiersScanned += 1;
        const currency = resolveCampaignCurrency(
          tier.campaign.currencyCode || DEFAULT_CURRENCY,
        );
        try {
          const th = legacyFloatToMoney(tier.threshold, currency);
          if (tier.thresholdMinor != null && tier.thresholdMinor === th.amountMinor) {
            stats.tiersSkipped += 1;
            continue;
          }
          if (!DRY_RUN) {
            await prisma.campaignRewardTier.update({
              where: { id: tier.id },
              data: { thresholdMinor: th.amountMinor },
            });
          }
          stats.tiersUpdated += 1;
        } catch (err) {
          const kind = classifyError(err);
          if (kind === "overflow") stats.overflow += 1;
          else stats.invalid += 1;
          console.error(JSON.stringify({ entity: "tier", id: tier.id, error: kind }));
        }
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
      stats.settingsScanned += 1;
      const currency = resolveCampaignCurrency(row.currencyCode || DEFAULT_CURRENCY);
      try {
        const th = legacyFloatToMoney(row.defaultThreshold, currency);
        const needs =
          row.defaultThresholdMinor == null ||
          row.defaultThresholdMinor !== th.amountMinor ||
          row.currencyCode !== currency;
        if (!needs) {
          stats.settingsSkipped += 1;
          continue;
        }
        if (!DRY_RUN) {
          await prisma.appSettings.update({
            where: { id: row.id },
            data: {
              defaultThresholdMinor: th.amountMinor,
              currencyCode: currency,
            },
          });
        }
        stats.settingsUpdated += 1;
      } catch (err) {
        const kind = classifyError(err);
        if (kind === "overflow") stats.overflow += 1;
        else stats.invalid += 1;
        console.error(JSON.stringify({ entity: "settings", id: row.id, error: kind }));
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ ok: stats.invalid === 0 && stats.overflow === 0, stats }));
  if (stats.invalid || stats.overflow) process.exitCode = 2;
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exitCode = 1;
});
