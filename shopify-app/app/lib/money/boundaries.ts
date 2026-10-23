/**
 * Shopify money boundary adapters (Admin GraphQL MoneyV2, cart cents, metafield decimals).
 */

import { assertSupportedCurrency, normalizeCurrencyCode } from "./currency";
import {
  formatMoneyDecimal,
  moneyOf,
  parseMoneyDecimal,
  parseShopifyMoneyV2,
  type Money,
  MoneyParseError,
} from "./money";
import { legacyFloatToMoney } from "./legacy-float";

/** Parse MoneyV2 `{ amount, currencyCode }` from Admin / Storefront GraphQL. */
export function fromShopifyMoneyV2(input: {
  amount: string;
  currencyCode: string;
}): Money {
  return parseShopifyMoneyV2(input);
}

/** Emit MoneyV2 decimal string + currency (never scientific notation). */
export function toShopifyMoneyV2(money: Money): {
  amount: string;
  currencyCode: string;
} {
  return {
    amount: formatMoneyDecimal(money),
    currencyCode: assertSupportedCurrency(money.currencyCode),
  };
}

/**
 * Shopify Ajax cart line prices are integer minor units in the shop currency
 * (e.g. `final_line_price`).
 */
export function fromShopifyCartCents(
  cents: number,
  currencyCode: string,
): Money {
  if (!Number.isInteger(cents) || cents < 0 || !Number.isSafeInteger(cents)) {
    throw new MoneyParseError("Cart money must be a non-negative safe integer.");
  }
  return moneyOf(BigInt(cents), currencyCode);
}

/**
 * Transient major-unit numbers (App Proxy `cartSubtotal` query, legacy Float).
 * Prefer decimal strings when available.
 */
export function fromTransientMajorNumber(
  value: number,
  currencyCode: string,
): Money {
  return legacyFloatToMoney(value, normalizeCurrencyCode(currencyCode));
}

export function fromTransientMajorString(
  value: string,
  currencyCode: string,
): Money {
  return parseMoneyDecimal(value, currencyCode, { allowZero: true });
}

/** Discount metafield threshold shape. */
export function toDiscountThresholdPayload(money: Money): {
  amount: string;
  currencyCode: string;
} {
  return toShopifyMoneyV2(money);
}
