/**
 * Read-only provisioning report for one shop.
 *
 * Prints the stored discount node, the app's sync state, and the exact
 * discount-config JSON that would be written to the function's metafield for
 * the currently winning campaign — so the gift variant IDs and campaign IDs the
 * function will match on can be compared against what the storefront tags.
 *
 * Performs no writes and no Admin API calls.
 *
 *   npx tsx scripts/discount-provision-inspect.ts <shop-domain>
 */
import { PrismaClient } from "@prisma/client";

import { buildDiscountSyncPlan } from "../app/services/discount-sync.server";

const db = new PrismaClient();

async function main() {
  const shop = process.argv[2];
  if (!shop) {
    console.error("usage: npx tsx scripts/discount-provision-inspect.ts <shop-domain>");
    process.exitCode = 1;
    return;
  }

  const [discount, campaigns, settings, session] = await Promise.all([
    db.shopDiscount.findUnique({ where: { shop } }),
    db.campaign.findMany({ where: { shop } }),
    db.appSettings.findFirst({ where: { shop } }),
    db.session.findFirst({ where: { shop }, select: { id: true, scope: true } }),
  ]);

  const plan = buildDiscountSyncPlan({ shop, campaigns });

  console.log(
    JSON.stringify(
      {
        shop,
        installed: Boolean(session),
        grantedScopes: session?.scope ?? null,
        shopDiscount: discount
          ? {
              discountGid: discount.discountGid,
              syncStatus: discount.syncStatus,
              lastSyncedAt: discount.lastSyncedAt,
              lastSyncErrorCode: discount.lastSyncErrorCode,
            }
          : null,
        autoAddGift: settings?.autoAddGift ?? null,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.campaignType,
          status: c.status,
          threshold: c.threshold,
          giftVariantId: c.giftVariantId,
          giftProductId: c.giftProductId,
          updatedAt: c.updatedAt,
          // A campaign edited after the last sync means the metafield Shopify
          // holds may no longer describe the campaign the storefront tags with.
          staleVsLastSync: discount?.lastSyncedAt
            ? c.updatedAt > discount.lastSyncedAt
            : null,
        })),
        plannedMode: plan.mode,
        plannedConfig: JSON.parse(plan.configJson),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
