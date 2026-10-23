import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseCartCampaign } from "../../shared/campaign-policy";

const classic = {
  campaignId: "24",
  priority: 0,
  threshold: { amount: "999" },
};
const tiered = {
  campaignId: "25",
  priority: 0,
  tiers: [{ threshold: { amount: "1500" } }],
};

describe("chooseCartCampaign classic + tiered", () => {
  it("gives no checkout reward below both thresholds", () => {
    assert.equal(chooseCartCampaign([classic, tiered], 837)?.campaignId, undefined);
    assert.equal(chooseCartCampaign([classic, tiered], 0)?.campaignId, undefined);
  });

  it("awards only the classic gift between the two thresholds", () => {
    assert.equal(chooseCartCampaign([classic, tiered], 999)?.campaignId, "24");
    assert.equal(chooseCartCampaign([classic, tiered], 1116)?.campaignId, "24");
    assert.equal(chooseCartCampaign([classic, tiered], 1499.99)?.campaignId, "24");
  });

  it("equal priority uses the highest reached threshold, then the lowest campaign ID", () => {
    assert.equal(chooseCartCampaign([classic, tiered], 1500)?.campaignId, "25");
    assert.equal(chooseCartCampaign([tiered, classic], 2000)?.campaignId, "25");
    const twins = [
      { ...classic, campaignId: "30", threshold: { amount: "1500" } },
      { ...tiered, campaignId: "25" },
    ];
    assert.equal(chooseCartCampaign(twins, 1500)?.campaignId, "25");
  });

  it("a higher-priority classic still wins after the tiered threshold is reached", () => {
    const preferred = { ...classic, priority: 10 };
    assert.equal(chooseCartCampaign([preferred, tiered], 2000)?.campaignId, "24");
  });

  it("progress below every threshold points at the nearest equal-priority goal", () => {
    assert.equal(
      chooseCartCampaign([classic, tiered], 400, 1, true)?.campaignId,
      "24",
    );
  });
});
