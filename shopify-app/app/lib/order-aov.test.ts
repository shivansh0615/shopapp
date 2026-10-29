import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAdminMoney } from "./admin-money";
import {
  aovFigure,
  describeAovReport,
  orderIncludesFreeGift,
  parseShopCurrencyCode,
  parseShopMoneyAmount,
  summarizeOrderAov,
} from "./order-aov";

test("a free-gift line property marks the order", () => {
  assert.equal(orderIncludesFreeGift([{ key: "_fgpb_free_gift", value: "true" }]), true);
  assert.equal(orderIncludesFreeGift([{ key: "_fgpb_free_gift", value: "false" }]), false);
  assert.equal(orderIncludesFreeGift([{ key: "Gift", value: "true" }]), false);
});

test("AOV difference is influenced orders minus the rest", () => {
  const summary = summarizeOrderAov([
    { total: 150, influenced: true },
    { total: 90, influenced: true },
    { total: 80, influenced: false },
    { total: 40, influenced: false },
  ]);
  assert.equal(summary.influencedOrders, 2);
  assert.equal(summary.otherOrders, 2);
  assert.equal(summary.influencedAov, 120);
  assert.equal(summary.otherAov, 60);
  assert.equal(summary.difference, 60);
});

test("a missing shop amount is not a zero-value order", () => {
  assert.equal(parseShopMoneyAmount(null), null);
  assert.equal(parseShopMoneyAmount(undefined), null);
  assert.equal(parseShopMoneyAmount(""), null);
  assert.equal(parseShopMoneyAmount("  "), null);
  assert.equal(parseShopMoneyAmount("0"), 0);
  assert.equal(parseShopMoneyAmount("0.00"), 0);
  assert.equal(parseShopMoneyAmount("12.50"), 12.5);
  assert.equal(Number(null), 0);
});

test("AOV is unlabeled when the order currency is missing and keeps a non-USD code", () => {
  assert.equal(parseShopCurrencyCode(null), null);
  assert.equal(parseShopCurrencyCode("inr"), "INR");
  assert.equal(aovFigure(100, null), null);
  assert.equal(aovFigure(null, "INR"), null);
  assert.equal(aovFigure(100, "INR"), formatAdminMoney(100, "INR"));
  assert.notEqual(aovFigure(100, "INR"), formatAdminMoney(100, "USD"));
});

test("a truncated sample does not claim the whole 60-day window was inspected", () => {
  const base = { available: true, denied: false, incomplete: false, summary: { influencedOrders: 0, otherOrders: 4 } };
  const full = describeAovReport({ ...base, truncated: false });
  assert.match(full, /No completed order in the last 60 days/);
  const sampled = describeAovReport({ ...base, truncated: true });
  assert.match(sampled, /latest 400 orders/);
  assert.doesNotMatch(sampled, /No completed order in the last 60 days/);

  const allGifts = describeAovReport({
    available: true,
    denied: false,
    incomplete: false,
    truncated: true,
    summary: { influencedOrders: 400, otherOrders: 0 },
  });
  assert.match(allGifts, /latest 400/);
  assert.doesNotMatch(allGifts, /Every recent order/);

  const compared = describeAovReport({
    available: true,
    denied: false,
    incomplete: false,
    truncated: true,
    summary: { influencedOrders: 10, otherOrders: 30 },
  });
  assert.match(compared, /latest 400 orders/);
  assert.match(compared, /were not inspected/);
});

test("no comparison when either side has no orders", () => {
  const onlyGifts = summarizeOrderAov([{ total: 100, influenced: true }]);
  assert.equal(onlyGifts.influencedAov, 100);
  assert.equal(onlyGifts.difference, null);
  const none = summarizeOrderAov([]);
  assert.equal(none.influencedAov, null);
  assert.equal(none.difference, null);
});
