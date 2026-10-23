/**
 * Controlled staging money fixtures for a synthetic shop only.
 *
 * Usage:
 *   node --import tsx scripts/staging-money-fixtures.mjs --seed
 *   node --import tsx scripts/staging-money-fixtures.mjs --cleanup --confirm
 *   node --import tsx scripts/staging-money-fixtures.mjs --seed --with-invalid
 *
 * Shop: staging-money-fixture.myshopify.com (synthetic; not a real merchant)
 */

import { PrismaClient } from "@prisma/client";
import { legacyFloatToMoney, DEFAULT_SHOP_CURRENCY } from "../app/lib/money/index.ts";

export const FIXTURE_SHOP = "staging-money-fixture.myshopify.com";

const prisma = new PrismaClient();

function arg(flag) {
  return process.argv.includes(flag);
}

async function cleanup() {
  const deletedTiers = await prisma.campaignRewardTier.deleteMany({
    where: { campaign: { shop: FIXTURE_SHOP } },
  });
  const deletedCampaigns = await prisma.campaign.deleteMany({ where: { shop: FIXTURE_SHOP } });
  const deletedSettings = await prisma.appSettings.deleteMany({ where: { shop: FIXTURE_SHOP } });
  return {
    deletedTiers: deletedTiers.count,
    deletedCampaigns: deletedCampaigns.count,
    deletedSettings: deletedSettings.count,
  };
}

async function seed({ withInvalid }) {
  await cleanup();

  const currency = DEFAULT_SHOP_CURRENCY;

  // Settings — requires backfill (minor null)
  await prisma.appSettings.create({
    data: {
      shop: FIXTURE_SHOP,
      defaultThreshold: 999,
      defaultThresholdMinor: null,
      currencyCode: currency,
    },
  });

  // Exact two-decimal threshold — needs backfill
  const cExact = await prisma.campaign.create({
    data: {
      shop: FIXTURE_SHOP,
      name: "FIXTURE exact two-decimal",
      campaignType: "Spend X -> Free Gift",
      threshold: 999.99,
      thresholdMinor: null,
      currencyCode: currency,
      giftProductId: "gid://shopify/Product/fixture-1",
      giftProductTitle: "Fixture Gift",
      giftVariantId: "gid://shopify/ProductVariant/fixture-1",
      giftQuantity: 1,
      placements: [],
      status: "DRAFT",
    },
  });

  // Legacy float artifact — needs backfill under HALF_UP policy
  const cArtifact = await prisma.campaign.create({
    data: {
      shop: FIXTURE_SHOP,
      name: "FIXTURE legacy float artifact",
      campaignType: "Spend X -> Free Gift",
      threshold: 10.005,
      thresholdMinor: null,
      currencyCode: currency,
      giftProductId: "gid://shopify/Product/fixture-2",
      giftVariantId: "gid://shopify/ProductVariant/fixture-2",
      giftQuantity: 1,
      placements: [],
      status: "DRAFT",
    },
  });

  // Already populated minor (should skip overwrite incorrectly)
  const populated = legacyFloatToMoney(500, currency);
  const cPopulated = await prisma.campaign.create({
    data: {
      shop: FIXTURE_SHOP,
      name: "FIXTURE already populated minor",
      campaignType: "Spend X -> Free Gift",
      threshold: 500,
      thresholdMinor: populated.amountMinor,
      currencyCode: currency,
      giftProductId: "gid://shopify/Product/fixture-3",
      giftVariantId: "gid://shopify/ProductVariant/fixture-3",
      giftQuantity: 1,
      placements: [],
      status: "DRAFT",
    },
  });

  // Fixed discount — needs backfill
  const cFixed = await prisma.campaign.create({
    data: {
      shop: FIXTURE_SHOP,
      name: "FIXTURE fixed discount",
      campaignType: "Spend X -> Fixed Discount",
      threshold: 1000,
      thresholdMinor: null,
      fixedDiscountAmount: 100.5,
      fixedDiscountAmountMinor: null,
      currencyCode: currency,
      giftProductId: "",
      giftQuantity: 1,
      placements: [],
      status: "DRAFT",
    },
  });

  // Tiered — needs tier backfill
  const cTiered = await prisma.campaign.create({
    data: {
      shop: FIXTURE_SHOP,
      name: "FIXTURE tiered",
      campaignType: "Tiered Free Gifts",
      threshold: 50,
      thresholdMinor: null,
      currencyCode: currency,
      giftProductId: "",
      giftQuantity: 1,
      placements: [],
      status: "DRAFT",
      rewardTiers: {
        create: [
          {
            id: "fixture-tier-a",
            threshold: 50,
            thresholdMinor: null,
            giftVariantId: "gid://shopify/ProductVariant/fixture-t1",
            giftProductId: "p1",
            position: 0,
          },
          {
            id: "fixture-tier-b",
            threshold: 100,
            thresholdMinor: null,
            giftVariantId: "gid://shopify/ProductVariant/fixture-t2",
            giftProductId: "p2",
            position: 1,
          },
        ],
      },
    },
  });

  let invalidId = null;
  if (withInvalid) {
    // Negative-test row: unsupported currency code stored after expand (verification must fail)
    const bad = await prisma.campaign.create({
      data: {
        shop: FIXTURE_SHOP,
        name: "FIXTURE invalid currency",
        campaignType: "Spend X -> Free Gift",
        threshold: 10,
        thresholdMinor: 1000n,
        currencyCode: "CLF",
        giftProductId: "gid://shopify/Product/fixture-bad",
        giftVariantId: "gid://shopify/ProductVariant/fixture-bad",
        giftQuantity: 1,
        placements: [],
        status: "DRAFT",
      },
    });
    invalidId = bad.id;
  }

  const counts = await prisma.campaign.count({ where: { shop: FIXTURE_SHOP } });
  const tierCounts = await prisma.campaignRewardTier.count({
    where: { campaign: { shop: FIXTURE_SHOP } },
  });

  return {
    shop: FIXTURE_SHOP,
    campaignIds: {
      exact: cExact.id,
      artifact: cArtifact.id,
      populated: cPopulated.id,
      fixed: cFixed.id,
      tiered: cTiered.id,
      invalid: invalidId,
    },
    campaignCount: counts,
    tierCount: tierCounts,
  };
}

async function main() {
  const doSeed = arg("--seed");
  const doCleanup = arg("--cleanup");
  const withInvalid = arg("--with-invalid");
  const confirm = arg("--confirm");

  if (!doSeed && !doCleanup) {
    console.error("Usage: --seed [--with-invalid] | --cleanup --confirm");
    process.exitCode = 2;
    return;
  }

  try {
    if (doCleanup) {
      if (!confirm) {
        console.error("Cleanup requires --confirm (synthetic shop only).");
        process.exitCode = 2;
        return;
      }
      const result = await cleanup();
      console.log(JSON.stringify({ ok: true, action: "cleanup", shop: FIXTURE_SHOP, ...result }));
      return;
    }

    const result = await seed({ withInvalid });
    console.log(JSON.stringify({ ok: true, action: "seed", withInvalid, ...result }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
