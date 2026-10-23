/**
 * Exact integer-money helpers (minor units + currency).
 * No binary floating-point as source of truth for persisted amounts.
 */

import {
  assertSupportedCurrency,
  minorUnitsForCurrency,
  normalizeCurrencyCode,
} from "./currency";

export type Money = {
  amountMinor: bigint;
  currencyCode: string;
  minorUnit: number;
};

export type RoundingMode = "HALF_UP" | "FLOOR" | "CEILING";

export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

export class MoneyOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyOverflowError";
  }
}

export class CurrencyMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CurrencyMismatchError";
  }
}

/** PostgreSQL BIGINT / JS bigint practical guard for campaign config. */
export const MAX_AMOUNT_MINOR = 10n ** 15n;

function assertSafeMinor(amountMinor: bigint): void {
  if (amountMinor < 0n) {
    throw new MoneyParseError("Money amount must not be negative.");
  }
  if (amountMinor > MAX_AMOUNT_MINOR) {
    throw new MoneyOverflowError("Money amount exceeds supported maximum.");
  }
}

export function moneyOf(
  amountMinor: bigint | number | string,
  currencyCode: string,
): Money {
  const code = assertSupportedCurrency(currencyCode);
  const minorUnit = minorUnitsForCurrency(code);
  const minor =
    typeof amountMinor === "bigint"
      ? amountMinor
      : typeof amountMinor === "number"
        ? (() => {
            if (!Number.isInteger(amountMinor) || !Number.isSafeInteger(amountMinor)) {
              throw new MoneyParseError("amountMinor number must be a safe integer.");
            }
            return BigInt(amountMinor);
          })()
        : BigInt(amountMinor);
  assertSafeMinor(minor);
  return { amountMinor: minor, currencyCode: code, minorUnit };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currencyCode !== b.currencyCode) {
    throw new CurrencyMismatchError(
      `Currency mismatch: ${a.currencyCode} vs ${b.currencyCode}`,
    );
  }
}

/**
 * Parse a locale-independent decimal string into minor units.
 * Rejects scientific notation, commas, empty, negatives, excess precision.
 */
export function parseMoneyDecimal(
  raw: string,
  currencyCode: string,
  options: { allowZero?: boolean } = {},
): Money {
  const code = assertSupportedCurrency(currencyCode);
  const minorUnit = minorUnitsForCurrency(code);
  const text = String(raw ?? "").trim();
  if (!text) throw new MoneyParseError("Money amount is required.");
  if (/[eE]/.test(text)) {
    throw new MoneyParseError("Scientific notation is not allowed for money.");
  }
  if (text.includes(",")) {
    throw new MoneyParseError("Locale-formatted money is not allowed.");
  }
  if (text.startsWith("-")) {
    throw new MoneyParseError("Money amount must not be negative.");
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new MoneyParseError("Malformed money decimal.");
  }

  const [wholeRaw, fracRaw = ""] = text.split(".");
  if (fracRaw.length > minorUnit) {
    throw new MoneyParseError(
      `Too many decimal places for ${code} (max ${minorUnit}).`,
    );
  }
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.padEnd(minorUnit, "0");
  const digits = minorUnit === 0 ? whole : `${whole}${frac}`;
  let amountMinor: bigint;
  try {
    amountMinor = BigInt(digits);
  } catch {
    throw new MoneyParseError("Malformed money decimal.");
  }
  assertSafeMinor(amountMinor);
  if (amountMinor === 0n && options.allowZero === false) {
    throw new MoneyParseError("Money amount must be greater than zero.");
  }
  return { amountMinor, currencyCode: code, minorUnit };
}

/** Format minor units to a locale-independent decimal string (no scientific notation). */
export function formatMoneyDecimal(money: Money): string {
  const code = assertSupportedCurrency(money.currencyCode);
  const minorUnit = minorUnitsForCurrency(code);
  assertSafeMinor(money.amountMinor);
  if (minorUnit === 0) return money.amountMinor.toString();
  const scale = 10n ** BigInt(minorUnit);
  const whole = money.amountMinor / scale;
  const frac = money.amountMinor % scale;
  return `${whole.toString()}.${frac.toString().padStart(minorUnit, "0")}`;
}

/**
 * Convert Money to a JS number for legacy APIs / storefront major-unit fields.
 * Only when the decimal is exactly representable as a finite number path used today
 * (threshold display). Prefer formatMoneyDecimal for serialization.
 */
export function moneyToMajorNumber(money: Money): number {
  const text = formatMoneyDecimal(money);
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new MoneyOverflowError("Cannot represent money as JavaScript number.");
  }
  // Strip negative zero
  return Object.is(n, -0) ? 0 : n;
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  const sum = a.amountMinor + b.amountMinor;
  assertSafeMinor(sum);
  return { ...a, amountMinor: sum };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  if (b.amountMinor > a.amountMinor) {
    throw new MoneyParseError("Subtraction would yield a negative amount.");
  }
  return { ...a, amountMinor: a.amountMinor - b.amountMinor };
}

export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function multiplyMoneyByQuantity(money: Money, quantity: number): Money {
  if (!Number.isInteger(quantity) || quantity < 0 || !Number.isSafeInteger(quantity)) {
    throw new MoneyParseError("Quantity must be a non-negative safe integer.");
  }
  const product = money.amountMinor * BigInt(quantity);
  assertSafeMinor(product);
  return { ...money, amountMinor: product };
}

function divRound(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode,
): bigint {
  if (denominator <= 0n) throw new MoneyParseError("Invalid denominator.");
  if (mode === "FLOOR") return numerator / denominator;
  if (mode === "CEILING") {
    const q = numerator / denominator;
    return numerator % denominator === 0n ? q : q + 1n;
  }
  // HALF_UP
  const half = denominator / 2n;
  return (numerator + half) / denominator;
}

/**
 * Apply an integer percentage (1–100) discount to a money amount.
 * Rounding: HALF_UP on the minor-unit result (documented policy).
 * Shopify Function percentage discounts are applied by Shopify’s discount engine;
 * this helper is for app-side estimates only — see docs/ops/integer-money-migration.md.
 */
export function applyPercentageDiscount(
  money: Money,
  percentage: number,
  mode: RoundingMode = "HALF_UP",
): Money {
  if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
    throw new MoneyParseError("Percentage must be an integer 0–100.");
  }
  const discounted =
    percentage === 0
      ? 0n
      : divRound(money.amountMinor * BigInt(percentage), 100n, mode);
  assertSafeMinor(discounted);
  return { ...money, amountMinor: discounted };
}

export function serializeMoney(money: Money): {
  amountMinor: string;
  currencyCode: string;
  amount: string;
} {
  return {
    amountMinor: money.amountMinor.toString(),
    currencyCode: money.currencyCode,
    amount: formatMoneyDecimal(money),
  };
}

export function parseShopifyMoneyV2(input: {
  amount: string;
  currencyCode: string;
}): Money {
  return parseMoneyDecimal(input.amount, normalizeCurrencyCode(input.currencyCode));
}
