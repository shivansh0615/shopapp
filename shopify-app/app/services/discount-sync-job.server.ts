import { randomUUID } from "node:crypto";
import { Prisma, type DiscountSyncJob } from "@prisma/client";
import db from "../db.server";
import {
  DISCOUNT_SYNC_DEFAULTS,
  loadDiscountSyncConfig,
} from "../lib/discount-sync-config.server";
import {
  AppError,
  classifySyncError,
  errorCodeOf,
  isRetryableError,
  logOperationalError,
  toSafeErrorMessage,
} from "../lib/errors.server";
import {
  deactivateAutomaticAppDiscount,
  resolveShopDiscountGid,
} from "./discount-provisioner.server";
import {
  syncShopDiscount,
  type DiscountSyncMode,
} from "./discount-sync.server";
import { upsertShopDiscountSyncState } from "../repositories/shop-discount.repository";

export const DISCOUNT_SYNC_ACTIONS = {
  SYNC: "SYNC",
  DEACTIVATE: "DEACTIVATE",
} as const;

export type DiscountSyncAction =
  (typeof DISCOUNT_SYNC_ACTIONS)[keyof typeof DISCOUNT_SYNC_ACTIONS];

export const DISCOUNT_SYNC_JOB_STATUS = {
  PENDING: "pending",
  CLAIMED: "claimed",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const DEFAULT_MAX_ATTEMPTS = DISCOUNT_SYNC_DEFAULTS.maxAttempts;
export const CLAIM_LEASE_MS = DISCOUNT_SYNC_DEFAULTS.leaseMs;

/** Minimal Prisma surface for durable sync jobs (injectable in tests). */
export type DiscountSyncJobStore = {
  discountSyncJob: {
    upsert: (args: {
      where: { dedupeKey: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<DiscountSyncJob>;
    findUnique: (args: {
      where: { id?: string; dedupeKey?: string };
    }) => Promise<DiscountSyncJob | null>;
    findFirst: (args: {
      where: unknown;
      orderBy?: unknown;
    }) => Promise<DiscountSyncJob | null>;
    updateMany: (args: {
      where: unknown;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<DiscountSyncJob>;
    create: (args: {
      data: Record<string, unknown>;
    }) => Promise<DiscountSyncJob>;
    findMany: (args: {
      where?: unknown;
      orderBy?: unknown;
      take?: number;
    }) => Promise<DiscountSyncJob[]>;
    count?: (args: { where: unknown }) => Promise<number>;
    deleteMany?: (args: {
      where: { shop: string };
    }) => Promise<{ count: number }>;
  };
  session?: {
    count: (args: { where: { shop: string } }) => Promise<number>;
  };
  $transaction: <T>(fn: (tx: DiscountSyncJobStore) => Promise<T>) => Promise<T>;
  $queryRaw?: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

type ClaimableStore = DiscountSyncJobStore & {
  $queryRaw: <T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) => Promise<T>;
};

function hasQueryRaw(client: DiscountSyncJobStore): client is ClaimableStore {
  return typeof client.$queryRaw === "function";
}

/** Bounded exponential backoff with full jitter (ms). Cap from config. */
export function computeBackoffMs(
  attemptCount: number,
  now = Date.now(),
  options?: { baseDelayMs?: number; maxDelayMs?: number; random?: () => number },
): {
  delayMs: number;
  nextAttemptAt: Date;
} {
  const cfg = loadDiscountSyncConfig();
  const baseDelay = options?.baseDelayMs ?? cfg.baseDelayMs;
  const maxDelay = options?.maxDelayMs ?? cfg.maxDelayMs;
  const random = options?.random ?? Math.random;
  const cappedAttempt = Math.max(0, Math.min(attemptCount, 10));
  const exp = baseDelay * 2 ** cappedAttempt;
  const base = Math.min(maxDelay, Number.isFinite(exp) ? exp : maxDelay);
  const delayMs = Math.max(0, Math.floor(random() * (base + 1)));
  return { delayMs, nextAttemptAt: new Date(now + delayMs) };
}

export function syncDedupeKey(shop: string, action: DiscountSyncAction): string {
  return `${action}:${shop.trim()}`;
}

export type EnqueueSyncJobInput = {
  shop: string;
  action: DiscountSyncAction;
  desiredMode?: DiscountSyncMode | null;
  campaignId?: number | null;
  error?: unknown;
  /** When true, job is immediately terminal (no worker retries). */
  terminal?: boolean;
  maxAttempts?: number;
};

function leaseStillActive(job: DiscountSyncJob, now: Date): boolean {
  return (
    job.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED &&
    job.leaseExpiresAt != null &&
    job.leaseExpiresAt.getTime() > now.getTime()
  );
}

/**
 * Cancel open (pending/claimed) jobs for a shop — uninstall / supersession.
 * Claimed jobs are marked cancelled so workers no-op instead of applying stale actions.
 */
export async function cancelOpenDiscountSyncJobs(
  shop: string,
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
  reasonCode = "SUPERSEDED",
  reasonMessage = "Cancelled because shop desired state changed or uninstall began.",
): Promise<number> {
  const normalized = shop.trim();
  if (!normalized) return 0;
  const now = new Date();
  const result = await client.discountSyncJob.updateMany({
    where: {
      shop: normalized,
      status: {
        in: [
          DISCOUNT_SYNC_JOB_STATUS.PENDING,
          DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
        ],
      },
    },
    data: {
      status: DISCOUNT_SYNC_JOB_STATUS.CANCELLED,
      completedAt: now,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reasonCode,
      lastErrorMessageSafe: toSafeErrorMessage(reasonMessage),
    },
  });
  return result.count;
}

async function supersedeConflictingActions(
  shop: string,
  keepAction: DiscountSyncAction,
  client: DiscountSyncJobStore,
): Promise<void> {
  const opposite =
    keepAction === DISCOUNT_SYNC_ACTIONS.SYNC
      ? DISCOUNT_SYNC_ACTIONS.DEACTIVATE
      : DISCOUNT_SYNC_ACTIONS.SYNC;
  const now = new Date();
  await client.discountSyncJob.updateMany({
    where: {
      shop,
      desiredAction: opposite,
      status: {
        in: [
          DISCOUNT_SYNC_JOB_STATUS.PENDING,
          DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
        ],
      },
    },
    data: {
      status: DISCOUNT_SYNC_JOB_STATUS.CANCELLED,
      completedAt: now,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: "SUPERSEDED",
      lastErrorMessageSafe:
        "Superseded by a newer merchant discount synchronization decision.",
    },
  });
}

/**
 * Upsert / coalesce a pending (or terminal failed) job.
 * Duplicate open failures share dedupeKey instead of creating unlimited rows.
 *
 * Does not steal an in-flight claim with a valid lease (worker already owns it).
 * Re-opening completed/failed/cancelled jobs resets attemptCount for a fresh cycle.
 * Enqueueing SYNC cancels open DEACTIVATE jobs (and vice versa) for the shop.
 */
export async function enqueueDiscountSyncJob(
  input: EnqueueSyncJobInput,
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
): Promise<DiscountSyncJob> {
  const shop = input.shop.trim();
  if (!shop) {
    throw new AppError({
      code: "SHOP_REQUIRED",
      message: "shop is required to enqueue discount sync.",
      errorClass: "validation",
    });
  }

  const dedupeKey = syncDedupeKey(shop, input.action);
  const errorCode = input.error ? errorCodeOf(input.error, "SYNC_FAILED") : null;
  const errorMessage = input.error ? toSafeErrorMessage(input.error) : null;
  const maxAttempts =
    input.maxAttempts ?? loadDiscountSyncConfig().maxAttempts;
  const now = new Date();

  if (!input.terminal) {
    await supersedeConflictingActions(shop, input.action, client);
  }

  const existing = await client.discountSyncJob.findUnique({
    where: { dedupeKey },
  });

  if (input.terminal) {
    // Terminal uninstall path: neutralize any remaining open SYNC work first.
    await cancelOpenDiscountSyncJobs(
      shop,
      client,
      "UNINSTALL",
      "Cancelled during uninstall; credentials will be removed.",
    );
    if (!existing) {
      return client.discountSyncJob.create({
        data: {
          shop,
          campaignId: input.campaignId ?? null,
          desiredAction: input.action,
          desiredMode: input.desiredMode ?? null,
          status: DISCOUNT_SYNC_JOB_STATUS.FAILED,
          attemptCount: maxAttempts,
          maxAttempts,
          nextAttemptAt: now,
          lastErrorCode: errorCode ?? "TERMINAL",
          lastErrorMessageSafe:
            errorMessage ?? "Terminal failure; no credentials for retry.",
          dedupeKey,
          completedAt: now,
        },
      });
    }
    return client.discountSyncJob.update({
      where: { id: existing.id },
      data: {
        status: DISCOUNT_SYNC_JOB_STATUS.FAILED,
        attemptCount: maxAttempts,
        maxAttempts,
        lastErrorCode: errorCode ?? "TERMINAL",
        lastErrorMessageSafe:
          errorMessage ?? "Terminal failure; no credentials for retry.",
        campaignId: input.campaignId ?? undefined,
        desiredMode: input.desiredMode ?? undefined,
        completedAt: now,
        claimedAt: null,
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
  }

  if (!existing) {
    return client.discountSyncJob.create({
      data: {
        shop,
        campaignId: input.campaignId ?? null,
        desiredAction: input.action,
        desiredMode: input.desiredMode ?? null,
        status: DISCOUNT_SYNC_JOB_STATUS.PENDING,
        attemptCount: 0,
        maxAttempts,
        nextAttemptAt: now,
        lastErrorCode: errorCode,
        lastErrorMessageSafe: errorMessage,
        dedupeKey,
        completedAt: null,
      },
    });
  }

  if (leaseStillActive(existing, now)) {
    return client.discountSyncJob.update({
      where: { id: existing.id },
      data: {
        lastErrorCode: errorCode ?? undefined,
        lastErrorMessageSafe: errorMessage ?? undefined,
        desiredMode: input.desiredMode ?? undefined,
        campaignId: input.campaignId ?? undefined,
      },
    });
  }

  const reopenFresh =
    existing.status === DISCOUNT_SYNC_JOB_STATUS.COMPLETED ||
    existing.status === DISCOUNT_SYNC_JOB_STATUS.FAILED ||
    existing.status === DISCOUNT_SYNC_JOB_STATUS.CANCELLED;

  return client.discountSyncJob.update({
    where: { id: existing.id },
    data: {
      status: DISCOUNT_SYNC_JOB_STATUS.PENDING,
      desiredMode: input.desiredMode ?? undefined,
      campaignId: input.campaignId ?? undefined,
      attemptCount: reopenFresh ? 0 : existing.attemptCount,
      maxAttempts,
      nextAttemptAt: now,
      lastErrorCode: errorCode ?? undefined,
      lastErrorMessageSafe: errorMessage ?? undefined,
      completedAt: null,
      claimedAt: null,
      claimToken: null,
      leaseExpiresAt: null,
    },
  });
}

/**
 * Atomically claim the next due job.
 * Production path uses FOR UPDATE SKIP LOCKED (multi-replica safe).
 * Never claims completed/failed/cancelled rows.
 */
export async function claimNextDiscountSyncJob(
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
  options: { workerId?: string; now?: Date; leaseMs?: number } = {},
): Promise<DiscountSyncJob | null> {
  const now = options.now ?? new Date();
  const leaseMs = options.leaseMs ?? loadDiscountSyncConfig().leaseMs;
  const claimToken = options.workerId ?? randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  if (hasQueryRaw(client)) {
    return claimWithSkipLocked(client, { now, claimToken, leaseExpiresAt });
  }

  return claimWithOptimisticUpdate(client, { now, claimToken, leaseExpiresAt });
}

async function claimWithSkipLocked(
  client: ClaimableStore,
  args: { now: Date; claimToken: string; leaseExpiresAt: Date },
): Promise<DiscountSyncJob | null> {
  const rows = await client.$queryRaw<DiscountSyncJob[]>(Prisma.sql`
    WITH next_job AS (
      SELECT id
      FROM "DiscountSyncJob"
      WHERE
        (
          status = ${DISCOUNT_SYNC_JOB_STATUS.PENDING}
          AND "nextAttemptAt" <= ${args.now}
        )
        OR (
          status = ${DISCOUNT_SYNC_JOB_STATUS.CLAIMED}
          AND "leaseExpiresAt" IS NOT NULL
          AND "leaseExpiresAt" <= ${args.now}
        )
      ORDER BY "nextAttemptAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "DiscountSyncJob" AS j
    SET
      status = ${DISCOUNT_SYNC_JOB_STATUS.CLAIMED},
      "claimToken" = ${args.claimToken},
      "claimedAt" = ${args.now},
      "leaseExpiresAt" = ${args.leaseExpiresAt},
      "updatedAt" = ${args.now}
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.*
  `);

  return rows[0] ?? null;
}

async function claimWithOptimisticUpdate(
  client: DiscountSyncJobStore,
  args: { now: Date; claimToken: string; leaseExpiresAt: Date },
): Promise<DiscountSyncJob | null> {
  return client.$transaction(async (tx) => {
    const candidate = await tx.discountSyncJob.findFirst({
      where: {
        OR: [
          {
            status: DISCOUNT_SYNC_JOB_STATUS.PENDING,
            nextAttemptAt: { lte: args.now },
          },
          {
            status: DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
            leaseExpiresAt: { lte: args.now },
          },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
    });
    if (!candidate) return null;
    if (
      candidate.status === DISCOUNT_SYNC_JOB_STATUS.COMPLETED ||
      candidate.status === DISCOUNT_SYNC_JOB_STATUS.FAILED ||
      candidate.status === DISCOUNT_SYNC_JOB_STATUS.CANCELLED
    ) {
      return null;
    }

    const updated = await tx.discountSyncJob.updateMany({
      where: {
        id: candidate.id,
        OR: [
          { status: DISCOUNT_SYNC_JOB_STATUS.PENDING },
          {
            status: DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
            leaseExpiresAt: { lte: args.now },
          },
        ],
      },
      data: {
        status: DISCOUNT_SYNC_JOB_STATUS.CLAIMED,
        claimToken: args.claimToken,
        claimedAt: args.now,
        leaseExpiresAt: args.leaseExpiresAt,
      },
    });

    if (updated.count !== 1) return null;

    return tx.discountSyncJob.findUnique({ where: { id: candidate.id } });
  });
}

async function markJobCompleted(
  job: DiscountSyncJob,
  client: DiscountSyncJobStore,
  meta?: { lastErrorCode?: string | null; lastErrorMessageSafe?: string | null },
): Promise<void> {
  const now = new Date();
  await client.discountSyncJob.update({
    where: { id: job.id },
    data: {
      status: DISCOUNT_SYNC_JOB_STATUS.COMPLETED,
      completedAt: now,
      claimToken: null,
      leaseExpiresAt: null,
      lastErrorCode: meta?.lastErrorCode ?? null,
      lastErrorMessageSafe: meta?.lastErrorMessageSafe ?? null,
    },
  });
}

async function markJobCancelled(
  job: DiscountSyncJob,
  client: DiscountSyncJobStore,
  reasonCode: string,
  reasonMessage: string,
): Promise<DiscountSyncJob> {
  const now = new Date();
  return client.discountSyncJob.update({
    where: { id: job.id },
    data: {
      status: DISCOUNT_SYNC_JOB_STATUS.CANCELLED,
      completedAt: now,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: reasonCode,
      lastErrorMessageSafe: toSafeErrorMessage(reasonMessage),
    },
  });
}

/** Exported for tests — advances attempt / schedules backoff or terminals. */
export async function markJobFailure(
  job: DiscountSyncJob,
  error: unknown,
  client: DiscountSyncJobStore,
): Promise<DiscountSyncJob> {
  const attemptCount = job.attemptCount + 1;
  const classified = classifySyncError(error);
  const retryable = isRetryableError(classified);
  const exhausted = attemptCount >= job.maxAttempts || !retryable;
  const { nextAttemptAt } = computeBackoffMs(attemptCount);
  const now = new Date();

  return client.discountSyncJob.update({
    where: { id: job.id },
    data: {
      attemptCount,
      status: exhausted
        ? DISCOUNT_SYNC_JOB_STATUS.FAILED
        : DISCOUNT_SYNC_JOB_STATUS.PENDING,
      nextAttemptAt: exhausted ? now : nextAttemptAt,
      completedAt: exhausted ? now : null,
      claimToken: null,
      claimedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: classified.code,
      lastErrorMessageSafe: toSafeErrorMessage(classified),
    },
  });
}

export type ProcessDiscountSyncJobDeps = {
  hasShopSession?: (shop: string) => Promise<boolean>;
  runSync?: (
    shop: string,
  ) => Promise<{ discountGid: string; mode: DiscountSyncMode }>;
  runDeactivate?: (shop: string) => Promise<void>;
};

async function defaultHasShopSession(
  shop: string,
  client: DiscountSyncJobStore,
): Promise<boolean> {
  if (client.session?.count) {
    return (await client.session.count({ where: { shop } })) > 0;
  }
  const count = await db.session.count({ where: { shop } });
  return count > 0;
}

/**
 * Execution plan: always prefer current DB truth over the originally queued action.
 *
 * - Cancelled jobs → noop
 * - No session (uninstalled) → noop (cannot call Shopify)
 * - Queued DEACTIVATE but session remains → supersede into SYNC (reconcile)
 * - SYNC → always reconcile via syncShopDiscount (activate/deactivate from plan)
 */
export async function resolveDiscountSyncExecution(
  job: DiscountSyncJob,
  deps: ProcessDiscountSyncJobDeps,
  client: DiscountSyncJobStore,
): Promise<
  | { kind: "noop"; reason: string; code: string }
  | { kind: "sync" }
  | { kind: "deactivate" }
> {
  const fresh =
    (await client.discountSyncJob.findUnique({ where: { id: job.id } })) ?? job;
  if (fresh.status === DISCOUNT_SYNC_JOB_STATUS.CANCELLED) {
    return {
      kind: "noop",
      code: "CANCELLED",
      reason: "Job was cancelled before execution.",
    };
  }

  const hasSession =
    (await deps.hasShopSession?.(job.shop)) ??
    (await defaultHasShopSession(job.shop, client));

  if (!hasSession) {
    return {
      kind: "noop",
      code: "UNINSTALLED",
      reason: "No shop session; remote discount API unavailable.",
    };
  }

  if (job.desiredAction === DISCOUNT_SYNC_ACTIONS.DEACTIVATE) {
    // Merchant still installed — do not blindly deactivate; reconcile instead.
    return { kind: "sync" };
  }

  if (job.desiredAction !== DISCOUNT_SYNC_ACTIONS.SYNC) {
    return {
      kind: "noop",
      code: "UNSUPPORTED_ACTION",
      reason: "Unsupported desired action.",
    };
  }

  return { kind: "sync" };
}

export async function processDiscountSyncJob(
  job: DiscountSyncJob,
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
  deps: ProcessDiscountSyncJobDeps = {},
): Promise<{ ok: boolean; job: DiscountSyncJob; outcome?: string }> {
  try {
    const plan = await resolveDiscountSyncExecution(job, deps, client);

    if (plan.kind === "noop") {
      const cancelled = await markJobCancelled(
        job,
        client,
        plan.code,
        plan.reason,
      );
      return { ok: true, job: cancelled, outcome: "noop" };
    }

    if (plan.kind === "deactivate") {
      if (deps.runDeactivate) {
        await deps.runDeactivate(job.shop);
      } else {
        const { unauthenticated } = await import("../shopify.server");
        const { admin } = await unauthenticated.admin(job.shop);
        const gid = await resolveShopDiscountGid(admin, job.shop);
        if (gid) {
          await deactivateAutomaticAppDiscount(admin, gid);
        }
      }
      await upsertShopDiscountSyncState(job.shop, {
        syncStatus: "inactive",
        lastSyncErrorCode: null,
        lastSyncedAt: new Date(),
      });
    } else {
      if (deps.runSync) {
        await deps.runSync(job.shop);
      } else {
        const { unauthenticated } = await import("../shopify.server");
        const { admin } = await unauthenticated.admin(job.shop);
        await syncShopDiscount(admin, job.shop, {
          enqueueOnFailure: false,
        });
      }
    }

    await markJobCompleted(
      job,
      client,
      plan.kind === "sync" && job.desiredAction === DISCOUNT_SYNC_ACTIONS.DEACTIVATE
        ? {
            lastErrorCode: "SUPERSEDED",
            lastErrorMessageSafe:
              "Queued DEACTIVATE superseded; reconciled via current SYNC plan.",
          }
        : undefined,
    );
    const completed =
      (await client.discountSyncJob.findUnique({ where: { id: job.id } })) ??
      job;
    return { ok: true, job: completed, outcome: plan.kind };
  } catch (error) {
    logOperationalError("discount-sync-job", error, {
      shop: job.shop,
      jobId: job.id,
      action: job.desiredAction,
    });
    const failed = await markJobFailure(job, error, client);
    if (failed.status === DISCOUNT_SYNC_JOB_STATUS.FAILED) {
      await upsertShopDiscountSyncState(job.shop, {
        syncStatus: "failed",
        lastSyncErrorCode: failed.lastErrorCode,
      });
    } else {
      await upsertShopDiscountSyncState(job.shop, {
        syncStatus: "retry_scheduled",
        lastSyncErrorCode: failed.lastErrorCode,
      });
    }
    return { ok: false, job: failed, outcome: "failed" };
  }
}

export async function processDueDiscountSyncJobs(
  options: {
    limit?: number;
    client?: DiscountSyncJobStore;
    deps?: ProcessDiscountSyncJobDeps;
    shouldStop?: () => boolean;
  } = {},
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const client = options.client ?? (db as unknown as DiscountSyncJobStore);
  const limit = options.limit ?? loadDiscountSyncConfig().batchSize;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    if (options.shouldStop?.()) break;
    const job = await claimNextDiscountSyncJob(client);
    if (!job) break;
    processed += 1;
    const result = await processDiscountSyncJob(job, client, options.deps);
    if (result.ok) succeeded += 1;
    else failed += 1;
  }

  return { processed, succeeded, failed };
}

export async function inspectDiscountSyncJobs(
  shop?: string,
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
): Promise<DiscountSyncJob[]> {
  return client.discountSyncJob.findMany({
    where: shop ? { shop: shop.trim() } : undefined,
    orderBy: [{ status: "asc" }, { nextAttemptAt: "asc" }],
    take: 100,
  });
}

export type DiscountSyncInspectSummary = {
  shop: string | null;
  countsByStatus: Record<string, number>;
  due: number;
  processing: number;
  expiredLeases: number;
  permanentlyFailed: number;
  oldestPendingAgeSeconds: number | null;
  /** Safe job list: codes only, no raw unsafe payloads. */
  jobs: Array<{
    id: string;
    shop: string;
    desiredAction: string;
    status: string;
    attemptCount: number;
    maxAttempts: number;
    nextAttemptAt: string;
    lastErrorCode: string | null;
    completedAt: string | null;
  }>;
};

/** Read-only operational summary — no secrets, payloads, or session data. */
export async function inspectDiscountSyncQueueSummary(
  shop?: string,
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
  now = new Date(),
): Promise<DiscountSyncInspectSummary> {
  const normalized = shop?.trim() || null;
  const jobs = await client.discountSyncJob.findMany({
    where: normalized ? { shop: normalized } : undefined,
    orderBy: [{ status: "asc" }, { nextAttemptAt: "asc" }],
    take: 500,
  });

  const countsByStatus: Record<string, number> = {};
  let due = 0;
  let processing = 0;
  let expiredLeases = 0;
  let permanentlyFailed = 0;
  let oldestPending: Date | null = null;

  for (const job of jobs) {
    countsByStatus[job.status] = (countsByStatus[job.status] ?? 0) + 1;
    if (
      job.status === DISCOUNT_SYNC_JOB_STATUS.PENDING &&
      job.nextAttemptAt <= now
    ) {
      due += 1;
    }
    if (job.status === DISCOUNT_SYNC_JOB_STATUS.CLAIMED) {
      processing += 1;
      if (job.leaseExpiresAt && job.leaseExpiresAt <= now) expiredLeases += 1;
    }
    if (job.status === DISCOUNT_SYNC_JOB_STATUS.FAILED) permanentlyFailed += 1;
    if (job.status === DISCOUNT_SYNC_JOB_STATUS.PENDING) {
      if (!oldestPending || job.createdAt < oldestPending) {
        oldestPending = job.createdAt;
      }
    }
  }

  return {
    shop: normalized,
    countsByStatus,
    due,
    processing,
    expiredLeases,
    permanentlyFailed,
    oldestPendingAgeSeconds: oldestPending
      ? Math.max(0, Math.floor((now.getTime() - oldestPending.getTime()) / 1000))
      : null,
    jobs: jobs.slice(0, 100).map((job) => ({
      id: job.id,
      shop: job.shop,
      desiredAction: job.desiredAction,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt.toISOString(),
      lastErrorCode: job.lastErrorCode,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    })),
  };
}

/** Minimal metrics helper — does not affect /health/ready. */
export async function getDiscountSyncQueueMetrics(
  client: DiscountSyncJobStore = db as unknown as DiscountSyncJobStore,
): Promise<{
  pending: number;
  claimed: number;
  failed: number;
  due: number;
}> {
  const summary = await inspectDiscountSyncQueueSummary(undefined, client);
  return {
    pending: summary.countsByStatus.pending ?? 0,
    claimed: summary.countsByStatus.claimed ?? 0,
    failed: summary.permanentlyFailed,
    due: summary.due,
  };
}
