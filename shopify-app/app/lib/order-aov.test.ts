import assert from "node:assert/strict";
import { test } from "node:test";
import { orderIncludesFreeGift, summarizeOrderAov } from "./order-aov";

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

test("no comparison when either side has no orders", () => {
  const onlyGifts = summarizeOrderAov([{ total: 100, influenced: true }]);
  assert.equal(onlyGifts.influencedAov, 100);
  assert.equal(onlyGifts.difference, null);
  const none = summarizeOrderAov([]);
  assert.equal(none.influencedAov, null);
  assert.equal(none.difference, null);
});
