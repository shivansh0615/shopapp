import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiagnosticCheck } from "./compatibility-diagnostics";
import {
  EMPTY_METRIC_CAPTION,
  EMPTY_METRIC_VALUE,
  buildOverviewHealth,
  diagnosticTone,
  formatConversionMetric,
  formatCountableMetric,
  formatRevenueMetric,
  giftConversionPercent,
  hasStorefrontPerformance,
  healthFocusItemId,
  incompleteLaunchSteps,
  isThemeEmbedReady,
  merchantHealthBlurb,
  overviewSecondaryAction,
  overviewStatusSentence,
  statusLabelForTone,
  summarizeOverviewHealth,
  withPublishedThemeEmbedStatus,
} from "./overview-metrics";

function check(
  id: string,
  status: DiagnosticCheck["status"],
  explanation = "ok",
): DiagnosticCheck {
  return {
    id,
    label: id,
    status,
    explanation,
    merchantAction: "Do something",
    technicalDetails: null,
  };
}

describe("hasStorefrontPerformance", () => {
  it("is false when every counter is zero", () => {
    assert.equal(
      hasStorefrontPerformance({
        giftsUnlocked: 0,
        giftsAdded: 0,
        influencedOrders: 0,
        revenueGenerated: 0,
      }),
      false,
    );
  });

  it("is true when any real event exists", () => {
    assert.equal(
      hasStorefrontPerformance({
        giftsUnlocked: 1,
        giftsAdded: 0,
        influencedOrders: 0,
        revenueGenerated: 0,
      }),
      true,
    );
  });
});

describe("formatCountableMetric", () => {
  it("returns an em dash without events", () => {
    assert.deepEqual(formatCountableMetric(0, false), {
      value: EMPTY_METRIC_VALUE,
      empty: true,
      caption: EMPTY_METRIC_CAPTION,
    });
  });

  it("returns the real count when events exist", () => {
    assert.deepEqual(formatCountableMetric(0, true), { value: "0", empty: false, caption: null });
    assert.deepEqual(formatCountableMetric(4, true), { value: "4", empty: false, caption: null });
  });
});

describe("formatRevenueMetric", () => {
  it("does not invent a currency amount without events", () => {
    assert.deepEqual(formatRevenueMetric(0, false, () => "$0.00"), {
      value: EMPTY_METRIC_VALUE,
      empty: true,
      caption: EMPTY_METRIC_CAPTION,
    });
  });

  it("formats revenue from real events", () => {
    assert.deepEqual(formatRevenueMetric(12.5, true, (n) => `$${n.toFixed(2)}`), {
      value: "$12.50",
      empty: false,
      caption: null,
    });
  });
});

describe("giftConversionPercent", () => {
  it("is null when there are no unlocks", () => {
    assert.equal(giftConversionPercent(0, 0), null);
    assert.equal(giftConversionPercent(0, 3), null);
  });

  it("rounds gifts added divided by gifts unlocked", () => {
    assert.equal(giftConversionPercent(10, 4), 40);
    assert.equal(giftConversionPercent(3, 1), 33);
    assert.equal(giftConversionPercent(8, 0), 0);
  });
});

describe("formatConversionMetric", () => {
  it("shows an em dash without unlocks", () => {
    assert.deepEqual(formatConversionMetric(0, 0), {
      value: EMPTY_METRIC_VALUE,
      empty: true,
      caption: EMPTY_METRIC_CAPTION,
    });
  });

  it("shows a percent when unlocks exist", () => {
    assert.deepEqual(formatConversionMetric(2, 1), { value: "50%", empty: false, caption: null });
  });
});

describe("diagnosticTone", () => {
  it("maps diagnostic statuses to overview tones", () => {
    assert.equal(diagnosticTone("pass"), "ready");
    assert.equal(diagnosticTone("warn"), "attention");
    assert.equal(diagnosticTone("fail"), "problem");
    assert.equal(diagnosticTone("unable_to_verify"), "unknown");
    assert.equal(diagnosticTone("info"), "unknown");
  });
});

describe("statusLabelForTone", () => {
  it("uses merchant-facing labels", () => {
    assert.equal(statusLabelForTone("ready"), "Ready");
    assert.equal(statusLabelForTone("attention"), "Needs attention");
    assert.equal(statusLabelForTone("problem"), "Action needed");
    assert.equal(statusLabelForTone("unknown"), "Not verified");
  });
});

describe("buildOverviewHealth", () => {
  it("selects the four overview checks and wires problem actions", () => {
    const items = buildOverviewHealth([
      check("campaign_readiness", "fail", "The active campaign is missing a gift variant."),
      check("discount_function_readiness", "pass"),
      check("app_proxy", "pass"),
      check("theme_app_embed", "unable_to_verify", "Unable to verify automatically."),
      check("storefront_communication", "warn", "No storefront widget-state contact recorded yet."),
      check("backend_health", "pass"),
    ]);

    assert.equal(items.length, 4);
    assert.deepEqual(
      items.map((item) => item.id),
      [
        "campaign_readiness",
        "discount_function_readiness",
        "app_proxy",
        "theme_app_embed",
      ],
    );
    assert.equal(items[0].actionTo, "/app/campaigns");
    assert.equal(items[0].actionLabel, "Fix campaign");
    assert.equal(items[1].actionTo, null);
    assert.equal(items[3].tone, "unknown");
    assert.equal(items[3].actionTo, "/app/widgets");
    assert.equal(items[3].actionLabel, "Complete setup");
    assert.equal(items[3].blurb, "Theme embed is not verified yet.");
  });

  it("sends merchants with no active campaign to create one", () => {
    const items = buildOverviewHealth([
      check("campaign_readiness", "warn", "There is no active campaign for this shop yet."),
      check("discount_function_readiness", "warn"),
      check("app_proxy", "pass"),
      check("theme_app_embed", "unable_to_verify"),
    ]);
    assert.equal(items[0].actionTo, "/app/campaigns/new");
    assert.equal(items[0].actionLabel, "Complete setup");
  });

  it("does not treat recent storefront contact as proof of embed activation", () => {
    const items = buildOverviewHealth([
      check("campaign_readiness", "pass"),
      check("discount_function_readiness", "pass"),
      check("app_proxy", "pass"),
      check("theme_app_embed", "unable_to_verify"),
      check("storefront_communication", "pass", "Recent storefront contact via widget-state."),
    ]);
    const theme = items.find((item) => item.id === "theme_app_embed");
    assert.equal(theme?.tone, "unknown");
    assert.match(theme?.detail ?? "", /does not establish activation/);
    assert.equal(theme?.actionTo, "/app/widgets");
    assert.equal(isThemeEmbedReady(items), false);
  });
});

