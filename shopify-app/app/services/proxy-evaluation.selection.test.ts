/**
 * PR-1 — Canonical App Proxy selection uses supportedTypesOnly: true.
 * Tests the proxy wrapper without DB / App Proxy auth.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectActiveCampaign } from "./promotion-engine/campaign-selection";
import { readCallerSubtotal, selectCampaignForProxyEvaluation, toPresentmentSnapshot } from "./proxy-evaluation.server";
import { proxyDisabledPayload } from "../lib/proxy-route.server";
import type { PromotionCampaignSnapshot } from "./promotion-engine.server";

it("preserves major units across large cart boundaries", () => {
  for (const amount of [99999, 100000, 100001, 100000.5, 5000000]) {
    assert.equal(readCallerSubtotal(new Request(`https://example.com/?cartSubtotal=${amount}`)), amount);
  }
});

function campaign(input: {
  id: number;
  status?: string;
  campaignType?: string;
  priority?: number;
  createdAt?: Date;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  return {
    id: input.id,
    status: input.status ?? "ACTIVE",
    campaignType: input.campaignType ?? "Spend X -> Free Gift",
    priority: input.priority ?? 0,
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
  };
}

const FREE_GIFT = "Spend X -> Free Gift";
const MYSTERY = "Mystery Gift";
const now = new Date("2026-07-15T00:00:00Z");

describe("PR-1 — selectCampaignForProxyEvaluation", () => {
  it("enables supportedTypesOnly (Mystery P10 does not shadow Free Gift P1)", () => {
    const { selection, diagnostics } = selectCampaignForProxyEvaluation(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      { now, shop: "demo.myshopify.com" },
    );

    assert.equal(selection.campaign?.id, 2);
    assert.equal(diagnostics.selectedCampaignId, 2);
    assert.equal(diagnostics.selectedCampaignType, FREE_GIFT);
    assert.equal(diagnostics.candidateCount, 2);
    assert.equal(diagnostics.supportedCount, 1);
    assert.equal(diagnostics.unsupportedSkipped.length, 1);
    assert.equal(diagnostics.unsupportedSkipped[0]?.campaignType, MYSTERY);
    assert.equal(diagnostics.selectionReason, "SUPPORTED_TYPES_ONLY_HIGHEST_PRIORITY");
  });

  it("only unsupported → no campaign (adapters return disabled)", () => {
    const { selection, diagnostics } = selectCampaignForProxyEvaluation(
      [campaign({ id: 9, campaignType: MYSTERY, priority: 10 })],
      { now },
    );
    assert.equal(selection.campaign, null);
    assert.equal(diagnostics.selectedCampaignId, null);
    assert.equal(diagnostics.selectionReason, "UNSUPPORTED_CAMPAIGN_TYPE");

    const disabled = proxyDisabledPayload("widget-state");
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.campaignId, null);
  });

  it("does not change selectActiveCampaign default (unsupported still wins without flag)", () => {
    const legacy = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      { now },
    );
    assert.equal(legacy.campaign?.id, 1);

    const proxy = selectCampaignForProxyEvaluation(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      { now },
    );
    assert.equal(proxy.selection.campaign?.id, 2);
  });

  it("diagnostics are internal-shaped and not part of disabled payload keys", () => {
    const { diagnostics } = selectCampaignForProxyEvaluation(
      [campaign({ id: 8, campaignType: FREE_GIFT })],
      { now },
    );
    const disabled = proxyDisabledPayload("evaluate-cart") as Record<string, unknown>;
    assert.equal("selectionDiagnostics" in disabled, false);
    assert.equal("unsupportedSkipped" in disabled, false);
    assert.ok(typeof diagnostics.selectionReason === "string");
  });
});

describe("presentment-currency campaign money", () => {
  const snapshot = {
    id: 1,
    name: "Free gift",
    campaignType: FREE_GIFT,
    threshold: 500,
    currencyCode: "INR",
    fixedDiscountAmount: 100,
    rewardTiers: [{ id: "t1", threshold: 1000 }],
  } as unknown as PromotionCampaignSnapshot;

  it("converts every campaign amount when the cart uses another currency", () => {
    const converted = toPresentmentSnapshot(snapshot, "USD", 0.012);
    assert.equal(converted.currencyCode, "USD");
    assert.equal(converted.threshold, 6);
    assert.equal(converted.fixedDiscountAmount, 1.2);
    assert.equal(converted.rewardTiers?.[0]?.threshold, 12);
  });

  it("does not apply a rate when currencies already match", () => {
    assert.equal(toPresentmentSnapshot(snapshot, "INR", 0.012), snapshot);
  });
});
