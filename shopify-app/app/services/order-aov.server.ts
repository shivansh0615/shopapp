import type { ShopifyAdminClient } from "./shopify-admin.server";
import {
  orderIncludesFreeGift,
  parseShopCurrencyCode,
  parseShopMoneyAmount,
  summarizeOrderAov,
  type OrderAovSummary,
} from "../lib/order-aov";

const ORDER_WINDOW_DAYS = 60;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const LINE_PAGE_SIZE = 50;
/** First page plus follow-ups. Four pages is 200 lines; anything beyond is incomplete. */
const MAX_LINE_PAGES = 4;
/** Extra line-item requests for the whole report, after the pages already on each order. */
const MAX_EXTRA_LINE_REQUESTS = 24;

const ORDERS_QUERY = `#graphql
  query OrderAovWindow($cursor: String, $query: String!) {
    orders(first: ${PAGE_SIZE}, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        currentSubtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: ${LINE_PAGE_SIZE}) {
          pageInfo {
            hasNextPage
            endCursor
          }
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

const LINE_ITEMS_QUERY = `#graphql
  query OrderAovLineItems($id: ID!, $cursor: String!) {
    order(id: $id) {
      lineItems(first: ${LINE_PAGE_SIZE}, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          customAttributes {
            key
            value
          }
        }
      }
    }
  }
`;

type Attribute = { key?: string | null; value?: string | null };

type LineConnection = {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } | null;
  nodes?: Array<{ customAttributes?: Attribute[] | null }> | null;
};

type OrderNode = {
  id?: string | null;
  currentSubtotalPriceSet?: { shopMoney?: { amount?: string | null; currencyCode?: string | null } | null } | null;
  lineItems?: LineConnection | null;
};

type OrdersPayload = {
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
  data?: {
    orders?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: OrderNode[];
    } | null;
  } | null;
};

type LineItemsPayload = {
  errors?: Array<{ message?: string }>;
  data?: { order?: { lineItems?: LineConnection | null } | null } | null;
};

export type StoreAovReport = {
  available: boolean;
  denied: boolean;
  truncated: boolean;
  /** A total was missing, a page returned GraphQL errors, or gift lines were not fully read. */
  incomplete: boolean;
  /** Currency of the shop-money amounts that were averaged. Null when those amounts cannot be labeled. */
  currencyCode: string | null;
  summary: OrderAovSummary;
};

const emptySummary = summarizeOrderAov([]);

export async function getStoreAovReport(admin: ShopifyAdminClient): Promise<StoreAovReport> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - ORDER_WINDOW_DAYS);
  const query = `created_at:>=${since.toISOString().slice(0, 10)}`;
  const samples: Array<{ total: number; influenced: boolean }> = [];
  const lineBudget = { remaining: MAX_EXTRA_LINE_REQUESTS };
  let cursor: string | null = null;
  let truncated = false;
  let incomplete = false;
  let currencyCode: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let payload: OrdersPayload;
    try {
      const response = await admin.graphql(ORDERS_QUERY, { variables: { cursor, query } });
      payload = (await response.json()) as OrdersPayload;
    } catch {
      return unavailable({ denied: false, incomplete: false });
    }

    if (payload.errors?.some(isOrderAccessError)) {
      return unavailable({ denied: true, incomplete: false });
    }
    if (payload.errors?.length) incomplete = true;

    const orders = payload.data?.orders;
    if (!orders) return unavailable({ denied: false, incomplete });

    for (const node of orders.nodes ?? []) {
      const total = parseShopMoneyAmount(node.currentSubtotalPriceSet?.shopMoney?.amount);
      const moneyCurrency = parseShopCurrencyCode(node.currentSubtotalPriceSet?.shopMoney?.currencyCode);
      if (total == null || moneyCurrency == null) {
        incomplete = true;
        continue;
      }
      if (currencyCode == null) currencyCode = moneyCurrency;
      else if (currencyCode !== moneyCurrency) {
        return unavailable({ denied: false, incomplete: true });
      }

      const gift = await classifyGift(admin, node.id, node.lineItems, lineBudget);
      if (gift === "incomplete") {
        incomplete = true;
        continue;
      }
      samples.push({ total, influenced: gift === "gift" });
    }

    if (!orders.pageInfo?.hasNextPage || !orders.pageInfo.endCursor) {
      return finish(samples, { truncated, incomplete, currencyCode });
    }
    if (page === MAX_PAGES - 1) truncated = true;
    cursor = orders.pageInfo.endCursor;
  }

  return finish(samples, { truncated: true, incomplete, currencyCode });
}

function finish(
  samples: Array<{ total: number; influenced: boolean }>,
  flags: { truncated: boolean; incomplete: boolean; currencyCode: string | null },
): StoreAovReport {
  if (samples.length === 0 && flags.incomplete) {
    return unavailable({ denied: false, incomplete: true });
  }
  return {
    available: true,
    denied: false,
    truncated: flags.truncated,
    incomplete: flags.incomplete,
    currencyCode: samples.length === 0 ? null : flags.currencyCode,
    summary: summarizeOrderAov(samples),
  };
}

function unavailable(flags: { denied: boolean; incomplete: boolean }): StoreAovReport {
  return {
    available: false,
    denied: flags.denied,
    truncated: false,
    incomplete: flags.incomplete,
    currencyCode: null,
    summary: emptySummary,
  };
}

type LineRead = "gift" | "none" | "incomplete" | "continue";

/** A page counts as fully read only when its nodes and hasNextPage flag are both present. */
function readLinePage(lines: LineConnection | null | undefined): LineRead {
  if (lines == null || !Array.isArray(lines.nodes)) return "incomplete";
  if (orderIncludesFreeGift(lineAttributes(lines))) return "gift";
  if (typeof lines.pageInfo?.hasNextPage !== "boolean") return "incomplete";
  if (!lines.pageInfo.hasNextPage) return "none";
  return lines.pageInfo.endCursor ? "continue" : "incomplete";
}

async function classifyGift(
  admin: ShopifyAdminClient,
  orderId: string | null | undefined,
  lines: LineConnection | null | undefined,
  budget: { remaining: number },
): Promise<"gift" | "none" | "incomplete"> {
  const first = readLinePage(lines);
  if (first !== "continue") return first;

  let cursor = lines?.pageInfo?.endCursor ?? null;
  let pagesRead = 1;
  while (cursor) {
    if (pagesRead >= MAX_LINE_PAGES || budget.remaining <= 0 || !orderId) return "incomplete";
    budget.remaining -= 1;
    pagesRead += 1;

    let payload: LineItemsPayload;
    try {
      const response = await admin.graphql(LINE_ITEMS_QUERY, { variables: { id: orderId, cursor } });
      payload = (await response.json()) as LineItemsPayload;
    } catch {
      return "incomplete";
    }
    if (payload.errors?.length) return "incomplete";
    const connection = payload.data?.order?.lineItems;
    const next = readLinePage(connection);
    if (next === "continue") {
      cursor = connection?.pageInfo?.endCursor ?? null;
      continue;
    }
    return next;
  }
  return "incomplete";
}

function lineAttributes(lines: LineConnection | null | undefined): Attribute[] {
  return (lines?.nodes ?? []).flatMap((line) => line.customAttributes ?? []);
}

function isOrderAccessError(error: { message?: string; extensions?: { code?: string } }): boolean {
  const code = String(error.extensions?.code || "").toUpperCase();
  const message = String(error.message || "").toLowerCase();
  return code === "ACCESS_DENIED" || message.includes("access denied") || message.includes("read_orders");
}
