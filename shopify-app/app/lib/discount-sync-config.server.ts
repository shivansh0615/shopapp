/**
 * Validated, bounded configuration for discount sync retries / worker.
 *
 * All values fail-safe to documented defaults when env is missing/invalid.
 */

function intEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export const DISCOUNT_SYNC_DEFAULTS = {
  /** Jobs claimed per run-once / poll tick. */
  batchSize: 10,
  /** Base delay for attempt 0 exponential backoff (ms). */
  baseDelayMs: 1_000,
  /** Cap for exponential backoff (ms). */
  maxDelayMs: 30 * 60 * 1000,
  /** Full jitter: delay = random(0..min(maxDelay, base*2^attempt)). */
  jitter: "full" as const,
  /** Max worker attempts including the first claimed execution. */
  maxAttempts: 8,
  /** Claim lease duration (ms). Abandoned claims reclaim after expiry. */
  leaseMs: 60_000,
  /** Continuous worker idle poll interval (ms). */
  pollIntervalMs: 5_000,
  /** Grace period to finish the active job after SIGTERM/SIGINT (ms). */
  shutdownGraceMs: 25_000,
  /** Advisory lock wait timeout (ms). */
  lockTimeoutMs: 30_000,
} as const;

export type DiscountSyncRuntimeConfig = {
  batchSize: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  leaseMs: number;
  pollIntervalMs: number;
  shutdownGraceMs: number;
  lockTimeoutMs: number;
  /** When true, continuous worker must not claim work. */
  disabled: boolean;
};

export function loadDiscountSyncConfig(
  env: NodeJS.ProcessEnv = process.env,
): DiscountSyncRuntimeConfig {
  const disabled =
    String(env.DISCOUNT_SYNC_WORKER_DISABLED || "")
      .trim()
      .toLowerCase() === "true" ||
    String(env.DISCOUNT_SYNC_WORKER_DISABLED || "").trim() === "1";

  return {
    batchSize: intEnv(env, "DISCOUNT_SYNC_BATCH", DISCOUNT_SYNC_DEFAULTS.batchSize, 1, 50),
    baseDelayMs: intEnv(
      env,
      "DISCOUNT_SYNC_BASE_DELAY_MS",
      DISCOUNT_SYNC_DEFAULTS.baseDelayMs,
      100,
      60_000,
    ),
    maxDelayMs: intEnv(
      env,
      "DISCOUNT_SYNC_MAX_DELAY_MS",
      DISCOUNT_SYNC_DEFAULTS.maxDelayMs,
      1_000,
      60 * 60 * 1000,
    ),
    maxAttempts: intEnv(
      env,
      "DISCOUNT_SYNC_MAX_ATTEMPTS",
      DISCOUNT_SYNC_DEFAULTS.maxAttempts,
      1,
      20,
    ),
    leaseMs: intEnv(
      env,
      "DISCOUNT_SYNC_LEASE_MS",
      DISCOUNT_SYNC_DEFAULTS.leaseMs,
      5_000,
      15 * 60_000,
    ),
    pollIntervalMs: intEnv(
      env,
      "DISCOUNT_SYNC_POLL_MS",
      DISCOUNT_SYNC_DEFAULTS.pollIntervalMs,
      1_000,
      5 * 60_000,
    ),
    shutdownGraceMs: intEnv(
      env,
      "DISCOUNT_SYNC_SHUTDOWN_GRACE_MS",
      DISCOUNT_SYNC_DEFAULTS.shutdownGraceMs,
      1_000,
      5 * 60_000,
    ),
    lockTimeoutMs: intEnv(
      env,
      "DISCOUNT_SYNC_LOCK_TIMEOUT_MS",
      DISCOUNT_SYNC_DEFAULTS.lockTimeoutMs,
      1_000,
      120_000,
    ),
    disabled,
  };
}
