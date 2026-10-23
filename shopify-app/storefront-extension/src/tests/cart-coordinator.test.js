import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ORIGIN,
  STAGE,
  cartFingerprint,
  compensatingRemovals,
  createGenerationClock,
  createGiftReconciler,
  evaluateEligibility,
  flagsForStage,
  giftProperties,
  isPlanStillValid,
  planGiftReconciliation,
  qualifyingSubtotalCents,
  resolveStage,
} from "../utils/cart-coordinator.js";

const ASSETS = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../extensions/free-gift-progress-bar/assets",
);
const TIERED = readFileSync(join(ASSETS, "tiered-gift-sync.js"), "utf8");
const CPP = readFileSync(join(ASSETS, "cart-page-progress.js"), "utf8");
const RUNTIME = readFileSync(join(ASSETS, "fgpb-runtime.js"), "utf8");
const UNLOCK = readFileSync(join(ASSETS, "unlock-celebrate.js"), "utf8");
const EMBED = readFileSync(
  join(ASSETS, "../blocks/free-gift-embed.liquid"),
  "utf8",
);
const SECTION = readFileSync(
  join(ASSETS, "../blocks/free-gift-progress-bar.liquid"),
  "utf8",
);

const DISCOUNT_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../extensions/fgpb-discount/src",
);
const FN_ENGINE = readFileSync(join(DISCOUNT_SRC, "discount-engine.ts"), "utf8");
const FN_QUERY = readFileSync(
  join(DISCOUNT_SRC, "cart_lines_discounts_generate_run.graphql"),
  "utf8",
);

const TIERS = [{ tierId: "t1", variantId: "111", threshold: 50 }];

function paidLine(key, cents, qty = 1, variantId = "999") {
  return {
    key,
    variant_id: variantId,
    quantity: qty,
    price: cents / qty,
    final_line_price: cents,
    properties: {},
  };
}

function giftLine(key, tierId = "t1", variantId = "111", qty = 1) {
  return {
    key,
    variant_id: variantId,
    quantity: qty,
    price: 0,
    final_line_price: 0,
    properties: giftProperties("c1", tierId),
  };
}

function cartOf(items) {
  return {
    token: "tok",
    currency: "INR",
    items,
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    total_price: items.reduce((n, i) => n + i.final_line_price, 0),
    items_subtotal_price: items.reduce((n, i) => n + i.final_line_price, 0),
  };
}

describe("cart fingerprint", () => {
  it("ignores DOM/array order", () => {
    const a = cartOf([paidLine("k1", 1000), paidLine("k2", 2000)]);
    const b = cartOf([paidLine("k2", 2000), paidLine("k1", 1000)]);
    assert.equal(cartFingerprint(a), cartFingerprint(b));
  });

  it("changes when a quantity changes", () => {
    const before = cartFingerprint(cartOf([paidLine("k1", 1000, 1)]));
    const after = cartFingerprint(cartOf([paidLine("k1", 2000, 2)]));
    assert.notEqual(before, after);
  });

  it("changes when a gift line appears", () => {
    const before = cartFingerprint(cartOf([paidLine("k1", 6000)]));
    const after = cartFingerprint(cartOf([paidLine("k1", 6000), giftLine("g1")]));
    assert.notEqual(before, after);
  });
});

describe("eligibility", () => {
  it("excludes tagged gift lines from qualifying spend", () => {
    const cart = cartOf([paidLine("k1", 4000), giftLine("g1")]);
    assert.equal(qualifyingSubtotalCents(cart), 4000);
  });

  it("counts a paid line of the gift variant as qualifying spend", () => {
    const cart = cartOf([paidLine("k1", 6000, 1, "111"), giftLine("g1")]);
    assert.equal(qualifyingSubtotalCents(cart), 6000);
    assert.equal(evaluateEligibility(cart, TIERS).unlocked.length, 1);
  });

  it("compares thresholds in cents, not major units", () => {
    assert.equal(evaluateEligibility(cartOf([paidLine("k1", 4999)]), TIERS).unlocked.length, 0);
    assert.equal(evaluateEligibility(cartOf([paidLine("k1", 5000)]), TIERS).unlocked.length, 1);
  });

  it("never lets the gift's own price create circular eligibility", () => {
    const gift = giftLine("g1");
    gift.final_line_price = 9900;
    const cart = cartOf([paidLine("k1", 1000), gift]);
    assert.equal(evaluateEligibility(cart, TIERS).unlocked.length, 0);
  });
});

