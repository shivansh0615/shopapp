import assert from "node:assert/strict";
import { describe, it } from "node:test";
import db from "../db.server";
import { runDiscountSyncOnce, startDiscountSyncWorker } from "./discount-sync-worker.server";
import {
  DISCOUNT_SYNC_ACTIONS,
  DISCOUNT_SYNC_JOB_STATUS,
  enqueueDiscountSyncJob,
  type DiscountSyncJobStore,
} from "./discount-sync-job.server";

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
  [key: string]: unknown;
};

function createJobStore(): DiscountSyncJobStore {
  const byDedupe = new Map<string, JobRow>();
  const byId = new Map<string, JobRow>();

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
      count: async () => 1,
    },
    $transaction: async (fn) => fn(api),
  };

  return api;
}

describe("discount sync worker lifecycle", () => {
  it("normal run-once configuration scans schedules even with an explicit client", async (t) => {
    const original = db.campaign.findMany;
    const scan = t.mock.fn(async () => []);
    db.campaign.findMany = scan as never;
    t.after(() => { db.campaign.findMany = original; });
    await runDiscountSyncOnce({ client: createJobStore(), onSignal: () => () => undefined });
    assert.equal(scan.mock.callCount(), 1);
  });

  it("processes schedule work queued during the same run-once invocation", async () => {
    const client = createJobStore();
    const events: string[] = [];
    const result = await runDiscountSyncOnce({
      client,
      onSignal: () => () => undefined,
      scanSchedules: async () => {
        events.push("scan");
        await enqueueDiscountSyncJob({ shop: "scheduled.myshopify.com", action: "SYNC" }, client);
        return 1;
      },
      deps: {
        hasShopSession: async () => true,
        runSync: async () => {
          events.push("sync");
          return { discountGid: "gid://shopify/DiscountAutomaticNode/1", mode: "active" };
        },
      },
    });
    assert.deepEqual(events, ["scan", "sync"]);
    assert.equal(result.succeeded, 1);
  });

  it("run-once exits successfully on empty queue", async () => {
    const client = createJobStore();
    const handle = startDiscountSyncWorker({
      mode: "once",
      client,
      scanSchedules: async () => 0,
      onSignal: () => () => undefined,
      config: {
        batchSize: 5,
        baseDelayMs: 1000,
        maxDelayMs: 1000,
        maxAttempts: 8,
        leaseMs: 60000,
        pollIntervalMs: 10,
        shutdownGraceMs: 50,
        lockTimeoutMs: 1000,
        disabled: false,
      },
    });
    const result = await handle.done;
    assert.equal(result.processed, 0);
    assert.equal(result.mode, "once");
  });

  it("run-once processes a successful injectable job", async () => {
    const client = createJobStore();
    await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      client,
    );
    let synced = 0;
    let scans = 0;
    const handle = startDiscountSyncWorker({
      mode: "once",
      client,
      scanSchedules: async () => { scans += 1; return 0; },
      onSignal: () => () => undefined,
      deps: {
        hasShopSession: async () => true,
        runSync: async () => {
          synced += 1;
          return { discountGid: "gid://shopify/DiscountAutomaticNode/1", mode: "active" };
        },
      },
      config: {
        batchSize: 5,
        baseDelayMs: 1000,
        maxDelayMs: 1000,
        maxAttempts: 8,
        leaseMs: 60000,
        pollIntervalMs: 10,
        shutdownGraceMs: 50,
        lockTimeoutMs: 1000,
        disabled: false,
      },
    });
    const result = await handle.done;
    assert.equal(result.processed, 1);
    assert.equal(result.succeeded, 1);
    assert.equal(synced, 1);
    assert.equal(scans, 1, "explicit database client must not disable schedule scanning");
  });

  it("watch mode stops claiming after shutdown signal", async () => {
    const client = createJobStore();
    let batches = 0;
    let scans = 0;
    let signalHandler: ((s: string) => void) | null = null;
    const handle = startDiscountSyncWorker({
      mode: "watch",
      client,
      scanSchedules: async () => { scans += 1; return 0; },
      sleep: async () => undefined,
      onSignal: (handler) => {
        signalHandler = handler;
        return () => undefined;
      },
      onBatch: () => {
        batches += 1;
        if (batches >= 2) signalHandler?.("SIGTERM");
      },
      config: {
        batchSize: 1,
        baseDelayMs: 1000,
        maxDelayMs: 1000,
        maxAttempts: 8,
        leaseMs: 60000,
        pollIntervalMs: 1,
        shutdownGraceMs: 10,
        lockTimeoutMs: 1000,
        disabled: false,
      },
    });
    const result = await handle.done;
    assert.equal(result.batches, 2);
    assert.equal(scans, 2, "watch mode scans before every batch and stops on shutdown");
    assert.equal(result.shutdownReason, "SIGTERM");
  });

  it("disabled worker claims nothing", async () => {
    const client = createJobStore();
    await enqueueDiscountSyncJob(
      { shop: "a.myshopify.com", action: DISCOUNT_SYNC_ACTIONS.SYNC },
      client,
    );
    const handle = startDiscountSyncWorker({
      mode: "once",
      client,
      scanSchedules: async () => { assert.fail("disabled worker must not scan"); },
      onSignal: () => () => undefined,
      config: {
        batchSize: 5,
        baseDelayMs: 1000,
        maxDelayMs: 1000,
        maxAttempts: 8,
        leaseMs: 60000,
        pollIntervalMs: 10,
        shutdownGraceMs: 50,
        lockTimeoutMs: 1000,
        disabled: true,
      },
    });
    const result = await handle.done;
    assert.equal(result.processed, 0);
    assert.equal(result.shutdownReason, "disabled");
  });
});
