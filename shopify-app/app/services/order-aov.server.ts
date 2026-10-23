import type { ShopifyAdminClient } from "./shopify-admin.server";
import { orderIncludesFreeGift, summarizeOrderAov, type OrderAovSummary } from "../lib/order-aov";

const ORDER_WINDOW_DAYS = 60;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;

const ORDERS_QUERY = `#graphql
  query OrderAovWindow($cursor: String, $query: String!) {
    orders(first: ${PAGE_SIZE}, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        currentSubtotalPriceSet {
          shopMoney {
            amount
          }
        }
        lineItems(first: 50) {
          nodes {
            customAttributes {
              key
              value
            }
          }
        }
      }
    }
  }
`;

type OrdersPayload = {
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  data?: {
    orders?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: Array<{
        currentSubtotalPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
        lineItems?: {
          nodes?: Array<{
            customAttributes?: Array<{ key?: string | null; value?: string | null }>;
          }>;
        } | null;
      }>;
    } | null;
  } | null;
};

export type StoreAovReport = {
  available: boolean;
  denied: boolean;
  truncated: boolean;
  summary: OrderAovSummary;
};

const emptySummary = summarizeOrderAov([]);

export async function getStoreAovReport(admin: ShopifyAdminClient): Promise<StoreAovReport> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - ORDER_WINDOW_DAYS);
  const query = `created_at:>=${since.toISOString().slice(0, 10)}`;
  const samples: Array<{ total: number; influenced: boolean }> = [];
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let payload: OrdersPayload;
    try {
      const response = await admin.graphql(ORDERS_QUERY, { variables: { cursor, query } });
      payload = (await response.json()) as OrdersPayload;
    } catch {
      return { available: false, denied: false, truncated: false, summary: emptySummary };
    }

    const orders = payload.data?.orders;
    if (!orders) {
      return {
        available: false,
        denied: payload.errors?.some(isOrderAccessError) ?? false,
        truncated: false,
        summary: emptySummary,
      };
    }

    for (const node of orders.nodes ?? []) {
      const total = Number(node.currentSubtotalPriceSet?.shopMoney?.amount);
      const attributes = (node.lineItems?.nodes ?? []).flatMap(
        (line) => line.customAttributes ?? [],
      );
      samples.push({
        total,
        influenced: orderIncludesFreeGift(attributes),
      });
    }

    if (!orders.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) {
      return { available: true, denied: false, truncated, summary: summarizeOrderAov(samples) };
    }
    if (page === MAX_PAGES - 1) truncated = true;
    cursor = orders.pageInfo.endCursor;
  }

  return { available: true, denied: false, truncated: true, summary: summarizeOrderAov(samples) };
}

function isOrderAccessError(error: { message?: string; extensions?: { code?: string } }): boolean {
  const code = String(error.extensions?.code || "").toUpperCase();
  const message = String(error.message || "").toLowerCase();
  return code === "ACCESS_DENIED" || message.includes("access denied") || message.includes("read_orders");
}
