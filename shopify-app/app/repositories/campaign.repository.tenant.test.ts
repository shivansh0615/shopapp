import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownedCampaignWhere } from "./campaign.repository";

describe("ownedCampaignWhere — tenant identity", () => {
  it("requires both id and shop", () => {
    assert.deepEqual(ownedCampaignWhere(42, "a.myshopify.com"), {
      id: 42,
      shop: "a.myshopify.com",
    });
  });

  it("trims shop domains", () => {
    assert.equal(ownedCampaignWhere(1, "  shop.myshopify.com  ").shop, "shop.myshopify.com");
  });

  it("rejects empty shop", () => {
    assert.throws(() => ownedCampaignWhere(1, "   "), /shop is required/);
  });

  it("rejects non-positive ids", () => {
    assert.throws(() => ownedCampaignWhere(0, "a.myshopify.com"), /Invalid campaign id/);
    assert.throws(() => ownedCampaignWhere(-3, "a.myshopify.com"), /Invalid campaign id/);
    assert.throws(() => ownedCampaignWhere(1.5, "a.myshopify.com"), /Invalid campaign id/);
  });
});
