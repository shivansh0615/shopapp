import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectActiveCampaign } from "./campaign-selection";

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

describe("Phase 2B — campaign selection policy", () => {
  const now = new Date("2026-07-15T00:00:00Z");

  it("selects first ACTIVE scheduled campaign by priority DESC then createdAt DESC", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, priority: 1, createdAt: new Date("2026-06-01T00:00:00Z") }),
        campaign({ id: 2, priority: 5, createdAt: new Date("2026-05-01T00:00:00Z") }),
        campaign({ id: 3, priority: 5, createdAt: new Date("2026-07-01T00:00:00Z") }),
      ],
      { now },
    );
    assert.equal(result.campaign?.id, 3);
  });

  it("excludes PAUSED / disabled campaigns", () => {
    const result = selectActiveCampaign(
      [campaign({ id: 1, status: "PAUSED", priority: 99 })],
      { now },
    );
    assert.equal(result.campaign, null);
    assert.equal(result.diagnostic.code, "NO_ACTIVE_CAMPAIGN");
  });

  it("excludes not-started and expired campaigns", () => {
    const notStarted = selectActiveCampaign(
      [
        campaign({
          id: 1,
          startDate: new Date("2026-08-01T00:00:00Z"),
        }),
      ],
      { now },
    );
    assert.equal(notStarted.campaign, null);

    const expired = selectActiveCampaign(
      [
        campaign({
          id: 2,
          endDate: new Date("2026-07-01T00:00:00Z"),
        }),
      ],
      { now },
    );
    assert.equal(expired.campaign, null);
  });

  it("supportedTypesOnly excludes unsupported types without inventing stacking", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      { now, supportedTypesOnly: true },
    );
    assert.equal(result.campaign?.id, 2);
    assert.equal(result.candidates.length, 1);
  });

  it("without supportedTypesOnly preserves current multi-type first-match behavior", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      { now },
    );
    assert.equal(result.campaign?.id, 1);
    assert.equal(result.meta.unsupportedSkipped.length, 0);
  });
});

describe("PR-1 — App Proxy supportedTypesOnly selection scenarios", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const opts = { now, supportedTypesOnly: true as const };

  it("1. only Free Gift → Free Gift selected", () => {
    const result = selectActiveCampaign(
      [campaign({ id: 8, campaignType: FREE_GIFT, priority: 0 })],
      opts,
    );
    assert.equal(result.campaign?.id, 8);
    assert.equal(result.campaign?.campaignType, FREE_GIFT);
    assert.equal(result.meta.candidateCount, 1);
    assert.equal(result.meta.supportedCount, 1);
    assert.equal(result.meta.unsupportedSkipped.length, 0);
  });

  it("2. two Free Gifts → highest priority selected", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: FREE_GIFT, priority: 1 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 5 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
  });

  it("3. Mystery Gift priority 10 + Free Gift priority 1 → Free Gift selected", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
    assert.equal(result.meta.unsupportedSkipped.length, 1);
    assert.equal(result.meta.unsupportedSkipped[0]?.campaignType, MYSTERY);
    assert.equal(result.meta.selectionReason, "SUPPORTED_TYPES_ONLY_HIGHEST_PRIORITY");
  });

  it("4. only unsupported campaign → no selection (disabled path)", () => {
    const result = selectActiveCampaign(
      [campaign({ id: 9, campaignType: MYSTERY, priority: 10 })],
      opts,
    );
    assert.equal(result.campaign, null);
    assert.equal(result.diagnostic.code, "UNSUPPORTED_CAMPAIGN_TYPE");
    assert.equal(result.meta.supportedCount, 0);
    assert.equal(result.meta.unsupportedSkipped.length, 1);
  });

  it("5. unsupported lower priority + Free Gift higher priority → Free Gift selected", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 1 }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 10 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
  });

  it("6. inactive unsupported + active Free Gift → Free Gift selected", () => {
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 99, status: "PAUSED" }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
    assert.equal(result.meta.unsupportedSkipped.length, 0);
  });

  it("7. future scheduled unsupported + current Free Gift → Free Gift selected", () => {
    const result = selectActiveCampaign(
      [
        campaign({
          id: 1,
          campaignType: MYSTERY,
          priority: 99,
          startDate: new Date("2026-08-01T00:00:00Z"),
        }),
        campaign({ id: 2, campaignType: FREE_GIFT, priority: 1 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
    assert.equal(result.meta.candidateCount, 1);
  });

  it("8. Percentage Discount is selectable under supportedTypesOnly", () => {
    const PCT = "Spend X -> Percentage Discount";
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: MYSTERY, priority: 10 }),
        campaign({ id: 2, campaignType: PCT, priority: 1 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
    assert.equal(result.campaign?.campaignType, PCT);
  });

  it("9. Free Gift + Percentage → highest priority wins (no stacking)", () => {
    const PCT = "Spend X -> Percentage Discount";
    const result = selectActiveCampaign(
      [
        campaign({ id: 1, campaignType: FREE_GIFT, priority: 1 }),
        campaign({ id: 2, campaignType: PCT, priority: 5 }),
      ],
      opts,
    );
    assert.equal(result.campaign?.id, 2);
  });
});
