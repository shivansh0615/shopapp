import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isForbiddenProductionHostname,
  validateProductionToml,
} from "./validate-production-toml.mjs";

const validToml = `
client_id = "38f760e2b4436ea157c262ac18f1970b"
name = "Free Gift Progress Bar"
application_url = "https://fgpb.myexample.com"
embedded = true

[webhooks]
api_version = "2025-10"

  [[webhooks.subscriptions]]
  uri = "/webhooks/app/uninstalled"
  topics = [ "app/uninstalled" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/app/scopes_update"
  topics = [ "app/scopes_update" ]

  [[webhooks.subscriptions]]
  uri = "/webhooks/compliance"
  compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]

[auth]
redirect_urls = [ "https://fgpb.myexample.com/auth/callback" ]

[app_proxy]
url = "https://fgpb.myexample.com/apps/proxy"
subpath = "free-gift"
prefix = "apps"
`;

describe("isForbiddenProductionHostname (toml)", () => {
  it("rejects example.com / localhost but allows myexample.com", () => {
    assert.equal(isForbiddenProductionHostname("example.com"), true);
    assert.equal(isForbiddenProductionHostname("app.example.com"), true);
    assert.equal(isForbiddenProductionHostname("localhost"), true);
    assert.equal(isForbiddenProductionHostname("myexample.com"), false);
  });
});

describe("validateProductionToml", () => {
  it("accepts a consistent production-ready toml", () => {
    assert.deepEqual(validateProductionToml(validToml), []);
  });

  it("rejects example.com placeholders", () => {
    const errors = validateProductionToml(
      validToml
        .replaceAll("https://fgpb.myexample.com", "https://example.com"),
    );
    assert.ok(errors.some((e) => e.includes("application_url")));
    assert.ok(errors.some((e) => e.includes("auth.redirect_urls")));
    assert.ok(errors.some((e) => e.includes("app_proxy.url")));
  });

  it("rejects /api/auth OAuth path mismatch", () => {
    const errors = validateProductionToml(
      validToml.replace(
        "https://fgpb.myexample.com/auth/callback",
        "https://fgpb.myexample.com/api/auth",
      ),
    );
    assert.ok(errors.some((e) => e.includes("/api/auth")));
  });

  it("rejects missing compliance topics", () => {
    const errors = validateProductionToml(
      validToml.replace(' "shop/redact"', ""),
    );
    assert.ok(errors.some((e) => e.includes('shop/redact')));
  });

  it("rejects wrong app proxy backend path", () => {
    const errors = validateProductionToml(
      validToml.replace("/apps/proxy", "/apps/free-gift"),
    );
    assert.ok(errors.some((e) => e.includes("/apps/proxy")));
  });

  it("rejects localhost production URLs", () => {
    const errors = validateProductionToml(
      validToml.replaceAll(
        "https://fgpb.myexample.com",
        "https://localhost:3000",
      ),
    );
    assert.ok(errors.some((e) => e.includes("forbidden production host")));
  });

  it("rejects invalid URLs", () => {
    const errors = validateProductionToml(
      validToml.replace(
        'application_url = "https://fgpb.myexample.com"',
        'application_url = "not-a-url"',
      ),
    );
    assert.ok(errors.some((e) => e.includes("not a valid https URL")));
  });
});
