import { Prisma, type PrismaClient } from "@prisma/client";
import db from "../db.server";
import { logOperationalError } from "../lib/errors.server";
import {
  deactivateAutomaticAppDiscount,
  resolveShopDiscountGid,
} from "./discount-provisioner.server";
import {
  DISCOUNT_SYNC_ACTIONS,
  cancelOpenDiscountSyncJobs,
  enqueueDiscountSyncJob,
  type DiscountSyncJobStore,
} from "./discount-sync-job.server";
import type { ShopifyAdminClient } from "./shopify-admin.server";

export type AppUninstalledResult = {
  shop: string;
  sessionsDeleted: number;
  campaignsPreserved: number;
  campaignsPaused: number;
  settingsPreserved: number;
  shopDiscountRecordsDeleted: number;
  discountDeactivated: boolean;
  /**
   * When remote deactivation failed and credentials are about to be wiped,
   * a terminal DiscountSyncJob row is recorded (no post-wipe retry possible).
   */
  discountDeactivateTerminalRecorded: boolean;
  cleanupPrepared: true;
};

export type ShopRedactResult = {
  shop: string;
  sessionsDeleted: number;
  campaignsDeleted: number;
  settingsDeleted: number;
  shopDiscountRecordsDeleted: number;
  analyticsDeleted: number;
  integrationStatusDeleted: number;
};

export type CustomerComplianceResult = {
  shop: string;
  topic: "customers/data_request" | "customers/redact";
  acknowledged: true;
  buyerRecordsFound: false;
};

/** Minimal surface needed to run shop/redact inside one transaction (injectable for tests). */
export type ShopRedactDb = Pick<PrismaClient, "$transaction"> &
  Partial<Pick<PrismaClient, "$queryRaw">>;

export type AppUninstalledOptions = {
  /** Best-effort Admin client while the offline session still exists. */
  admin?: ShopifyAdminClient | null;
  db?: {
    $transaction: PrismaClient["$transaction"];
    $queryRaw?: PrismaClient["$queryRaw"];
    discountSyncJob: Pick<
      DiscountSyncJobStore["discountSyncJob"],
      "findUnique" | "create" | "update" | "updateMany"
    >;
  };
};

type UninstallCleanupRow = {
  sessionsDeleted: number;
  campaignsPreserved: number;
  campaignsPaused: number;
  settingsPreserved: number;
  shopDiscountRecordsDeleted: number;
};

type ShopRedactCleanupRow = Omit<ShopRedactResult, "shop">;

