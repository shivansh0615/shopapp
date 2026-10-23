import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AppError,
  isRetryableError,
  toSafeErrorMessage,
} from "../lib/errors.server";
import {
  CLAIM_LEASE_MS,
  DISCOUNT_SYNC_ACTIONS,
  DISCOUNT_SYNC_JOB_STATUS,
  claimNextDiscountSyncJob,
  computeBackoffMs,
  enqueueDiscountSyncJob,
  markJobFailure,
  processDiscountSyncJob,
  syncDedupeKey,
  type DiscountSyncJobStore,
} from "./discount-sync-job.server";
import {
  discountSyncFailureMessage,
  discountSyncPendingMessage,
  discountSyncPermanentFailureMessage,
} from "./discount-sync.server";

type JobRow = {
  id: string;
  shop: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseExpiresAt?: Date | null;
  claimToken?: string | null;
  claimedAt?: Date | null;
  dedupeKey: string;
  desiredAction: string;
  completedAt?: Date | null;
  createdAt: Date;
  lastErrorCode?: string | null;
  lastErrorMessageSafe?: string | null;
  [key: string]: unknown;
};

function createJobStore(options?: { sessions?: Record<string, number> }): {
  client: DiscountSyncJobStore;
  byDedupe: Map<string, JobRow>;
  byId: Map<string, JobRow>;
} {
  const byDedupe = new Map<string, JobRow>();
  const byId = new Map<string, JobRow>();
  const sessions = options?.sessions ?? {};

  const api: DiscountSyncJobStore = {
    discountSyncJob: {
      create: async ({ data }) => {
        const row = {
          id: `job_${byId.size + 1}`,
          createdAt: new Date(),
          ...(data as object),
        } as unknown as JobRow;
        byDedupe.set(row.dedupeKey, row);
        byId.set(row.id, row);
        return { ...row } as never;
      },
      upsert: async ({ where, create, update }) => {
        const existing = byDedupe.get(where.dedupeKey);
        if (!existing) return api.discountSyncJob.create({ data: create });
        Object.assign(existing, update);
        return { ...existing } as never;
      },
      findFirst: async ({ where }) => {
        const filter = where as {
          OR?: Array<{
            status?: string;
            nextAttemptAt?: { lte?: Date };
            leaseExpiresAt?: { lte?: Date };
          }>;
        };
        const now =
          filter.OR?.find((c) => c.status === "pending")?.nextAttemptAt?.lte ??
          filter.OR?.find((c) => c.status === "claimed")?.leaseExpiresAt?.lte ??
          new Date();
        const rows = [...byId.values()].filter((row) => {
          if (row.status === DISCOUNT_SYNC_JOB_STATUS.PENDING) {
            return row.nextAttemptAt <= now;
          }
          if (row.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED) {
            return Boolean(row.leaseExpiresAt && row.leaseExpiresAt <= now);
          }
          return false;
        });
        rows.sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime());
        return rows[0] ? ({ ...rows[0] } as never) : null;
      },
      updateMany: async ({ where, data }) => {
        const w = where as {
          id?: string;
          shop?: string;
          status?: { in?: string[] };
          desiredAction?: string;
          OR?: Array<{ status?: string; leaseExpiresAt?: { lte?: Date } }>;
        };
        let targets = [...byId.values()];
        if (w.id) targets = targets.filter((r) => r.id === w.id);
        if (w.shop) targets = targets.filter((r) => r.shop === w.shop);
        if (w.desiredAction) {
          targets = targets.filter((r) => r.desiredAction === w.desiredAction);
        }
        if (w.status?.in) {
          targets = targets.filter((r) => w.status!.in!.includes(r.status));
        }
        if (w.OR) {
          targets = targets.filter((row) =>
            w.OR!.some((clause) => {
              if (clause.status === DISCOUNT_SYNC_JOB_STATUS.PENDING) {
                return row.status === DISCOUNT_SYNC_JOB_STATUS.PENDING;
              }
              if (clause.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED) {
                const lte = clause.leaseExpiresAt?.lte;
                return (
                  row.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED &&
                  Boolean(row.leaseExpiresAt && lte && row.leaseExpiresAt <= lte)
                );
              }
              return false;
            }),
          );
        }
        for (const row of targets) Object.assign(row, data);
        return { count: targets.length };
      },
      findUnique: async ({ where }) => {
        if (where.id) {
          const row = byId.get(where.id);
          return row ? ({ ...row } as never) : null;
        }
        if (where.dedupeKey) {
          const row = byDedupe.get(where.dedupeKey);
          return row ? ({ ...row } as never) : null;
        }
        return null;
      },
      update: async ({ where, data }) => {
        const row = byId.get(where.id);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return { ...row } as never;
      },
      findMany: async ({ where }) => {
        const shop = (where as { shop?: string } | undefined)?.shop;
        return [...byId.values()]
          .filter((row) => (shop ? row.shop === shop : true))
          .map((row) => ({ ...row }) as never);
      },
    },
    session: {
      count: async ({ where }) => sessions[where.shop] ?? 1,
    },
    $transaction: async (fn) => fn(api),
  };

  return { client: api, byDedupe, byId };
}