describe("gift reconciliation plan", () => {
  it("below threshold plans nothing", () => {
    const cart = cartOf([paidLine("k1", 1000)]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(plan, []);
  });

  it("crossing the threshold plans exactly one add", () => {
    const cart = cartOf([paidLine("k1", 6000)]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, "ADD");
    assert.equal(plan[0].properties._fgpb_free_gift, "true");
  });

  it("eligible and already satisfied plans nothing", () => {
    const cart = cartOf([paidLine("k1", 6000), giftLine("g1")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(plan, []);
  });

  it("falling below the threshold plans a removal", () => {
    const cart = cartOf([paidLine("k1", 1000), giftLine("g1")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, "REMOVE");
    assert.equal(plan[0].lineKey, "g1");
  });

  it("removing all paid lines leaves zero tagged gifts", () => {
    const cart = cartOf([giftLine("g1")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(plan.map((a) => a.type), ["REMOVE"]);
  });

  it("removes duplicate gifts for the same tier", () => {
    const cart = cartOf([paidLine("k1", 6000), giftLine("g1"), giftLine("g2")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, "REMOVE");
    assert.equal(plan[0].reason, "duplicate");
  });

  it("normalizes a gift line whose quantity drifted above one", () => {
    const cart = cartOf([paidLine("k1", 6000), giftLine("g1", "t1", "111", 3)]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(plan.map((a) => a.type), ["NORMALIZE"]);
    assert.equal(plan[0].quantity, 1);
  });

  it("leaves a same-SKU paid line untouched while removing the tagged one", () => {
    const cart = cartOf([paidLine("paid", 1000, 1, "111"), giftLine("g1")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].lineKey, "g1");
  });

  it("never touches a gift line belonging to another campaign", () => {
    const other = giftLine("g-other");
    other.properties._fgpb_campaign_id = "c2";
    const cart = cartOf([paidLine("k1", 1000), other]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(plan, []);
  });

  it("still removes ineligible gifts when adds are suppressed", () => {
    const cart = cartOf([paidLine("k1", 1000), giftLine("g1")]);
    const plan = planGiftReconciliation({
      cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
      giftUnavailable: true,
    });
    assert.deepEqual(plan.map((a) => a.type), ["REMOVE"]);
  });
});

describe("generation clock", () => {
  it("advances only for customer mutations", () => {
    const clock = createGenerationClock(0);
    clock.bump(ORIGIN.CUSTOMER);
    assert.equal(clock.current, 1);
    clock.bump(ORIGIN.GIFT_SYNC);
    clock.bump(ORIGIN.RECOVERY);
    assert.equal(clock.current, 1);
  });

  it("marks older generations stale", () => {
    const clock = createGenerationClock(3);
    clock.bump(ORIGIN.CUSTOMER);
    assert.equal(clock.isStale(3), true);
    assert.equal(clock.isCurrent(4), true);
  });
});

describe("plan validity guard", () => {
  it("rejects a plan whose generation was superseded", () => {
    const plan = { generation: 2, fingerprint: "fp" };
    assert.equal(isPlanStillValid(plan, { generation: 3, fingerprint: "fp" }), false);
  });

  it("rejects a plan whose cart changed underneath it", () => {
    const plan = { generation: 2, fingerprint: "fp" };
    assert.equal(isPlanStillValid(plan, { generation: 2, fingerprint: "other" }), false);
  });

  it("accepts an unchanged plan", () => {
    const plan = { generation: 2, fingerprint: "fp" };
    assert.equal(isPlanStillValid(plan, { generation: 2, fingerprint: "fp" }), true);
  });
});

describe("serialized gift reconciler", () => {
  function harness({ dryRun = false, tiers = TIERS } = {}) {
    const clock = createGenerationClock(0);
    let cart = cartOf([]);
    const calls = [];
    const reconciler = createGiftReconciler({
      clock,
      campaignId: "c1",
      dryRun,
      getTiers: () => tiers,
      getConfirmedCart: async () => cart,
      execute: async (action) => {
        calls.push(action);
        if (action.type === "ADD") {
          cart = cartOf([...cart.items, giftLine("g-added", action.tierId, action.variantId)]);
        } else if (action.type === "REMOVE") {
          cart = cartOf(cart.items.filter((i) => i.key !== action.lineKey));
        }
        return { ok: true };
      },
    });
    return {
      clock,
      calls,
      reconciler,
      get cart() {
        return cart;
      },
      setCart(items) {
        cart = cartOf(items);
      },
      customerMutation(items) {
        cart = cartOf(items);
        clock.bump(ORIGIN.CUSTOMER);
      },
    };
  }

  it("adds exactly one gift when the threshold is crossed", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    await h.reconciler.request();
    assert.equal(h.calls.filter((c) => c.type === "ADD").length, 1);
    assert.equal(h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length, 1);
  });

  it("does not add a second gift when run again while still eligible", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    await h.reconciler.request();
    await h.reconciler.request();
    assert.equal(h.calls.filter((c) => c.type === "ADD").length, 1);
  });

  it("dry run reports the plan and never mutates the cart", async () => {
    const h = harness({ dryRun: true });
    h.setCart([paidLine("k1", 6000)]);
    await h.reconciler.request();
    assert.equal(h.calls.length, 0);
    assert.equal(h.cart.items.length, 1);
    assert.equal(h.reconciler.log[0].status, "dry-run");
  });

  it("removes the gift once the cart drops below the threshold", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    await h.reconciler.request();
    h.customerMutation([paidLine("k1", 1000), giftLine("g-added")]);
    await h.reconciler.request();
    assert.equal(h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length, 0);
  });

  // The exact live race: an eligible plan is built, the shopper then removes the
  // qualifying products, and the delayed gift add must not survive it.
  it("an older eligible plan cannot add a gift after a newer removal", async () => {
    const clock = createGenerationClock(0);
    let cart = cartOf([paidLine("k1", 6000)]);
    const calls = [];
    const reconciler = createGiftReconciler({
      clock,
      campaignId: "c1",
      getTiers: () => TIERS,
      getConfirmedCart: async () => cart,
      execute: async (action) => {
        calls.push(action);
        return { ok: true };
      },
      onPlan() {
        // Shopper empties the qualifying products the instant the plan is built.
        cart = cartOf([]);
        clock.bump(ORIGIN.CUSTOMER);
      },
    });
    const result = await reconciler.request();
    assert.equal(result.status, "superseded");
    assert.equal(calls.filter((c) => c.type === "ADD").length, 0);
  });

  it("an add that lands after eligibility is lost is immediately compensated", async () => {
    const clock = createGenerationClock(0);
    let cart = cartOf([paidLine("k1", 6000)]);
    const calls = [];
    const reconciler = createGiftReconciler({
      clock,
      campaignId: "c1",
      getTiers: () => TIERS,
      getConfirmedCart: async () => cart,
      execute: async (action) => {
        calls.push(action);
        if (action.type === "ADD") {
          // The POST is already in flight and cannot be cancelled; while it
          // completes the shopper removes the qualifying product.
          cart = cartOf([giftLine("g-added")]);
        } else if (action.type === "REMOVE") {
          cart = cartOf(cart.items.filter((i) => i.key !== action.lineKey));
        }
        return { ok: true };
      },
    });
    const result = await reconciler.request();
    assert.equal(result.status, "compensated");
    assert.equal(calls.filter((c) => c.type === "ADD").length, 1);
    assert.equal(calls.filter((c) => c.type === "REMOVE").length, 1);
    assert.equal(cart.items.length, 0, "no orphaned gift may survive");
  });

  it("rapid crossing then reversal settles with zero gifts", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    const first = h.reconciler.request();
    h.customerMutation([paidLine("k1", 500)]);
    await first;
    await h.reconciler.request();
    assert.equal(h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length, 0);
  });

  it("runs one reconciliation at a time and coalesces duplicates", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    const results = await Promise.all([
      h.reconciler.request(),
      h.reconciler.request(),
      h.reconciler.request(),
    ]);
    assert.equal(results.filter((r) => r && r.status === "queued").length, 2);
    assert.equal(h.calls.filter((c) => c.type === "ADD").length, 1);
  });

  it("bounds retries on a failing gift mutation", async () => {
    const clock = createGenerationClock(0);
    const cart = cartOf([paidLine("k1", 6000)]);
    let attempts = 0;
    const reconciler = createGiftReconciler({
      clock,
      campaignId: "c1",
      getTiers: () => TIERS,
      getConfirmedCart: async () => cart,
      execute: async () => {
        attempts += 1;
        return { ok: false, error: "422" };
      },
    });
    const result = await reconciler.request();
    assert.equal(result.status, "failed");
    assert.equal(attempts, 2, "one initial attempt plus one bounded retry");
  });

  it("reaches idle with no further work queued", async () => {
    const h = harness();
    h.setCart([paidLine("k1", 6000)]);
    await h.reconciler.request();
    assert.equal(h.reconciler.busy, false);
    const before = h.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(h.calls.length, before);
  });
});

describe("compensating removals", () => {
  it("removes every tagged gift when eligibility was lost", () => {
    const cart = cartOf([giftLine("g1")]);
    const undo = compensatingRemovals({
      confirmedCart: cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(undo.map((a) => a.lineKey), ["g1"]);
  });

  it("returns nothing while the gift is still earned", () => {
    const cart = cartOf([paidLine("k1", 6000), giftLine("g1")]);
    const undo = compensatingRemovals({
      confirmedCart: cart,
      eligibility: evaluateEligibility(cart, TIERS),
      campaignId: "c1",
    });
    assert.deepEqual(undo, []);
  });
});

describe("isolation stages", () => {
  it("stage 0 leaves Dawn completely native", () => {
    const f = flagsForStage(STAGE.OFF);
    assert.equal(f.enabled, false);
    assert.equal(f.renderProgress, false);
    assert.equal(f.mutateGifts, false);
  });

  it("stages below 5 never mutate the cart", () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      const f = flagsForStage(stage);
      assert.equal(f.mutateGifts, false, `stage ${stage} must not mutate`);
      assert.equal(f.optimisticPaint, false, `stage ${stage} must not paint predictions`);
      assert.equal(f.recommendations, false, `stage ${stage} must not add recommendations`);
    }
  });

  it("stage 4 evaluates gifts without mutating", () => {
    const f = flagsForStage(STAGE.GIFT_DRY_RUN);
    assert.equal(f.evaluateGifts, true);
    assert.equal(f.mutateGifts, false);
    assert.equal(f.renderProgress, true);
  });

  it("no stage ever lets UpsellTrix write Dawn section HTML wholesale", () => {
    for (const stage of [0, 1, 2, 3, 4, 5]) {
      assert.equal(flagsForStage(stage).applyDawnSections, undefined);
    }
  });

  it("uses explicit query stages and ignores stale persistent storage", () => {
    assert.equal(resolveStage({ search: "?fgpb_stage=0" }), 0);
    assert.equal(resolveStage({ search: "?a=1&fgpb_stage=5&b=2" }), 5);
    assert.equal(resolveStage({ search: "", storage: { getItem: () => "2" } }), 5);
    assert.equal(resolveStage({ search: "?fgpb_stage=3", storage: { getItem: () => "0" } }), 3);
  });

  it("clamps nonsense and defaults to gift-live", () => {
    assert.equal(resolveStage({ search: "?fgpb_stage=99" }), 5);
    assert.equal(resolveStage({ search: "?fgpb_stage=-4" }), 0);
    assert.equal(resolveStage({ search: "?fgpb_stage=abc" }), STAGE.GIFT_LIVE);
    assert.equal(resolveStage({}), STAGE.GIFT_LIVE);
  });
});

describe("shipped assets honour the coordination contract", () => {
  it("loads the runtime kill switch before every other asset", () => {
    const runtimeAt = EMBED.indexOf("fgpb-runtime.js");
    const cppAt = EMBED.indexOf("cart-page-progress.js");
    const giftAt = EMBED.indexOf("tiered-gift-sync.js");
    assert.ok(runtimeAt > -1, "embed must load fgpb-runtime.js");
    assert.ok(runtimeAt < cppAt && runtimeAt < giftAt);
    assert.match(EMBED, /fgpb_sync = '162'/);
    const sectionRuntimeAt = SECTION.indexOf("fgpb-runtime.js");
    const sectionCppAt = SECTION.indexOf("cart-page-progress.js");
    const sectionGiftAt = SECTION.indexOf("tiered-gift-sync.js");
    assert.ok(sectionRuntimeAt > -1, "product section block must load fgpb-runtime.js");
    assert.ok(sectionRuntimeAt < sectionCppAt && sectionRuntimeAt < sectionGiftAt);
    assert.match(SECTION, /fgpb_sync = '162'/);
  });

  it("keeps the progress strip out of drawers that are not Dawn", () => {
    assert.match(CPP, /function allowsOwnedDrawerStrip\(/);
    const pinAt = CPP.indexOf("function pinDrawerStripNow");
    const pin = CPP.slice(pinAt, CPP.indexOf("function liveDrawerHasOwnedHost", pinAt));
    assert.match(pin, /if \(!allowsOwnedDrawerStrip\(drawer\)\)/);
    assert.equal(CPP.includes('target.classList.contains("cart-drawer__inner")'), false);
  });

  it("defaults the runtime to gift-live mutations", () => {
    assert.match(RUNTIME, /var DEFAULT_STAGE = 5/);
    assert.match(RUNTIME, /mutateGifts: stage >= 5/);
    assert.match(RUNTIME, /applyDawnSections: false/);
    assert.doesNotMatch(RUNTIME, /readStore\("fgpb_stage"\)/);
  });

  it("emits a confirmed gift-add event for celebration UI", () => {
    assert.match(TIERED, /new CustomEvent\("fgpb:gift-added"/);
    assert.match(UNLOCK, /addEventListener\("fgpb:gift-added"/);
  });

  it("stamps one build version across every asset the embed loads", () => {
    assert.match(RUNTIME, /version: "142"/);
    assert.match(TIERED, /__FGPB_TGS = \{ v: 142/);
    assert.match(CPP, /v: 142,/);
  });

  it("routes every gift mutation through the safety postcondition", () => {
    // One chokepoint: applyActions wraps the raw path so no caller can mutate
    // gifts without settling afterwards.
    assert.match(TIERED, /function applyActionsRaw\(/);
    const at = TIERED.indexOf("function applyActions(");
    assert.ok(at > -1);
    assert.match(TIERED.slice(at, at + 400), /giftSafetySettle\(\)/);
    assert.match(TIERED, /function giftSafetySettle\(/);
  });

  it("enforces the addition preconditions at the POST site", () => {
    const at = TIERED.indexOf("function addGiftsBatch(");
    assert.ok(at > -1);
    const body = TIERED.slice(at, TIERED.indexOf("function applyActions(", at));
    assert.match(body, /validateGiftAddition\(/, "preconditions must be checked before the POST");
    assert.match(body, /gift-add-refused/);
  });

  it("never renders FREE from the _fgpb_* tag alone", () => {
    assert.match(TIERED, /function canRenderFree\(/);
    assert.match(TIERED, /window\.__fgpbCanRenderFree = canRenderFree/);
    assert.match(CPP, /__fgpbCanRenderFree/);
    assert.doesNotMatch(CPP, /"Free!"/, "the tag-driven Free! label must be gone");
    const badgeAt = CPP.indexOf("function ensureGiftBadge(");
    assert.match(CPP.slice(badgeAt, badgeAt + 300), /confirmedFree \? "FREE GIFT"/);
  });

  it("leaves Dawn's own price and discount presentation visible", () => {
    for (const selector of [
      ".fgpb-gift-line .discounts,",
      ".fgpb-gift-line .cart-item__price,",
      ".fgpb-gift-line .cart-item__totals,",
      ".fgpb-gift-line .price,",
      ".fgpb-gift-line s{display:none",
    ]) {
      assert.ok(!CPP.includes(selector), `must not hide native pricing: ${selector}`);
    }
    // The JS path must not hide it either.
    const at = CPP.indexOf("function forceHideGiftControls(");
    const body = CPP.slice(at, at + 900);
    for (const selector of [".discounts", ".cart-item__price", ".cart-item__totals", ".unit-price"]) {
      assert.ok(!body.includes(selector), `forceHideGiftControls must not hide ${selector}`);
    }
  });

  it("attributes only the exact provisioned discount title", () => {
    // Attribution decides whether a gift survives, so a rename would silently
    // remove every legitimate gift. The allowlist is exact: substring matching
    // would let an unrelated merchant discount validate a charged line.
    const SCHEMA = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../app/services/discount-engine/discount-config.schema.ts",
      ),
      "utf8",
    );
    const provisioned = /^export const DISCOUNT_FUNCTION_TITLE = "([^"]+)"/m.exec(SCHEMA)[1];
    const normalize = (s) =>
      String(s)
        .normalize("NFKC")
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const titles = /var OUR_DISCOUNT_TITLES = \[([^\]]+)\]/
      .exec(TIERED)[1]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .map(normalize);

    assert.deepEqual(
      [...titles].sort(),
      [normalize(provisioned), "free gift progress bar - campaign rewards", "free gift"].sort(),
      "Current admin title, the legacy title, and the Function cart.js message",
    );
    assert.ok(
      !titles.some((t) => t === "free gift friday"),
      "substring titles must not be allowlisted",
    );
    assert.match(TIERED, /var OUR_APPLICATION_TYPES = \["automatic"\]/);
  });

  it("keeps the pure module and the shipped asset on the same attribution policy", () => {
    const SAFETY = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../utils/gift-safety.js"),
      "utf8",
    );
    for (const source of [TIERED, SAFETY]) {
      assert.ok(source.includes('"upselltrix free gift"'));
      assert.ok(source.includes('"free gift progress bar - campaign rewards"'));
      assert.ok(source.includes('"FREE GIFT"'));
      assert.match(source, /normalizeDiscountTitle/);
      assert.match(source, /intrinsicallyZero/);
      assert.match(source, /"intrinsically-zero"|INTRINSICALLY_ZERO/);
      assert.match(source, /"discount-confirmed"|DISCOUNT_CONFIRMED/);
    }
  });

  it("fails closed on unattributed discount coverage", () => {
    const at = TIERED.indexOf("function discountEvidence(");
    const body = TIERED.slice(at, at + 1800);
    assert.match(body, /attributed >= original/, "only attributed cents may prove the postcondition");
    assert.ok(!/unknown \+ attributed/.test(body));
  });

  it("gates every path that can put the progress strip in the DOM", () => {
    // Stage 1 reported the strip still rendering: gating the paint entry point
    // alone left the mount and recovery paths open.
    for (const fn of [
      "function createStripCard",
      "function createProductCard",
      "function ensureStrip",
      "function ensureDrawerStrip",
      "function mountInDrawer",
      "function pinDrawerStripNow",
      "function paintStrip",
      "function paintEnabledChrome",
    ]) {
      const at = CPP.indexOf(fn);
      assert.ok(at > -1, `missing ${fn}`);
      assert.match(
        CPP.slice(at, at + 200),
        /can\("renderProgress"\)/,
        `${fn} must refuse to render below stage 2`,
      );
    }
    const recoverAt = CPP.indexOf("function recoverLiveDrawerProgressHost");
    assert.match(CPP.slice(recoverAt, recoverAt + 200), /can\("progressRecovery"\)/);
  });

  it("emits the stage 5 lifecycle diagnostics", () => {
    for (const type of [
      "customer-generation",
      "eligibility",
      "gift-plan",
      "pre-post-validate",
      "gift-post-result",
      "compensating-reconcile",
      "final-confirmed-cart",
    ]) {
      assert.ok(TIERED.includes(`"${type}"`), `missing diagnostic: ${type}`);
    }
  });

  it("tags gifts with exactly the properties the discount function matches on", () => {
    // If these drift, the gift is still added but nothing discounts it, and the
    // shopper is charged at checkout with no storefront symptom.
    const keys = ["_fgpb_free_gift", "_fgpb_campaign_id", "_fgpb_tier_id"];
    for (const key of keys) {
      assert.ok(TIERED.includes(`"${key}"`), `storefront must write ${key}`);
      assert.ok(FN_ENGINE.includes(`"${key}"`), `discount function must read ${key}`);
      // Underscore-prefixed keys only resolve in a Function input query when
      // aliased, so the query must request them via an alias.
      assert.match(
        FN_QUERY,
        new RegExp(`\\w+:\\s*attribute\\(key:\\s*"${key}"\\)`),
        `${key} must be queried with an alias`,
      );
    }
  });

  it("does not monkey-patch Dawn rendering", () => {
    for (const src of [TIERED, CPP]) {
      assert.equal(src.includes("wrapDawnSectionRender"), false);
      assert.equal(src.includes("installDawnSectionRenderHook"), false);
      assert.equal(/renderContents\s*=/.test(src), false);
      assert.equal(/setInnerHTML\s*=/.test(src), false);
    }
  });

  it("never replaces the whole cart-drawer element", () => {
    assert.equal(/drawer\.innerHTML\s*=/.test(CPP), false);
  });

  it("never rewrites Dawn's outgoing request", () => {
    assert.equal(TIERED.includes("runWatchedFetch"), false);
    assert.equal(TIERED.includes("prepareBatchedAdd"), false);
    assert.match(TIERED, /nativeFetch\.apply\(this, arguments\)/);
  });

  it("never issues a second section fetch that could apply stale HTML", () => {
    assert.equal(TIERED.includes("fetchCartSectionsFallback"), false);
    assert.equal(TIERED.includes("refreshCartPageSections"), false);
  });

  it("does not let an empty snapshot wipe a drawer Dawn already rendered", () => {
    assert.match(CPP, /function renderedCartShowsItems/);
    const prune = CPP.slice(
      CPP.indexOf("function pruneStaleCartRows"),
      CPP.indexOf("function visibleCartTotalText"),
    );
    assert.match(prune, /if \(renderedCartShowsItems\(\)\) return/);
    const paint = CPP.slice(
      CPP.indexOf("function paintFromCartNow"),
      CPP.indexOf("function lockGiftBadgeStyle"),
    );
    assert.match(paint, /renderedCartShowsItems\(\)/);
    const chrome = CPP.slice(
      CPP.indexOf("function syncDawnCartChrome"),
      CPP.indexOf("function reindexCartRows"),
    );
    assert.match(chrome, /if \(empty && renderedCartShowsItems\(\)\) return/);
  });

  it("requests /cart section HTML by Dawn data-id, never a hardcoded type name", () => {
    assert.match(TIERED, /function cartPageSectionId/);
    assert.match(TIERED, /function cartSectionsList/);
    assert.equal(TIERED.includes('list += ",main-cart-items,main-cart-footer"'), false);
    assert.match(CPP, /function findCartPageItemsHost/);
    assert.match(CPP, /function pruneStaleCartRows/);
    assert.match(TIERED, /function fillMissingCartPageRows/);
    assert.match(CPP, /__fgpbCartPageMissingKeys/);
    assert.match(CPP, /\.js-contents/);
    assert.equal(CPP.includes("observeRoot(findMountPoint())"), false);
  });

  it("bumps the generation for every customer mutation, even mid gift sync", () => {
    assert.equal(TIERED.includes("if (!processing) bumpShopperCartGen()"), false);
    assert.match(TIERED, /bumpShopperCartGen\(\);/);
  });

  it("revalidates the plan immediately before a gift add", () => {
    assert.match(TIERED, /function planStillValid/);
    assert.match(TIERED, /if \(!planStillValid\(\)\)/);
    assert.match(TIERED, /function reconcileAfterGiftMutation/);
  });

  it("refuses to plan gift work from a predicted cart", () => {
    assert.match(TIERED, /cart\._partial[\s\S]{0,120}partial-cart/);
  });

  it("clears the gift-unavailable latch so a 422 is not permanent", () => {
    assert.match(TIERED, /giftUnavailable = false;/);
  });

  it("restores natively hidden Dawn controls when a row stops being a gift", () => {
    assert.match(CPP, /function restoreGiftControls/);
    assert.match(CPP, /data-fgpb-hid/);
    assert.match(CPP, /restoreGiftControls\(row\);/);
  });

  it("identifies gifts by confirmed line key, never by variant id alone", () => {
    assert.equal(CPP.includes("uniqueGiftVids"), false);
  });

  it("no longer injects a synthetic gift row into the drawer", () => {
    assert.equal(CPP.includes('row.className = "fgpb-optimistic-gift"'), false);
  });
});
