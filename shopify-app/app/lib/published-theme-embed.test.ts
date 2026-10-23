import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadPublishedThemeEmbedStatus, withPublishedThemeEmbedCheck, type EmbedCheckState } from "./published-theme-embed";
import { buildOverviewHealth, summarizeOverviewHealth, withPublishedThemeEmbedStatus, isThemeEmbedReady } from "./overview-metrics";
import type { DiagnosticCheck } from "./compatibility-diagnostics";
import { aggregateOverallState } from "./compatibility-diagnostics";
import type { ThemeExtensionRecord } from "./theme-embed-deeplink";

function check(id: string, status: DiagnosticCheck["status"]): DiagnosticCheck {
  return { id, label: id, status, explanation: "Check result", merchantAction: null, technicalDetails: null };
}
function baseHealth() {
  return summarizeOverviewHealth(buildOverviewHealth([
    check("campaign_readiness", "pass"), check("discount_function_readiness", "pass"),
    check("app_proxy", "pass"), check("theme_app_embed", "unable_to_verify"),
    check("storefront_communication", "pass"),
  ]));
}
function response(status: string): ThemeExtensionRecord[] {
  return [{ type: "theme_app_extension", activations: [{ handle: "free-gift-embed", status }] }];
}

describe("read-only published-theme checks", () => {
  for (const status of ["active", "available", "unavailable"] as const) {
    it(`reads Shopify's ${status} state`, async () => {
      assert.equal(await loadPublishedThemeEmbedStatus({ app: { extensions: async () => response(status) } }), status);
    });
  }
  it("reports missing only for a valid response without the intended embed", async () => {
    assert.equal(await loadPublishedThemeEmbedStatus({ app: { extensions: async () => [] } }), "missing");
    assert.equal(await loadPublishedThemeEmbedStatus({ app: { extensions: async () => [{ type: "ui_extension", activations: [{ handle: "free-gift-embed", status: "active" }] }] } }), "missing");
  });
  it("does not guess when App Bridge is unavailable", async () => {
    await assert.rejects(loadPublishedThemeEmbedStatus(undefined), /unavailable/);
  });
  it("propagates a failed Shopify check", async () => {
    await assert.rejects(loadPublishedThemeEmbedStatus({ app: { extensions: async () => { throw new Error("Offline"); } } }), /Offline/);
  });
  for (const invalid of [null, {}, [null], [{ type: "theme_app_extension" }], response("unsupported")]) {
    it(`rejects an unreadable response ${JSON.stringify(invalid)}`, async () => {
      await assert.rejects(loadPublishedThemeEmbedStatus({ app: { extensions: async () => invalid as ThemeExtensionRecord[] } }));
    });
  }
  it("times out instead of leaving readiness stuck checking", async () => {
    await assert.rejects(loadPublishedThemeEmbedStatus({ app: { extensions: () => new Promise(() => {}) } }, 5), /timed out/);
  });
  it("reads fresh evidence on the next check after disabling the embed", async () => {
    let calls = 0;
    const api = { app: { extensions: async () => response(++calls === 1 ? "active" : "available") } };
    assert.equal(await loadPublishedThemeEmbedStatus(api), "active");
    assert.equal(await loadPublishedThemeEmbedStatus(api), "available");
  });
});

describe("overview readiness from current embed evidence", () => {
  it("does not mark recent storefront activity as enabled", () => {
    assert.equal(isThemeEmbedReady(baseHealth().items), false);
    assert.equal(baseHealth().tone, "unknown");
  });
  it("marks enabled only when Shopify reports active", () => {
    const health = withPublishedThemeEmbedStatus(baseHealth(), "active");
    assert.equal(isThemeEmbedReady(health.items), true);
    assert.equal(health.tone, "ready");
    assert.match(health.items.find((item) => item.id === "theme_app_embed")?.blurb ?? "", /published theme/);
  });
  for (const status of ["available", "unavailable", "missing", "unknown", "checking", "error"] as EmbedCheckState[]) {
    it(`does not report ready for ${status}, even after an earlier active check`, () => {
      const enabled = withPublishedThemeEmbedStatus(baseHealth(), "active");
      const health = withPublishedThemeEmbedStatus(enabled, status);
      assert.equal(isThemeEmbedReady(health.items), false);
      assert.notEqual(health.tone, "ready");
      assert.equal(health.items.filter((item) => item.id === "theme_app_embed").length, 1);
    });
  }
  it("keeps other failures visible when the embed is active", () => {
    const health = baseHealth();
    health.items[0] = { ...health.items[0], tone: "problem" };
    assert.equal(withPublishedThemeEmbedStatus(health, "active").tone, "problem");
  });
});

describe("diagnostics readiness", () => {
  for (const [state, expected] of [
    ["active", "READY"], ["available", "ACTION_REQUIRED"],
    ["missing", "ACTION_REQUIRED"], ["unavailable", "ACTION_REQUIRED"],
    ["error", "UNABLE_TO_VERIFY"], ["unknown", "UNABLE_TO_VERIFY"],
    ["checking", "UNABLE_TO_VERIFY"],
  ] as const) {
    it(`reports ${expected} for ${state} without relying on storefront contact`, () => {
      const checks = withPublishedThemeEmbedCheck([
        check("backend_health", "pass"), check("storefront_communication", "pass"),
        check("theme_app_embed", "unable_to_verify"),
      ], state);
      assert.equal(aggregateOverallState(checks).overall, expected);
      assert.equal(checks.filter((entry) => entry.id === "theme_app_embed").length, 1);
    });
  }
});
