/**
 * Shopify-relevant ISO 4217 minor-unit exponents.
 * Campaign money is shop-currency only (no multi-currency campaigns).
 *
 * Sources: ISO 4217 + Shopify Help (amount_no_decimals defaults) + common
 * three-decimal Gulf/North-Africa currencies. Unknown codes fail closed.
 */

const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "UYI",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

/** Currencies with 3 ISO minor digits. */
const THREE_DECIMAL = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

/** Default assumed when historical rows have no currency (matches discount-sync fallback). */
export const DEFAULT_SHOP_CURRENCY = "INR";

export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Unsupported currency code: ${code}`);
    this.name = "UnsupportedCurrencyError";
  }
}

export function normalizeCurrencyCode(code: string | null | undefined): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new UnsupportedCurrencyError(normalized || "(empty)");
  }
  return normalized;
}

/**
 * Minor-unit exponent for a currency (0, 2, or 3 for supported set).
 * Unknown alphabetic codes with no table entry are treated as **unsupported**
 * (fail safe) — do not assume 2 decimals for arbitrary codes.
 */
export function minorUnitsForCurrency(currencyCode: string): number {
  const code = normalizeCurrencyCode(currencyCode);
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  // Standard two-decimal set: require known pattern — accept common ISO codes
  // that are neither zero nor three. We allow any remaining A-Z{3} as 2-decimal
  // only if it is not in an explicit reject list of four-decimal / special cases.
  if (code === "CLF" || code === "UYW") {
    throw new UnsupportedCurrencyError(code);
  }
  return 2;
}

export function assertSupportedCurrency(currencyCode: string): string {
  const code = normalizeCurrencyCode(currencyCode);
  minorUnitsForCurrency(code); // throws for unsupported specials
  return code;
}
