/**
 * Authoritative discount postcondition for tagged gift lines (build 138).
 *
 * Mirroring the Discount Function's configuration is necessary but not
 * sufficient: storefront config and function config can drift, and only the
 * confirmed Shopify cart proves what a shopper will actually be charged. So the
 * final gate is evidence-based — a tagged line may remain only if the
 * authoritative cart shows it fully discounted for its whole quantity.
 *
 * The tag `_fgpb_free_gift` is never treated as proof of anything.
 *
 * Pure module: no DOM, no fetch, no globals.
 */
import { isTaggedGift, lineCampaignId, lineTierId } from "./cart-coordinator.js";

export const FREE_GIFT_REWARD = "FREE_GIFT";
export const TIERED_FREE_GIFTS_REWARD = "TIERED_FREE_GIFTS";

export const VIOLATION = Object.freeze({
  MISSING_CAMPAIGN_ID: "missing-campaign-id",
  UNKNOWN_CAMPAIGN: "campaign-not-in-config",
  MISSING_TIER_ID: "missing-tier-id",
  UNKNOWN_TIER: "tier-not-in-campaign",
  VARIANT_NOT_ALLOWED: "variant-not-allowed",
  ELIGIBILITY_LOST: "eligibility-lost",
  QUANTITY_ABOVE_CAP: "quantity-above-cap",
  NOT_FULLY_DISCOUNTED: "not-fully-discounted",
});

export const ACTION = Object.freeze({
  KEEP: "KEEP",
  NORMALIZE: "NORMALIZE",
  REMOVE: "REMOVE",
});

/** Why a kept line is considered free. Recorded so the two are never conflated. */
export const EVIDENCE = Object.freeze({
  DISCOUNT_CONFIRMED: "discount-confirmed",
  INTRINSICALLY_ZERO: "intrinsically-zero",
});

