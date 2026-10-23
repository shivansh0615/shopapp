import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createKeyedMutex, createPostgresAdvisoryLock } from "./shop-lock.server";

describe("shop lock abstraction", () => {
  it("serializes same-shop work and releases after success", async () => {
    const lock = createKeyedMutex();
    const order: string[] = [];
    await Promise.all([
      lock.withLock("a.myshopify.com", async () => {
        order.push("a1-start");
        await new Promise((r) => setTimeout(r, 30));
        order.push("a1-end");
      }),
      lock.withLock("a.myshopify.com", async () => {
        order.push("a2");
      }),
    ]);
    assert.deepEqual(order, ["a1-start", "a1-end", "a2"]);
  });

  it("allows different shops concurrently", async () => {
    const lock = createKeyedMutex();
    let concurrent = 0;
    let maxConcurrent = 0;
    await Promise.all([
      lock.withLock("a.myshopify.com", async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      }),
      lock.withLock("b.myshopify.com", async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      }),
    ]);
    assert.ok(maxConcurrent >= 2);
  });

  it("releases lock after failure", async () => {
    const lock = createKeyedMutex();
    await assert.rejects(() =>
      lock.withLock("a.myshopify.com", async () => {
        throw new Error("boom");
      }),
    );
    let ran = false;
    await lock.withLock("a.myshopify.com", async () => {
      ran = true;
    });
    assert.equal(ran, true);
  });

  it("postgres advisory lock uses injectable client and timeout path", async () => {
    const calls: string[] = [];
    const client = {
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        calls.push(sql);
        if (sql.includes("pg_advisory_lock") && values[0] === "timeout.myshopify.com") {
          throw new Error("canceling statement due to lock_timeout");
        }
        return undefined;
      },
    };
    const lock = createPostgresAdvisoryLock({
      getClient: () => client,
      localMutex: createKeyedMutex(),
      lockTimeoutMs: 1000,
    });

    await lock.withLock("ok.myshopify.com", async () => "done");
    assert.ok(calls.some((c) => c.includes("pg_advisory_lock")));
    assert.ok(calls.some((c) => c.includes("pg_advisory_unlock")));

    await assert.rejects(
      () => lock.withLock("timeout.myshopify.com", async () => "x"),
      /timed out/i,
    );
  });

  it("worker and request share mutex semantics via same abstraction", async () => {
    const lock = createKeyedMutex();
    const order: string[] = [];
    await Promise.all([
      lock.withLock("shop.myshopify.com", async () => {
        order.push("request");
        await new Promise((r) => setTimeout(r, 20));
      }),
      lock.withLock("shop.myshopify.com", async () => {
        order.push("worker");
      }),
    ]);
    assert.deepEqual(order, ["request", "worker"]);
  });
});
