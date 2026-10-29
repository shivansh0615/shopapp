import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAovReport } from "../lib/order-aov";
import type { ShopifyAdminClient } from "./shopify-admin.server";
import { getStoreAovReport } from "./order-aov.server";

type Vars = Record<string, unknown>;

function lines(count: number, giftAt: number | null, hasNextPage = false, endCursor: string | null = null) {
  return {
    pageInfo: { hasNextPage, endCursor },
    nodes: Array.from({ length: count }, (_, index) => ({
      customAttributes: giftAt === index ? [{ key: "_fgpb_free_gift", value: "true" }] : [{ key: "note", value: "x" }],
    })),
  };
}

function order(options: {
  id: string;
  amount?: string | null;
  currency?: string | null;
  lineItems?: ReturnType<typeof lines> | { nodes?: unknown; pageInfo?: unknown } | null;
}) {
  return {
    id: options.id,
    currentSubtotalPriceSet: {
      shopMoney: {
        amount: options.amount === undefined ? "10.00" : options.amount,
        currencyCode: options.currency === undefined ? "INR" : options.currency,
      },
    },
    lineItems: options.lineItems === undefined ? lines(1, null) : options.lineItems,
  };
}

function page(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return { data: { orders: { pageInfo: { hasNextPage, endCursor }, nodes } } };
}

function admin(handler: (query: string, variables: Vars) => unknown) {
  const calls: Array<{ query: string; variables: Vars }> = [];
  const client = {
    graphql: async (query: string, options?: { variables?: Vars }) => {
      const variables = options?.variables ?? {};
      calls.push({ query, variables });
      return Response.json(handler(query, variables));
    },
  } as unknown as ShopifyAdminClient;
  return { client, calls };
}

