import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertMerchantMayCreateCampaignType,
  assertMerchantMaySetCampaignType,
  getMerchantPromotionTypeOptions,
  isMerchantCreatableCampaignType,
  MERCHANT_CREATABLE_CAMPAIGN_TYPES,
} from "./merchant-campaign-types";

describe("merchant campaign visibility", () => {
  it("creatable types are Tiered Free Gifts and Spend X -> Free Gift only", () => {
    assert.deepEqual([...MERCHANT_CREATABLE_CAMPAIGN_TYPES], [
      "Tiered Free Gifts",
      "Spend X -> Free Gift",
    ]);
    assert.equal(isMerchantCreatableCampaignType("Spend X -> Percentage Discount"), false);
    assert.equal(isMerchantCreatableCampaignType("Spend X -> Fixed Discount"), false);
  });

  it("create selector shows Tiered and Free Gift only", () => {
    const options = getMerchantPromotionTypeOptions({ mode: "create" });
    const titles = options.map((o) => o.title);
    assert.deepEqual(titles, ["Tiered Free Gifts", "Spend X -> Free Gift"]);
    assert.equal(options.every((o) => o.available), true);
  });

  it("edit of hidden Percentage includes legacy-preserved option", () => {
    const options = getMerchantPromotionTypeOptions({
      mode: "edit",
      currentType: "Spend X -> Percentage Discount",
    });
    const legacy = options.find((o) => o.title === "Spend X -> Percentage Discount");
    assert.ok(legacy);
    assert.equal(legacy?.legacyPreserved, true);
    assert.equal(legacy?.available, false);
  });

  it("server rejects creating Percentage Discount and Mystery Gift", () => {
    assert.throws(
      () => assertMerchantMayCreateCampaignType("Spend X -> Percentage Discount"),
      /not available for new campaigns/i,
    );
    assert.throws(
      () => assertMerchantMayCreateCampaignType("Mystery Gift"),
      /not available for new campaigns/i,
    );
  });

  it("server allows keeping existing Fixed Discount type on update", () => {
    assert.doesNotThrow(() =>
      assertMerchantMaySetCampaignType({
        nextType: "Spend X -> Fixed Discount",
        previousType: "Spend X -> Fixed Discount",
        isCreate: false,
      }),
    );
  });

  it("server rejects switching into Fixed Discount", () => {
    assert.throws(
      () =>
        assertMerchantMaySetCampaignType({
          nextType: "Spend X -> Fixed Discount",
          previousType: "Spend X -> Free Gift",
          isCreate: false,
        }),
      /hidden promotion type/i,
    );
  });
});
