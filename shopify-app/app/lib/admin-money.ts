import { DEFAULT_SHOP_CURRENCY } from "./money/currency";

/** Format a major-unit amount for admin UI (display only). */
export function formatAdminMoney(
  amount: number | string | null | undefined,
  currencyCode: string = DEFAULT_SHOP_CURRENCY,
): string {
  const n = typeof amount === "string" ? Number(amount) : Number(amount ?? 0);
  const value = Number.isFinite(n) ? n : 0;
  const code = String(currencyCode || DEFAULT_SHOP_CURRENCY).trim().toUpperCase() || DEFAULT_SHOP_CURRENCY;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value}`;
  }
}

/** Compact currency hint for input prefixes (₹ / $ / EUR). */
export function adminCurrencyPrefix(currencyCode: string = DEFAULT_SHOP_CURRENCY): string {
  const code = String(currencyCode || DEFAULT_SHOP_CURRENCY).trim().toUpperCase() || DEFAULT_SHOP_CURRENCY;
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || code;
  } catch {
    return code;
  }
}
