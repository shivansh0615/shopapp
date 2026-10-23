import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AppError,
  classifySyncError,
  isRetryableError,
  sanitizeLogDetails,
  serializeErrorForLog,
} from "./errors.server";

describe("AppError / operational logging", () => {
  it("classifies retryable vs permanent", () => {
    const permanent = new AppError({
      code: "NOT_FOUND",
      message: "missing",
      errorClass: "permanent",
    });
    const retryable = new AppError({
      code: "UPSTREAM_TIMEOUT",
      message: "timeout",
      errorClass: "retryable",
    });
    assert.equal(isRetryableError(permanent), false);
    assert.equal(isRetryableError(retryable), true);
    assert.equal(isRetryableError(new Error("ECONNRESET")), true);
  });

  it("classifies structured HTTP statuses", () => {
    assert.equal(isRetryableError({ status: 429, message: "slow down" }), true);
    assert.equal(isRetryableError({ status: 503, message: "upstream" }), true);
    assert.equal(isRetryableError({ status: 401, message: "revoked" }), false);
    assert.equal(isRetryableError({ status: 403, message: "forbidden" }), false);
  });

  it("classifies permanent auth and config messages", () => {
    assert.equal(isRetryableError(new Error("Unauthorized")), false);
    assert.equal(isRetryableError(new Error("invalid scope")), false);
    assert.equal(isRetryableError(new Error("throttled by Shopify")), true);
    assert.equal(isRetryableError(new Error("Shop discount sync lock timed out")), true);
  });

  it("classifySyncError wraps structured statuses", () => {
    const limited = classifySyncError({ status: 429, message: "rate" });
    assert.equal(limited.code, "RATE_LIMITED");
    assert.equal(limited.errorClass, "retryable");
    const forbidden = classifySyncError({ status: 403, message: "nope" });
    assert.equal(forbidden.code, "FORBIDDEN");
    assert.equal(forbidden.errorClass, "permanent");
  });

  it("unknown non-Error values are not retryable forever", () => {
    assert.equal(isRetryableError({ weird: true }), false);
  });

  it("redacts secrets from log details", () => {
    const sanitized = sanitizeLogDetails({
      shop: "a.myshopify.com",
      token: "shpat_should_not_leak",
      DATABASE_URL: "postgresql://user:pass@host/db",
      campaignId: 9,
    });
    assert.equal(sanitized?.shop, "a.myshopify.com");
    assert.equal(sanitized?.token, "[redacted]");
    assert.equal(sanitized?.DATABASE_URL, "[redacted]");
    assert.equal(sanitized?.campaignId, 9);
  });

  it("serializes AppError without stack traces", () => {
    const serialized = serializeErrorForLog(
      new AppError({
        code: "DISCOUNT_SYNC_FAILED",
        message: "Shopify update failed",
        errorClass: "retryable",
        details: { shop: "a.myshopify.com", api_key: "secret" },
      }),
    );
    assert.equal(serialized.code, "DISCOUNT_SYNC_FAILED");
    assert.equal(serialized.errorClass, "retryable");
    assert.equal(serialized.details?.api_key, "[redacted]");
    assert.equal("stack" in serialized, false);
  });
});
