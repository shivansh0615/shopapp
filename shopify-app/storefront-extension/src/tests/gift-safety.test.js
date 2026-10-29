/**
 * Build 138 safety invariant: every remaining tagged gift is fully free for its
 * full quantity; everything else is normalized or removed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTION,
  EVIDENCE,
  VIOLATION,
  attributeAllocation,
  auditCart,
  canRenderFree,
  createGiftSafetyReconciler,
  discountEvidence,
  qualifyingCentsOf,
  validateGiftAddition,
} from "../utils/gift-safety.js";

const GIFT_VARIANT = "50822170509559";
const OTHER_VARIANT = "50822170312951";
const CAMPAIGN = "9";

const CONFIG = {
  schemaVersion: 1,
  shopDomain: "algorithmtrix-development.myshopify.com",
  activeCampaigns: [
    {
      campaignId: CAMPAIGN,
      rewardType: "FREE_GIFT",
      threshold: { amount: "2999.00", currencyCode: "INR" },
      giftVariantIds: [GIFT_VARIANT],
      maxGiftQuantity: 1,
    },
  ],
};

const TIERED_CONFIG = {
  schemaVersion: 1,
  shopDomain: "s.myshopify.com",
  activeCampaigns: [
    {
      campaignId: CAMPAIGN,
      rewardType: "TIERED_FREE_GIFTS",
      tiers: [
        { tierId: "t1", threshold: { amount: "1000.00" }, giftVariantId: GIFT_VARIANT },
      ],
    },
  ],
};

function paid(key, cents, variantId = "111", qty = 1) {
  return {
    key,
    variant_id: variantId,
    quantity: qty,
    original_line_price: cents,
    line_price: cents,
    final_line_price: cents,
    line_level_discount_allocations: [],
    properties: {},
  };
}

/**
 * A tagged gift line. `discounted` controls the authoritative evidence, which
 * is deliberately independent of the tag.
 */
function gift({
  key = "g1",
  variantId = GIFT_VARIANT,
  campaignId = CAMPAIGN,
  tierId = null,
  qty = 1,
  unitCents = 50000,
  discounted = "full",
  // Default to a correctly attributed allocation; tests opt into the failing
  // shapes explicitly, since attribution now fails closed.
  source = "ours",
} = {}) {
  const original = unitCents * qty;
  const app =
    source === "ours"
      ? { discount_application: { type: "automatic", title: "Free Gift Progress Bar — Campaign Rewards" } }
      : source === "function-message"
        ? { discount_application: { title: "FREE GIFT" } }
        : source === "foreign"
          ? { discount_application: { type: "discount_code", title: "SUMMER50" } }
          : {};
  let final = original;
  let allocations = [];
  if (discounted === "full") {
    final = 0;
    allocations = [{ amount: original, ...app }];
  } else if (discounted === "partial") {
    final = unitCents * Math.max(0, qty - 1);
    allocations = [{ amount: original - final, ...app }];
  } else if (discounted === "zero-allocation") {
    final = original;
    allocations = [{ amount: 0, ...app }];
  }
  const properties = { _fgpb_free_gift: "true", _is_free_gift: "true" };
  if (campaignId !== null) properties._fgpb_campaign_id = campaignId;
  if (tierId) properties._fgpb_tier_id = tierId;
  return {
    key,
    variant_id: variantId,
    quantity: qty,
    price: unitCents,
    original_price: unitCents,
    final_price: qty ? Math.round(final / qty) : 0,
    original_line_price: original,
    line_price: original,
    final_line_price: final,
    line_level_discount_allocations: allocations,
    properties,
  };
}

function cartOf(items) {
  return {
    token: "t",
    items,
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    items_subtotal_price: items.reduce((n, i) => n + i.final_line_price, 0),
    total_price: items.reduce((n, i) => n + i.final_line_price, 0),
  };
}

// A cart comfortably over the ₹2999 threshold.
const ELIGIBLE_PAID = paid("p1", 400000);
const INELIGIBLE_PAID = paid("p1", 100000);

const audit = (items, opts = {}) =>
  auditCart({ cart: cartOf(items), config: CONFIG, ...opts });
const only = (result) => {
  assert.equal(result.actions.length, 1, `expected one action, got ${result.actions.length}`);
  return result.actions[0];
};

