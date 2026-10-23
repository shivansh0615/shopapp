/**
 * Legacy Float → minor-unit conversion.
 *
 * Binary floats already in the DB may not equal the merchant’s intended decimal.
 * Policy: convert via a decimal digit string derived with enough fixed places,
 * then HALF_UP to the currency exponent. Document ambiguity for corrupted values.
 */

import {
  formatMoneyDecimal,
  moneyOf,
  parseMoneyDecimal,
  type Money,
  MoneyParseError,
} from "./money";
import { assertSupportedCurrency, minorUnitsForCurrency } from "./currency";

/**
 * Convert a legacy JS number (Prisma Float) to Money.
 * Uses string expansion — not `Math.round(float * 100)`.
 */
export function legacyFloatToMoney(
  value: number,
  currencyCode: string,
): Money {
  const code = assertSupportedCurrency(currencyCode);
  if (!Number.isFinite(value)) {
    throw new MoneyParseError("Legacy float is not finite.");
  }
  if (value < 0) {
    throw new MoneyParseError("Legacy float must not be negative.");
  }
  const minorUnit = minorUnitsForCurrency(code);
  // Expand to minorUnit+4 fraction digits, then HALF_UP into currency precision
  // via parse after manual round — avoid binary * 100.
  const expanded = value.toFixed(minorUnit + 4);
  const rounded = roundHalfUpDecimalString(expanded, minorUnit);
  return parseMoneyDecimal(rounded, code, { allowZero: true });
}

/**
 * Round a decimal string to `fractionDigits` using HALF_UP (no float math).
 */
export function roundHalfUpDecimalString(
  decimal: string,
  fractionDigits: number,
): string {
  const text = String(decimal).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new MoneyParseError("Invalid decimal for rounding.");
  }
  const [wholeRaw, fracRaw = ""] = text.split(".");
  if (fractionDigits === 0) {
    if (!fracRaw) return wholeRaw.replace(/^0+(?=\d)/, "") || "0";
    const first = Number(fracRaw[0] || "0");
    let whole = BigInt(wholeRaw || "0");
    if (first >= 5) whole += 1n;
    return whole.toString();
  }
  const frac = fracRaw.padEnd(fractionDigits + 1, "0");
  const keep = frac.slice(0, fractionDigits);
  const nextDigit = Number(frac[fractionDigits] || "0");
  let digits = BigInt(`${wholeRaw || "0"}${keep}`);
  if (nextDigit >= 5) digits += 1n;
  const scale = 10n ** BigInt(fractionDigits);
  const whole = digits / scale;
  const rem = digits % scale;
  return `${whole.toString()}.${rem.toString().padStart(fractionDigits, "0")}`;
}

/** True when formatting minor units back matches legacy float under conversion policy. */
export function legacyFloatMatchesMoney(value: number, money: Money): boolean {
  try {
    const again = legacyFloatToMoney(value, money.currencyCode);
    return again.amountMinor === money.amountMinor;
  } catch {
    return false;
  }
}

export function moneyEqualsLegacyMajorDisplay(money: Money, legacy: number): boolean {
  const formatted = formatMoneyDecimal(money);
  const fromLegacy = legacyFloatToMoney(legacy, money.currencyCode);
  return fromLegacy.amountMinor === money.amountMinor && formatted === formatMoneyDecimal(fromLegacy);
}

export function bigintFromPrisma(value: bigint | number | null | undefined): bigint | null {
  if (value == null) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new MoneyParseError("Invalid Prisma integer money value.");
}

export function prismaBigInt(money: Money): bigint {
  return moneyOf(money.amountMinor, money.currencyCode).amountMinor;
}
