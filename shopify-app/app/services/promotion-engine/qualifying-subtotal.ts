/**
 * Qualifying cart subtotal helper.
 *
 * Semantics: sum of paid line totals excluding tagged free-gift lines
 * (`_fgpb_free_gift === "true"`). Same-SKU paid (untagged) lines always count.
 *
 * Wired into App Proxy evaluation via `resolve-subtotal.ts`:
 * - When every cart line has an explicit price + properties field,
 *   `calculateQualifyingSubtotal` is the evaluation input.
 * - Otherwise the legacy caller `cartSubtotal` query param is used
 *   (production storefront sends `eligibleSubtotal` and typically omits lines).
 *
 * Do not call this helper for evaluation when line prices are missing — the
 * resolve gate must fall back to the caller subtotal instead of inventing zeros.
 */

import { isTaggedFreeGiftLine } from "../tagged-gift-cart.server";
import type { CanonicalCart, CanonicalCartLine } from "./types";

export type QualifyingSubtotalLine = {
  quantity: number;
  price: number;
  properties?: Record<string, string> | null;
};

/**
 * Sum of line totals excluding tagged free-gift lines.
 * Price is treated as unit price in major currency units (current convention).
 * Callers must only pass lines that already passed the resolve completeness gate.
 */
export function calculateQualifyingSubtotalFromLines(
  lines: QualifyingSubtotalLine[],
): number {
  return lines.reduce((total, line) => {
    if (isTaggedFreeGiftLine(line.properties ?? null)) {
      return total;
    }
    const quantity = Math.max(0, line.quantity);
    const price = Math.max(0, line.price);
    return total + quantity * price;
  }, 0);
}

/** Canonical-cart variant of the qualifying subtotal helper. */
export function calculateQualifyingSubtotal(cart: CanonicalCart): number {
  return calculateQualifyingSubtotalFromLines(
    cart.lines.map((line: CanonicalCartLine) => ({
      quantity: line.quantity,
      price:
        line.finalLinePrice != null
          ? line.quantity > 0
            ? line.finalLinePrice / line.quantity
            : 0
          : Math.max(0, line.price ?? 0),
      properties: line.properties ?? null,
    })),
  );
}