describe("authoritative discount evidence", () => {
  it("does not treat the tag as proof of anything", () => {
    const line = gift({ discounted: "none" });
    assert.equal(line.properties._fgpb_free_gift, "true");
    assert.equal(discountEvidence(line).fullyFree, false);
  });

  it("accepts a line whose allocation covers the whole original price", () => {
    const ev = discountEvidence(gift({ discounted: "full" }));
    assert.equal(ev.fullyFree, true);
    assert.equal(ev.residualChargedCents, 0);
    assert.ok(ev.allocatedCents >= ev.originalLinePrice);
  });

  it("rejects a partial allocation that leaves a residual charge", () => {
    const ev = discountEvidence(gift({ qty: 2, discounted: "partial" }));
    assert.equal(ev.fullyFree, false);
    assert.ok(ev.residualChargedCents > 0);
  });

  it("rejects a zero-value allocation", () => {
    const ev = discountEvidence(gift({ discounted: "zero-allocation" }));
    assert.equal(ev.allocationCount, 1);
    assert.equal(ev.fullyFree, false);
  });

  it("accepts a variant that genuinely costs nothing, as intrinsically zero", () => {
    const ev = discountEvidence(gift({ unitCents: 0, discounted: "none" }));
    assert.equal(ev.fullyFree, true);
    assert.equal(ev.intrinsicallyZero, true);
    assert.equal(ev.discountConfirmed, false);
    assert.equal(ev.evidenceKind, EVIDENCE.INTRINSICALLY_ZERO);
  });

  it("records a discounted gift as discount-confirmed, never intrinsically zero", () => {
    const ev = discountEvidence(gift({ discounted: "full" }));
    assert.equal(ev.evidenceKind, EVIDENCE.DISCOUNT_CONFIRMED);
    assert.equal(ev.intrinsicallyZero, false);
  });

  it("refuses the zero-price exception when any authoritative amount is positive", () => {
    // Line totals read zero but the unit price does not: the exception must not
    // be reachable, because something is still priced.
    const inconsistent = {
      ...gift({ unitCents: 0, discounted: "none" }),
      price: 50000,
      original_price: 50000,
    };
    const ev = discountEvidence(inconsistent);
    assert.equal(ev.intrinsicallyZero, false);
    assert.equal(ev.fullyFree, false);
    assert.equal(ev.evidenceKind, null);
  });

  it("refuses the zero-price exception when a residual unit charge remains", () => {
    const residual = { ...gift({ unitCents: 0, discounted: "none" }), final_price: 100 };
    assert.equal(discountEvidence(residual).intrinsicallyZero, false);
  });

  it("excludes tagged lines from the qualifying subtotal", () => {
    assert.equal(qualifyingCentsOf(cartOf([ELIGIBLE_PAID, gift({})])), 400000);
  });
});

