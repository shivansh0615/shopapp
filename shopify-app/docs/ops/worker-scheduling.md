# Worker Scheduling Contract

> **The production environment must schedule the discount-sync worker. Creating the worker code alone does not execute retries.**

This is a **release-blocking** external configuration item.

## Recommended mode

**Scheduled run-once** every **1–2 minutes**:

```bash
npm run discount-sync:once
```

Exit codes:

- `0` — startup OK; empty queue or jobs processed (partial job failures do not fail the process)
- `1` — unrecoverable startup (e.g. missing `DATABASE_URL`)

## Alternate mode

```bash
npm run discount-sync:watch
```

Dedicated process; bounded poll interval (`DISCOUNT_SYNC_POLL_MS`).

## Overlap

- Two overlapping run-once invocations are safe: claims use `FOR UPDATE SKIP LOCKED`.
- Prefer max **1–2** concurrent scheduler executions; more is safe but adds DB load.
- Per-shop Shopify sync is serialized by the dedicated advisory lock.

## Timeouts

- Lease default 60s — platform job timeout should exceed worst-case batch × Shopify latency (recommend ≥ 5 minutes).
- Expected runtime: usually seconds for empty/small queues.

## Incident switch

```bash
DISCOUNT_SYNC_WORKER_DISABLED=true
```

Stops claiming. Web in-request sync still runs.

## Inspect / reopen

```bash
npm run discount-sync:inspect
npm run discount-sync:inspect shop.myshopify.com
```

Reopen safely via a new merchant save (resets attempt cycle) or controlled ops update of a failed SYNC row to `pending` with `attemptCount=0` after confirming desired DB state.

## Post-deploy confirmation

1. Enqueue work (campaign save on a test shop) or inspect existing due jobs.
2. Run `discount-sync:once`.
3. Inspect: due decreases; no unbounded pending growth.
4. Confirm `ShopDiscount.syncStatus` moves off `retry_scheduled` when Shopify is healthy.

Full defaults: [../discount-sync-worker.md](../discount-sync-worker.md).
