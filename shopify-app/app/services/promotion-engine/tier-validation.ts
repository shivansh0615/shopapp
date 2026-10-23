import { currentThresholdLimit } from "../../lib/plan-tier-allowance";

/**
 * Server-side validation for Tiered Free Gifts payloads.
 * Prefers explicit rejection over silently rewriting merchant input.
 */

export type TierInput = {
  id?: string | null;
  threshold: number;
  giftProductId?: string | null;
  giftProductTitle?: string | null;
  giftProductImage?: string | null;
  giftVariantId: string;
  position: number;
};

export type ValidatedTier = {
  id?: string;
  threshold: number;
  giftProductId: string | null;
  giftProductTitle: string | null;
  giftProductImage: string | null;
  giftVariantId: string;
  position: number;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Validates and returns ordered tiers (by position ascending).
 * Rejects: empty, zero/negative thresholds, missing variants, non-strictly-increasing
 * thresholds, duplicate thresholds, duplicate ids, invalid positions.
 */
export function validateTieredFreeGiftTiers(raw: unknown): ValidatedTier[] {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw new Error("Tiered Free Gifts requires at least one tier.");
  }
  const limit = currentThresholdLimit();
  if (raw.length > limit) {
    throw new Error(`A campaign can have at most ${limit} thresholds.`);
  }

  const parsed: ValidatedTier[] = [];
  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Tier ${i + 1} is malformed.`);
    }
    const record = entry as Record<string, unknown>;
    const threshold = Number(record.threshold);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new Error(`Tier ${i + 1} threshold must be greater than 0.`);
    }
    const giftVariantId = String(record.giftVariantId || "").trim();
    if (!giftVariantId) {
      throw new Error(`Tier ${i + 1} requires a gift variant.`);
    }
    const position = Number(record.position);
    if (!Number.isFinite(position) || !Number.isInteger(position) || position < 0) {
      throw new Error(`Tier ${i + 1} position is invalid.`);
    }
    if (seenPositions.has(position)) {
      throw new Error("Duplicate tier positions are not allowed.");
    }
    seenPositions.add(position);

    const idRaw = record.id != null ? String(record.id).trim() : "";
    if (idRaw) {
      if (seenIds.has(idRaw)) {
        throw new Error("Duplicate tier IDs are not allowed.");
      }
      seenIds.add(idRaw);
    }

    parsed.push({
      id: idRaw || undefined,
      threshold: Math.round(threshold * 100) / 100,
      giftProductId: record.giftProductId != null ? String(record.giftProductId).trim() || null : null,
      giftProductTitle:
        record.giftProductTitle != null ? String(record.giftProductTitle).trim() || null : null,
      giftProductImage:
        record.giftProductImage != null ? String(record.giftProductImage).trim() || null : null,
      giftVariantId,
      position,
    });
  }

  parsed.sort((a, b) => a.position - b.position);

  // Positions should be contiguous 0..n-1 after sort (merchant UI uses 0-based).
  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i]!.position !== i) {
      throw new Error("Tier positions must be contiguous starting at 0.");
    }
  }

  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1]!;
    const curr = parsed[i]!;
    if (toCents(curr.threshold) <= toCents(prev.threshold)) {
      throw new Error("Tier thresholds must be strictly increasing.");
    }
  }

  return parsed;
}

/** Parse tiers JSON from form field `rewardTiers`. */
export function parseRewardTiersFormField(formData: FormData): ValidatedTier[] {
  const raw = String(formData.get("rewardTiers") || "").trim();
  if (!raw) {
    throw new Error("Tiered Free Gifts requires at least one tier.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Tier payload is malformed.");
  }
  return validateTieredFreeGiftTiers(parsed);
}
