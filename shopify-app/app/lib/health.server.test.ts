import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  READY_CHECK_TIMEOUT_MS,
  buildLiveResponse,
  buildReadyResponse,
  hasRequiredRuntimeConfig,
  withTimeout,
} from "./health.server";

describe("buildLiveResponse", () => {
  it("returns healthy liveness JSON without secrets or stack traces", async () => {
    const res = buildLiveResponse();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: "ok" });
    const text = JSON.stringify(body);
    assert.equal(text.includes("DATABASE_URL"), false);
    assert.equal(text.includes("stack"), false);
    assert.equal(text.includes("SHOPIFY"), false);
  });
});

describe("hasRequiredRuntimeConfig", () => {
  it("requires DATABASE_URL outside production", () => {
    assert.equal(hasRequiredRuntimeConfig({ NODE_ENV: "development" }), false);
    assert.equal(
      hasRequiredRuntimeConfig({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://fgpb:fgpb@127.0.0.1:5432/fgpb",
      }),
      true,
    );
  });

  it("requires full production set in production", () => {
    assert.equal(
      hasRequiredRuntimeConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://fgpb:fgpb@127.0.0.1:5432/fgpb",
      }),
      false,
    );
    assert.equal(
      hasRequiredRuntimeConfig({
        NODE_ENV: "production",
        SHOPIFY_API_KEY: "key",
        SHOPIFY_API_SECRET: "secret",
        SHOPIFY_APP_URL: "https://app.example-real.internal",
        SCOPES: "write_products",
        DATABASE_URL: "postgresql://fgpb:fgpb@127.0.0.1:5432/fgpb",
      }),
      true,
    );
  });
});

describe("withTimeout", () => {
  it("resolves when the work finishes before the timeout", async () => {
    const value = await withTimeout(Promise.resolve(42), 100);
    assert.equal(value, 42);
  });

  it("rejects with timeout when the work is too slow", async () => {
    await assert.rejects(
      () =>
        withTimeout(
          new Promise((resolve) => setTimeout(resolve, 50)),
          5,
          new Error("timeout"),
        ),
      /timeout/,
    );
  });
});

describe("buildReadyResponse", () => {
  const baseEnv = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://fgpb:fgpb@127.0.0.1:5432/fgpb",
  } as NodeJS.ProcessEnv;

  it("returns healthy readiness when ping succeeds", async () => {
    const res = await buildReadyResponse({
      env: baseEnv,
      prisma: { $queryRaw: async () => [{ "?column?": 1 }] } as never,
      ping: async () => [{ ok: 1 }],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ready" });
  });

  it("returns configuration not_ready when DATABASE_URL is missing", async () => {
    const res = await buildReadyResponse({
      env: { NODE_ENV: "development" } as NodeJS.ProcessEnv,
      prisma: { $queryRaw: async () => [{ "?column?": 1 }] } as never,
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      status: "not_ready",
      reason: "configuration",
    });
  });

  it("returns database not_ready without leaking errors", async () => {
    const res = await buildReadyResponse({
      env: baseEnv,
      prisma: { $queryRaw: async () => [{ "?column?": 1 }] } as never,
      ping: async () => {
        throw new Error("ECONNREFUSED postgresql://secret-user:secret-pass@db:5432/fgpb");
      },
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.deepEqual(body, { status: "not_ready", reason: "database" });
    const text = JSON.stringify(body);
    assert.equal(text.includes("secret-pass"), false);
    assert.equal(text.includes("ECONNREFUSED"), false);
    assert.equal(text.includes("stack"), false);
  });

  it("returns timeout not_ready when the ping exceeds the limit", async () => {
    const res = await buildReadyResponse({
      env: baseEnv,
      prisma: { $queryRaw: async () => [{ "?column?": 1 }] } as never,
      timeoutMs: 10,
      ping: async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 100);
        }),
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      status: "not_ready",
      reason: "timeout",
    });
  });

  it("uses the default readiness timeout constant", () => {
    assert.equal(READY_CHECK_TIMEOUT_MS, 2000);
  });
});
