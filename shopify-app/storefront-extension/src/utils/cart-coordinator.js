/**
 * One serialized cart coordinator for UpsellTrix-owned work.
 *
 * Correctness order enforced here:
 *   1. Shopify's confirmed cart is the only source of truth.
 *   2. Customer mutations always win over promotion work.
 *   3. A gift mutation may only run against the newest confirmed cart.
 *
 * Pure logic only — no DOM, no fetch. The storefront asset
 * (extensions/.../assets/fgpb-runtime.js) wires this to the browser.
 */

export const FREE_GIFT_KEY = "_fgpb_free_gift";
export const CAMPAIGN_KEY = "_fgpb_campaign_id";
export const TIER_KEY = "_fgpb_tier_id";

/** Mutation origin. Only `customer` may invalidate promotion work. */
export const ORIGIN = Object.freeze({
  CUSTOMER: "customer",
  GIFT_SYNC: "gift-sync",
  RECOVERY: "recovery",
});

/** Isolation stages for the live diagnostic matrix. */
export const STAGE = Object.freeze({
  OFF: 0,
  CONFIG_ONLY: 1,
  PROGRESS_READONLY: 2,
  PASSIVE_RECOVERY: 3,
  GIFT_DRY_RUN: 4,
  GIFT_LIVE: 5,
});

/**
 * Production default. Stage 5 mutates the cart when a gift is eligible.
 * Stages 0–4 remain available as explicit query overrides. Persistent browser
 * storage is intentionally ignored so diagnostics cannot disable gifts later.
 */
export const DEFAULT_STAGE = STAGE.GIFT_LIVE;

export function resolveStage({ search = "", storage = null, fallback = DEFAULT_STAGE } = {}) {
  const fromQuery = readStageValue(parseQueryParam(search, "fgpb_stage"));
  if (fromQuery != null) return fromQuery;
  void storage;
  return clampStage(fallback);
}

function readStageValue(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampStage(n);
}

function clampStage(n) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_STAGE;
  if (v < STAGE.OFF) return STAGE.OFF;
  if (v > STAGE.GIFT_LIVE) return STAGE.GIFT_LIVE;
  return v;
}

