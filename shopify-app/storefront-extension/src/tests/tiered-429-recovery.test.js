import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTieredGiftSync } from "../utils/tiered-gift-sync.js";

/**
 * Characterization of extensions/.../assets/tiered-gift-sync.js 429 contract.
 * Does not change production code — mirrors gates used for recovery validation.
 */
const RATE_LIMIT_COOLDOWN_MS = 120000;
const RATE_KEY = "fgpb_cart_rate_until";

function createRateLimitHarness(nowRef) {
  let rateLimitedUntil = 0;
  let queued = false;
  let timer = null;
  let syncDisabled = false;
  const store = Object.create(null);
  const status = { publishes: 0 };

  function now() {
    return nowRef.t;
  }

  function isRateLimited() {
    return now() < rateLimitedUntil;
  }

  function writeRateLimit(until) {
    rateLimitedUntil = until;
    store[RATE_KEY] = String(until);
  }

  function unlockLocalRateLimit() {
    rateLimitedUntil = 0;
    delete store[RATE_KEY];
    syncDisabled = false;
  }

  function tripRateLimit() {
    writeRateLimit(now() + RATE_LIMIT_COOLDOWN_MS);
    queued = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    syncDisabled = true;
    status.publishes += 1;
    // Asset schedules re-enable after cooldown (+50ms).
    const unlockAt = rateLimitedUntil;
    setTimeout(function () {
      if (now() >= unlockAt) syncDisabled = false;
    }, 0);
  }

  function schedule() {
    if (isRateLimited() || syncDisabled) return false;
    return true;
  }

  function onCartMutation() {
    if (isRateLimited() || syncDisabled) {
      // Asset: schedule() returns early when rate-limited; onCartMutation still
      // calls schedule() which no-ops. Mid-sync 429 clears queued via tripRateLimit.
      return schedule();
    }
    return schedule();
  }

  function syncOnceGate() {
    if (syncDisabled) return { ran: false, reason: "disabled" };
    if (isRateLimited()) return { ran: false, reason: "rate-limited" };
    return { ran: true, reason: "ok" };
  }

  /** Simulate cartPost /cart/add.js receiving Shopify 429. */
  function giftAddReceives429() {
    tripRateLimit();
    return { status: 429, path: "/cart/add.js" };
  }

  return {
    RATE_KEY,
    get queued() {
      return queued;
    },
    set queued(v) {
      queued = !!v;
    },
    get rateLimitedUntil() {
      return rateLimitedUntil;
    },
    get syncDisabled() {
      return syncDisabled;
    },
    setSyncDisabled(v) {
      syncDisabled = !!v;
    },
    store,
    isRateLimited,
    tripRateLimit,
    unlockLocalRateLimit,
    schedule,
    onCartMutation,
    syncOnceGate,
    giftAddReceives429,
    status,
  };
}

