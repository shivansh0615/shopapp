# Discount Sync Worker — Production Scheduling

> **The production environment must schedule the discount-sync worker. Creating the worker code alone does not execute retries.**

## Campaign schedule transitions

Each enabled run-once invocation or watch batch first scans ACTIVE campaigns for
effective start/end boundaries, then processes the durable queue. Supplying a
database client does not disable scanning. Start times are inclusive; expiration
occurs after the inclusive end time, matching campaign evaluation.

The scanner coalesces transitions per shop and uses the existing shop lock.
Installed shops whose last successful configuration predates the boundary are
queued. Pending/claimed jobs retain their retry time, attempts and lease. Failed
or cancelled jobs are not reopened for the same boundary; a later boundary may
request a fresh sync. Shops without sessions are skipped.

`ShopDiscount.lastSyncedAt` records the schedule evaluation time represented by
the successfully written configuration. It is not the end of the network
request. This allows a boundary crossed during a slow Shopify response to be
detected on the next scan.

Schedule updates are eventually consistent: worker cadence, queue depth and
Shopify failures affect delay. Keep the worker running and monitor terminal
failures. The web-only Docker runner does not include the source/tsx worker CLI;
run these commands from a worker deployment with source and its required
dependencies, as well as the same runtime credentials.
>
> Canonical scheduling contract: [ops/worker-scheduling.md](./ops/worker-scheduling.md). Deployment overview: [ops/deployment.md](./ops/deployment.md).

## Commands

| Mode | Command | Behavior |
|---|---|---|
| Run once (recommended for cron) | `npm run discount-sync:once` | Claim a bounded batch, process, exit 0 (including empty queue) |
| Run once (alias) | `npm run discount-sync:process` | Same as once unless `--watch` |
| Continuous | `npm run discount-sync:watch` | Bounded polling until SIGTERM/SIGINT |
| Inspect | `npm run discount-sync:inspect [shop]` | Read-only queue summary (exact shop filter optional) |

## Recommended production mode

**Scheduled run-once** every 1–5 minutes via the host scheduler (Cloud Run Job, systemd timer, Kubernetes CronJob, etc.).

Do **not** run the worker inside the main web process.

A dedicated long-running `discount-sync:watch` process is acceptable when the platform prefers always-on workers.

## Safe schedule frequency

- Start at **every 1–2 minutes**.
- Batch size default: `10` (`DISCOUNT_SYNC_BATCH`).
- Lease duration default: `60s` — schedule interval should usually be ≤ lease so reclaim stays timely, but reclaim also works if a worker dies mid-job.

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL |
| `DISCOUNT_SYNC_BATCH` | `10` | 1–50 |
| `DISCOUNT_SYNC_BASE_DELAY_MS` | `1000` | Backoff base |
| `DISCOUNT_SYNC_MAX_DELAY_MS` | `1800000` | 30 minutes cap |
| `DISCOUNT_SYNC_MAX_ATTEMPTS` | `8` | Includes first claimed execution |
| `DISCOUNT_SYNC_LEASE_MS` | `60000` | Claim lease |
| `DISCOUNT_SYNC_POLL_MS` | `5000` | Watch mode only |
| `DISCOUNT_SYNC_SHUTDOWN_GRACE_MS` | `25000` | Finish active job window |
| `DISCOUNT_SYNC_LOCK_TIMEOUT_MS` | `30000` | Advisory lock wait |
| `DISCOUNT_SYNC_WORKER_DISABLED` | unset | `true` / `1` disables claiming (incident response) |

Shopify Admin credentials come from existing session storage used by `unauthenticated.admin(shop)` — the worker needs the same runtime secrets as the web app.

## Concurrency guidance

- Multiple worker replicas are safe: claiming uses `FOR UPDATE SKIP LOCKED`.
- Discount critical sections use a **dedicated single-connection** Prisma advisory lock client (`connection_limit=1`) plus an in-process keyed mutex.
- Prefer 1–2 worker replicas; raising replicas does not require changing application code.

## Multi-replica behavior

- **Job claim:** atomic across replicas sharing one Postgres.
- **Shop discount sync lock:** session advisory lock on a dedicated connection — safe across replicas on the same database.
- **Active leases:** enqueue will not steal a valid claim token/lease.
- **Abandoned jobs:** reclaimed when `leaseExpiresAt` elapses.

## Deployment ordering

1. Deploy migrations (`prisma migrate deploy`), including `DiscountSyncJob` indexes.
2. Deploy application (web + worker image/binary).
3. Enable scheduler for `discount-sync:once`.
4. Verify with `discount-sync:inspect`.

## Graceful shutdown

- `SIGTERM` / `SIGINT` stop new claims immediately.
- Active job may finish within `DISCOUNT_SYNC_SHUTDOWN_GRACE_MS`.
- If interrupted mid-job, leave status `claimed` until lease expiry — never mark unfinished work `completed`.

## Inspect failed jobs

```bash
npm run discount-sync:inspect
npm run discount-sync:inspect example.myshopify.com
```

Output includes counts by status, due/processing/expired-lease/failed counts, and safe job metadata (`lastErrorCode` only — no tokens/payloads).

## Retry or reopen a failed job safely

- Prefer a new merchant save/activate (enqueues a fresh SYNC cycle with `attemptCount` reset).
- Or set `status=pending`, `attemptCount=0`, `nextAttemptAt=now()`, clear claim fields for that shop’s SYNC dedupe row via a controlled ops query — only after confirming desired campaign state.

## Disable during incidents

```bash
DISCOUNT_SYNC_WORKER_DISABLED=true npm run discount-sync:once
```

Or unset the scheduler. Web requests still attempt in-process sync + one immediate retry.

## Uninstall and shop/redact

- Uninstall cancels open jobs, best-effort deactivates remotely, may write a **terminal** DEACTIVATE failure record (no post-wipe API retry).
- `shop/redact` deletes all `DiscountSyncJob` rows for that shop inside the redact transaction.

## Attempt / backoff semantics

- `attemptCount` increments on each failed worker execution.
- `maxAttempts` is the maximum failed executions before `failed`.
- Backoff: full jitter in `[0, min(maxDelay, base * 2^attempt)]`.
- Permanent errors skip further delay and become `failed` immediately.
- Successful execution → `completed`, lease cleared.
