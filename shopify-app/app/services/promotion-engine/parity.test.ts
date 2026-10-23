/**
 * Phase 2D — Canonical Promotion Engine ↔ storefront buildLocalEvaluation parity.
 *
 * Verification only. Does not migrate or remove storefront logic.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  centsParityProbe,
  compareLocalWithCanonical,
  compareQualifyingSubtotals,
  type ParityCampaignConfig,
  type ParityCartItem,
  type ParityCompareResult,
} from "./parity-harness";

const GIFT_VARIANT = "54277124161902";
const PAID_VARIANT = "11111111111";
const THRESHOLD = 999;
const CAMPAIGN_ID = 8;

const ACTIVE: ParityCampaignConfig = {
  campaignId: CAMPAIGN_ID,
  threshold: THRESHOLD,
  giftVariantId: GIFT_VARIANT,
  status: "ACTIVE",
  campaignType: "Spend X -> Free Gift",
};

function giftProps(campaignId: number | string = CAMPAIGN_ID) {
  return {
    _fgpb_free_gift: "true",
    _fgpb_campaign_id: String(campaignId),
  };
}

function paid(amount: number, qty = 1): ParityCartItem {
  return {
    variantId: PAID_VARIANT,
    quantity: qty,
    price: amount,
    lineKey: `paid-${amount}`,
    properties: {},
  };
}

function taggedGift(qty = 1, campaignId: number | string = CAMPAIGN_ID): ParityCartItem {
  return {
    variantId: GIFT_VARIANT,
    quantity: qty,
    price: 100,
    lineKey: `gift-${qty}-${campaignId}`,
    properties: giftProps(campaignId),
  };
}

function paidSameSku(amount: number, qty = 1): ParityCartItem {
  return {
    variantId: GIFT_VARIANT,
    quantity: qty,
    price: amount,
    lineKey: `paid-sku-${amount}`,
    properties: {},
  };
}

function assertParity(label: string, result: ParityCompareResult) {
  if (!result.ok) {
    const detail = result.mismatches
      .map(
        (m) =>
          `${m.field}: storefront=${JSON.stringify(m.storefront)} canonical=${JSON.stringify(m.canonical)} [${m.responsibleCalculation}] → ${m.suggestedFix}`,
      )
      .join("\n  ");
    assert.fail(`${label} parity failed:\n  ${detail}`);
  }
}

describe("Phase 2D — qualifying subtotal equivalence", () => {
  it("empty cart", () => {
    const r = compareQualifyingSubtotals([]);
    assert.equal(r.ok, true);
    assert.equal(r.storefront, 0);
  });

  it("excludes tagged gift; includes paid same-SKU", () => {
    const r = compareQualifyingSubtotals([
      paid(600),
      paidSameSku(885.95),
      taggedGift(1),
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.storefront, 600 + 885.95);
  });

  it("mixed products match", () => {
    const r = compareQualifyingSubtotals([paid(400), paid(200, 2), taggedGift(1)]);
    assert.equal(r.ok, true);
    assert.equal(r.storefront, 800);
  });
});

describe("Phase 2D — cent-rounding divergence probe", () => {
  it("major-unit compare diverges from storefront cents at 99.995/100 (evaluator uses cents)", () => {
    const boundary = centsParityProbe(99.995, 100);
    assert.equal(boundary.storefrontEligible, true);
    assert.equal(boundary.majorUnitEligible, false);
    assert.equal(boundary.diverges, true);
  });
});

describe("Phase 2D — threshold parity", () => {
  it("empty cart", () => {
    assertParity("empty cart", compareLocalWithCanonical({ campaign: ACTIVE, items: [] }));
  });

  it("below threshold", () => {
    assertParity(
      "below threshold",
      compareLocalWithCanonical({ campaign: ACTIVE, items: [paid(500)] }),
    );
  });

  it("exactly at threshold", () => {
    assertParity(
      "exact threshold",
      compareLocalWithCanonical({ campaign: ACTIVE, items: [paid(THRESHOLD)] }),
    );
  });

  it("above threshold", () => {
    assertParity(
      "above threshold",
      compareLocalWithCanonical({ campaign: ACTIVE, items: [paid(2000)] }),
    );
  });

  it("decimal prices near boundary use storefront cent rules", () => {
    assertParity(
      "decimal 99.994 / 100",
      compareLocalWithCanonical({
        campaign: { ...ACTIVE, threshold: 100 },
        items: [paid(99.994)],
      }),
    );
    assertParity(
      "decimal 99.995 / 100",
      compareLocalWithCanonical({
        campaign: { ...ACTIVE, threshold: 100 },
        items: [paid(99.995)],
      }),
    );
  });
});

describe("Phase 2D — gift parity", () => {
  it("gift absent when eligible → ADD_GIFT", () => {
    assertParity(
      "gift absent",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(THRESHOLD)],
      }),
    );
  });

  it("gift already present when eligible → NONE", () => {
    assertParity(
      "gift present",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(THRESHOLD), taggedGift(1)],
      }),
    );
  });

  it("duplicate tagged gifts detected; sync action stays NONE when eligible", () => {
    assertParity(
      "duplicate gifts",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(THRESHOLD), taggedGift(1), taggedGift(1)],
      }),
    );
  });

  it("tagged quantity > 1 detected; sync action NONE when eligible", () => {
    assertParity(
      "qty > 1",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(THRESHOLD), taggedGift(3)],
      }),
    );
  });

  it("gift removed after threshold drop → REMOVE_GIFT", () => {
    assertParity(
      "threshold drop",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(400), taggedGift(1)],
      }),
    );
  });

  it("refresh: eligible + existing tagged gift → NONE", () => {
    assertParity(
      "refresh with gift",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(600), paid(500), taggedGift(1)],
      }),
    );
  });
});

describe("Phase 2D — same-SKU parity", () => {
  it("paid only same SKU counts toward threshold and is not a gift", () => {
    assertParity(
      "paid only",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paidSameSku(THRESHOLD)],
      }),
    );
  });

  it("gift only (tagged) does not qualify subtotal", () => {
    assertParity(
      "gift only",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [taggedGift(1)],
      }),
    );
  });

  it("paid + gift together", () => {
    assertParity(
      "paid + gift",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paidSameSku(600), paid(500), taggedGift(1)],
      }),
    );
  });
});

describe("Phase 2D — campaign state parity", () => {
  it("disabled campaign → not eligible / NONE", () => {
    // Storefront receives disabled widget-state (campaign not usable).
    assertParity(
      "disabled",
      compareLocalWithCanonical({
        campaign: {
          ...ACTIVE,
          status: "PAUSED",
          storefrontCampaignLoaded: false,
        },
        items: [paid(THRESHOLD)],
        // Progress fields differ when storefront is unloaded (0) vs canonical early-exit;
        // eligibility / sync / gift detection remain the contract that matters.
        ignoreFields: ["remaining", "progress", "percentage", "threshold"],
      }),
    );
  });

  it("scheduled not started → not eligible", () => {
    assertParity(
      "not started",
      compareLocalWithCanonical({
        campaign: {
          ...ACTIVE,
          startDate: new Date("2026-08-01T00:00:00Z"),
          storefrontCampaignLoaded: false,
        },
        items: [paid(THRESHOLD)],
        now: new Date("2026-07-15T00:00:00Z"),
        ignoreFields: ["remaining", "progress", "percentage", "threshold"],
      }),
    );
  });

  it("expired → not eligible", () => {
    assertParity(
      "expired",
      compareLocalWithCanonical({
        campaign: {
          ...ACTIVE,
          endDate: new Date("2026-07-01T00:00:00Z"),
          storefrontCampaignLoaded: false,
        },
        items: [paid(THRESHOLD)],
        now: new Date("2026-07-15T00:00:00Z"),
        ignoreFields: ["remaining", "progress", "percentage", "threshold"],
      }),
    );
  });

  it("unsupported campaign type → not eligible", () => {
    assertParity(
      "unsupported",
      compareLocalWithCanonical({
        campaign: {
          ...ACTIVE,
          campaignType: "Mystery Gift",
          storefrontCampaignLoaded: false,
        },
        items: [paid(THRESHOLD)],
        ignoreFields: ["remaining", "progress", "percentage", "threshold"],
      }),
    );
  });
});

describe("Phase 2D — mixed cart parity", () => {
  it("mixed products below / above threshold", () => {
    assertParity(
      "mixed below",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(300), paid(200, 2)],
      }),
    );
    assertParity(
      "mixed above with gift",
      compareLocalWithCanonical({
        campaign: ACTIVE,
        items: [paid(400), paid(350), paidSameSku(300), taggedGift(1)],
      }),
    );
  });
});
