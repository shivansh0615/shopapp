import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectTaggedLineKeys, shouldHighlightGiftRow } from "../utils/gift-row-highlight.js";

const PAID_KEY = "54277124751726:paidhash";
const GIFT_KEY = "54277123998062:gifthash";

describe("gift-row-highlight (Fix 1)", () => {
  it("collects only tagged Shopify line keys", () => {
    const keys = collectTaggedLineKeys([
      { key: PAID_KEY, properties: {} },
      {
        key: GIFT_KEY,
        properties: { _fgpb_free_gift: "true", _fgpb_tier_id: "t1" },
      },
    ]);
    assert.equal(keys[PAID_KEY], undefined);
    assert.equal(keys[GIFT_KEY], true);
  });

  it("paid product never highlights without matching key", () => {
    const keys = collectTaggedLineKeys([
      { key: GIFT_KEY, properties: { _fgpb_free_gift: "true" } },
      { key: PAID_KEY, properties: {} },
    ]);
    // Stale DOM: paid row is CartItem-1 but gift is cart.js index 1 — no key ⇒ no highlight
    assert.equal(shouldHighlightGiftRow("", keys), false);
    assert.equal(shouldHighlightGiftRow(null, keys), false);
    assert.equal(shouldHighlightGiftRow(PAID_KEY, keys), false);
  });

  it("never shows Free! path for paid key even when gift exists (same-SKU)", () => {
    const giftVariant = "54277123998062";
    const keys = collectTaggedLineKeys([
      {
        key: `${giftVariant}:paid`,
        properties: {},
      },
      {
        key: `${giftVariant}:gift`,
        properties: { _fgpb_free_gift: "true", _fgpb_tier_id: "t1" },
      },
    ]);
    assert.equal(shouldHighlightGiftRow(`${giftVariant}:paid`, keys), false);
    assert.equal(shouldHighlightGiftRow(`${giftVariant}:gift`, keys), true);
  });

  it("highlights only when Shopify line keys match", () => {
    const keys = collectTaggedLineKeys([
      { key: GIFT_KEY, properties: { _fgpb_free_gift: "true" } },
    ]);
    assert.equal(shouldHighlightGiftRow(GIFT_KEY, keys), true);
    assert.equal(shouldHighlightGiftRow("wrong:key", keys), false);
  });
});
