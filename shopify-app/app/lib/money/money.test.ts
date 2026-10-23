import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addMoney,
  applyPercentageDiscount,
  compareMoney,
  formatMoneyDecimal,
  fromShopifyMoneyV2,
  minorUnitsForCurrency,
  moneyOf,
  multiplyMoneyByQuantity,
  parseMoneyDecimal,
  subtractMoney,
  UnsupportedCurrencyError,
  MoneyParseError,
} from "./index";

describe("currency metadata", () => {
  it("handles zero / two / three decimal currencies", () => {
    assert.equal(minorUnitsForCurrency("JPY"), 0);
    assert.equal(minorUnitsForCurrency("inr"), 2);
    assert.equal(minorUnitsForCurrency("KWD"), 3);
  });

  it("rejects unsupported special currencies", () => {
    assert.throws(() => minorUnitsForCurrency("CLF"), UnsupportedCurrencyError);
  });
});

describe("parseMoneyDecimal", () => {
  it("parses common values", () => {
    assert.equal(parseMoneyDecimal("0", "USD", { allowZero: true }).amountMinor, 0n);
    assert.equal(parseMoneyDecimal("0.01", "USD").amountMinor, 1n);
    assert.equal(parseMoneyDecimal("999.99", "USD").amountMinor, 99999n);
    assert.equal(parseMoneyDecimal(" 10.50 ", "INR").amountMinor, 1050n);
  });

  it("rejects malformed / excess / scientific / negative", () => {
    assert.throws(() => parseMoneyDecimal("1.234", "USD"), MoneyParseError);
    assert.throws(() => parseMoneyDecimal("1e2", "USD"), MoneyParseError);
    assert.throws(() => parseMoneyDecimal("-1", "USD"), MoneyParseError);
    assert.throws(() => parseMoneyDecimal("1,00", "USD"), MoneyParseError);
    assert.throws(() => parseMoneyDecimal("", "USD"), MoneyParseError);
  });

  it("parses zero-decimal and three-decimal", () => {
    assert.equal(parseMoneyDecimal("1000", "JPY").amountMinor, 1000n);
    assert.throws(() => parseMoneyDecimal("1000.1", "JPY"), MoneyParseError);
    assert.equal(parseMoneyDecimal("1.234", "KWD").amountMinor, 1234n);
  });
});

describe("formatMoneyDecimal", () => {
  it("round-trips and pads zeros", () => {
    const m = parseMoneyDecimal("12.5", "USD");
    assert.equal(formatMoneyDecimal(m), "12.50");
    assert.equal(formatMoneyDecimal(moneyOf(0n, "USD")), "0.00");
    assert.equal(formatMoneyDecimal(moneyOf(5n, "JPY")), "5");
  });
});

describe("arithmetic", () => {
  it("adds subtracts compares multiplies", () => {
    const a = parseMoneyDecimal("10.00", "USD");
    const b = parseMoneyDecimal("2.50", "USD");
    assert.equal(addMoney(a, b).amountMinor, 1250n);
    assert.equal(subtractMoney(a, b).amountMinor, 750n);
    assert.equal(compareMoney(a, b), 1);
    assert.equal(multiplyMoneyByQuantity(b, 3).amountMinor, 750n);
  });

  it("applies percentage with HALF_UP midpoint", () => {
    // 1.00 * 50% = 0.50
    assert.equal(
      applyPercentageDiscount(parseMoneyDecimal("1.00", "USD"), 50).amountMinor,
      50n,
    );
    // 1.01 * 50% = 0.505 → HALF_UP → 0.51
    assert.equal(
      applyPercentageDiscount(parseMoneyDecimal("1.01", "USD"), 50).amountMinor,
      51n,
    );
  });

  it("rejects currency mismatch", () => {
    assert.throws(() =>
      addMoney(parseMoneyDecimal("1", "USD"), parseMoneyDecimal("1", "INR")),
    );
  });
});

describe("Shopify boundaries", () => {
  it("parses MoneyV2 payloads", () => {
    const m = fromShopifyMoneyV2({ amount: "19.99", currencyCode: "usd" });
    assert.equal(m.amountMinor, 1999n);
    assert.equal(m.currencyCode, "USD");
  });
});
