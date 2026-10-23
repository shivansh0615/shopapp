/**
 * Process / dependency health checks for load balancers.
 * No Shopify API calls. No secrets in responses.
 */

import type { PrismaClient } from "@prisma/client";

export const READY_CHECK_TIMEOUT_MS = 2000;

export type LiveResponseBody = {
  status: "ok";
};

export type ReadyResponseBody =
  | { status: "ready" }
  | { status: "not_ready"; reason: "configuration" | "database" | "timeout" };

export function buildLiveResponse(): Response {
  const body: LiveResponseBody = { status: "ok" };
  return Response.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function hasRequiredRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV !== "production") {
    // In non-production, require DATABASE_URL only for readiness DB check.
    return Boolean(env.DATABASE_URL && String(env.DATABASE_URL).trim());
  }

  const required = [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "SCOPES",
    "DATABASE_URL",
  ];
  return required.every((key) => Boolean(env[key] && String(env[key]).trim()));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error("timeout"),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type ReadyCheckDeps = {
  env?: NodeJS.ProcessEnv;
  prisma: Pick<PrismaClient, "$queryRaw">;
  timeoutMs?: number;
  ping?: (prisma: Pick<PrismaClient, "$queryRaw">) => Promise<unknown>;
};

async function defaultPing(prisma: Pick<PrismaClient, "$queryRaw">) {
  return prisma.$queryRaw`SELECT 1`;
}

/**
 * Returns a readiness Response. Never includes stack traces, URLs, or env values.
 */
export async function buildReadyResponse(
  deps: ReadyCheckDeps,
): Promise<Response> {
  const env = deps.env ?? process.env;
  const timeoutMs = deps.timeoutMs ?? READY_CHECK_TIMEOUT_MS;
  const ping = deps.ping ?? defaultPing;

  if (!hasRequiredRuntimeConfig(env)) {
    const body: ReadyResponseBody = {
      status: "not_ready",
      reason: "configuration",
    };
    return Response.json(body, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await withTimeout(Promise.resolve(ping(deps.prisma)), timeoutMs, new Error("timeout"));
    const body: ReadyResponseBody = { status: "ready" };
    return Response.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "timeout";
    const body: ReadyResponseBody = {
      status: "not_ready",
      reason: timedOut ? "timeout" : "database",
    };
    return Response.json(body, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
