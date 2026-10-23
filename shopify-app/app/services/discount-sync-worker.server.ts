/**
 * Discount sync worker lifecycle — run-once and bounded continuous polling.
 *
 * Recommended production mode: scheduled run-once (`discount-sync:once`).
 * Optional: dedicated long-running process (`discount-sync:process --watch`).
 * Do not run background jobs inside the main web process.
 */

import {
  loadDiscountSyncConfig,
  type DiscountSyncRuntimeConfig,
} from "../lib/discount-sync-config.server";
import { logOperationalError } from "../lib/errors.server";
import { enqueueDueScheduleSyncs } from "./campaign-schedule-sync.server";
import {
  processDueDiscountSyncJobs,
  type DiscountSyncJobStore,
  type ProcessDiscountSyncJobDeps,
} from "./discount-sync-job.server";

export type WorkerMode = "once" | "watch";

export type DiscountSyncWorkerOptions = {
  mode?: WorkerMode;
  client?: DiscountSyncJobStore;
  deps?: ProcessDiscountSyncJobDeps;
  config?: DiscountSyncRuntimeConfig;
  /** Explicit test seam; supplying a queue client must never disable schedules. */
  scanSchedules?: () => Promise<number>;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable shutdown signal registration for tests. */
  onSignal?: (
    handler: (signal: string) => void,
  ) => () => void;
  /** Called after each batch in watch mode (tests). */
  onBatch?: (result: {
    processed: number;
    succeeded: number;
    failed: number;
  }) => void;
};

export type DiscountSyncWorkerHandle = {
  /** Request graceful stop (same as SIGTERM). */
  requestShutdown: (reason?: string) => void;
  /** True after shutdown begins — no new claims. */
  isShuttingDown: () => boolean;
  /** Resolves when the worker loop exits. */
  done: Promise<{
    mode: WorkerMode;
    batches: number;
    processed: number;
    succeeded: number;
    failed: number;
    shutdownReason: string | null;
  }>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installProcessSignals(
  handler: (signal: string) => void,
): () => void {
  const signals = ["SIGTERM", "SIGINT"] as const;
  for (const signal of signals) {
    process.on(signal, handler);
  }
  return () => {
    for (const signal of signals) {
      process.off(signal, handler);
    }
  };
}

/**
 * Start the discount-sync worker.
 * Run-once exits after one bounded batch (including empty queue → success).
 * Watch mode polls until shutdown.
 */
export function startDiscountSyncWorker(
  options: DiscountSyncWorkerOptions = {},
): DiscountSyncWorkerHandle {
  const config = options.config ?? loadDiscountSyncConfig();
  const mode: WorkerMode = options.mode ?? "once";
  const sleep = options.sleep ?? defaultSleep;
  let shuttingDown = false;
  let shutdownReason: string | null = null;

  const requestShutdown = (reason = "shutdown") => {
    if (shuttingDown) return;
    shuttingDown = true;
    shutdownReason = reason;
  };

  const removeSignals = (options.onSignal ?? installProcessSignals)((signal) => {
    requestShutdown(signal);
  });

  const done = (async () => {
    let batches = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    try {
      if (config.disabled) {
        console.info(
          JSON.stringify({
            ok: true,
            worker: "discount-sync",
            disabled: true,
            message:
              "DISCOUNT_SYNC_WORKER_DISABLED is set; no jobs claimed.",
          }),
        );
        return {
          mode,
          batches: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          shutdownReason: "disabled",
        };
      }

      const runBatch = async () => {
        if (shuttingDown) {
          return { processed: 0, succeeded: 0, failed: 0 };
        }
        await (options.scanSchedules ?? enqueueDueScheduleSyncs)();
        const result = await processDueDiscountSyncJobs({
          limit: config.batchSize,
          client: options.client,
          deps: options.deps,
          shouldStop: () => shuttingDown,
        });
        options.onBatch?.(result);
        return result;
      };

      if (mode === "once") {
        const result = await runBatch();
        batches = 1;
        processed = result.processed;
        succeeded = result.succeeded;
        failed = result.failed;
      } else {
        while (!shuttingDown) {
          try {
            const result = await runBatch();
            batches += 1;
            processed += result.processed;
            succeeded += result.succeeded;
            failed += result.failed;
          } catch (error) {
            logOperationalError("discount-sync-worker", error, {
              phase: "batch",
            });
            // Transient top-level failure: back off, do not tight-loop crash.
            await sleep(config.pollIntervalMs);
          }
          if (shuttingDown) break;
          await sleep(config.pollIntervalMs);
        }
        // Mid-batch: shouldStop prevents new claims; the in-flight batch await
        // above finishes before the loop exits. Lease recovery covers hard kills.
      }

      return {
        mode,
        batches,
        processed,
        succeeded,
        failed,
        shutdownReason,
      };
    } finally {
      removeSignals();
    }
  })();

  // Prevent unhandled rejection if caller does not await immediately.
  done.catch((error) => {
    logOperationalError("discount-sync-worker", error, { phase: "fatal" });
  });

  return {
    requestShutdown,
    isShuttingDown: () => shuttingDown,
    done,
  };
}

/** Convenience: run one batch and return the result (for CLI scripts). */
export async function runDiscountSyncOnce(
  options: Omit<DiscountSyncWorkerOptions, "mode"> = {},
): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const handle = startDiscountSyncWorker({ ...options, mode: "once" });
  const summary = await handle.done;
  return {
    processed: summary.processed,
    succeeded: summary.succeeded,
    failed: summary.failed,
  };
}
