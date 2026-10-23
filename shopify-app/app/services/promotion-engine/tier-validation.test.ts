import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateTieredFreeGiftTiers } from "./tier-validation";

describe("tier validation", () => {
  it("rejects empty tiers", () => {
    assert.throws(() => validateTieredFreeGiftTiers([]), /at least one tier/i);
  });

  it("rejects zero threshold", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { threshold: 0, giftVariantId: "1", position: 0 },
        ]),
      /greater than 0/i,
    );
  });

  it("rejects negative threshold", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { threshold: -10, giftVariantId: "1", position: 0 },
        ]),
      /greater than 0/i,
    );
  });

  it("rejects duplicate thresholds", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { threshold: 50, giftVariantId: "1", position: 0 },
          { threshold: 50, giftVariantId: "2", position: 1 },
        ]),
      /strictly increasing/i,
    );
  });

  it("rejects descending thresholds", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { threshold: 100, giftVariantId: "1", position: 0 },
          { threshold: 50, giftVariantId: "2", position: 1 },
        ]),
      /strictly increasing/i,
    );
  });

  it("rejects missing gift variant", () => {
    assert.throws(
      () => validateTieredFreeGiftTiers([{ threshold: 50, giftVariantId: "", position: 0 }]),
      /gift variant/i,
    );
  });

  it("rejects duplicate tier ids", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { id: "a", threshold: 50, giftVariantId: "1", position: 0 },
          { id: "a", threshold: 100, giftVariantId: "2", position: 1 },
        ]),
      /Duplicate tier IDs/i,
    );
  });

  it("rejects malformed positions", () => {
    assert.throws(
      () =>
        validateTieredFreeGiftTiers([
          { threshold: 50, giftVariantId: "1", position: 0 },
          { threshold: 100, giftVariantId: "2", position: 2 },
        ]),
      /contiguous/i,
    );
  });

  it("accepts five thresholds and rejects a sixth", () => {
    const five = Array.from({ length: 5 }, (_, position) => ({
      threshold: (position + 1) * 100,
      giftVariantId: String(position + 1),
      position,
    }));
    assert.equal(validateTieredFreeGiftTiers(five).length, 5);
    assert.throws(
      () => validateTieredFreeGiftTiers([...five, { threshold: 600, giftVariantId: "6", position: 5 }]),
      /at most 5 thresholds/,
    );
  });

  it("accepts valid ordered tiers", () => {
    const tiers = validateTieredFreeGiftTiers([
      { id: "t1", threshold: 50, giftVariantId: "111", position: 0 },
      { id: "t2", threshold: 100, giftVariantId: "222", position: 1 },
      { id: "t3", threshold: 150, giftVariantId: "333", position: 2 },
    ]);
    assert.equal(tiers.length, 3);
    assert.equal(tiers[0]!.threshold, 50);
    assert.equal(tiers[2]!.threshold, 150);
  });
});