export function parseQueryParam(search, key) {
  const s = String(search || "");
  const m = s.match(new RegExp("[?&]" + key + "=([^&#]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Capability flags derived from one stage number. */
export function flagsForStage(stage) {
  const s = clampStage(stage);
  return Object.freeze({
    stage: s,
    // Any UpsellTrix storefront behaviour at all.
    enabled: s > STAGE.OFF,
    // Read the confirmed cart / campaign config.
    readCart: s >= STAGE.CONFIG_ONLY,
    // Paint the progress surface.
    renderProgress: s >= STAGE.PROGRESS_READONLY,
    // Re-mount the owned progress host after Dawn replaces the drawer.
    progressRecovery: s >= STAGE.PASSIVE_RECOVERY,
    // Evaluate gift eligibility and build a plan.
    evaluateGifts: s >= STAGE.GIFT_DRY_RUN,
    // Actually POST gift add/remove.
    mutateGifts: s >= STAGE.GIFT_LIVE,
    // Predicted (unconfirmed) cart may paint progress.
    optimisticPaint: s >= STAGE.GIFT_LIVE,
    // Recommendations surface.
    recommendations: s >= STAGE.GIFT_LIVE,
  });
}

export function isTaggedGift(props) {
  if (!props || typeof props !== "object" || Array.isArray(props)) return false;
  const flag = props[FREE_GIFT_KEY];
  return flag === "true" || flag === true;
}

export function lineCampaignId(item) {
  const raw = item && item.properties && item.properties[CAMPAIGN_KEY];
  return raw == null || raw === "" ? "" : String(raw);
}

export function lineTierId(item) {
  const raw = item && item.properties && item.properties[TIER_KEY];
  return raw == null || raw === "" ? "" : String(raw);
}

/**
 * Deterministic fingerprint of the promotion-relevant cart state.
 * Sorted by line key so DOM order can never influence it.
 */
export function cartFingerprint(cart) {
  if (!cart || typeof cart !== "object") return "none";
  const items = Array.isArray(cart.items) ? cart.items : [];
  const parts = items
    .map((item) => {
      const key = String(item.key != null ? item.key : "");
      const vid = String(item.variant_id != null ? item.variant_id : item.id != null ? item.id : "");
      const qty = Number(item.quantity) || 0;
      const line = Number(
        item.final_line_price != null
          ? item.final_line_price
          : item.line_price != null
            ? item.line_price
            : 0,
      );
      const gift = isTaggedGift(item.properties) ? 1 : 0;
      return [key, vid, qty, line, gift, lineCampaignId(item), lineTierId(item)].join(":");
    })
    .sort();
  return [
    String(cart.token || ""),
    String(cart.currency || ""),
    String(Number(cart.item_count) || 0),
    String(Number(cart.total_price) || 0),
    parts.join(","),
  ].join("|");
}

/** Qualifying spend in cents. Tagged gift lines never count toward the threshold. */
export function qualifyingSubtotalCents(cart) {
  const items = (cart && cart.items) || [];
  let sum = 0;
  for (const item of items) {
    if (isTaggedGift(item.properties)) continue;
    let line = Number(
      item.final_line_price != null
        ? item.final_line_price
        : item.line_price != null
          ? item.line_price
          : NaN,
    );
    if (!Number.isFinite(line)) line = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    if (Number.isFinite(line)) sum += line;
  }
  return sum;
}

/**
 * Single eligibility function. Progress UI and gift reconciliation must both
 * call this so they can never disagree.
 *
 * `tiers` entries: { tierId, variantId, threshold } with threshold in MAJOR units
 * (widget-state contract). Comparison happens in cents.
 */
export function evaluateEligibility(cart, tiers, { autoAddGift = true } = {}) {
  const paidCents = qualifyingSubtotalCents(cart);
  const list = Array.isArray(tiers) ? tiers : [];
  const unlocked = [];
  for (const tier of list) {
    if (!tier) continue;
    const tierId = tier.tierId != null ? String(tier.tierId) : "";
    const variantId = tier.variantId != null ? String(tier.variantId) : "";
    if (!tierId || !variantId) continue;
    const thresholdCents = Math.round((Number(tier.threshold) || 0) * 100);
    if (thresholdCents <= 0) continue;
    if (paidCents >= thresholdCents) unlocked.push({ tierId, variantId, thresholdCents });
  }
  return { paidCents, unlocked, autoAddGift: autoAddGift !== false };
}

/**
 * Minimum mutation set: desired tagged gift lines − actual tagged gift lines.
 *
 * Never plans from a predicted cart: the caller must pass a confirmed cart.
 * Removals are always planned, even when adds are suppressed, because an
 * orphaned gift corrupts checkout while a missing gift only under-rewards.
 */
export function planGiftReconciliation({ cart, eligibility, campaignId = null, giftUnavailable = false }) {
  const actions = [];
  const items = (cart && cart.items) || [];
  const wantCampaign = campaignId == null ? "" : String(campaignId);
  const desired = new Map();
  for (const tier of (eligibility && eligibility.unlocked) || []) {
    desired.set(String(tier.tierId), String(tier.variantId));
  }

  const seenTiers = new Set();
  for (const item of items) {
    if (!isTaggedGift(item.properties)) continue;
    const lineCampaign = lineCampaignId(item);
    // A gift line from another campaign is not ours to reconcile.
    if (wantCampaign && lineCampaign && lineCampaign !== wantCampaign) continue;
    const key = item.key != null ? String(item.key) : "";
    if (!key) continue;
    const tierId = lineTierId(item);
    if (!tierId || !desired.has(tierId)) {
      actions.push({ type: "REMOVE", lineKey: key, tierId, reason: "not-eligible" });
      continue;
    }
    if (seenTiers.has(tierId)) {
      actions.push({ type: "REMOVE", lineKey: key, tierId, reason: "duplicate" });
      continue;
    }
    seenTiers.add(tierId);
    if ((Number(item.quantity) || 0) !== 1) {
      actions.push({ type: "NORMALIZE", lineKey: key, tierId, quantity: 1, reason: "quantity" });
    }
  }

  if (eligibility && eligibility.autoAddGift && !giftUnavailable) {
    for (const [tierId, variantId] of desired) {
      if (seenTiers.has(tierId)) continue;
      actions.push({
        type: "ADD",
        tierId,
        variantId,
        quantity: 1,
        properties: giftProperties(campaignId, tierId),
        reason: "eligible",
      });
    }
  }
  return actions;
}

export function giftProperties(campaignId, tierId) {
  const props = { [FREE_GIFT_KEY]: "true", _is_free_gift: "true" };
  if (campaignId != null && campaignId !== "") props[CAMPAIGN_KEY] = String(campaignId);
  if (tierId != null && tierId !== "") props[TIER_KEY] = String(tierId);
  return props;
}

/**
 * Guard evaluated immediately before every gift mutation POST — not just before
 * painting. This is what makes the delayed-orphan-gift race impossible.
 */
export function isPlanStillValid(plan, live) {
  if (!plan || !live) return false;
  if (plan.cancelled) return false;
  if (Number(live.generation) !== Number(plan.generation)) return false;
  if (String(live.fingerprint) !== String(plan.fingerprint)) return false;
  return true;
}

/**
 * After a gift ADD lands, re-check the confirmed cart. If the customer removed
 * qualifying products while the add was in flight, the add cannot be cancelled —
 * so it must be immediately undone.
 */
export function compensatingRemovals({ confirmedCart, eligibility, campaignId = null }) {
  const plan = planGiftReconciliation({
    cart: confirmedCart,
    eligibility: { ...eligibility, autoAddGift: false },
    campaignId,
  });
  return plan.filter((a) => a.type === "REMOVE");
}

/** Monotonic generation clock. Only customer mutations advance it. */
export function createGenerationClock(initial = 0) {
  let generation = Number(initial) || 0;
  return {
    get current() {
      return generation;
    },
    bump(origin) {
      if (origin !== ORIGIN.CUSTOMER) return generation;
      generation += 1;
      return generation;
    },
    isCurrent(gen) {
      return Number(gen) === generation;
    },
    isStale(gen) {
      return Number(gen) < generation;
    },
  };
}

/**
 * Serialized gift reconciler.
 *
 * - at most one reconciliation in flight
 * - a newer customer generation cancels a pending/queued plan
 * - every mutation revalidates generation + fingerprint before executing
 * - a late ADD is followed by a compensating REMOVE under the newest generation
 * - failures are bounded (single retry), never an infinite loop
 */
export function createGiftReconciler({
  clock,
  getConfirmedCart,
  getTiers,
  execute,
  campaignId = null,
  dryRun = false,
  maxRetries = 1,
  onPlan = null,
  onSkip = null,
}) {
  let running = false;
  let pendingRequest = null;
  let lastFingerprint = null;
  const log = [];

  function record(entry) {
    log.push(entry);
    return entry;
  }

  async function runOnce(attempt) {
    const cart = await getConfirmedCart();
    const generation = clock.current;
    const fingerprint = cartFingerprint(cart);
    const eligibility = evaluateEligibility(cart, getTiers(), {
      autoAddGift: true,
    });
    const actions = planGiftReconciliation({ cart, eligibility, campaignId });
    const plan = { generation, fingerprint, actions, eligibility, cancelled: false };
    if (typeof onPlan === "function") onPlan(plan);

    if (!actions.length) {
      lastFingerprint = fingerprint;
      return record({ status: "noop", generation, fingerprint, actions: [] });
    }
    if (dryRun) {
      return record({ status: "dry-run", generation, fingerprint, actions });
    }

    // Entry checkpoint: the cart must still be the one this plan was built from.
    const entry = {
      generation: clock.current,
      fingerprint: cartFingerprint(await getConfirmedCart()),
    };
    if (!isPlanStillValid(plan, entry)) {
      if (typeof onSkip === "function") onSkip({ plan, live: entry });
      return record({ status: "superseded", generation, fingerprint, applied: [], supersededBy: entry.generation });
    }

    const applied = [];
    for (const action of actions) {
      // Between actions only the generation matters: our own mutations change the
      // fingerprint by design, but a generation bump means the customer changed
      // the cart and everything we planned is void.
      if (!clock.isCurrent(plan.generation)) {
        if (typeof onSkip === "function") onSkip({ action, plan, live: { generation: clock.current } });
        return record({
          status: "superseded",
          generation,
          fingerprint,
          applied,
          supersededBy: clock.current,
        });
      }
      const result = await execute(action, { generation, origin: ORIGIN.GIFT_SYNC });
      if (result && result.ok === false) {
        if (attempt < maxRetries) return runOnce(attempt + 1);
        return record({ status: "failed", generation, fingerprint, applied, action, error: result.error });
      }
      applied.push(action);
    }

    // Late-add safety net: the cart may have changed while we were POSTing.
    const finalCart = await getConfirmedCart();
    const finalEligibility = evaluateEligibility(finalCart, getTiers(), { autoAddGift: true });
    const undo = compensatingRemovals({
      confirmedCart: finalCart,
      eligibility: finalEligibility,
      campaignId,
    });
    for (const action of undo) {
      await execute(action, { generation: clock.current, origin: ORIGIN.GIFT_SYNC });
      applied.push(action);
    }
    lastFingerprint = cartFingerprint(await getConfirmedCart());
    return record({
      status: undo.length ? "compensated" : "applied",
      generation,
      fingerprint,
      applied,
      compensated: undo.length,
    });
  }

  async function drain() {
    running = true;
    let last = null;
    try {
      while (pendingRequest) {
        pendingRequest = null;
        // eslint-disable-next-line no-await-in-loop
        last = await runOnce(0);
      }
    } finally {
      running = false;
    }
    return last;
  }

  return {
    /** Request reconciliation. Duplicate requests for the same cart coalesce. */
    request({ force = false } = {}) {
      pendingRequest = { force };
      if (running) return Promise.resolve({ status: "queued" });
      return drain();
    },
    get log() {
      return log.slice();
    },
    get lastFingerprint() {
      return lastFingerprint;
    },
    get busy() {
      return running;
    },
  };
}
