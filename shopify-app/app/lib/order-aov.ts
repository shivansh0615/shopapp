import { formatAdminMoney } from "./admin-money";

export const FREE_GIFT_LINE_PROPERTY = "_fgpb_free_gift";

/** A real shop amount, including zero. Missing or unparseable text is null, never zero. */
export function parseShopMoneyAmount(amount: string | null | undefined): number | null {
  if (typeof amount !== "string") return null;
  const trimmed = amount.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function parseShopCurrencyCode(currencyCode: string | null | undefined): string | null {
  if (typeof currencyCode !== "string") return null;
  const code = currencyCode.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Formats an AOV figure only when the amount's own currency is known. */
export function aovFigure(amount: number | null, currencyCode: string | null): string | null {
  if (amount == null || currencyCode == null) return null;
  return formatAdminMoney(amount, currencyCode);
}

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

export function describeAovReport(report: {
  available: boolean;
  denied: boolean;
  truncated: boolean;
  incomplete: boolean;
  summary: Pick<OrderAovSummary, "influencedOrders" | "otherOrders">;
}): string {
  if (!report.available) {
    if (report.denied) {
      return "Average order value needs permission to read recent orders. Free gifts are still counted.";
    }
    if (report.incomplete) {
      return "Average order value is unavailable because some orders could not be read in full or did not share one currency. Free gifts are still counted.";
    }
    return "Order totals could not be loaded. Free gifts are still counted.";
  }

  const omitted = report.incomplete
    ? " Some orders were left out because a total was missing or their gift lines could not be read in full."
    : "";
  const { influencedOrders, otherOrders } = report.summary;

  if (influencedOrders === 0) {
    if (!report.truncated && !report.incomplete) {
      return "No completed order in the last 60 days included an UpsellTrix gift. The gift count above includes gifts added to carts.";
    }
    const scope = report.truncated
      ? "This sample is the latest 400 orders in the last 60 days. Older orders in that window were not inspected."
      : "Orders outside the ones that could be read were not inspected.";
    return `None of the orders included in this result had an UpsellTrix gift. ${scope}${omitted} The gift count above includes gifts added to carts.`;
  }

  if (otherOrders === 0) {
    const claim = report.truncated
      ? "Every order included in the latest 400 had a gift, so there is no other order in that sample to compare. Older orders in the last 60 days were not inspected."
      : "Every order included in this result had a gift, so there is no other order to compare.";
    return `${claim}${omitted}`;
  }

  const windowNote = report.truncated
    ? "Compared using the latest 400 orders in the last 60 days. Older orders in that window were not inspected."
    : "Compared with other orders from the last 60 days.";
  return `${windowNote} A difference above zero means orders with a gift had a higher merchandise subtotal.${omitted}`;
}
