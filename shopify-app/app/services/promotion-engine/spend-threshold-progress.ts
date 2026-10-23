/**
 * Shared spend-threshold progress (integer minor units via money helpers).
 * Used by Free Gift and Percentage Discount evaluators — do not duplicate.
 *
 * Transient major-unit inputs (proxy cartSubtotal, legacy Float thresholds) are
 * converted with the documented legacy/transient HALF_UP policy.
 */

import type { PromotionProgress } from "./types";
import {
  DEFAULT_SHOP_CURRENCY,
  fromTransientMajorNumber,
  moneyToMajorNumber,
} from "../../lib/money";

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/**
 * Convert major-unit amount to integer minor units for the shop currency.
 * Prefer passing an explicit currencyCode when known (defaults INR).
 */
export function toCents(amount: number, currencyCode: string = DEFAULT_SHOP_CURRENCY): number {
  const money = fromTransientMajorNumber(Math.max(0, amount), currencyCode);
  const asNumber = Number(money.amountMinor);
  if (!Number.isSafeInteger(asNumber)) {
    throw new Error("Money minor units exceed safe integer range.");
  }
  return asNumber;
}

/**
 * Spend-threshold progress using integer minor units — aligned with
 * storefront-extension `buildLocalEvaluation()` for two-decimal shop currencies.
 */
export function buildSpendThresholdProgress(
  subtotal: number,
  threshold: number,
  currencyCode: string = DEFAULT_SHOP_CURRENCY,
): { progress: PromotionProgress; eligible: boolean; metric: number } {
  const paid = fromTransientMajorNumber(Math.max(0, subtotal), currencyCode);
  const th = fromTransientMajorNumber(Math.max(0, threshold), currencyCode);
  if (th.amountMinor <= 0n) {
    return {
      eligible: false,
      metric: Math.max(0, subtotal),
      progress: {
        current: Math.max(0, subtotal),
        target: Math.max(0, threshold),
        remaining: 0,
        percentage: 0,
        unlocked: false,
      },
    };
  }

  const remainingMinor =
    th.amountMinor > paid.amountMinor ? th.amountMinor - paid.amountMinor : 0n;
  const remaining = moneyToMajorNumber({
    amountMinor: remainingMinor,
    currencyCode: paid.currencyCode,
    minorUnit: paid.minorUnit,
  });
  const percentage = clampPercentage(
    (Number(paid.amountMinor) / Number(th.amountMinor)) * 100,
  );
  const eligible = paid.amountMinor >= th.amountMinor;
  const current = moneyToMajorNumber(paid);
  const target = moneyToMajorNumber(th);
  return {
    eligible,
    metric: current,
    progress: {
      current,
      target,
      remaining,
      percentage,
      unlocked: eligible,
    },
  };
}

export function buildProgress(
  current: number,
  target: number,
  unlocked: boolean,
): PromotionProgress {
  const safeTarget = Math.max(0, target);
  const safeCurrent = Math.max(0, current);
  const remaining = Math.max(safeTarget - safeCurrent, 0);
  const percentage =
    safeTarget > 0 ? clampPercentage((safeCurrent / safeTarget) * 100) : 0;
  return {
    current: safeCurrent,
    target: safeTarget,
    remaining,
    percentage,
    unlocked,
  };
}