describe("store AOV report", () => {
  it("does not turn a missing subtotal plus a GraphQL error into a zero AOV", async () => {
    const fake = admin(() => ({
      errors: [{ message: "subtotal unavailable" }],
      ...page([order({ id: "gid://shopify/Order/1", amount: null, lineItems: lines(1, 0) })]),
    }));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, false);
    assert.equal(report.incomplete, true);
    assert.equal(report.summary.influencedAov, null);
    assert.equal(report.summary.influencedOrders, 0);
    assert.match(describeAovReport(report), /could not be read in full/);
  });

  it("keeps a real zero total distinct from a missing total", async () => {
    const fake = admin(() => page([
      order({ id: "gid://shopify/Order/1", amount: null }),
      order({ id: "gid://shopify/Order/2", amount: "0.00", lineItems: lines(1, 0) }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, true);
    assert.equal(report.incomplete, true);
    assert.equal(report.currencyCode, "INR");
    assert.equal(report.summary.influencedOrders, 1);
    assert.equal(report.summary.influencedAov, 0);
    assert.equal(report.summary.otherOrders, 0);
  });

  it("uses the order currency and does not substitute USD when shop currency is absent", async () => {
    const fake = admin(() => page([
      order({ id: "gid://shopify/Order/1", amount: "100.00", currency: "INR", lineItems: lines(1, 0) }),
      order({ id: "gid://shopify/Order/2", amount: "40.00", currency: "INR" }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.currencyCode, "INR");
    assert.equal(fake.calls.some((call) => call.query.includes("currencyCode") && call.query.includes("shop {")), false);
    assert.equal(report.summary.influencedAov, 100);
    assert.equal(report.summary.difference, 60);
  });

  it("does not label an amount when its currency is missing", async () => {
    const fake = admin(() => page([
      order({ id: "gid://shopify/Order/1", amount: "100.00", currency: null, lineItems: lines(1, 0) }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, false);
    assert.equal(report.currencyCode, null);
    assert.equal(report.summary.influencedAov, null);
  });

  it("does not average orders that use different currencies", async () => {
    const fake = admin(() => page([
      order({ id: "gid://shopify/Order/1", amount: "100.00", currency: "INR", lineItems: lines(1, 0) }),
      order({ id: "gid://shopify/Order/2", amount: "40.00", currency: "USD" }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, false);
    assert.equal(report.incomplete, true);
    assert.equal(report.currencyCode, null);
    assert.equal(report.summary.influencedAov, null);
    assert.equal(report.summary.difference, null);
  });

  it("finds a gift past the first 50 lines", async () => {
    const fake = admin((query) => {
      if (query.includes("OrderAovLineItems")) {
        return { data: { order: { lineItems: lines(1, 0) } } };
      }
      return page([order({
        id: "gid://shopify/Order/51",
        amount: "80.00",
        lineItems: lines(50, null, true, "line-2"),
      })]);
    });
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.summary.influencedOrders, 1);
    assert.equal(report.summary.influencedAov, 80);
    assert.equal(report.incomplete, false);
    assert.equal(fake.calls[1]?.variables.cursor, "line-2");
    assert.equal(fake.calls[1]?.variables.id, "gid://shopify/Order/51");
  });

  it("does not call an unread gift order an order without a gift", async () => {
    let followUps = 0;
    const fake = admin((query) => {
      if (query.includes("OrderAovLineItems")) {
        followUps += 1;
        return { data: { order: { lineItems: lines(50, null, true, `more-${followUps}`) } } };
      }
      return page([
        order({ id: "gid://shopify/Order/long", amount: "80.00", lineItems: lines(50, null, true, "more-0") }),
        order({ id: "gid://shopify/Order/plain", amount: "20.00", lineItems: lines(1, null) }),
      ]);
    });
    const report = await getStoreAovReport(fake.client);
    assert.equal(followUps, 3);
    assert.equal(report.available, true);
    assert.equal(report.incomplete, true);
    assert.equal(report.summary.influencedOrders, 0);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.otherAov, 20);
    assert.match(describeAovReport(report), /left out/);
    assert.doesNotMatch(describeAovReport(report), /No completed order in the last 60 days/);
  });

  it("stops classifying an order when a later line page fails", async () => {
    const fake = admin((query) => {
      if (query.includes("OrderAovLineItems")) throw new Error("line page failed");
      return page([
        order({ id: "gid://shopify/Order/long", amount: "80.00", lineItems: lines(50, null, true, "more-0") }),
        order({ id: "gid://shopify/Order/plain", amount: "20.00" }),
      ]);
    });
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.incomplete, true);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.influencedOrders, 0);
  });

  it("qualifies a 400-order sample that contains no gift orders", async () => {
    let pages = 0;
    const fake = admin(() => {
      pages += 1;
      return page(
        [order({ id: `gid://shopify/Order/${pages}`, amount: "15.00" })],
        true,
        `page-${pages}`,
      );
    });
    const report = await getStoreAovReport(fake.client);
    assert.equal(pages, 8);
    assert.equal(report.truncated, true);
    assert.equal(report.summary.influencedOrders, 0);
    assert.equal(report.summary.otherOrders, 8);
    const note = describeAovReport(report);
    assert.match(note, /latest 400 orders/);
    assert.doesNotMatch(note, /No completed order in the last 60 days/);
  });

  it("excludes an order whose line items failed to load", async () => {
    const fake = admin(() => ({
      errors: [{ message: "lineItems could not be loaded" }],
      ...page([
        order({ id: "gid://shopify/Order/missing", amount: "1198.00", currency: "INR", lineItems: null }),
        order({ id: "gid://shopify/Order/plain", amount: "40.00", currency: "INR", lineItems: lines(1, null) }),
      ]),
    }));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, true);
    assert.equal(report.incomplete, true);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.otherAov, 40);
    assert.equal(report.summary.influencedOrders, 0);
    assert.match(describeAovReport(report), /left out/);
  });

  it("excludes an order whose first line page has no pagination metadata", async () => {
    const fake = admin(() => page([
      order({
        id: "gid://shopify/Order/nopage",
        amount: "1198.00",
        lineItems: { nodes: [{ customAttributes: [{ key: "note", value: "x" }] }] },
      }),
      order({ id: "gid://shopify/Order/plain", amount: "40.00", lineItems: lines(2, null) }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.otherAov, 40);
    assert.equal(report.incomplete, true);
  });

  it("excludes an order when a follow-up line page has no pagination metadata", async () => {
    const fake = admin((query) => {
      if (query.includes("OrderAovLineItems")) {
        return { data: { order: { lineItems: { nodes: [{ customAttributes: [{ key: "note", value: "x" }] }] } } } };
      }
      return page([
        order({ id: "gid://shopify/Order/long", amount: "1198.00", lineItems: lines(50, null, true, "line-2") }),
        order({ id: "gid://shopify/Order/plain", amount: "40.00", lineItems: lines(1, null) }),
      ]);
    });
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.otherAov, 40);
    assert.equal(report.summary.influencedOrders, 0);
    assert.equal(report.incomplete, true);
  });

  it("counts an explicit empty line connection as an order without a gift", async () => {
    const fake = admin(() => page([
      order({
        id: "gid://shopify/Order/empty",
        amount: "25.00",
        lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.available, true);
    assert.equal(report.incomplete, false);
    assert.equal(report.summary.otherOrders, 1);
    assert.equal(report.summary.otherAov, 25);
    assert.equal(report.summary.influencedOrders, 0);
  });

  it("counts a gift even when later line pages were not returned", async () => {
    const fake = admin(() => page([
      order({
        id: "gid://shopify/Order/gift",
        amount: "80.00",
        lineItems: { nodes: [{ customAttributes: [{ key: "_fgpb_free_gift", value: "true" }] }] },
      }),
    ]));
    const report = await getStoreAovReport(fake.client);
    assert.equal(report.summary.influencedOrders, 1);
    assert.equal(report.summary.influencedAov, 80);
    assert.equal(report.incomplete, false);
  });
});
