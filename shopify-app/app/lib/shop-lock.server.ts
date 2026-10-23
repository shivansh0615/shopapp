/**
 * Shop-scoped lock abstraction for discount synchronization.
 *
 * Implementations:
 * - `createKeyedMutex` — process-local only (tests / single-process).
 * - `createPostgresAdvisoryLock` — PostgreSQL session advisory lock on a
 *   dedicated single-connection Prisma client, plus an in-process keyed mutex.
 *
 * Why a dedicated connection:
 * Prisma's default pool can run consecutive `$executeRaw` calls on different
 * connections. Session advisory locks require lock + unlock on the SAME
 * backend session. Using `connection_limit=1` for the lock client guarantees
 * affinity. The in-process keyed mutex prevents same-shop deadlock when two
 * async tasks would otherwise block each other on that single connection.
 *
 * Protects: all Node processes sharing the same PostgreSQL database.
 * Does NOT protect: cross-region / split-brain databases without shared Postgres.
 */

import { PrismaClient } from "@prisma/client";

export type ShopLock = {
  withLock: <T>(shop: string, fn: () => Promise<T>) => Promise<T>;
};

export type AdvisoryLockClient = {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

function requireShopKey(shop: string): string {
  const normalized = shop.trim();
  if (!normalized) {
    throw new Error("shop is required for shop lock.");
  }
  return normalized;
}

/**
 * Process-local keyed mutex.
 * Protects: one Node process only.
 * Does NOT protect: multiple workers, replicas, or hosts.
 */
export function createKeyedMutex(): ShopLock {
  const tails = new Map<string, Promise<unknown>>();

  return {
    async withLock<T>(shop: string, fn: () => Promise<T>): Promise<T> {
      const key = requireShopKey(shop);
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const next = previous.catch(() => undefined).then(() => gate);
      tails.set(key, next);

      await previous.catch(() => undefined);
      try {
        return await fn();
      } finally {
        release();
        if (tails.get(key) === next) {
          tails.delete(key);
        }
      }
    },
  };
}

function buildSingleConnectionUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    url.searchParams.set("connection_limit", "1");
    return url.href;
  } catch {
    const sep = databaseUrl.includes("?") ? "&" : "?";
    return `${databaseUrl}${sep}connection_limit=1`;
  }
}

let dedicatedLockClient: PrismaClient | null = null;

/** Test/prod override for the dedicated lock client. */
export function setDedicatedLockClientForTests(
  client: PrismaClient | null,
): void {
  dedicatedLockClient = client;
}

function getDedicatedLockClient(): PrismaClient {
  if (dedicatedLockClient) return dedicatedLockClient;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for PostgreSQL shop advisory locks.",
    );
  }
  dedicatedLockClient = new PrismaClient({
    datasources: {
      db: { url: buildSingleConnectionUrl(databaseUrl) },
    },
  });
  return dedicatedLockClient;
}

export type PostgresAdvisoryLockOptions = {
  /**
   * Optional injectable client (must be single-connection / affinity-safe).
   * Defaults to a dedicated PrismaClient with connection_limit=1.
   */
  getClient?: () => AdvisoryLockClient;
  /** Bounded wait before failing lock acquisition (ms). Default 30s. */
  lockTimeoutMs?: number;
  /** In-process same-shop serialization (required with single-connection client). */
  localMutex?: ShopLock;
};

/**
 * PostgreSQL session advisory lock keyed by hashtext(shop).
 *
 * Policy:
 * - Lock wait uses `lock_timeout` on the dedicated session (default 30s).
 * - Always unlocked in `finally`.
 * - Disconnect/process crash: PostgreSQL releases session locks automatically.
 * - Do NOT pass the shared pooled Prisma client — affinity is not guaranteed.
 * - Do NOT hold an ordinary Prisma interactive transaction across Shopify HTTP.
 */
export function createPostgresAdvisoryLock(
  options: PostgresAdvisoryLockOptions = {},
): ShopLock {
  const local = options.localMutex ?? createKeyedMutex();
  const lockTimeoutMs = Math.max(
    1_000,
    Math.min(options.lockTimeoutMs ?? 30_000, 120_000),
  );

  return {
    async withLock<T>(shop: string, fn: () => Promise<T>): Promise<T> {
      return local.withLock(shop, async () => {
        const key = requireShopKey(shop);
        const client = options.getClient?.() ?? getDedicatedLockClient();
        await client.$executeRaw`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`;
        try {
          await client.$executeRaw`SELECT pg_advisory_lock(hashtext(${key}))`;
        } catch (error) {
          const message =
            error instanceof Error ? error.message.toLowerCase() : "";
          if (message.includes("lock_timeout") || message.includes("canceling")) {
            throw new Error(
              `Shop discount sync lock timed out after ${lockTimeoutMs}ms`,
            );
          }
          throw error;
        }
        try {
          return await fn();
        } finally {
          try {
            await client.$executeRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
          } catch {
            // Session may already be gone — Postgres drops abandoned session locks.
          }
        }
      });
    },
  };
}

/** @deprecated Prefer createPostgresAdvisoryLock() with dedicated client options. */
export function createPostgresAdvisoryLockFromPooledClient(
  client: AdvisoryLockClient,
): ShopLock {
  // Kept for tests that inject a fake client with affinity.
  return createPostgresAdvisoryLock({ getClient: () => client });
}
