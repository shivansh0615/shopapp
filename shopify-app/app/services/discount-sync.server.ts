import type { Campaign } from "@prisma/client";
import {
  AppError,
  errorCodeOf,
  isRetryableError,
  logOperationalError,
  toSafeErrorMessage,
} from "../lib/errors.server";
import { loadDiscountSyncConfig } from "../lib/discount-sync-config.server";
import {
  createPostgresAdvisoryLock,
  type ShopLock,
} from "../lib/shop-lock.server";
import { getCampaigns } from "./campaign.server";
import {
  buildDiscountConfig,
  buildInactiveDiscountConfig,
} from "./discount-engine/discount-config.builder";
import { serializeDiscountConfig } from "./discount-engine/discount-config.schema";
import {
  activateAutomaticAppDiscount,
  deactivateAutomaticAppDiscount,
  ensureShopAutomaticDiscount,
} from "./discount-provisioner.server";
import { selectWinningCampaign } from "./promotion-engine/campaign-selection";
import type { ShopifyAdminClient } from "./shopify-admin.server";
import { upsertShopDiscountSyncState } from "../repositories/shop-discount.repository";

export type DiscountSyncMode = "active" | "inactive";

export type DiscountSyncPlan = {
  mode: DiscountSyncMode;
  configJson: string;
  /** Sole candidate id, or null when inactive / cart-dependent competition. */
  winningCampaignId: string | null;
};

export type SyncShopDiscountOptions = {
  /** Default true — enqueue durable retry when in-process sync fails. */
  enqueueOnFailure?: boolean;
  lock?: ShopLock;
};

/** Merchant-facing sync outcome after DB campaign writes succeed. */
export type MerchantDiscountSyncResult =
  | { status: "synced" }
  | { status: "pending"; message: string }
  | { status: "failed"; message: string };

const runtimeConfig = loadDiscountSyncConfig();
const defaultLock = createPostgresAdvisoryLock({
  lockTimeoutMs: runtimeConfig.lockTimeoutMs,
});

const SHOP_CURRENCY_QUERY = `#graphql
  query FgpbShopCurrency {
    shop {
      currencyCode
    }
  }
`;

async function getShopCurrencyCode(admin: ShopifyAdminClient): Promise<string> {
  const response = await admin.graphql(SHOP_CURRENCY_QUERY);
  const payload = (await response.json()) as {
    data?: { shop?: { currencyCode?: string | null } };
  };

  return payload.data?.shop?.currencyCode?.trim() || "INR";
}

async function applyDiscountStatus(
  admin: ShopifyAdminClient,
  discountGid: string,
  mode: DiscountSyncMode,
): Promise<void> {
  if (mode === "active") {
    await activateAutomaticAppDiscount(admin, discountGid);
  } else {
    await deactivateAutomaticAppDiscount(admin, discountGid);
  }
}

/**
 * Sync all scheduled supported candidates; checkout selects by cart eligibility.
 */
export function buildDiscountSyncPlan(input: {
  shop: string;
  campaigns: Campaign[];
  currencyCode?: string;
  now?: Date;
}): DiscountSyncPlan {
  const currencyCode = input.currencyCode?.trim() || "INR";
  const selection = selectWinningCampaign(input.campaigns, { now: input.now });
  const winner = selection.campaign;

  if (!winner) {
    return {
      mode: "inactive",
      configJson: serializeDiscountConfig(buildInactiveDiscountConfig(input.shop)),
      winningCampaignId: null,
    };
  }

  const config = {
    ...buildInactiveDiscountConfig(input.shop),
    selectionPolicy: "ELIGIBILITY_FIRST" as const,
    activeCampaigns: selection.candidates.flatMap((campaign) =>
      buildDiscountConfig({ shopDomain: input.shop, campaign, currencyCode }).activeCampaigns
        .map((built) => ({ ...built, priority: campaign.priority }))),
  };

  if (!config.activeCampaigns.length) {
    return {
      mode: "inactive",
      configJson: serializeDiscountConfig(buildInactiveDiscountConfig(input.shop)),
      winningCampaignId: null,
    };
  }

  return {
    mode: "active",
    configJson: serializeDiscountConfig(config),
    winningCampaignId: config.activeCampaigns.length === 1 ? config.activeCampaigns[0].campaignId : null,
  };
}