function canUseRawCleanup(
  client: ShopRedactDb,
): client is ShopRedactDb & Pick<PrismaClient, "$queryRaw"> {
  return typeof client.$queryRaw === "function";
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function normalizeShopDomain(shop: string): string | null {
  return toStringOrNull(shop);
}

type DeactivateOutcome =
  | { ok: true; deactivated: boolean }
  | { ok: false; error: unknown };

/**
 * Best-effort: deactivate the managed automatic discount while credentials remain.
 * Never throws — uninstall DB cleanup must still proceed.
 *
 * Limitation: after sessions are deleted, Shopify Admin calls are no longer possible.
 * Failed deactivation therefore becomes a terminal operational record, not a retryable job.
 */
async function bestEffortDeactivateShopDiscount(
  shop: string,
  admin: ShopifyAdminClient,
): Promise<DeactivateOutcome> {
  try {
    const gid = await resolveShopDiscountGid(admin, shop);
    if (!gid) return { ok: true, deactivated: false };
    await deactivateAutomaticAppDiscount(admin, gid);
    return { ok: true, deactivated: true };
  } catch (error) {
    logOperationalError("uninstall-deactivate-discount", error, { shop });
    return { ok: false, error };
  }
}

/**
 * app/uninstalled: revoke operational access while retaining reinstall-safe data.
 * Campaigns, tiers, gift options, settings, and analytics stay. Every campaign
 * for this shop is set to PAUSED so a later reinstall cannot affect the
 * storefront until the merchant activates it again. shop/redact deletes them.
 *
 * Order:
 * 1) best-effort Shopify discount deactivate (while admin/session available)
 * 2) terminal operational record if deactivate failed (retry impossible after wipe)
 * 3) one statement: cancel jobs, delete sessions and discount rows, pause campaigns
 */
export async function handleAppUninstalled(
  shop: string,
  options: AppUninstalledOptions = {},
): Promise<AppUninstalledResult> {
  const client = options.db ?? db;
  const normalizedShop = normalizeShopDomain(shop);
  if (!normalizedShop) {
    return {
      shop: "",
      sessionsDeleted: 0,
      campaignsPreserved: 0,
      campaignsPaused: 0,
      settingsPreserved: 0,
      shopDiscountRecordsDeleted: 0,
      discountDeactivated: false,
      discountDeactivateTerminalRecorded: false,
      cleanupPrepared: true,
    };
  }

  let discountDeactivated = false;
  let discountDeactivateTerminalRecorded = false;

  const supportsRawCleanup = canUseRawCleanup(client);

  // The production path folds cancellation, cleanup, and retained-data counts
  // into one PostgreSQL statement, minimizing time spent inside Shopify's
  // five-second webhook response deadline.
  if (!supportsRawCleanup) {
    await cancelOpenDiscountSyncJobs(
      normalizedShop,
      client as unknown as DiscountSyncJobStore,
      "UNINSTALL",
      "Cancelled during uninstall; credentials will be removed.",
    );
  }

  if (options.admin) {
    const outcome = await bestEffortDeactivateShopDiscount(
      normalizedShop,
      options.admin,
    );
    if (outcome.ok) {
      discountDeactivated = outcome.deactivated;
    } else {
      await enqueueDiscountSyncJob(
        {
          shop: normalizedShop,
          action: DISCOUNT_SYNC_ACTIONS.DEACTIVATE,
          error: outcome.error,
          terminal: true,
        },
        client as unknown as DiscountSyncJobStore,
      );
      discountDeactivateTerminalRecorded = true;
    }
  }

  let sessionsDeleted: number;
  let campaignsPreserved: number;
  let campaignsPaused: number;
  let settingsPreserved: number;
  let shopDiscountRecordsDeleted: number;

  if (supportsRawCleanup) {
    const [cleanup] = await client.$queryRaw<UninstallCleanupRow[]>(Prisma.sql`
      WITH cancelled_jobs AS (
        UPDATE "DiscountSyncJob"
        SET
          "status" = 'cancelled',
          "completedAt" = NOW(),
          "claimToken" = NULL,
          "claimedAt" = NULL,
          "leaseExpiresAt" = NULL,
          "lastErrorCode" = 'UNINSTALL',
          "lastErrorMessageSafe" = 'Cancelled during uninstall; credentials will be removed.'
        WHERE "shop" = ${normalizedShop}
          AND "status" IN ('pending', 'claimed')
        RETURNING 1
      ), paused_campaigns AS (
        UPDATE "Campaign"
        SET "status" = 'PAUSED', "updatedAt" = NOW()
        WHERE "shop" = ${normalizedShop}
          AND "status" <> 'PAUSED'
        RETURNING 1
      ), deleted_sessions AS (
        DELETE FROM "Session" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_discounts AS (
        DELETE FROM "ShopDiscount" WHERE "shop" = ${normalizedShop} RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM deleted_sessions) AS "sessionsDeleted",
        (SELECT COUNT(*)::int FROM "Campaign" WHERE "shop" = ${normalizedShop}) AS "campaignsPreserved",
        (SELECT COUNT(*)::int FROM paused_campaigns) AS "campaignsPaused",
        (SELECT COUNT(*)::int FROM "AppSettings" WHERE "shop" = ${normalizedShop}) AS "settingsPreserved",
        (SELECT COUNT(*)::int FROM deleted_discounts) AS "shopDiscountRecordsDeleted",
        (SELECT COUNT(*)::int FROM cancelled_jobs) AS "jobsCancelled"
    `);
    sessionsDeleted = cleanup?.sessionsDeleted ?? 0;
    campaignsPreserved = cleanup?.campaignsPreserved ?? 0;
    campaignsPaused = cleanup?.campaignsPaused ?? 0;
    settingsPreserved = cleanup?.settingsPreserved ?? 0;
    shopDiscountRecordsDeleted = cleanup?.shopDiscountRecordsDeleted ?? 0;
  } else {
    const [sessionResult, campaigns, paused, settings, discountsDeleted] =
      await client.$transaction(async (tx) => {
        const sessions = await tx.session.deleteMany({ where: { shop: normalizedShop } });
        const discounts = await tx.shopDiscount.deleteMany({ where: { shop: normalizedShop } });
        const pausedCampaigns = await tx.campaign.updateMany({
          where: { shop: normalizedShop, status: { not: "PAUSED" } },
          data: { status: "PAUSED" },
        });
        const campaignCount = await tx.campaign.count({ where: { shop: normalizedShop } });
        const settingsCount = await tx.appSettings.count({ where: { shop: normalizedShop } });
        return [sessions, campaignCount, pausedCampaigns.count, settingsCount, discounts.count] as const;
      });
    sessionsDeleted = sessionResult.count;
    campaignsPreserved = campaigns;
    campaignsPaused = paused;
    settingsPreserved = settings;
    shopDiscountRecordsDeleted = discountsDeleted;
  }

  return {
    shop: normalizedShop,
    sessionsDeleted,
    campaignsPreserved,
    campaignsPaused,
    settingsPreserved,
    shopDiscountRecordsDeleted,
    discountDeactivated,
    discountDeactivateTerminalRecorded,
    cleanupPrepared: true,
  };
}

/**
 * customers/data_request / customers/redact.
 *
 * Inventory (Phase 1 verification): this app does not persist buyer identity
 * (customer id, email, phone, address). Analytics payloads are shop/campaign
 * metrics (and optionally order ids). Merchant/staff Session fields are
 * personal data but are not customer/buyer records — they are wiped on shop/redact.
 *
 * These handlers are naturally idempotent acknowledgements (no receipt table).
 */
export async function handleCustomerComplianceTopic(input: {
  shop: string;
  topic: "customers/data_request" | "customers/redact";
}): Promise<CustomerComplianceResult> {
  const normalizedShop = normalizeShopDomain(input.shop) || "";
  console.info("[compliance]", {
    topic: input.topic,
    shop: normalizedShop || null,
    buyerRecordsFound: false,
  });
  return {
    shop: normalizedShop,
    topic: input.topic,
    acknowledged: true,
    buyerRecordsFound: false,
  };
}

/**
 * shop/redact: Shopify already waits ~48h after uninstall. On receipt, wipe
 * all shop-scoped application data immediately inside one transaction.
 * Strictly scoped to `shop`. Idempotent via deleteMany (zero matches is success).
 */
export async function handleShopRedact(
  shop: string,
  client: ShopRedactDb = db,
): Promise<ShopRedactResult> {
  const normalizedShop = normalizeShopDomain(shop);
  if (!normalizedShop) {
    return {
      shop: "",
      sessionsDeleted: 0,
      campaignsDeleted: 0,
      settingsDeleted: 0,
      shopDiscountRecordsDeleted: 0,
      analyticsDeleted: 0,
      integrationStatusDeleted: 0,
    };
  }

  // Production uses one atomic PostgreSQL statement instead of seven
  // sequential round trips. Injected test clients retain the transaction path.
  if (canUseRawCleanup(client)) {
    const [cleanup] = await client.$queryRaw<ShopRedactCleanupRow[]>(Prisma.sql`
      WITH deleted_sessions AS (
        DELETE FROM "Session" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_campaigns AS (
        DELETE FROM "Campaign" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_settings AS (
        DELETE FROM "AppSettings" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_analytics AS (
        DELETE FROM "AnalyticsEvent" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_integrations AS (
        DELETE FROM "ShopIntegrationStatus" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_discounts AS (
        DELETE FROM "ShopDiscount" WHERE "shop" = ${normalizedShop} RETURNING 1
      ), deleted_jobs AS (
        DELETE FROM "DiscountSyncJob" WHERE "shop" = ${normalizedShop} RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM deleted_sessions) AS "sessionsDeleted",
        (SELECT COUNT(*)::int FROM deleted_campaigns) AS "campaignsDeleted",
        (SELECT COUNT(*)::int FROM deleted_settings) AS "settingsDeleted",
        (SELECT COUNT(*)::int FROM deleted_discounts) AS "shopDiscountRecordsDeleted",
        (SELECT COUNT(*)::int FROM deleted_analytics) AS "analyticsDeleted",
        (SELECT COUNT(*)::int FROM deleted_integrations) AS "integrationStatusDeleted",
        (SELECT COUNT(*)::int FROM deleted_jobs) AS "jobsDeleted"
    `);
    const result: ShopRedactResult = {
      shop: normalizedShop,
      sessionsDeleted: cleanup?.sessionsDeleted ?? 0,
      campaignsDeleted: cleanup?.campaignsDeleted ?? 0,
      settingsDeleted: cleanup?.settingsDeleted ?? 0,
      shopDiscountRecordsDeleted: cleanup?.shopDiscountRecordsDeleted ?? 0,
      analyticsDeleted: cleanup?.analyticsDeleted ?? 0,
      integrationStatusDeleted: cleanup?.integrationStatusDeleted ?? 0,
    };
    console.info("[compliance]", { topic: "shop/redact", ...result });
    return result;
  }

  // GiftOption / CampaignRewardTier cascade from Campaign deletes.
  const result = await client.$transaction(async (tx) => {
    const sessionResult = await tx.session.deleteMany({
      where: { shop: normalizedShop },
    });
    const campaignResult = await tx.campaign.deleteMany({
      where: { shop: normalizedShop },
    });
    const settingsResult = await tx.appSettings.deleteMany({
      where: { shop: normalizedShop },
    });
    const analyticsResult = await tx.analyticsEvent.deleteMany({
      where: { shop: normalizedShop },
    });
    const integrationResult = await tx.shopIntegrationStatus.deleteMany({
      where: { shop: normalizedShop },
    });
    const shopDiscountResult = await tx.shopDiscount.deleteMany({
      where: { shop: normalizedShop },
    });
    const maybeJobs = tx as unknown as {
      discountSyncJob?: {
        deleteMany: (args: { where: { shop: string } }) => Promise<unknown>;
      };
    };
    if (maybeJobs.discountSyncJob?.deleteMany) {
      await maybeJobs.discountSyncJob.deleteMany({
        where: { shop: normalizedShop },
      });
    }

    return {
      shop: normalizedShop,
      sessionsDeleted: sessionResult.count,
      campaignsDeleted: campaignResult.count,
      settingsDeleted: settingsResult.count,
      shopDiscountRecordsDeleted: shopDiscountResult.count,
      analyticsDeleted: analyticsResult.count,
      integrationStatusDeleted: integrationResult.count,
    } satisfies ShopRedactResult;
  });

  console.info("[compliance]", {
    topic: "shop/redact",
    shop: result.shop,
    sessionsDeleted: result.sessionsDeleted,
    campaignsDeleted: result.campaignsDeleted,
    settingsDeleted: result.settingsDeleted,
    analyticsDeleted: result.analyticsDeleted,
    integrationStatusDeleted: result.integrationStatusDeleted,
    shopDiscountRecordsDeleted: result.shopDiscountRecordsDeleted,
  });

  return result;
}

/** Normalize framework topic strings to underscore form (e.g. CUSTOMERS_DATA_REQUEST). */
export function normalizeComplianceTopic(topic: string): string {
  return String(topic || "")
    .trim()
    .toUpperCase()
    .replace(/\//g, "_");
}
