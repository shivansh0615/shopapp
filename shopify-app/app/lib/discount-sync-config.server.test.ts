import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISCOUNT_SYNC_DEFAULTS,
  loadDiscountSyncConfig,
} from "./discount-sync-config.server";

describe("discount sync config", () => {
  it("uses documented defaults", () => {
    const cfg = loadDiscountSyncConfig({});
    assert.equal(cfg.batchSize, DISCOUNT_SYNC_DEFAULTS.batchSize);
    assert.equal(cfg.maxAttempts, DISCOUNT_SYNC_DEFAULTS.maxAttempts);
    assert.equal(cfg.leaseMs, DISCOUNT_SYNC_DEFAULTS.leaseMs);
    assert.equal(cfg.disabled, false);
  });

  it("bounds invalid and extreme env values", () => {
    const cfg = loadDiscountSyncConfig({
      DISCOUNT_SYNC_BATCH: "9999",
      DISCOUNT_SYNC_MAX_ATTEMPTS: "0",
      DISCOUNT_SYNC_POLL_MS: "not-a-number",
      DISCOUNT_SYNC_WORKER_DISABLED: "true",
    });
    assert.equal(cfg.batchSize, 50);
    assert.equal(cfg.maxAttempts, 1);
    assert.equal(cfg.pollIntervalMs, DISCOUNT_SYNC_DEFAULTS.pollIntervalMs);
    assert.equal(cfg.disabled, true);
  });
});