async function syncShopDiscountOnce(
  admin: ShopifyAdminClient,
  shop: string,
): Promise<{ discountGid: string; mode: DiscountSyncMode; winningCampaignId: string | null }> {
  await upsertShopDiscountSyncState(shop, { syncStatus: "syncing" });

  const [campaigns, currencyCode] = await Promise.all([
    getCampaigns(shop),
    getShopCurrencyCode(admin),
  ]);

  // Store the time represented by the config, not when the network write
  // finishes. Otherwise a boundary crossed during Shopify's response can be
  // incorrectly marked as already synchronized.
  const evaluatedAt = new Date();
  const plan = buildDiscountSyncPlan({ shop, campaigns, currencyCode, now: evaluatedAt });
  const discountGid = await ensureShopAutomaticDiscount(
    admin,
    shop,
    plan.configJson,
  );

  try {
    await applyDiscountStatus(admin, discountGid, plan.mode);
  } catch (error) {
    logOperationalError("discount-sync-status", error, {
      shop,
      mode: plan.mode,
      discountGid,
      phase: "first_attempt",
    });
    await applyDiscountStatus(admin, discountGid, plan.mode);
  }

  await upsertShopDiscountSyncState(shop, {
    syncStatus: plan.mode,
    lastSyncErrorCode: null,
    lastSyncedAt: evaluatedAt,
    discountGid,
  });

  return {
    discountGid,
    mode: plan.mode,
    winningCampaignId: plan.winningCampaignId,
  };
}

/**
 * Ensures Shopify automatic discount metafield + activation match DB campaigns.
 *
 * Lock: Postgres advisory by default (all processes on this DB). Override with
 * a process-local keyed mutex in tests via `options.lock`.
 */
export async function syncShopDiscount(
  admin: ShopifyAdminClient,
  shop: string,
  options: SyncShopDiscountOptions = {},
): Promise<{ discountGid: string; mode: DiscountSyncMode }> {
  const lock = options.lock ?? defaultLock;
  const enqueueOnFailure = options.enqueueOnFailure !== false;

  return lock.withLock(shop, async () => {
    try {
      try {
        const result = await syncShopDiscountOnce(admin, shop);
        return { discountGid: result.discountGid, mode: result.mode };
      } catch (error) {
        logOperationalError("discount-sync", error, {
          shop,
          phase: "in_process_retry",
          retryable: isRetryableError(error),
        });
        const result = await syncShopDiscountOnce(admin, shop);
        return { discountGid: result.discountGid, mode: result.mode };
      }
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError({
              code: errorCodeOf(error, "DISCOUNT_SYNC_FAILED"),
              message: toSafeErrorMessage(error),
              errorClass: isRetryableError(error) ? "retryable" : "permanent",
              cause: error,
              details: { shop },
            });

      if (enqueueOnFailure) {
        const { enqueueDiscountSyncJob, DISCOUNT_SYNC_ACTIONS } = await import(
          "./discount-sync-job.server"
        );
        const retryable = isRetryableError(appError);
        await enqueueDiscountSyncJob({
          shop,
          action: DISCOUNT_SYNC_ACTIONS.SYNC,
          error: appError,
          // Permanent/validation failures are visible but must not retry forever.
          terminal: !retryable,
        });
        await upsertShopDiscountSyncState(shop, {
          syncStatus: retryable ? "retry_scheduled" : "failed",
          lastSyncErrorCode: appError.code,
        });
      } else {
        await upsertShopDiscountSyncState(shop, {
          syncStatus: "failed",
          lastSyncErrorCode: appError.code,
        });
      }

      throw appError;
    }
  });
}

/** Clear operational copy for routes when DB saved but Shopify sync failed. */
export function discountSyncFailureMessage(error: unknown): string {
  if (isRetryableError(error)) {
    return discountSyncPendingMessage(error);
  }
  return discountSyncPermanentFailureMessage(error);
}

export function discountSyncPendingMessage(error: unknown): string {
  const detail = toSafeErrorMessage(error);
  return `Campaign changes were saved. Shopify discount synchronization is pending a background retry (${detail}).`;
}

export function discountSyncPermanentFailureMessage(error: unknown): string {
  const detail = toSafeErrorMessage(error);
  return `Campaign changes were saved, but Shopify discount synchronization failed permanently (${detail}).`;
}

/**
 * Run discount sync after a successful campaign DB write.
 * Distinguishes synced / pending retry / permanent failure for merchant responses.
 * Does not roll back campaign writes.
 */
export async function runMerchantDiscountSync(
  admin: ShopifyAdminClient,
  shop: string,
  options: SyncShopDiscountOptions = {},
): Promise<MerchantDiscountSyncResult> {
  try {
    await syncShopDiscount(admin, shop, options);
    return { status: "synced" };
  } catch (error) {
    // Enqueue already attempted inside syncShopDiscount when enqueueOnFailure.
    // If enqueue itself threw, classify as failed.
    if (isRetryableError(error)) {
      return { status: "pending", message: discountSyncPendingMessage(error) };
    }
    return {
      status: "failed",
      message: discountSyncPermanentFailureMessage(error),
    };
  }
}

/** @deprecated Use createPostgresAdvisoryLock / createKeyedMutex from shop-lock.server */
export async function withShopDiscountLock<T>(
  shop: string,
  fn: () => Promise<T>,
): Promise<T> {
  return defaultLock.withLock(shop, fn);
}
