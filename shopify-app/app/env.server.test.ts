import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductionEnv,
  isForbiddenProductionHostname,
  isInvalidProductionAppUrl,
  isInvalidProductionPort,
  normalizeAppOrigin,
} from "./env.server";

describe("isForbiddenProductionHostname", () => {
  it("rejects example.com and subdomains only", () => {
    assert.equal(isForbiddenProductionHostname("example.com"), true);
    assert.equal(isForbiddenProductionHostname("app.example.com"), true);
    assert.equal(isForbiddenProductionHostname("www.example.com"), true);
  });

  it("allows legitimate domains that merely contain the letters example", () => {
    assert.equal(isForbiddenProductionHostname("myexample.com"), false);
    assert.equal(isForbiddenProductionHostname("example-company.com"), false);
    assert.equal(isForbiddenProductionHostname("app.example-real.internal"), false);
  });

  it("rejects localhost loopbacks", () => {
    assert.equal(isForbiddenProductionHostname("localhost"), true);
    assert.equal(isForbiddenProductionHostname("127.0.0.1"), true);
    assert.equal(isForbiddenProductionHostname("[::1]"), true);
  });
});

describe("isInvalidProductionAppUrl", () => {
  it("rejects empty, invalid, and non-https URLs", () => {
    assert.equal(isInvalidProductionAppUrl(""), true);
    assert.equal(isInvalidProductionAppUrl("not-a-url"), true);
    assert.equal(isInvalidProductionAppUrl("http://app.real-host.internal"), true);
    assert.equal(isInvalidProductionAppUrl("https://example.com"), true);
    assert.equal(isInvalidProductionAppUrl("https://localhost"), true);
  });

  it("accepts https URLs on non-placeholder hosts", () => {
    assert.equal(isInvalidProductionAppUrl("https://myexample.com"), false);
    assert.equal(isInvalidProductionAppUrl("https://example-company.com"), false);
    assert.equal(isInvalidProductionAppUrl("https://fgpb.example-real.internal"), false);
  });
});

describe("normalizeAppOrigin / PORT", () => {
  it("strips trailing slashes from origins", () => {
    assert.equal(
      normalizeAppOrigin("https://fgpb.myexample.com/"),
      "https://fgpb.myexample.com",
    );
  });

  it("validates PORT bounds", () => {
    assert.equal(isInvalidProductionPort(undefined), false);
    assert.equal(isInvalidProductionPort("3000"), false);
    assert.equal(isInvalidProductionPort("0"), true);
    assert.equal(isInvalidProductionPort("65536"), true);
    assert.equal(isInvalidProductionPort("abc"), true);
  });
});

describe("assertProductionEnv", () => {
  it("is a no-op outside production", () => {
    const result = assertProductionEnv({
      NODE_ENV: "development",
      SHOPIFY_APP_URL: "https://example.com",
    } as NodeJS.ProcessEnv);
    assert.equal(result, null);
  });

  it("fails clearly when required production vars are missing", () => {
    assert.throws(
      () =>
        assertProductionEnv({
          NODE_ENV: "production",
          SHOPIFY_API_KEY: "key",
        } as NodeJS.ProcessEnv),
      /missing required environment variable/,
    );
  });

  it("rejects example.com placeholders in production", () => {
    assert.throws(
      () =>
        assertProductionEnv({
          NODE_ENV: "production",
          SHOPIFY_API_KEY: "key",
          SHOPIFY_API_SECRET: "secret",
          SHOPIFY_APP_URL: "https://example.com",
          SCOPES: "write_products",
          DATABASE_URL: "postgresql://fgpb:fgpb@localhost:5432/fgpb",
        } as NodeJS.ProcessEnv),
      /non-placeholder host/,
    );
  });

  it("rejects localhost app URLs in production", () => {
    assert.throws(
      () =>
        assertProductionEnv({
          NODE_ENV: "production",
          SHOPIFY_API_KEY: "key",
          SHOPIFY_API_SECRET: "secret",
          SHOPIFY_APP_URL: "https://localhost:3000",
          SCOPES: "write_products",
          DATABASE_URL: "postgresql://fgpb:fgpb@localhost:5432/fgpb",
        } as NodeJS.ProcessEnv),
      /non-placeholder host/,
    );
  });

  it("does not reject myexample.com or example-company.com", () => {
    for (const url of ["https://myexample.com", "https://example-company.com"]) {
      const result = assertProductionEnv({
        NODE_ENV: "production",
        SHOPIFY_API_KEY: "key",
        SHOPIFY_API_SECRET: "secret",
        SHOPIFY_APP_URL: url,
        SCOPES: "write_products",
        DATABASE_URL: "postgresql://fgpb:fgpb@db.internal:5432/fgpb",
      } as NodeJS.ProcessEnv);
      assert.equal(result?.SHOPIFY_APP_URL, url);
    }
  });

  it("rejects sqlite file URLs in production", () => {
    assert.throws(
      () =>
        assertProductionEnv({
          NODE_ENV: "production",
          SHOPIFY_API_KEY: "key",
          SHOPIFY_API_SECRET: "secret",
          SHOPIFY_APP_URL: "https://app.example-real.internal",
          SCOPES: "write_products",
          DATABASE_URL: "file:./dev.sqlite",
        } as NodeJS.ProcessEnv),
      /must point at PostgreSQL/,
    );
  });

  it("rejects invalid PORT in production", () => {
    assert.throws(
      () =>
        assertProductionEnv({
          NODE_ENV: "production",
          PORT: "99999",
          SHOPIFY_API_KEY: "key",
          SHOPIFY_API_SECRET: "secret",
          SHOPIFY_APP_URL: "https://fgpb.example-real.internal",
          SCOPES: "write_products",
          DATABASE_URL: "postgresql://fgpb:fgpb@db.internal:5432/fgpb",
        } as NodeJS.ProcessEnv),
      /PORT/,
    );
  });

  it("accepts a complete production env", () => {
    const result = assertProductionEnv({
      NODE_ENV: "production",
      PORT: "8080",
      SHOPIFY_API_KEY: "key",
      SHOPIFY_API_SECRET: "secret",
      SHOPIFY_APP_URL: "https://fgpb.example-real.internal/",
      SCOPES: "write_products",
      DATABASE_URL: "postgresql://fgpb:fgpb@db.internal:5432/fgpb",
    } as NodeJS.ProcessEnv);
    assert.equal(result?.SHOPIFY_APP_URL, "https://fgpb.example-real.internal");
    assert.equal(result?.PORT, "8080");
    assert.ok(result?.worker);
  });
});
