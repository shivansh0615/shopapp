import assert from "node:assert/strict";
import { it } from "node:test";
import db from "../db.server";
import { createKeyedMutex } from "../lib/shop-lock.server";
import { syncShopDiscount } from "./discount-sync.server";
import type { ShopifyAdminClient } from "./shopify-admin.server";

it("records config evaluation time when Shopify finishes after a schedule boundary", async (t) => {
  const evaluatedAt = new Date("2026-10-20T12:00:00Z");
  const completedAt = new Date("2026-10-20T12:01:00Z");
  t.mock.timers.enable({ apis: ["Date"], now: evaluatedAt.getTime() });
  const original = {
    campaigns: db.campaign.findMany,
    discount: db.shopDiscount.findUnique,
    update: db.shopDiscount.update,
  };
  const writes: Array<{ lastSyncedAt?: Date }> = [];
  db.campaign.findMany = (async () => []) as never;
  db.shopDiscount.findUnique = (async () => ({
    shop: "scheduled.myshopify.com", discountGid: "gid://shopify/DiscountAutomaticNode/1",
  })) as never;
  db.shopDiscount.update = (async ({ data }: { data: { lastSyncedAt?: Date } }) => {
    writes.push(data);
    return {};
  }) as never;
  t.after(() => {
    db.campaign.findMany = original.campaigns;
    db.shopDiscount.findUnique = original.discount;
    db.shopDiscount.update = original.update;
    t.mock.timers.reset();
  });

  const admin = {
    graphql: async (query: string) => {
      if (query.includes("FgpbShopCurrency")) {
        return { json: async () => ({ data: { shop: { currencyCode: "USD" } } }) };
      }
      // Simulate the network crossing a boundary after the plan was evaluated.
      t.mock.timers.setTime(completedAt.getTime());
      return { json: async () => ({ data: {
        discountNode: { discount: { title: "test" } },
        discountAutomaticAppUpdate: { userErrors: [] },
        discountAutomaticDeactivate: { userErrors: [] },
      } }) };
    },
  } as unknown as ShopifyAdminClient;
  await syncShopDiscount(admin, "scheduled.myshopify.com", {
    lock: createKeyedMutex(), enqueueOnFailure: false,
  });
  assert.equal(Date.now(), completedAt.getTime());
  assert.equal(writes.find((write) => write.lastSyncedAt)?.lastSyncedAt?.getTime(), evaluatedAt.getTime());
});
