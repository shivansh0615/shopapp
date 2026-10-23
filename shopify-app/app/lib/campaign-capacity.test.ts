import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { campaignCapacityError } from "./campaign-capacity";
import {
  LIVE_FREE_GIFT_CAMPAIGN_TYPE as CLASSIC,
  LIVE_TIERED_FREE_GIFTS_CAMPAIGN_TYPE as TIERED,
} from "../services/promotion-engine/campaign-types";

describe("campaignCapacityError", () => {
  it("refuses a second campaign while any campaign is active", () => {
    assert.match(
      campaignCapacityError([{ id: 24, campaignType: CLASSIC }], TIERED) ?? "",
      /Only one campaign can be active/,
    );
    assert.match(
      campaignCapacityError([{ id: 25, campaignType: TIERED }], CLASSIC) ?? "",
      /Only one campaign can be active/,
    );
    assert.match(
      campaignCapacityError([{ id: 24, campaignType: CLASSIC }], CLASSIC) ?? "",
      /Only one campaign can be active/,
    );
  });

  it("allows the first classic or the first tiered campaign", () => {
    assert.equal(campaignCapacityError([], CLASSIC), null);
    assert.equal(campaignCapacityError([], TIERED), null);
  });

  it("self-edit of the occupied classic is allowed", () => {
    assert.equal(
      campaignCapacityError([{ id: 24, campaignType: CLASSIC }], CLASSIC, 24),
      null,
    );
  });

  it("rejects unsupported types instead of occupying the slot", () => {
    assert.match(
      campaignCapacityError([], "Spend X -> Percentage Discount") ?? "",
      /Only one gift campaign can be active/,
    );
  });
});