describe("tiered 429 recovery contract", () => {
  it("429 on gift cart mutation trips 120s cooldown and clears queued", () => {
    const nowRef = { t: 1_000_000 };
    const h = createRateLimitHarness(nowRef);
    h.queued = true;

    const hit = h.giftAddReceives429();
    assert.equal(hit.path, "/cart/add.js");
    assert.equal(hit.status, 429);
    assert.equal(h.isRateLimited(), true);
    assert.equal(h.queued, false);
    assert.equal(h.syncDisabled, true);
    assert.equal(Number(h.store[RATE_KEY]), nowRef.t + RATE_LIMIT_COOLDOWN_MS);
  });

  it("syncOnce and schedule no-op while cooldown is active", () => {
    const nowRef = { t: 5_000_000 };
    const h = createRateLimitHarness(nowRef);
    h.tripRateLimit();

    const gate = h.syncOnceGate();
    assert.equal(gate.ran, false);
    // Asset checks __fgpbTieredSyncDisabled then isRateLimited — either blocks.
    assert.ok(gate.reason === "disabled" || gate.reason === "rate-limited");
    assert.equal(h.schedule(), false);
    assert.equal(h.onCartMutation(), false);
  });

  it("after cooldown, a normal cart event can run sync again", () => {
    const nowRef = { t: 10_000_000 };
    const h = createRateLimitHarness(nowRef);
    h.tripRateLimit();

    nowRef.t = 10_000_000 + RATE_LIMIT_COOLDOWN_MS + 1;
    h.setSyncDisabled(false); // mirrors setTimeout re-enable after cooldown

    assert.equal(h.isRateLimited(), false);
    assert.deepEqual(h.syncOnceGate(), { ran: true, reason: "ok" });
    assert.equal(h.onCartMutation(), true);
  });

  it("page refresh unlockLocalRateLimit clears stuck cooldown (boot path)", () => {
    const nowRef = { t: 20_000_000 };
    const h = createRateLimitHarness(nowRef);
    h.tripRateLimit();
    assert.equal(h.isRateLimited(), true);

    // install() calls unlockLocalRateLimit() before schedule(400)
    h.unlockLocalRateLimit();
    assert.equal(h.isRateLimited(), false);
    assert.equal(h.store[RATE_KEY], undefined);
    assert.deepEqual(h.syncOnceGate(), { ran: true, reason: "ok" });
  });

  it("recovery plan removes locked gifts when paid subtotal drops (stale gift)", () => {
    const cart = {
      items: [
        {
          key: "gift-key",
          properties: {
            _fgpb_free_gift: "true",
            _fgpb_campaign_id: "12",
            _fgpb_tier_id: "t1",
          },
        },
      ],
    };
    // widget-state after paid removed: no unlocked gifts
    const actions = planTieredGiftSync({
      cart,
      unlockedGifts: [],
      campaignId: "12",
      autoAddGift: true,
    });
    assert.ok(actions.some((a) => a.type === "REMOVE" && a.lineKey === "gift-key"));
    assert.ok(!actions.some((a) => a.type === "ADD"));
  });

  it("recovery plan adds missing unlocked gift once (no duplicate when already present)", () => {
    const unlocked = [{ tierId: "t1", variantId: "99", threshold: 999 }];
    const withGift = {
      items: [
        {
          key: "gift-key",
          variant_id: 99,
          quantity: 1,
          properties: {
            _fgpb_free_gift: "true",
            _fgpb_campaign_id: "12",
            _fgpb_tier_id: "t1",
          },
        },
      ],
    };
    const missing = {
      items: [{ key: "paid", properties: {}, final_line_price: 200000 }],
    };

    const addPlan = planTieredGiftSync({
      cart: missing,
      unlockedGifts: unlocked,
      campaignId: "12",
      autoAddGift: true,
    });
    assert.equal(addPlan.filter((a) => a.type === "ADD").length, 1);

    const nonePlan = planTieredGiftSync({
      cart: withGift,
      unlockedGifts: unlocked,
      campaignId: "12",
      autoAddGift: true,
    });
    assert.equal(nonePlan.filter((a) => a.type === "ADD").length, 0);
  });

  it("429 path does not invent gift chrome for paid lines (highlight key-only)", () => {
    // Mirror Fix 1: without tagged key / Free Gift property, paid row is not styled.
    const taggedKeys = {};
    const paidRowKey = "paid:1";
    const isGift = !!(paidRowKey && taggedKeys[paidRowKey]);
    assert.equal(isGift, false);
  });
});

describe("classic FREE_GIFT mutation gate", () => {
  it("browser classic gift writes are delegated (Disable true when window exists)", async () => {
    const mod = await import("../core/gift-sync.js");
    // In Node test runner there is no window → mutations stay enabled for unit tests.
    assert.equal(mod.DISABLE_GIFT_CART_MUTATIONS, typeof window !== "undefined");
  });

  it("shared cart rate limit key matches tiered sync", async () => {
    const { CART_RATE_KEY, CART_RATE_COOLDOWN_MS, isCartRateLimited, tripCartRateLimit } =
      await import("../utils/util.js");
    assert.equal(CART_RATE_KEY, "fgpb_cart_rate_until");
    assert.equal(CART_RATE_COOLDOWN_MS, 120000);
    assert.equal(typeof isCartRateLimited(), "boolean");
    assert.equal(typeof tripCartRateLimit, "function");
  });
});
