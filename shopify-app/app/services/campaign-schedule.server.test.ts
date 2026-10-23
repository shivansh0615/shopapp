import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterScheduledCampaigns, isCampaignWithinSchedule } from "./campaign-schedule.server";

describe("campaign schedule", () => {
  it("allows campaigns inside schedule window", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");
    const campaign = {
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-31T23:59:59.000Z"),
    };
    assert.equal(isCampaignWithinSchedule(campaign, now), true);
  });

  it("filters campaigns outside schedule window", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const campaigns = [
      { startDate: null, endDate: new Date("2026-07-31T23:59:59.000Z") },
      { startDate: null, endDate: null },
    ];
    assert.deepEqual(filterScheduledCampaigns(campaigns, now), [campaigns[1]]);
  });
});