describe("discount source attribution", () => {
  it("attributes our own automatic discount by exact normalized title", () => {
    assert.equal(
      attributeAllocation({
        amount: 100,
        discount_application: { type: "automatic", title: "Free Gift Progress Bar — Campaign Rewards" },
      }),
      "ours",
    );
    // Dash variant, casing and stray whitespace must not defeat the match.
    assert.equal(
      attributeAllocation({
        amount: 100,
        discount_application: { title: "  free gift progress bar - CAMPAIGN   rewards " },
      }),
      "ours",
    );
  });

  it("attributes the Discount Function cart.js message FREE GIFT as ours", () => {
    assert.equal(
      attributeAllocation({
        amount: 69995,
        discount_application: { title: "FREE GIFT" },
      }),
      "ours",
    );
    const ev = discountEvidence(
      gift({
        unitCents: 69995,
        source: "function-message",
      }),
    );
    assert.equal(ev.fullyFree, true);
    assert.equal(ev.attributedToUs, true);
    assert.equal(ev.evidenceKind, EVIDENCE.DISCOUNT_CONFIRMED);
    const result = audit([ELIGIBLE_PAID, gift({ unitCents: 69995, source: "function-message" })]);
    assert.equal(result.safe, true);
    assert.deepEqual(result.actions, []);
    assert.ok(!result.violations.includes(VIOLATION.NOT_FULLY_DISCOUNTED));
  });

  it("refuses a merchant discount that merely contains our words", () => {
    for (const title of ["Free Gift Friday", "Free Gift Progress Bar", "gift"]) {
      assert.equal(
        attributeAllocation({ amount: 100, discount_application: { title } }),
        "foreign",
        `${title} must not be attributed to us`,
      );
    }
  });

  it("refuses our own title arriving under an unexpected application type", () => {
    assert.equal(
      attributeAllocation({
        amount: 100,
        discount_application: {
          type: "discount_code",
          title: "Free Gift Progress Bar — Campaign Rewards",
        },
      }),
      "foreign",
      "a removable code is not evidence an automatic discount applied",
    );
  });

  it("attributes an identifiable third-party discount as foreign", () => {
    assert.equal(
      attributeAllocation({ amount: 100, discount_application: { title: "SUMMER50" } }),
      "foreign",
    );
  });

  it("treats unlabelled allocations as unknown rather than foreign", () => {
    assert.equal(attributeAllocation({ amount: 100 }), "unknown");
    assert.equal(attributeAllocation({ amount: 100, discount_application: {} }), "unknown");
  });

  it("accepts a line covered by our own discount", () => {
    const ev = discountEvidence(gift({ source: "ours" }));
    assert.equal(ev.fullyFree, true);
    assert.equal(ev.attributedToUs, true);
  });

  it("refuses to treat a foreign discount as proof our gift is free", () => {
    const ev = discountEvidence(gift({ source: "foreign" }));
    assert.equal(ev.finalLinePrice, 0, "the cart does show zero today");
    assert.equal(ev.coveredByForeignDiscountOnly, true);
    assert.equal(ev.fullyFree, false, "but a removable foreign discount is not our guarantee");
  });

  it("removes a gift that only a foreign discount is covering", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ source: "foreign" })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("removes a charged tagged gift with no UpsellTrix discount", () => {
    const line = gift({ discounted: "none" });
    assert.equal(discountEvidence(line).fullyFree, false);
    const action = only(audit([ELIGIBLE_PAID, line]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("removes a tagged gift with only a partial foreign discount", () => {
    const line = {
      ...gift({ source: "foreign", discounted: "full", unitCents: 10000 }),
      final_line_price: 5000,
      final_price: 5000,
      line_level_discount_allocations: [
        {
          amount: 5000,
          discount_application: { type: "automatic", title: "SUMMER50" },
        },
      ],
    };
    assert.equal(discountEvidence(line).fullyFree, false);
    const action = only(audit([ELIGIBLE_PAID, line]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("still rejects a $0 line covered only by a foreign discount", () => {
    const ev = discountEvidence(gift({ source: "foreign" }));
    assert.equal(ev.finalLinePrice, 0);
    assert.equal(ev.coveredByForeignDiscountOnly, true);
    assert.equal(ev.fullyFree, false);
    assert.equal(audit([ELIGIBLE_PAID, gift({ source: "foreign" })]).safe, false);
  });

  it("accepts a mixed line when our allocation still covers the original price", () => {
    const original = 50000;
    const line = gift({ discounted: "full" });
    line.line_level_discount_allocations = [
      {
        amount: original,
        discount_application: { type: "automatic", title: "FREE GIFT" },
      },
      {
        amount: 0,
        discount_application: { type: "automatic", title: "SUMMER50" },
      },
    ];
    const ev = discountEvidence(line);
    assert.equal(ev.attributedToUs, true);
    assert.equal(ev.fullyFree, true);
    assert.equal(audit([ELIGIBLE_PAID, line]).safe, true);
  });

  it("rejects a mixed line when our allocation does not cover the original price", () => {
    const original = 50000;
    const line = gift({ discounted: "full" });
    line.final_line_price = 0;
    line.final_price = 0;
    line.line_level_discount_allocations = [
      {
        amount: 20000,
        discount_application: { type: "automatic", title: "FREE GIFT" },
      },
      {
        amount: 30000,
        discount_application: { type: "automatic", title: "SUMMER50" },
      },
    ];
    const ev = discountEvidence(line);
    assert.equal(ev.finalLinePrice, 0);
    assert.equal(ev.attributedToUs, true);
    assert.ok(ev.attributedCents < original);
    assert.equal(ev.fullyFree, false);
    const action = only(audit([ELIGIBLE_PAID, line]));
    assert.equal(action.type, ACTION.REMOVE);
  });

  it("fails closed on an unattributable allocation", () => {
    const ev = discountEvidence(gift({ source: null }));
    assert.equal(ev.finalLinePrice, 0);
    assert.equal(ev.coveredByUnknownDiscountOnly, true);
    assert.equal(ev.fullyFree, false, "unknown attribution is not proof");
  });

  it("removes a gift covered only by an unattributable allocation", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ source: null })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("still treats a zero-price variant as free, the one open case", () => {
    assert.equal(discountEvidence(gift({ unitCents: 0, discounted: "none" })).fullyFree, true);
    assert.equal(
      discountEvidence(gift({ unitCents: 0, discounted: "none" }), {
        allowIntrinsicallyZero: false,
      }).fullyFree,
      false,
    );
  });
});

describe("FREE presentation gate", () => {
  it("permits FREE only on authoritative zero-price evidence", () => {
    assert.equal(canRenderFree(gift({ discounted: "full" })), true);
    assert.equal(canRenderFree(gift({ source: "function-message" })), true);
    assert.equal(canRenderFree(gift({ discounted: "none" })), false);
    assert.equal(canRenderFree(gift({ discounted: "partial", qty: 2 })), false);
    assert.equal(canRenderFree(gift({ source: "foreign" })), false);
  });

  it("never permits FREE for an untagged line", () => {
    assert.equal(canRenderFree(paid("p1", 0, GIFT_VARIANT)), false);
  });
});

describe("campaign identity conditions", () => {
  it("removes a gift with a missing campaign id", () => {
    const line = gift({ campaignId: null });
    assert.equal(line.properties._fgpb_campaign_id, undefined);
    const action = only(audit([ELIGIBLE_PAID, line]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.MISSING_CAMPAIGN_ID]);
  });

  it("removes a gift with a blank campaign id", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ campaignId: "   " })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.MISSING_CAMPAIGN_ID]);
  });

  it("removes a gift whose campaign is absent from the function configuration", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ campaignId: "8" })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.UNKNOWN_CAMPAIGN]);
  });

  it("removes a valid campaign carrying a variant it does not gift", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ variantId: OTHER_VARIANT })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.VARIANT_NOT_ALLOWED]);
  });

  it("keeps the same variant when it is re-tagged to the current campaign", () => {
    const result = audit([ELIGIBLE_PAID, gift({ campaignId: CAMPAIGN })]);
    assert.deepEqual(result.actions, []);
    assert.equal(result.safe, true);
  });
});

