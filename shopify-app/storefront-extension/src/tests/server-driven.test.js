/**
 * Phase 2E — server-driven promotion state + cart reconciliation tests.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { state } from "../core/state.js";
import {
  buildLocalEvaluation,
  buildWidgetState,
  cacheFromEvaluation,
  cacheFromWidgetState,
} from "../core/widget-state.js";

const GIFT = "54277124161902";
const PAID = "111";
const TH = 999;

function reset() {
  state.campaign = {
    enabled: true,
    threshold: TH,
    giftVariantId: GIFT,
    campaignId: 8,
  };
  state.knownGiftVariantId = GIFT;
  state.campaignLoaded = true;
  state.sv = 0;
  state.se = 0;
  state.sr = 0;
  state.sp = 0;
  state.autoAddGift = true;
  state.ht = "You are {remaining} away";
  state.ds = "Keep going";
  state.uh = "Unlocked!";
  state.ud = "Enjoy";
  state.cl = { barColor: "#111" };
}

function cart(items) {
  return {
    subtotal: items.reduce((t, i) => t + i.quantity * i.price, 0),
    currency: "INR",
    items,
  };
}

function paid(amount) {
  return { variantId: PAID, quantity: 1, price: amount, lineKey: "p", properties: {} };
}

function tagged(qty = 1) {
  return {
    variantId: GIFT,
    quantity: qty,
    price: 100,
    lineKey: "g",
    properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "8" },
  };
}

function seedServer({ eligible, remaining, progress, threshold = TH }) {
  cacheFromEvaluation({
    enabled: true,
    eligible,
    remaining,
    progress,
    threshold,
    gift: { variantId: GIFT },
    campaign: { id: 8 },
  });
}

beforeEach(reset);

describe("Phase 2E — server-driven promotion fields", () => {
  it("copies eligible/remaining/progress from server without local recomputation", () => {
    seedServer({ eligible: false, remaining: 499, progress: 50.05 });
    const ev = buildLocalEvaluation(cart([paid(500)]));
    assert.equal(ev.eligible, false);
    assert.equal(ev.remaining, 499);
    assert.equal(ev.progress, 50.05);
    assert.equal(ev.threshold, TH);
  });

  it("exact threshold unlock comes from server", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const ev = buildLocalEvaluation(cart([paid(TH)]));
    assert.equal(ev.eligible, true);
    assert.equal(ev.progress, 100);
    assert.equal(ev.remaining, 0);
  });

  it("decimal boundary values are taken from server snapshot", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    assert.equal(buildLocalEvaluation(cart([paid(99.995)])).eligible, true);
    seedServer({ eligible: false, remaining: 0.01, progress: 99.99 });
    const below = buildLocalEvaluation(cart([paid(99.994)]));
    assert.equal(below.eligible, false);
    assert.equal(below.remaining, 0.01);
    assert.equal(below.progress, 99.99);
  });

  it("without server snapshot does not invent eligibility", () => {
    state.sv = 0;
    const ev = buildLocalEvaluation(cart([paid(TH)]));
    assert.equal(ev.eligible, false);
    assert.equal(ev.action, "NONE");
  });
});

describe("Phase 2E — cart reconciliation actions", () => {
  it("eligible + gift absent → ADD_GIFT", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    assert.equal(buildLocalEvaluation(cart([paid(TH)])).action, "ADD_GIFT");
  });

  it("eligible + gift present → NONE", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    assert.equal(buildLocalEvaluation(cart([paid(TH), tagged()])).action, "NONE");
  });

  it("ineligible + gift present → REMOVE_GIFT", () => {
    seedServer({ eligible: false, remaining: 400, progress: 40 });
    assert.equal(buildLocalEvaluation(cart([paid(400), tagged()])).action, "REMOVE_GIFT");
  });

  it("ineligible + gift absent → NONE", () => {
    seedServer({ eligible: false, remaining: 400, progress: 40 });
    assert.equal(buildLocalEvaluation(cart([paid(400)])).action, "NONE");
  });

  it("duplicate tagged gifts still reconcile as NONE when eligible", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const items = [paid(TH), tagged(), { ...tagged(), lineKey: "g2" }];
    assert.equal(buildLocalEvaluation(cart(items)).action, "NONE");
  });

  it("qty > 1 tagged gift → NONE when eligible (enforceGiftLimit owns normalize)", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    assert.equal(buildLocalEvaluation(cart([paid(TH), tagged(3)])).action, "NONE");
  });

  it("same SKU paid only never counts as gift line", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const ev = buildLocalEvaluation(
      cart([{ variantId: GIFT, quantity: 1, price: TH, lineKey: "paid", properties: {} }]),
    );
    assert.equal(ev.action, "ADD_GIFT");
  });

  it("paid + tagged same SKU → NONE when eligible", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const ev = buildLocalEvaluation(
      cart([
        { variantId: GIFT, quantity: 1, price: 600, lineKey: "paid", properties: {} },
        tagged(),
      ]),
    );
    assert.equal(ev.action, "NONE");
  });

  it("tagged gift for another campaign is ignored for this campaign", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const ev = buildLocalEvaluation(
      cart([
        paid(TH),
        {
          variantId: GIFT,
          quantity: 1,
          price: 100,
          lineKey: "other",
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "99" },
        },
      ]),
    );
    assert.equal(ev.action, "ADD_GIFT");
  });
});

describe("Phase 2E — failure / disabled policy", () => {
  it("proxy null keeps last valid promotion numbers", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    cacheFromWidgetState(null);
    cacheFromEvaluation(null);
    assert.equal(state.sv, 1);
    assert.equal(state.se, 1);
    assert.equal(buildLocalEvaluation(cart([paid(TH)])).eligible, true);
  });

  it("disabled campaign clears eligibility and forces NONE", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    cacheFromWidgetState({ enabled: false });
    const ev = buildLocalEvaluation(cart([paid(TH), tagged()]));
    assert.equal(state.se, 0);
    // campaign disabled → buildLocalEvaluation still needs giftId; enabled flag on campaign
    assert.equal(state.campaign.enabled, false);
    assert.equal(ev.eligible, false);
    assert.equal(ev.action, "REMOVE_GIFT");
  });

  it("evaluate-cart disabled payload clears promotion", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    cacheFromEvaluation({ enabled: false, eligible: false, action: "NONE" });
    assert.equal(state.se, 0);
    assert.equal(state.campaign.enabled, false);
  });

  it("setPromo via cacheFromEvaluation is the progress writer", () => {
    cacheFromEvaluation({
      enabled: true,
      eligible: false,
      remaining: 12,
      progress: 34,
      threshold: TH,
      gift: { variantId: GIFT },
      campaign: { id: 8 },
    });
    assert.equal(state.sr, 12);
    assert.equal(state.sp, 34);
    assert.equal(state.se, 0);
  });
});

describe("Phase 2E — UI uses live cart progress", () => {
  it("gift actions still copy eligible from the server snapshot", () => {
    seedServer({ eligible: false, remaining: 499, progress: 50.05 });
    const ev = buildLocalEvaluation(cart([paid(500)]));
    assert.equal(ev.eligible, false);
    assert.equal(ev.remaining, 499);
    assert.equal(ev.progress, 50.05);
  });

  it("widget copy/progress follow the live cart against the threshold", () => {
    seedServer({ eligible: false, remaining: 200, progress: 40 });
    const display = buildWidgetState(cart([paid(400)]));
    assert.equal(display.progress, (400 / TH) * 100);
    assert.match(display.heading, /away/i);
    assert.doesNotMatch(display.heading, /200/);
  });

  it("unlocked copy when the cart meets threshold even if the server snapshot is stale", () => {
    seedServer({ eligible: false, remaining: 162, progress: 84 });
    const display = buildWidgetState(cart([paid(TH)]));
    assert.equal(display.progress, 100);
    assert.match(display.heading, /Unlocked/i);
  });

  it("locked copy when the cart drops below threshold even if the server is still eligible", () => {
    seedServer({ eligible: true, remaining: 0, progress: 100 });
    const display = buildWidgetState(cart([paid(400)]));
    assert.ok(display.progress < 50);
    assert.match(display.heading, /away/i);
  });
});

describe("Phase 3A — percentage discount storefront gate", () => {
  it("PERCENTAGE_DISCOUNT caches progress without gift actions", () => {
    reset();
    state.rewardType = null;
    cacheFromWidgetState({
      enabled: true,
      campaignId: 20,
      threshold: 1000,
      eligible: true,
      remaining: 0,
      progress: 100,
      rewardType: "PERCENTAGE_DISCOUNT",
      gift: null,
      autoAddGift: false,
      heading: "Unlocked discount",
      description: "Enjoy 10% off",
    });
    assert.equal(state.rewardType, "PERCENTAGE_DISCOUNT");
    assert.equal(state.se, 1);
    const ev = buildLocalEvaluation(cart([paid(1000)]));
    assert.equal(ev.enabled, true);
    assert.equal(ev.eligible, true);
    assert.equal(ev.action, "NONE");
    assert.equal(ev.gift, null);
  });
});

describe("Phase 3B — fixed discount storefront gate", () => {
  it("FIXED_DISCOUNT caches progress without gift synchronization", () => {
    reset();
    state.rewardType = null;
    cacheFromWidgetState({
      enabled: true,
      campaignId: 30,
      threshold: 1000,
      eligible: true,
      remaining: 0,
      progress: 100,
      rewardType: "FIXED_DISCOUNT",
      gift: null,
      autoAddGift: false,
      heading: "Unlocked discount",
      description: "Enjoy 100 off",
    });
    assert.equal(state.rewardType, "FIXED_DISCOUNT");
    const ev = buildLocalEvaluation(cart([paid(1000)]));
    assert.equal(ev.enabled, true);
    assert.equal(ev.eligible, true);
    assert.equal(ev.action, "NONE");
    assert.equal(ev.gift, null);
  });
});
