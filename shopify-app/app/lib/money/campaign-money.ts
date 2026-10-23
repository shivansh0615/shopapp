/**
 * Resolve campaign / settings money preferring integer minor columns.
 */

import { DEFAULT_SHOP_CURRENCY } from "./currency";
import { legacyFloatToMoney, bigintFromPrisma } from "./legacy-float";
import {
  formatMoneyDecimal,
  moneyOf,
  moneyToMajorNumber,
  parseMoneyDecimal,
  type Money,
  MoneyParseError,
} from "./money";

export type CampaignMoneyFields = {
  threshold: number;
  thresholdMinor?: bigint | number | null;
  fixedDiscountAmount?: number | null;
  fixedDiscountAmountMinor?: bigint | number | null;
  currencyCode?: string | null;
};

export type TierMoneyFields = {
  threshold: number;
  thresholdMinor?: bigint | number | null;
};

export function resolveCampaignCurrency(
  currencyCode: string | null | undefined,
): string {
  const raw = (currencyCode || "").trim();
  return raw ? raw.toUpperCase() : DEFAULT_SHOP_CURRENCY;
}

export function resolveCampaignThresholdMoney(row: CampaignMoneyFields): Money {
  const currency = resolveCampaignCurrency(row.currencyCode);
  const minor = bigintFromPrisma(row.thresholdMinor ?? null);
  if (minor != null) return moneyOf(minor, currency);
  if (!Number.isFinite(row.threshold)) {
    throw new MoneyParseError("Campaign threshold is missing.");
  }
  return legacyFloatToMoney(row.threshold, currency);
}

export function resolveFixedDiscountMoney(
  row: CampaignMoneyFields,
): Money | null {
  const currency = resolveCampaignCurrency(row.currencyCode);
  const minor = bigintFromPrisma(row.fixedDiscountAmountMinor ?? null);
  if (minor != null) {
    if (minor === 0n) return null;
    return moneyOf(minor, currency);
  }
  if (row.fixedDiscountAmount == null || !Number.isFinite(row.fixedDiscountAmount)) {
    return null;
  }
  if (row.fixedDiscountAmount <= 0) return null;
  return legacyFloatToMoney(row.fixedDiscountAmount, currency);
}

export function resolveTierThresholdMoney(
  tier: TierMoneyFields,
  currencyCode: string | null | undefined,
): Money {
  const currency = resolveCampaignCurrency(currencyCode);
  const minor = bigintFromPrisma(tier.thresholdMinor ?? null);
  if (minor != null) return moneyOf(minor, currency);
  return legacyFloatToMoney(tier.threshold, currency);
}

/** Major-unit number for storefront / legacy admin display (compat). */
export function resolveThresholdMajor(row: CampaignMoneyFields): number {
  return moneyToMajorNumber(resolveCampaignThresholdMoney(row));
}

export function resolveFixedDiscountMajor(row: CampaignMoneyFields): number | null {
  const m = resolveFixedDiscountMoney(row);
  return m ? moneyToMajorNumber(m) : null;
}

export function dualWriteThreshold(
  decimalOrNumber: string | number,
  currencyCode: string,
): { threshold: number; thresholdMinor: bigint; currencyCode: string } {
  const text =
    typeof decimalOrNumber === "string"
      ? decimalOrNumber
      : formatMoneyDecimal(legacyFloatToMoney(decimalOrNumber, currencyCode));
  const money = parseMoneyDecimal(text, currencyCode, { allowZero: false });
  return {
    threshold: moneyToMajorNumber(money),
    thresholdMinor: money.amountMinor,
    currencyCode: money.currencyCode,
  };
}

export function dualWriteOptionalThreshold(
  decimalOrNumber: string | number,
  currencyCode: string,
  allowZero: boolean,
): { threshold: number; thresholdMinor: bigint; currencyCode: string } {
  const text =
    typeof decimalOrNumber === "string"
      ? decimalOrNumber
      : formatMoneyDecimal(legacyFloatToMoney(decimalOrNumber, currencyCode));
  const money = parseMoneyDecimal(text, currencyCode, { allowZero });
  return {
    threshold: moneyToMajorNumber(money),
    thresholdMinor: money.amountMinor,
    currencyCode: money.currencyCode,
  };
}

export function dualWriteFixedDiscount(
  decimalOrNumber: string | number,
  currencyCode: string,
): { fixedDiscountAmount: number; fixedDiscountAmountMinor: bigint } {
  const text =
    typeof decimalOrNumber === "string"
      ? decimalOrNumber
      : formatMoneyDecimal(legacyFloatToMoney(decimalOrNumber, currencyCode));
  const money = parseMoneyDecimal(text, currencyCode, { allowZero: false });
  return {
    fixedDiscountAmount: moneyToMajorNumber(money),
    fixedDiscountAmountMinor: money.amountMinor,
  };
}