describe("quantity normalization", () => {
  it("normalizes tagged quantity 2 down to a cap of 1 by line key", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ key: "g-merged", qty: 2 })]));
    assert.equal(action.type, ACTION.NORMALIZE);
    assert.equal(action.quantity, 1);
    assert.equal(action.lineKey, "g-merged");
    assert.deepEqual(action.reasons, [VIOLATION.QUANTITY_ABOVE_CAP]);
  });

  it("normalizes merged duplicate additions rather than removing the gift", () => {
    // Shopify merges identical variant + properties into one line.
    const merged = gift({ key: "g-merged", qty: 3, discounted: "partial" });
    const action = only(audit([ELIGIBLE_PAID, merged]));
    assert.equal(action.type, ACTION.NORMALIZE);
    assert.equal(action.quantity, 1);
  });

  it("prefers normalization over removal when quantity is the only fault", () => {
    const result = audit([ELIGIBLE_PAID, gift({ qty: 2, discounted: "partial" })]);
    assert.equal(result.actions[0].type, ACTION.NORMALIZE);
    assert.equal(
      result.actions.some((a) => a.type === ACTION.REMOVE),
      false,
    );
  });
});

describe("discount postcondition", () => {
  it("removes a tagged line that is not discounted at all", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ discounted: "none" })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("removes a tagged line whose allocation is zero", () => {
    const action = only(audit([ELIGIBLE_PAID, gift({ discounted: "zero-allocation" })]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.NOT_FULLY_DISCOUNTED]);
  });

  it("defers once before removing, so evidence can be re-read", () => {
    const result = audit([ELIGIBLE_PAID, gift({ discounted: "none" })], {
      finalAttempt: false,
    });
    assert.deepEqual(result.actions, []);
    assert.equal(result.deferred, true);
    assert.equal(result.safe, false, "a deferred line is never a safe stable state");
  });
});