describe("merchantHealthBlurb", () => {
  it("uses short merchant copy instead of implementation language", () => {
    assert.equal(
      merchantHealthBlurb("app_proxy", "ready", "Storefront proxy path is /apps/free-gift (backend /apps/proxy)."),
      "Storefront proxy is configured.",
    );
    assert.equal(
      merchantHealthBlurb(
        "discount_function_readiness",
        "ready",
        "Discount mapping and sync status look healthy (read-only check; no Admin mutations).",
      ),
      "Gift discounts can sync at checkout.",
    );
  });
});

describe("summarizeOverviewHealth", () => {
  it("picks the most serious tone and a single recommended action", () => {
    const summary = summarizeOverviewHealth(
      buildOverviewHealth([
        check("campaign_readiness", "warn", "There is no active campaign for this shop yet."),
        check("discount_function_readiness", "warn"),
        check("app_proxy", "pass"),
        check("theme_app_embed", "unable_to_verify"),
      ]),
    );
    assert.equal(summary.tone, "attention");
    assert.equal(summary.actionTo, "/app/campaigns/new");
    assert.equal(summary.actionLabel, "Complete setup");
    assert.match(summary.headline, /attention/i);
    assert.equal(healthFocusItemId(summary), "campaign_readiness");
  });

  it("reports ready only after Shopify verifies the published embed and all other checks pass", () => {
    const summary = withPublishedThemeEmbedStatus(summarizeOverviewHealth(
      buildOverviewHealth([
        check("campaign_readiness", "pass"),
        check("discount_function_readiness", "pass"),
        check("app_proxy", "pass"),
        check("theme_app_embed", "unable_to_verify"),
        check("storefront_communication", "pass"),
      ]),
    ), "active");
    assert.equal(summary.tone, "ready");
    assert.equal(summary.actionTo, null);
    assert.equal(healthFocusItemId(summary), null);
  });
});

describe("overviewStatusSentence", () => {
  it("describes an empty shop without welcome-back copy", () => {
    assert.equal(
      overviewStatusSentence({
        activeCampaigns: 0,
        totalCampaigns: 0,
        giftsClaimed: 0,
        hasEvents: false,
        healthTone: "attention",
      }),
      "No promotions yet. Create a free-gift campaign to start.",
    );
  });

  it("uses live campaign and gift counts when events exist", () => {
    assert.equal(
      overviewStatusSentence({
        activeCampaigns: 2,
        totalCampaigns: 2,
        giftsClaimed: 14,
        hasEvents: true,
        healthTone: "ready",
      }),
      "2 live campaigns. Shoppers have claimed 14 gifts.",
    );
  });

  it("mentions a needed fix when health is a problem", () => {
    assert.match(
      overviewStatusSentence({
        activeCampaigns: 1,
        totalCampaigns: 1,
        giftsClaimed: 0,
        hasEvents: false,
        healthTone: "problem",
      }),
      /needs a fix/,
    );
  });
});

describe("incompleteLaunchSteps", () => {
  it("lists only incomplete first-run steps", () => {
    const steps = incompleteLaunchSteps({
      totalCampaigns: 0,
      activeCampaigns: 0,
      themeReady: false,
      storePreviewHref: "https://example.myshopify.com",
    });
    assert.deepEqual(
      steps.map((step) => step.id),
      ["campaign", "embed", "storefront"],
    );
    assert.equal(steps[0].href, "/app/campaigns/new");
    assert.equal(steps[2].external, true);
  });

  it("hides completed campaign and embed steps", () => {
    const steps = incompleteLaunchSteps({
      totalCampaigns: 2,
      activeCampaigns: 1,
      themeReady: true,
      storePreviewHref: "https://example.myshopify.com",
    });
    assert.deepEqual(steps, []);
  });

  it("keeps theme steps when a campaign is already live", () => {
    const steps = incompleteLaunchSteps({
      totalCampaigns: 1,
      activeCampaigns: 1,
      themeReady: false,
      storePreviewHref: "https://example.myshopify.com",
    });
    assert.deepEqual(
      steps.map((step) => step.id),
      ["embed", "storefront"],
    );
  });
});

describe("overviewSecondaryAction", () => {
  it("offers Theme setup only when a campaign exists and embed is not ready", () => {
    assert.deepEqual(
      overviewSecondaryAction({ totalCampaigns: 1, themeReady: false }),
      { label: "Open Theme setup", to: "/app/widgets" },
    );
    assert.equal(overviewSecondaryAction({ totalCampaigns: 0, themeReady: false }), null);
    assert.equal(overviewSecondaryAction({ totalCampaigns: 1, themeReady: true }), null);
  });
});
