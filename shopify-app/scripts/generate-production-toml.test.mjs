import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyProductionUrlsToToml,
  assertTomlMatchesAppUrl,
  buildProductionUrlSet,
  normalizeOrigin,
} from "./generate-production-toml.mjs";

const TEMPLATE = `# test
application_url = "https://example.com"
embedded = true

[auth]
redirect_urls = [ "https://example.com/auth/callback" ]

[app_proxy]
url = "https://example.com/apps/proxy"
subpath = "free-gift"
prefix = "apps"

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
`;

describe("generate-production-toml", () => {
  it("rejects placeholder and localhost origins", () => {
    assert.equal(normalizeOrigin("https://example.com"), null);
    assert.equal(normalizeOrigin("https://localhost:3000"), null);
    assert.throws(() => buildProductionUrlSet("https://example.com"));
  });

  it("builds matching application / auth / proxy URLs", () => {
    const urls = buildProductionUrlSet("https://fgpb.myexample.com/");
    assert.equal(urls.applicationUrl, "https://fgpb.myexample.com");
    assert.equal(urls.redirectUrl, "https://fgpb.myexample.com/auth/callback");
    assert.equal(urls.appProxyUrl, "https://fgpb.myexample.com/apps/proxy");
  });

  it("rewrites template placeholders without guessing hosts", () => {
    const { toml, urls } = applyProductionUrlsToToml(
      TEMPLATE,
      "https://staging.myexample.com",
    );
    assert.match(toml, /application_url = "https:\/\/staging\.myexample\.com"/);
    assert.match(
      toml,
      /redirect_urls = \[ "https:\/\/staging\.myexample\.com\/auth\/callback" \]/,
    );
    assert.match(
      toml,
      /url = "https:\/\/staging\.myexample\.com\/apps\/proxy"/,
    );
    assert.equal(urls.origin, "https://staging.myexample.com");
  });

  it("detects mismatch between TOML and SHOPIFY_APP_URL", () => {
    const { toml } = applyProductionUrlsToToml(
      TEMPLATE,
      "https://a.myexample.com",
    );
    const errors = assertTomlMatchesAppUrl(toml, "https://b.myexample.com");
    assert.ok(errors.some((e) => /does not match SHOPIFY_APP_URL/i.test(e)));
  });

  it("accepts matching generated TOML", () => {
    const { toml } = applyProductionUrlsToToml(
      TEMPLATE,
      "https://fgpb.myexample.com",
    );
    assert.deepEqual(assertTomlMatchesAppUrl(toml, "https://fgpb.myexample.com"), []);
  });
});