describe("eligibility conditions", () => {
  it("removes a gift once the qualifying subtotal falls below the threshold", () => {
    const action = only(audit([INELIGIBLE_PAID, gift({})]));
    assert.equal(action.type, ACTION.REMOVE);
    assert.deepEqual(action.reasons, [VIOLATION.ELIGIBILITY_LOST]);
  });

  it("removes a tiered gift when its tier eligibility is lost", () => {
    const line = gift({ tierId: "t1" });
    const result = auditCart({
      cart: cartOf([paid("p1", 50000), line]),
      config: TIERED_CONFIG,
    });
    assert.equal(only(result).reasons[0], VIOLATION.ELIGIBILITY_LOST);
  });

  it("keeps a tiered gift while its tier is still satisfied", () => {
    const result = auditCart({
      cart: cartOf([paid("p1", 400000), gift({ tierId: "t1" })]),
      config: TIERED_CONFIG,
    });
    assert.deepEqual(result.actions, []);
    assert.equal(result.safe, true);
  });

  it("removes a tiered gift missing its tier id", () => {
    const result = auditCart({
      cart: cartOf([paid("p1", 400000), gift({ tierId: null })]),
      config: TIERED_CONFIG,
    });
    assert.equal(only(result).reasons[0], VIOLATION.MISSING_TIER_ID);
  });
});

describe("paid same-SKU preservation", () => {
  it("never emits an action against an untagged line sharing the gift SKU", () => {
    const paidSameSku = paid("paid-gift-sku", 400000, GIFT_VARIANT);
    const result = audit([paidSameSku, gift({ key: "g1" })]);
    assert.deepEqual(result.actions, []);
    assert.equal(result.safe, true);
  });

  it("removes only the obsolete tagged line, leaving the paid same-SKU line", () => {
    const paidSameSku = paid("paid-gift-sku", 400000, GIFT_VARIANT);
    const stale = gift({ key: "g-old", campaignId: "8" });
    const current = gift({ key: "g-new", campaignId: CAMPAIGN });
    const result = audit([paidSameSku, stale, current]);
    assert.deepEqual(
      result.actions.map((a) => [a.type, a.lineKey]),
      [[ACTION.REMOVE, "g-old"]],
    );
  });

  it("audits no untagged line at all", () => {
    const result = audit([paid("a", 400000), paid("b", 1000, GIFT_VARIANT)]);
    assert.deepEqual(result.audits, []);
    assert.equal(result.safe, true);
  });
});

describe("multiple tagged gifts across campaigns", () => {
  it("removes every gift from a campaign that is no longer synchronized", () => {
    const result = audit([
      ELIGIBLE_PAID,
      gift({ key: "g8a", campaignId: "8" }),
      gift({ key: "g8b", campaignId: "8", variantId: OTHER_VARIANT }),
      gift({ key: "g9", campaignId: CAMPAIGN }),
    ]);
    assert.deepEqual(
      result.actions.map((a) => a.lineKey).sort(),
      ["g8a", "g8b"],
    );
  });

  it("keeps the desired gift while discarding an obsolete one", () => {
    const result = audit([
      ELIGIBLE_PAID,
      gift({ key: "obsolete", campaignId: "7" }),
      gift({ key: "desired", campaignId: CAMPAIGN }),
    ]);
    const keep = result.audits.find((a) => a.lineKey === "desired");
    assert.equal(keep.action, ACTION.KEEP);
    assert.deepEqual(
      result.actions.map((a) => a.lineKey),
      ["obsolete"],
    );
  });
});

