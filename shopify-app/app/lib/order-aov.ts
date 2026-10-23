export const FREE_GIFT_LINE_PROPERTY = "_fgpb_free_gift";

export type OrderAovSample = {
  total: number;
  influenced: boolean;
};

export type OrderAovSummary = {
  influencedOrders: number;
  otherOrders: number;
  influencedAov: number | null;
  otherAov: number | null;
  /** Influenced AOV minus the AOV of orders without a gift. */
  difference: number | null;
};

export function orderIncludesFreeGift(
  attributes: Array<{ key?: string | null; value?: string | null }>,
): boolean {
  return attributes.some((attribute) => {
    const key = String(attribute.key || "").trim();
    const value = String(attribute.value || "").trim().toLowerCase();
    return key === FREE_GIFT_LINE_PROPERTY && (value === "true" || value === "1");
  });
}

export function summarizeOrderAov(orders: OrderAovSample[]): OrderAovSummary {
  let influencedTotal = 0;
  let influencedOrders = 0;
  let otherTotal = 0;
  let otherOrders = 0;

  for (const order of orders) {
    if (!Number.isFinite(order.total) || order.total < 0) continue;
    if (order.influenced) {
      influencedTotal += order.total;
      influencedOrders += 1;
    } else {
      otherTotal += order.total;
      otherOrders += 1;
    }
  }

  const influencedAov = influencedOrders > 0 ? influencedTotal / influencedOrders : null;
  const otherAov = otherOrders > 0 ? otherTotal / otherOrders : null;
  const difference =
    influencedAov != null && otherAov != null ? influencedAov - otherAov : null;

  return { influencedOrders, otherOrders, influencedAov, otherAov, difference };
}
