import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { formatAdminMoney } from "../lib/admin-money";
import { authenticateAdmin } from "../shopify.server";
import { getFreeGiftsAddedCount } from "../services/analytics.server";
import { getStoreAovReport } from "../services/order-aov.server";
import { getShopCurrencyCode } from "../services/shopify-admin.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticateAdmin(request);
  const [giftsAdded, currencyCode, aov] = await Promise.all([
    getFreeGiftsAddedCount(session.shop),
    getShopCurrencyCode(admin).catch(() => "USD"),
    getStoreAovReport(admin),
  ]);
  return { giftsAdded, currencyCode, aov };
};

export default function AnalyticsPage() {
  const { giftsAdded, currencyCode, aov } = useLoaderData<typeof loader>();
  const money = (amount: number) => formatAdminMoney(amount, currencyCode);
  const summary = aov.summary;
  const difference = summary.difference;

  return (
    <main className="fgpb-home">
      <div className="fgpb-home__wrap fgpb-analytics">
        <PageHeader
          title="Analytics"
          subtitle="Free gifts added to carts, and how order value compares over the last 60 days."
        />

        <section className="fgpb-home__stats" aria-label="Analytics">
          <div>
            <span>Free gifts added</span>
            <strong>{giftsAdded.toLocaleString("en-US")}</strong>
          </div>
          <div>
            <span>AOV with a gift</span>
            <strong>{summary.influencedAov == null ? "—" : money(summary.influencedAov)}</strong>
          </div>
          <div>
            <span>AOV difference</span>
            <strong className={differenceClass(difference)}>
              {difference == null ? "—" : signedMoney(difference, money)}
            </strong>
          </div>
        </section>

        <p className="fgpb-analytics__note">{aovNote(aov.available, aov.denied, aov.truncated, summary)}</p>
      </div>
    </main>
  );
}

function signedMoney(amount: number, money: (value: number) => string) {
  if (amount > 0) return `+${money(amount)}`;
  return money(amount);
}

function differenceClass(difference: number | null) {
  if (difference == null || difference === 0) return undefined;
  return difference > 0 ? "is-up" : "is-down";
}

function aovNote(
  available: boolean,
  denied: boolean,
  truncated: boolean,
  summary: { influencedOrders: number; otherOrders: number },
) {
  if (!available) {
    return denied
      ? "Average order value needs permission to read recent orders. Free gifts are still counted."
      : "Order totals could not be loaded. Free gifts are still counted.";
  }
  if (summary.influencedOrders === 0) {
    return "No completed order in the last 60 days included an UpsellTrix gift. The gift count above includes gifts added to carts.";
  }
  if (summary.otherOrders === 0) {
    return "Every recent order included a gift, so there is no other order to compare.";
  }
  const windowNote = truncated
    ? "Compared using the latest 400 orders in the last 60 days."
    : "Compared with other orders from the last 60 days.";
  return `${windowNote} A difference above zero means orders with a gift had a higher merchandise subtotal.`;
}
