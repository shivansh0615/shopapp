import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  legacyFloatToMoney,
  roundHalfUpDecimalString,
  dualWriteThreshold,
  resolveCampaignThresholdMoney,
} from "./index";
import { buildSpendThresholdProgress } from "../../services/promotion-engine/spend-threshold-progress";

describe("legacy float conversion", () => {
  it("converts without Math.round(float*100) path", () => {
    assert.equal(legacyFloatToMoney(999, "INR").amountMinor, 99900n);
    assert.equal(legacyFloatToMoney(10.5, "USD").amountMinor, 1050n);
    assert.equal(legacyFloatToMoney(1000, "JPY").amountMinor, 1000n);
    assert.equal(legacyFloatToMoney(1.234, "KWD").amountMinor, 1234n);
  });

  it("HALF_UP midpoint via decimal string", () => {
    assert.equal(roundHalfUpDecimalString("1.0050", 2), "1.01");
    assert.equal(roundHalfUpDecimalString("1.0049", 2), "1.00");
  });

  it("dual-write keeps major display stable for clean decimals", () => {
    const w = dualWriteThreshold("999.00", "INR");
    assert.equal(w.threshold, 999);
    assert.equal(w.thresholdMinor, 99900n);
  });

  it("resolve prefers minor when present", () => {
    const m = resolveCampaignThresholdMoney({
      threshold: 999.0000001,
      thresholdMinor: 99900n,
      currencyCode: "INR",
    });
    assert.equal(m.amountMinor, 99900n);
  });
});

describe("threshold boundaries via progress helper", () => {
  it("exact / one minor below / one minor above", () => {
    assert.equal(buildSpendThresholdProgress(100, 100, "USD").eligible, true);
    assert.equal(buildSpendThresholdProgress(99.99, 100, "USD").eligible, false);
    assert.equal(buildSpendThresholdProgress(100.01, 100, "USD").eligible, true);
  });

  it("zero-decimal currency boundaries", () => {
    assert.equal(buildSpendThresholdProgress(999, 1000, "JPY").eligible, false);
    assert.equal(buildSpendThresholdProgress(1000, 1000, "JPY").eligible, true);
  });
});