describe("discount sync durable retries", () => {
  it("computes bounded backoff with jitter", () => {
    const a = computeBackoffMs(0, 0, { random: () => 0 });
    const b = computeBackoffMs(20, 0, { random: () => 1 });
    assert.equal(a.delayMs, 0);
    assert.ok(b.delayMs >= 0 && b.delayMs <= 30 * 60 * 1000);
    assert.ok(a.nextAttemptAt instanceof Date);
  });

  it("dedupes open jobs per shop+action", async () => {
    const store = createJobStore();
    const first = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        error: new Error("timeout"),
      },
      store.client,
    );
    const second = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        error: new Error("timeout again"),
      },
      store.client,
    );
    assert.equal(first.dedupeKey, syncDedupeKey("a.myshopify.com", "SYNC"));
    assert.equal(first.id, second.id);
    assert.equal(store.byDedupe.size, 1);
  });

  it("cancels stale DEACTIVATE when SYNC is enqueued", async () => {
    const store = createJobStore();
    const deactivate = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.DEACTIVATE },
      store.client,
    );
    assert.equal(deactivate.status, DISCOUNT_SYNC_JOB_STATUS.PENDING);

    await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );

    const stale = store.byId.get(deactivate.id)!;
    assert.equal(stale.status, DISCOUNT_SYNC_JOB_STATUS.CANCELLED);
    assert.equal(stale.lastErrorCode, "SUPERSEDED");
  });

  it("cancels stale SYNC when DEACTIVATE is enqueued", async () => {
    const store = createJobStore();
    const sync = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );
    await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.DEACTIVATE },
      store.client,
    );
    assert.equal(store.byId.get(sync.id)!.status, DISCOUNT_SYNC_JOB_STATUS.CANCELLED);
  });

  it("stale DEACTIVATE with live session reconciles via SYNC (does not deactivate)", async () => {
    const store = createJobStore({ sessions: { "a.myshopify.com": 1 } });
    const job = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.DEACTIVATE },
      store.client,
    );
    let deactivated = 0;
    let synced = 0;
    const result = await processDiscountSyncJob(job, store.client, {
      hasShopSession: async () => true,
      runDeactivate: async () => {
        deactivated += 1;
      },
      runSync: async () => {
        synced += 1;
        return { discountGid: "gid://x", mode: "active" };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(synced, 1);
    assert.equal(deactivated, 0);
    assert.equal(result.job.lastErrorCode, "SUPERSEDED");
  });

  it("stale job with no session becomes noop cancelled", async () => {
    const store = createJobStore({ sessions: { "a.myshopify.com": 0 } });
    const job = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );
    let synced = 0;
    const result = await processDiscountSyncJob(job, store.client, {
      hasShopSession: async () => false,
      runSync: async () => {
        synced += 1;
        return { discountGid: "gid://x", mode: "active" };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(synced, 0);
    assert.equal(result.job.status, DISCOUNT_SYNC_JOB_STATUS.CANCELLED);
  });

  it("records terminal uninstall failures without retry", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      {
        shop: "gone.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.DEACTIVATE,
        error: new Error("403"),
        terminal: true,
      },
      store.client,
    );
    assert.equal(job.status, DISCOUNT_SYNC_JOB_STATUS.FAILED);
    assert.equal(job.attemptCount, job.maxAttempts);
    assert.ok(job.completedAt);
  });

  it("does not steal an active claim when coalescing enqueue", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );
    const future = new Date(Date.now() + 60_000);
    Object.assign(store.byId.get(job.id)!, {
      status: DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
      claimToken: "worker-1",
      leaseExpiresAt: future,
      claimedAt: new Date(),
    });

    const coalesced = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        error: new Error("timeout"),
      },
      store.client,
    );

    assert.equal(coalesced.status, DISCOUNT_SYNC_JOB_STATUS.CLAIMED);
    assert.equal(coalesced.claimToken, "worker-1");
  });

  it("resets attemptCount when reopening a failed job", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        error: new Error("timeout"),
        terminal: true,
      },
      store.client,
    );
    assert.equal(job.status, DISCOUNT_SYNC_JOB_STATUS.FAILED);

    const reopened = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        error: new Error("timeout"),
      },
      store.client,
    );
    assert.equal(reopened.status, DISCOUNT_SYNC_JOB_STATUS.PENDING);
    assert.equal(reopened.attemptCount, 0);
  });

  it("claims jobs atomically for two workers", async () => {
    const store = createJobStore();
    await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );

    const first = await claimNextDiscountSyncJob(store.client, {
      workerId: "w1",
      now: new Date(),
      leaseMs: CLAIM_LEASE_MS,
    });
    const second = await claimNextDiscountSyncJob(store.client, {
      workerId: "w2",
      now: new Date(),
      leaseMs: CLAIM_LEASE_MS,
    });

    assert.ok(first);
    assert.equal(first.status, DISCOUNT_SYNC_JOB_STATUS.CLAIMED);
    assert.equal(second, null);
  });

  it("recovers stale leases", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );
    const past = new Date(Date.now() - 120_000);
    Object.assign(store.byId.get(job.id)!, {
      status: DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
      claimToken: "old",
      leaseExpiresAt: past,
      claimedAt: past,
    });

    const recovered = await claimNextDiscountSyncJob(store.client, {
      workerId: "w-new",
      now: new Date(),
    });
    assert.ok(recovered);
    assert.equal(recovered.claimToken, "w-new");
  });

  it("schedules retryable failures and terminals permanent ones", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      store.client,
    );

    const retryable = new AppError({
      code: "TIMEOUT",
      message: "timeout",
      errorClass: "retryable",
    });
    const afterRetryable = await markJobFailure(job, retryable, store.client);
    assert.equal(afterRetryable.status, DISCOUNT_SYNC_JOB_STATUS.PENDING);

    const permanent = new AppError({
      code: "INVALID",
      message: "bad config",
      errorClass: "permanent",
    });
    const afterPermanent = await markJobFailure(
      afterRetryable,
      permanent,
      store.client,
    );
    assert.equal(afterPermanent.status, DISCOUNT_SYNC_JOB_STATUS.FAILED);
  });

  it("stops after maxAttempts", async () => {
    const store = createJobStore();
    const job = await enqueueDiscountSyncJob(
      {
        shop: "a.myshopify.com",
        action: DISCOUNT_SYNC_ACTIONS.SYNC,
        maxAttempts: 2,
      },
      store.client,
    );

    const err = new AppError({
      code: "TIMEOUT",
      message: "timeout",
      errorClass: "retryable",
    });
    const once = await markJobFailure(job, err, store.client);
    assert.equal(once.status, DISCOUNT_SYNC_JOB_STATUS.PENDING);
    const twice = await markJobFailure(once, err, store.client);
    assert.equal(twice.status, DISCOUNT_SYNC_JOB_STATUS.FAILED);
    assert.equal(twice.attemptCount, 2);
  });

  it("redacts secrets in safe error messages and merchant copy", () => {
    const messy = new Error(
      "failed Bearer shpat_abc123 postgresql://u:p@host/db user@x.com timeout",
    );
    const safe = toSafeErrorMessage(messy);
    assert.equal(safe.includes("shpat_"), false);
    assert.equal(safe.includes("postgresql://"), false);
    assert.equal(safe.includes("user@x.com"), false);
    assert.match(discountSyncFailureMessage(messy), /pending|permanently/i);
  });
});

describe("merchant discount sync outcomes", () => {
  it("pending vs permanent merchant messages differ", () => {
    const retryable = new AppError({
      code: "TIMEOUT",
      message: "timeout",
      errorClass: "retryable",
    });
    const permanent = new AppError({
      code: "FORBIDDEN",
      message: "revoked",
      errorClass: "permanent",
    });
    assert.match(discountSyncPendingMessage(retryable), /pending/i);
    assert.match(discountSyncPermanentFailureMessage(permanent), /permanently/i);
    assert.match(discountSyncFailureMessage(retryable), /pending/i);
    assert.match(discountSyncFailureMessage(permanent), /permanently/i);
    assert.equal(isRetryableError(retryable), true);
  });
});