describe("addition preconditions", () => {
  const base = { config: CONFIG, cart: cartOf([ELIGIBLE_PAID]) };

  it("accepts a fully validated addition", () => {
    const res = validateGiftAddition({
      ...base,
      campaignId: CAMPAIGN,
      variantId: GIFT_VARIANT,
      plannedGeneration: 4,
      currentGeneration: 4,
    });
    assert.deepEqual(res, { ok: true, reasons: [] });
  });

  it("refuses an addition without a campaign id", () => {
    const res = validateGiftAddition({ ...base, campaignId: "", variantId: GIFT_VARIANT });
    assert.equal(res.ok, false);
    assert.ok(res.reasons.includes(VIOLATION.MISSING_CAMPAIGN_ID));
  });

  it("refuses an addition for an unconfigured campaign", () => {
    const res = validateGiftAddition({ ...base, campaignId: "8", variantId: GIFT_VARIANT });
    assert.equal(res.ok, false);
    assert.ok(res.reasons.includes(VIOLATION.UNKNOWN_CAMPAIGN));
  });

  it("refuses an addition for a variant the campaign does not gift", () => {
    const res = validateGiftAddition({ ...base, campaignId: CAMPAIGN, variantId: OTHER_VARIANT });
    assert.equal(res.ok, false);
    assert.ok(res.reasons.includes(VIOLATION.VARIANT_NOT_ALLOWED));
  });

  it("refuses an addition planned from a partial cart", () => {
    const partial = { ...cartOf([ELIGIBLE_PAID]), _partial: true };
    const res = validateGiftAddition({
      config: CONFIG,
      cart: partial,
      campaignId: CAMPAIGN,
      variantId: GIFT_VARIANT,
    });
    assert.equal(res.ok, false);
    assert.ok(res.reasons.includes("partial-cart"));
  });

  it("refuses an addition whose generation has been superseded", () => {
    const res = validateGiftAddition({
      ...base,
      campaignId: CAMPAIGN,
      variantId: GIFT_VARIANT,
      plannedGeneration: 4,
      currentGeneration: 5,
    });
    assert.equal(res.ok, false);
    assert.ok(res.reasons.includes("generation-superseded"));
  });
});

