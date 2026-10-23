import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiscountSyncJob } from "@prisma/client";
import { createKeyedMutex } from "../lib/shop-lock.server";
import { enqueueDueScheduleSyncs, latestEffectiveBoundary, type ScheduleSyncStore } from "./campaign-schedule-sync.server";

const NOW = new Date("2026-10-20T12:00:00Z");
const before = new Date(NOW.getTime() - 1000);
const after = new Date(NOW.getTime() + 1000);
type Row = { shop: string; startDate: Date | null; endDate: Date | null };

function fixture(rows: Row[], existing?: Partial<DiscountSyncJob>) {
  let job = existing ? {
    id: "job", shop: "a", status: "pending", attemptCount: 3,
    nextAttemptAt: after, completedAt: null, dedupeKey: "SYNC:a",
    ...existing,
  } as DiscountSyncJob : null;
  let lastSyncedAt: Date | null = null;
  let sessions = 1;
  let writes = 0;
  const client = {
    campaign: { findMany: async (args: unknown) => {
      assert.deepEqual(args, {
        where: { status: "ACTIVE", OR: [{ startDate: { lte: NOW } }, { endDate: { lt: NOW } }] },
        select: { shop: true, startDate: true, endDate: true },
      });
      return rows;
    } },
    shopDiscount: { findUnique: async () => ({ lastSyncedAt }) },
    session: { count: async () => sessions },
    discountSyncJob: {
      findUnique: async () => job,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: object }) => {
        writes++;
        job = { id: "job", ...data } as DiscountSyncJob;
        return job;
      },
      update: async ({ data }: { data: object }) => {
        writes++;
        job = { ...job, ...data } as DiscountSyncJob;
        return job;
      },
    },
  } as unknown as ScheduleSyncStore;
  const lock = createKeyedMutex();
  return {
    scan: () => enqueueDueScheduleSyncs({ now: NOW, client, lock }),
    setSynced: (date: Date) => { lastSyncedAt = date; },
    uninstall: () => { sessions = 0; },
    job: () => job,
    writes: () => writes,
  };
}
const started: Row = { shop: "a", startDate: NOW, endDate: null };

describe("campaign schedule synchronization", () => {
  it("starts at the exact start boundary but expires only after the inclusive end", () => {
    assert.equal(latestEffectiveBoundary({ startDate: NOW, endDate: null }, NOW), NOW.getTime());
    assert.equal(latestEffectiveBoundary({ startDate: null, endDate: NOW }, NOW), null);
    assert.equal(latestEffectiveBoundary({ startDate: null, endDate: NOW }, after), NOW.getTime() + 1);
    assert.equal(latestEffectiveBoundary({ startDate: after, endDate: null }, NOW), null);
  });

  it("queues a newly started campaign once, including concurrent scanner passes", async () => {
    const f = fixture([started, started]);
    assert.equal((await Promise.all([f.scan(), f.scan()])).reduce((a, b) => a + b), 1);
    assert.equal(f.writes(), 1);
    assert.equal(f.job()?.shop, "a");
    assert.equal(f.job()?.desiredAction, "SYNC");
  });

  it("queues an expired campaign even when it was synced at its inclusive end", async () => {
    const f = fixture([{ shop: "a", startDate: null, endDate: before }]);
    f.setSynced(before);
    assert.equal(await f.scan(), 1);
  });

  it("does not queue future schedules or an end boundary that has not expired", async () => {
    const f = fixture([{ shop: "a", startDate: after, endDate: null },
      { shop: "b", startDate: null, endDate: NOW }]);
    assert.equal(await f.scan(), 0);
  });

  it("skips an already synchronized boundary and shops without installation sessions", async () => {
    const synced = fixture([started]);
    synced.setSynced(NOW);
    assert.equal(await synced.scan(), 0);
    const uninstalled = fixture([started]);
    uninstalled.uninstall();
    assert.equal(await uninstalled.scan(), 0);
  });

  for (const status of ["pending", "claimed"]) {
    it(`preserves ${status} job attempts, retry time and lease`, async () => {
      const f = fixture([started], { status, claimToken: "owner", leaseExpiresAt: after });
      const original = structuredClone(f.job());
      assert.equal(await f.scan(), 0);
      assert.deepEqual(f.job(), original);
      assert.equal(f.writes(), 0);
    });
  }

  for (const status of ["failed", "cancelled"]) {
    it(`does not reopen ${status} work for the same transition`, async () => {
      const f = fixture([started], { status, completedAt: NOW });
      assert.equal(await f.scan(), 0);
      assert.equal(f.writes(), 0);
    });
  }

  it("allows a new transition after a previous terminal failure", async () => {
    const f = fixture([started], { status: "failed", completedAt: before });
    assert.equal(await f.scan(), 1);
    assert.equal(f.job()?.attemptCount, 0);
  });

  it("requeues a completed sync whose evaluated config predates the boundary", async () => {
    const f = fixture([started], { status: "completed", completedAt: after });
    f.setSynced(before);
    assert.equal(await f.scan(), 1);
  });
});
