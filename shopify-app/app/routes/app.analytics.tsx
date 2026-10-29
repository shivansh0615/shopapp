import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { authenticateAdmin } from "../shopify.server";
import { getFreeGiftsAddedCount } from "../services/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const giftsAdded = await getFreeGiftsAddedCount(session.shop);
  return { giftsAdded };
};

export default function AnalyticsPage() {
  const { giftsAdded } = useLoaderData<typeof loader>();

  return (
    <main className="fgpb-home">
      <div className="fgpb-home__wrap fgpb-analytics">
        <PageHeader
          title="Analytics"
          subtitle="Gifts the storefront added to carts."
        />

        <section className="fgpb-home__stats" aria-label="Analytics">
          <div>
            <span>Free gifts added</span>
            <strong>{giftsAdded.toLocaleString("en-US")}</strong>
          </div>
        </section>

        <p className="fgpb-analytics__note">
          This counts gifts added to carts. It is not a count of completed orders.
        </p>
      </div>
    </main>
  );
}
