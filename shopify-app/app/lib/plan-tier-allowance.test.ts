import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CURRENT_THRESHOLD_LIMIT,
  PLAN_THRESHOLD_LIMITS,
  currentThresholdLimit,
} from "./plan-tier-allowance";

describe("plan threshold allowance", () => {
  it("keeps the paid ladder ready and gives every shop 5 thresholds until billing exists", () => {
    assert.deepEqual(PLAN_THRESHOLD_LIMITS, { free: 2, paid: 3, paidTop: 5 });
    assert.equal(CURRENT_THRESHOLD_LIMIT, 5);
    assert.equal(currentThresholdLimit(), 5);
  });
});
