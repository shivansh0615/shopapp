import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import type { CampaignWithTiers } from "./campaign.server";
import { LIVE_FREE_GIFT_CAMPAIGN_TYPE } from "./promotion-engine/campaign-types";

let stored: CampaignWithTiers | null = null;
const fakeDb = {
  campaign: {
  create: async ({ data }: { data: Record<string, unknown> }) => {
    stored = { id: 7, rewardTiers: [], ...data } as unknown as CampaignWithTiers;
    return stored;
  },
  findFirst: async ({ where }: { where: { id: number; shop: string } }) =>
    stored?.id === where.id && stored.shop === where.shop ? stored : null,
  update: async ({ data }: { data: Record<string, unknown> }) => {
    stored = { ...stored, ...data } as unknown as CampaignWithTiers;
    return stored;
  },
  },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
    callback({ campaign: fakeDb.campaign, $executeRaw: async () => 1 }),
};
const originalDb = globalThis.prismaGlobal;
globalThis.prismaGlobal = fakeDb as never;
const { createCampaign, getCampaign, updateCampaign } = await import("./campaign.server");
beforeEach(() => { stored = null; });
after(() => { globalThis.prismaGlobal = originalDb; });

async function saveGift() {
  return createCampaign({
    shop: "a.myshopify.com", name: "Gift campaign", campaignType: LIVE_FREE_GIFT_CAMPAIGN_TYPE,
    threshold: "100", currencyCode: "USD", giftProductId: "gid://shopify/Product/1",
    giftVariantId: "gid://shopify/ProductVariant/99", giftQuantity: 1,
    giftProductTitle: "Shirt", placements: ["Product Page"], status: "DRAFT",
  });
}

describe("gift campaign persistence through service and repository", () => {
  it("rejects unsupported quantities without changing the saved gift", async () => {
    await saveGift();
    for (const quantity of [0, 2, 3, 1.5, NaN]) {
      await assert.rejects(updateCampaign(7, "a.myshopify.com", { giftQuantity: quantity }), /exactly one/);
    }
    assert.equal((await getCampaign(7, "a.myshopify.com"))?.giftQuantity, 1);
  });
  it("saves and reloads the chosen variant and quantity rather than a default variant", async () => {
    await saveGift();
    const loaded = await getCampaign(7, "a.myshopify.com");
    assert.equal(loaded?.giftProductId, "gid://shopify/Product/1");
    assert.equal(loaded?.giftVariantId, "gid://shopify/ProductVariant/99");
    assert.equal(loaded?.giftQuantity, 1);
  });

  it("keeps gift IDs when editing unrelated campaign fields", async () => {
    await saveGift();
    await updateCampaign(7, "a.myshopify.com", { name: "Renamed" });
    const loaded = await getCampaign(7, "a.myshopify.com");
    assert.equal(loaded?.name, "Renamed");
    assert.equal(loaded?.giftVariantId, "gid://shopify/ProductVariant/99");
    assert.equal(loaded?.giftQuantity, 1);
  });

  it("updates product and variant together when the merchant replaces the gift", async () => {
    await saveGift();
    await updateCampaign(7, "a.myshopify.com", { giftProductId: "gid://shopify/Product/2", giftVariantId: "gid://shopify/ProductVariant/101", giftQuantity: 1 });
    const loaded = await getCampaign(7, "a.myshopify.com");
    assert.equal(loaded?.giftProductId, "gid://shopify/Product/2");
    assert.equal(loaded?.giftVariantId, "gid://shopify/ProductVariant/101");
    assert.equal(loaded?.giftQuantity, 1);
  });

  it("cannot reload or change another store's saved gift", async () => {
    await saveGift();
    assert.equal(await getCampaign(7, "b.myshopify.com"), null);
    assert.equal(await updateCampaign(7, "b.myshopify.com", { giftVariantId: "gid://shopify/ProductVariant/5" }), null);
    assert.equal((await getCampaign(7, "a.myshopify.com"))?.giftVariantId, "gid://shopify/ProductVariant/99");
  });
});