function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function thresholdCents(threshold) {
  if (!threshold) return 0;
  const amount = Number(
    typeof threshold === "object" ? threshold.amount : threshold,
  );
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function normalizeVariantId(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  const tail = raw.split("/").pop();
  return String(tail || "").trim();
}

function lineVariantId(line) {
  return normalizeVariantId(line && (line.variant_id != null ? line.variant_id : line.id));
}

export function lineKeyOf(line) {
  return String((line && (line.key || line.id)) || "");
}

// This module deliberately re-normalizes rather than trusting a caller's
// helper: a whitespace-only id must read as absent, not as an unknown campaign.
function campaignIdOf(line) {
  return String(lineCampaignId(line) || "").trim();
}

function tierIdOf(line) {
  return String(lineTierId(line) || "").trim();
}

/** Mirrors the function: tagged lines never count toward their own threshold. */
export function qualifyingCentsOf(cart) {
  const items = (cart && cart.items) || [];
  let sum = 0;
  for (const item of items) {
    if (isTaggedGift(item.properties)) continue;
    const line =
      item.final_line_price != null ? item.final_line_price : item.line_price;
    const cents = Number(line);
    if (Number.isFinite(cents)) sum += cents;
  }
  return sum;
}

export function findCampaignConfig(config, campaignId) {
  const want = String(campaignId == null ? "" : campaignId).trim();
  if (!want) return null;
  const campaigns = (config && config.activeCampaigns) || [];
  for (const campaign of campaigns) {
    if (campaign && String(campaign.campaignId).trim() === want) return campaign;
  }
  return null;
}

/**
 * Exact, normalized titles our own automatic discount is provisioned under.
 *
 * Deliberately not substring matching: "Free Gift Friday" must stay foreign.
 * Entries are added only from live evidence that Shopify actually surfaces them.
 * Cart.js exposes the Function candidate message ("FREE GIFT") rather than the
 * Admin node title; both are ours after normalizeDiscountTitle.
 */
export const OUR_DISCOUNT_TITLES = Object.freeze([
  "upselltrix free gift",
  "free gift progress bar - campaign rewards",
  "FREE GIFT",
]);

/** Application types our discount can legitimately arrive as. */
export const OUR_APPLICATION_TYPES = Object.freeze(["automatic"]);

/** Fold case, whitespace and dash variants so an em dash cannot break matching. */
export function normalizeDiscountTitle(value) {
  let text = String(value == null ? "" : value);
  if (typeof text.normalize === "function") text = text.normalize("NFKC");
  return text
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function applicationOf(allocation) {
  if (!allocation || typeof allocation !== "object") return null;
  return allocation.discount_application || allocation.discountApplication || null;
}

/**
 * Attribute one allocation to a source.
 *
 * Only "ours" validates a gift. "unknown" and "foreign" both fail closed:
 * removing a legitimate promotional gift is safer than letting a possibly
 * charged "free gift" reach checkout. A title we recognise arriving under an
 * unexpected application type is treated as foreign, not ours — an automatic
 * discount and a discount code are not interchangeable evidence.
 */
export function attributeAllocation(
  allocation,
  titles = OUR_DISCOUNT_TITLES,
  applicationTypes = OUR_APPLICATION_TYPES,
) {
  const app = applicationOf(allocation);
  const title = normalizeDiscountTitle(app && (app.title || app.description));
  if (!title) return "unknown";
  const known = titles.some((entry) => normalizeDiscountTitle(entry) === title);
  if (!known) return "foreign";
  const type = normalizeDiscountTitle(app && app.type);
  if (type && !applicationTypes.some((entry) => normalizeDiscountTitle(entry) === type)) {
    return "foreign";
  }
  return "ours";
}

/**
 * What the authoritative cart says about this line's price, independent of any
 * tag we wrote. `fullyFree` is the only thing callers should trust.
 *
 * A foreign discount covering the line does not prove our gift is free: it can
 * be removed by the shopper, leaving a charged "free gift" behind.
 */
export function discountEvidence(
  line,
  {
    titles = OUR_DISCOUNT_TITLES,
    applicationTypes = OUR_APPLICATION_TYPES,
    allowIntrinsicallyZero = true,
  } = {},
) {
  const originalLinePrice = toCents(
    line && (line.original_line_price != null ? line.original_line_price : line.line_price),
  );
  const finalLinePrice = toCents(line && line.final_line_price);
  const originalUnitPrice = toCents(
    line && (line.original_price != null ? line.original_price : line.price),
  );
  const finalUnitPrice = toCents(line && (line.final_price != null ? line.final_price : line.price));
  const allocations = Array.isArray(line && line.line_level_discount_allocations)
    ? line.line_level_discount_allocations
    : [];

  let allocatedCents = 0;
  let attributedCents = 0;
  let foreignCents = 0;
  let unknownCents = 0;
  for (const allocation of allocations) {
    const amount = toCents(allocation && allocation.amount);
    allocatedCents += amount;
    const source = attributeAllocation(allocation, titles, applicationTypes);
    if (source === "ours") attributedCents += amount;
    else if (source === "foreign") foreignCents += amount;
    else unknownCents += amount;
  }

  // The zero-price exception, and the only case where an absent allocation is
  // acceptable. Every authoritative amount on the line — unit and line, original
  // and final — must be zero, so there is nothing for a discount to cover and
  // nothing a shopper could uncover by removing one.
  const intrinsicallyZero =
    allowIntrinsicallyZero &&
    originalUnitPrice === 0 &&
    finalUnitPrice === 0 &&
    originalLinePrice === 0 &&
    finalLinePrice === 0;

  const discountConfirmed =
    originalLinePrice > 0 && finalLinePrice === 0 && attributedCents >= originalLinePrice;

  return {
    originalLinePrice,
    finalLinePrice,
    originalUnitPrice,
    finalUnitPrice,
    allocatedCents,
    attributedCents,
    foreignCents,
    unknownCents,
    allocationCount: allocations.length,
    residualChargedCents: finalLinePrice,
    attributedToUs: attributedCents > 0,
    coveredByForeignDiscountOnly:
      finalLinePrice === 0 && foreignCents > 0 && attributedCents < originalLinePrice,
    coveredByUnknownDiscountOnly:
      finalLinePrice === 0 && unknownCents > 0 && attributedCents < originalLinePrice,
    intrinsicallyZero,
    discountConfirmed,
    evidenceKind: discountConfirmed
      ? EVIDENCE.DISCOUNT_CONFIRMED
      : intrinsicallyZero
        ? EVIDENCE.INTRINSICALLY_ZERO
        : null,
    fullyFree: intrinsicallyZero || discountConfirmed,
  };
}

/**
 * The single gate the UI must consult before rendering FREE. Presentation may
 * never run ahead of authoritative zero-price evidence.
 */
export function canRenderFree(line, options) {
  if (!isTaggedGift(line && line.properties)) return false;
  return discountEvidence(line, options).fullyFree;
}

/**
 * Desired quantity for a tagged line under its campaign, or null when the
 * campaign/variant/eligibility checks disqualify it outright.
 */
function desiredQuantityFor(line, campaign, qualifying) {
  const variantId = lineVariantId(line);

  if (campaign.rewardType === TIERED_FREE_GIFTS_REWARD) {
    const tierId = tierIdOf(line);
    if (!tierId) return { reason: VIOLATION.MISSING_TIER_ID };
    const tier = (campaign.tiers || []).find((t) => t && String(t.tierId) === tierId);
    if (!tier) return { reason: VIOLATION.UNKNOWN_TIER };
    if (normalizeVariantId(tier.giftVariantId) !== variantId) {
      return { reason: VIOLATION.VARIANT_NOT_ALLOWED };
    }
    if (qualifying < thresholdCents(tier.threshold)) {
      return { reason: VIOLATION.ELIGIBILITY_LOST };
    }
    return { desired: 1 };
  }

  const allowed = (campaign.giftVariantIds || []).map(normalizeVariantId);
  if (!variantId || !allowed.includes(variantId)) {
    return { reason: VIOLATION.VARIANT_NOT_ALLOWED };
  }
  if (qualifying < thresholdCents(campaign.threshold)) {
    return { reason: VIOLATION.ELIGIBILITY_LOST };
  }
  const cap = Number(campaign.maxGiftQuantity);
  return { desired: Number.isFinite(cap) && cap > 0 ? Math.trunc(cap) : 1 };
}

/**
 * Audit one tagged line. Conditions run in the order the spec lists them, so a
 * fixable quantity is normalized rather than removed: the follow-up pass then
 * re-checks the discount against the corrected line.
 *
 * `finalAttempt` controls only the discount postcondition. A line that looks
 * undiscounted is deferrable once, because the evidence may simply not have
 * been re-read yet; on the final attempt it is removed rather than shipped to
 * checkout as a paid "free gift".
 */
export function auditTaggedLine(line, { config, qualifyingCents, finalAttempt = true } = {}) {
  if (!isTaggedGift(line && line.properties)) return null;

  const key = lineKeyOf(line);
  const quantity = Math.max(0, Math.trunc(Number(line.quantity) || 0));
  const remove = (reason) => ({
    lineKey: key,
    action: ACTION.REMOVE,
    quantity: 0,
    reasons: [reason],
    deferrable: false,
  });

  const campaignId = campaignIdOf(line);
  if (!campaignId) return remove(VIOLATION.MISSING_CAMPAIGN_ID);

  const campaign = findCampaignConfig(config, campaignId);
  if (!campaign) return remove(VIOLATION.UNKNOWN_CAMPAIGN);

  const desiredResult = desiredQuantityFor(line, campaign, qualifyingCents);
  if (desiredResult.reason) return remove(desiredResult.reason);

  const desired = desiredResult.desired;
  if (desired <= 0) return remove(VIOLATION.ELIGIBILITY_LOST);
  if (quantity > desired) {
    return {
      lineKey: key,
      action: ACTION.NORMALIZE,
      quantity: desired,
      reasons: [VIOLATION.QUANTITY_ABOVE_CAP],
      deferrable: false,
    };
  }

  const evidence = discountEvidence(line);
  if (!evidence.fullyFree) {
    return {
      lineKey: key,
      action: finalAttempt ? ACTION.REMOVE : ACTION.KEEP,
      quantity: 0,
      reasons: [VIOLATION.NOT_FULLY_DISCOUNTED],
      deferrable: !finalAttempt,
      evidence,
    };
  }

  return {
    lineKey: key,
    action: ACTION.KEEP,
    quantity,
    reasons: [],
    deferrable: false,
    evidenceKind: evidence.evidenceKind,
    evidence,
  };
}

/**
 * Audit every tagged line in a confirmed cart. Untagged lines are never
 * touched, so a paid line sharing a SKU with the gift is structurally safe.
 */
export function auditCart({ cart, config, finalAttempt = true } = {}) {
  const items = (cart && cart.items) || [];
  const qualifyingCents = qualifyingCentsOf(cart);
  const audits = [];
  const actions = [];
  const violations = [];

  for (const item of items) {
    const audit = auditTaggedLine(item, { config, qualifyingCents, finalAttempt });
    if (!audit) continue;
    audits.push(audit);
    if (audit.reasons.length) violations.push(...audit.reasons);
    if (audit.action === ACTION.REMOVE || audit.action === ACTION.NORMALIZE) {
      actions.push({
        type: audit.action,
        lineKey: audit.lineKey,
        quantity: audit.quantity,
        reasons: audit.reasons,
      });
    }
  }

  const deferred = audits.some((a) => a.deferrable);
  return {
    qualifyingCents,
    audits,
    actions,
    violations,
    deferred,
    // The stable invariant: every remaining tagged gift is fully free for its
    // full quantity, and nothing is pending.
    safe: actions.length === 0 && !deferred,
  };
}

/** Preconditions that must all hold before a gift may be POSTed. */
export function validateGiftAddition({
  campaignId,
  variantId,
  config,
  cart,
  plannedGeneration = null,
  currentGeneration = null,
} = {}) {
  const reasons = [];

  const id = String(campaignId == null ? "" : campaignId).trim();
  if (!id) reasons.push(VIOLATION.MISSING_CAMPAIGN_ID);

  const campaign = id ? findCampaignConfig(config, id) : null;
  if (id && !campaign) reasons.push(VIOLATION.UNKNOWN_CAMPAIGN);

  if (campaign) {
    const wanted = normalizeVariantId(variantId);
    const allowed =
      campaign.rewardType === TIERED_FREE_GIFTS_REWARD
        ? (campaign.tiers || []).map((t) => normalizeVariantId(t && t.giftVariantId))
        : (campaign.giftVariantIds || []).map(normalizeVariantId);
    if (!wanted || !allowed.includes(wanted)) reasons.push(VIOLATION.VARIANT_NOT_ALLOWED);
  }

  if (cart && cart._partial) reasons.push("partial-cart");
  if (
    plannedGeneration != null &&
    currentGeneration != null &&
    Number(plannedGeneration) !== Number(currentGeneration)
  ) {
    reasons.push("generation-superseded");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Bounded confirm-and-correct cycle.
 *
 * Reads the authoritative cart, audits it, applies removals/normalizations, and
 * re-reads. It never loops indefinitely: once the attempt budget is spent it
 * records a diagnostic failure and settles, leaving Dawn's native cart intact
 * rather than fighting the server.
 */
export function createGiftSafetyReconciler({
  fetchCart,
  applyActions,
  getConfig,
  note = () => {},
  // Extra authoritative re-reads allowed purely to let Shopify's allocation
  // appear. A newly activated campaign often needs several reads. Faults that
  // are already provable (campaign, variant, eligibility, quantity) never
  // consume this — they are corrected on the first read.
  discountGraceReads = 4,
  // Optional pause between those discount re-reads. Tests pass a no-op.
  wait = async () => {},
  // How many times we may apply corrections and re-verify.
  maxCorrectionRounds = 2,
} = {}) {
  if (typeof fetchCart !== "function") throw new TypeError("fetchCart is required");
  if (typeof applyActions !== "function") throw new TypeError("applyActions is required");

  let running = false;

  async function settle() {
    if (running) return { ok: false, busy: true };
    running = true;

    const applied = [];
    let reads = 0;
    let graceUsed = 0;
    let rounds = 0;
    const maxReads = maxCorrectionRounds + discountGraceReads + 2;

    const readAndAudit = async () => {
      reads += 1;
      // Always the authoritative cart. A mutation response is never evidence:
      // the allocation may not be present in it yet.
      const cart = await fetchCart();
      const config = typeof getConfig === "function" ? getConfig() : getConfig;
      const audit = auditCart({ cart, config, finalAttempt: graceUsed >= discountGraceReads });
      note("gift-safety-audit", {
        read: reads,
        graceUsed,
        round: rounds,
        violations: audit.violations,
        actions: audit.actions.map((a) => ({ type: a.type, lineKey: a.lineKey })),
        safe: audit.safe,
      });
      return audit;
    };

    try {
      let audit = null;

      while (reads < maxReads) {
        audit = await readAndAudit();
        if (audit.safe) {
          return { ok: true, reads, graceUsed, rounds, applied, violations: [] };
        }

        // Only the discount postcondition is unproven at this point. Wait and
        // re-read rather than removing a gift that is about to settle.
        if (!audit.actions.length && audit.deferred) {
          if (graceUsed >= discountGraceReads) break;
          graceUsed += 1;
          note("gift-safety-grace", { read: reads, graceUsed });
          await wait(graceUsed);
          continue;
        }

        if (rounds >= maxCorrectionRounds) break;
        rounds += 1;
        await applyActions(audit.actions);
        applied.push(...audit.actions);
      }

      // Budget spent. One last authoritative read decides the outcome.
      graceUsed = discountGraceReads;
      const final = await readAndAudit();
      if (final.safe) {
        return { ok: true, reads, graceUsed, rounds, applied, violations: [] };
      }

      note("gift-safety-failed", {
        reads,
        rounds,
        violations: final.violations,
        remaining: final.actions.map((a) => ({ type: a.type, lineKey: a.lineKey })),
      });
      return {
        ok: false,
        gaveUp: true,
        reads,
        graceUsed,
        rounds,
        applied,
        violations: final.violations,
      };
    } finally {
      running = false;
    }
  }

  return { settle };
}
