/**
 * Resolve which cart subtotal the Promotion Engine should evaluate against.
 *
 * Production storefront currently sends `eligibleSubtotal` as `cartSubtotal`
 * and does not send `cartLines`. Prefer that legacy caller value unless the
 * request includes complete line payloads with explicit prices + properties.
 *
 * When complete lines are present, the calculated qualifying subtotal is the
 * evaluation input. If the caller subtotal differs beyond one cent, the
 * calculated value is still preferred and an internal mismatch diagnostic is
 * recorded (never part of App Proxy JSON).
 *
 * Internal only — not part of the public App Proxy JSON contract.
 */

import { calculateQualifyingSubtotal } from "./qualifying-subtotal";
import type { CanonicalCartLine } from "./types";

export type SubtotalSource = "legacy_caller_subtotal" | "calculated_from_cart_lines";

/** Internal diagnostic codes for subtotal resolution (not public API). */
export type SubtotalDiagnosticCode = "SUBTOTAL_CALLER_MISMATCH";

export type SubtotalDiagnostic = {
  code: SubtotalDiagnosticCode;
  callerSubtotal: number;
  calculatedSubtotal: number;
};

export type ResolveEvaluationSubtotalInput = {
  callerSubtotal: number;
  lines: CanonicalCartLine[];
};

export type ResolveEvaluationSubtotalResult = {
  subtotal: number;
  source: SubtotalSource;
  /** Present only when calculated lines disagree with the caller beyond one cent. */
  diagnostic?: SubtotalDiagnostic;
};

/** One-cent tolerance in major currency units (integer cents compare). */
export const SUBTOTAL_MISMATCH_TOLERANCE_CENTS = 1;

function normalizeCallerSubtotal(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * True when every line has an explicit, finite, non-negative unit price AND a
 * `properties` field was provided (so tagged gifts can be detected).
 *
 * Missing / non-finite prices must NOT be treated as zero — that fails the gate
 * and forces legacy caller-subtotal fallback.
 */
export function canCalculateQualifyingSubtotalFromLines(
  lines: CanonicalCartLine[],
): boolean {
  if (!lines.length) return false;

  return lines.every((line) => {
    if (!("price" in line) || line.price === undefined || line.price === null) {
      return false;
    }
    const price = line.price;
    if (!Number.isFinite(price) || price < 0) return false;
    if (line.properties === undefined) return false;
    return true;
  });
}

function callerDiffersFromCalculated(caller: number, calculated: number): boolean {
  return (
    Math.abs(toCents(caller) - toCents(calculated)) >= SUBTOTAL_MISMATCH_TOLERANCE_CENTS
  );
}

export function resolveEvaluationSubtotal(
  input: ResolveEvaluationSubtotalInput,
): ResolveEvaluationSubtotalResult {
  const caller = normalizeCallerSubtotal(input.callerSubtotal);

  if (!canCalculateQualifyingSubtotalFromLines(input.lines)) {
    return { subtotal: caller, source: "legacy_caller_subtotal" };
  }

  const calculated = calculateQualifyingSubtotal({
    subtotal: caller,
    lines: input.lines,
  });

  if (callerDiffersFromCalculated(caller, calculated)) {
    return {
      subtotal: calculated,
      source: "calculated_from_cart_lines",
      diagnostic: {
        code: "SUBTOTAL_CALLER_MISMATCH",
        callerSubtotal: caller,
        calculatedSubtotal: calculated,
      },
    };
  }

  return {
    subtotal: calculated,
    source: "calculated_from_cart_lines",
  };
}
