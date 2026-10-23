import db from "../db.server";
import type { ShopLock } from "../lib/shop-lock.server";
import { withShopDiscountLock } from "./discount-sync.server";
import {
  DISCOUNT_SYNC_ACTIONS,
  DISCOUNT_SYNC_JOB_STATUS,
  enqueueDiscountSyncJob,
  syncDedupeKey,
  type DiscountSyncJobStore,
} from "./discount-sync-job.server";

export type ScheduleSyncStore = DiscountSyncJobStore & Pick<
  typeof db, "campaign" | "shopDiscount" | "session"
>;

const scheduleLock: ShopLock = { withLock: withShopDiscountLock };

/** End dates are inclusive: expiration takes effect one millisecond later. */
export function latestEffectiveBoundary(
  row: { startDate: Date | null; endDate: Date | null },
  now: Date,
): number | null {
  const boundaries = [
    row.startDate?.getTime(),
    row.endDate == null ? undefined : row.endDate.getTime() + 1,
  ].filter((value): value is number => value != null && value <= now.getTime());
  return boundaries.length ? Math.max(...boundaries) : null;
}

/** Reconcile schedule transitions through the existing durable retry queue. */
export async function enqueueDueScheduleSyncs(options: {
  now?: Date;
  client?: ScheduleSyncStore;
  lock?: ShopLock;
} = {}): Promise<number> {
  const now = options.now ?? new Date();
  const client = options.client ?? db as unknown as ScheduleSyncStore;
  const lock = options.lock ?? scheduleLock;
  const rows = await client.campaign.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ startDate: { lte: now } }, { endDate: { lt: now } }],
    },
    select: { shop: true, startDate: true, endDate: true },
  });
  const boundaryByShop = new Map<string, number>();
  for (const row of rows) {
    const boundary = latestEffectiveBoundary(row, now);
    if (boundary != null) {
      boundaryByShop.set(row.shop, Math.max(boundaryByShop.get(row.shop) ?? -Infinity, boundary));
    }
  }

  let queued = 0;
  for (const [shop, boundary] of boundaryByShop) {
    // Same shop-scoped lock as discount sync: concurrent scanners cannot reset
    // each other's queue work, or race a successful sync's checkpoint.
    await lock.withLock(shop, async () => {
      if (await client.session.count({ where: { shop } }) === 0) return;
      const state = await client.shopDiscount.findUnique({
        where: { shop }, select: { lastSyncedAt: true },
      });
      if (state?.lastSyncedAt && state.lastSyncedAt.getTime() >= boundary) return;
      const existing = await client.discountSyncJob.findUnique({
        where: { dedupeKey: syncDedupeKey(shop, DISCOUNT_SYNC_ACTIONS.SYNC) },
      });
      // The queue owns pending retries and abandoned-lease recovery. Polling
      // must not reset their nextAttemptAt, attempt count or claim token.
      if (existing?.status === DISCOUNT_SYNC_JOB_STATUS.PENDING ||
          existing?.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED) return;
      // Do not retry a terminal failure/cancellation forever for the same
      // boundary. A later schedule transition can request a fresh attempt.
      if (existing && [DISCOUNT_SYNC_JOB_STATUS.FAILED, DISCOUNT_SYNC_JOB_STATUS.CANCELLED]
        .some((status) => existing.status === status) &&
          (!existing.completedAt || existing.completedAt.getTime() >= boundary)) return;
      await enqueueDiscountSyncJob({ shop, action: DISCOUNT_SYNC_ACTIONS.SYNC }, client);
      queued += 1;
    });
  }
  return queued;
}