describe("bounded confirm-and-correct reconciler", () => {
  function harness(sequence) {
    const notes = [];
    const applied = [];
    let index = 0;
    const reconciler = createGiftSafetyReconciler({
      fetchCart: async () => sequence[Math.min(index++, sequence.length - 1)],
      applyActions: async (actions) => {
        applied.push(...actions);
      },
      getConfig: () => CONFIG,
      note: (type, data) => notes.push({ type, data }),
    });
    return { reconciler, notes, applied, reads: () => index };
  }

  it("settles immediately on an already-safe cart", async () => {
    const h = harness([cartOf([ELIGIBLE_PAID, gift({})])]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.equal(res.reads, 1, "a safe cart costs exactly one authoritative read");
    assert.equal(res.graceUsed, 0);
    assert.deepEqual(h.applied, []);
  });

  it("removes a stale previous-campaign gift and confirms the corrected cart", async () => {
    const h = harness([
      cartOf([ELIGIBLE_PAID, gift({ key: "g-old", campaignId: "8" })]),
      cartOf([ELIGIBLE_PAID]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.deepEqual(
      h.applied.map((a) => [a.type, a.lineKey]),
      [[ACTION.REMOVE, "g-old"]],
    );
  });

  it("normalizes an over-cap gift then confirms it is fully free", async () => {
    const h = harness([
      cartOf([ELIGIBLE_PAID, gift({ key: "g", qty: 2, discounted: "partial" })]),
      cartOf([ELIGIBLE_PAID, gift({ key: "g", qty: 1, discounted: "full" })]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.deepEqual(
      h.applied.map((a) => [a.type, a.quantity]),
      [[ACTION.NORMALIZE, 1]],
    );
  });

  it("handles a late add that lands after eligibility was lost", async () => {
    const h = harness([
      cartOf([INELIGIBLE_PAID, gift({ key: "late" })]),
      cartOf([INELIGIBLE_PAID]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.deepEqual(
      h.applied.map((a) => [a.type, a.lineKey]),
      [[ACTION.REMOVE, "late"]],
    );
  });

  it("does not remove a gift whose allocation appears on the bounded re-read", async () => {
    // Shopify has not surfaced the allocation in the first authoritative read.
    const h = harness([
      cartOf([ELIGIBLE_PAID, gift({ key: "g", discounted: "none" })]),
      cartOf([ELIGIBLE_PAID, gift({ key: "g", discounted: "full", source: "ours" })]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.deepEqual(h.applied, [], "nothing may be removed while the discount is still settling");
    assert.equal(res.graceUsed, 1, "exactly one bounded re-read");
  });

  it("never decides 'charged' from a single read", async () => {
    let reads = 0;
    const reconciler = createGiftSafetyReconciler({
      fetchCart: async () => {
        reads += 1;
        return cartOf([
          ELIGIBLE_PAID,
          reads === 1
            ? gift({ key: "g", discounted: "none" })
            : gift({ key: "g", discounted: "full", source: "ours" }),
        ]);
      },
      applyActions: async () => {
        throw new Error("must not mutate after a single read");
      },
      getConfig: () => CONFIG,
    });
    const res = await reconciler.settle();
    assert.equal(res.ok, true);
    assert.ok(reads >= 2, "a discount verdict requires a second authoritative read");
  });

  it("spends the grace read only on the discount, never on provable faults", async () => {
    const h = harness([
      cartOf([ELIGIBLE_PAID, gift({ key: "g-old", campaignId: "8" })]),
      cartOf([ELIGIBLE_PAID]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.equal(res.graceUsed, 0, "a stale campaign is provable on the first read");
    assert.equal(res.rounds, 1);
  });

  it("removes rather than ship a gift the cart still charges for", async () => {
    const charged = cartOf([ELIGIBLE_PAID, gift({ key: "charged", discounted: "none" })]);
    const h = harness([
      charged,
      charged,
      charged,
      charged,
      charged,
      cartOf([ELIGIBLE_PAID]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);
    assert.ok(
      h.applied.some((a) => a.type === ACTION.REMOVE && a.lineKey === "charged"),
      "a charged tagged gift must be removed, never sent to checkout",
    );
  });

  it("gives up with a diagnostic instead of looping forever", async () => {
    // The server never applies our corrections.
    const stuck = cartOf([ELIGIBLE_PAID, gift({ key: "stuck", discounted: "none" })]);
    const h = harness([stuck]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, false);
    assert.equal(res.gaveUp, true);
    assert.equal(res.reads, 8, `read budget is bounded, saw ${res.reads}`);
    assert.equal(res.graceUsed, 4, "grace is spent for the discount window, then it stops");
    assert.equal(res.rounds, 2, "corrections are bounded");
    assert.ok(h.notes.some((n) => n.type === "gift-safety-failed"));
    assert.ok(res.violations.includes(VIOLATION.NOT_FULLY_DISCOUNTED));
  });

  it("leaves the final cart with no charged tagged gift", async () => {
    const h = harness([
      cartOf([
        ELIGIBLE_PAID,
        gift({ key: "g-old", campaignId: "8" }),
        gift({ key: "g-qty", qty: 2, discounted: "partial" }),
        gift({ key: "g-ok" }),
      ]),
      cartOf([ELIGIBLE_PAID, gift({ key: "g-ok" })]),
    ]);
    const res = await h.reconciler.settle();
    assert.equal(res.ok, true);

    const final = cartOf([ELIGIBLE_PAID, gift({ key: "g-ok" })]);
    const charged = final.items.filter(
      (i) => i.properties._fgpb_free_gift === "true" && !discountEvidence(i).fullyFree,
    );
    assert.deepEqual(charged, []);
  });

  it("refuses to run two reconciliations concurrently", async () => {
    const h = harness([cartOf([ELIGIBLE_PAID, gift({})])]);
    const [a, b] = await Promise.all([h.reconciler.settle(), h.reconciler.settle()]);
    assert.equal([a.busy, b.busy].filter(Boolean).length, 1);
  });
});

describe("the stable invariant", () => {
  it("holds only when every tagged line is fully free for its full quantity", () => {
    const safe = audit([ELIGIBLE_PAID, gift({})]);
    assert.equal(safe.safe, true);

    for (const bad of [
      gift({ campaignId: null }),
      gift({ campaignId: "8" }),
      gift({ variantId: OTHER_VARIANT }),
      gift({ qty: 2, discounted: "partial" }),
      gift({ discounted: "none" }),
      gift({ discounted: "zero-allocation" }),
    ]) {
      assert.equal(audit([ELIGIBLE_PAID, bad]).safe, false);
    }
  });

  it("treats an ineligible cart with any tagged gift as unsafe", () => {
    assert.equal(audit([INELIGIBLE_PAID, gift({})]).safe, false);
  });
});
