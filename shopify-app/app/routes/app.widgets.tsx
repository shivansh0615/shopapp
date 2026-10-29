import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { ThemeEmbedStatus } from "../components/ui/ThemeEmbedStatus";
import { buildThemeAppBlockDeepLink, buildThemeAppEmbedDeepLink } from "../lib/theme-embed-deeplink";
import { getActiveCampaigns } from "../services/campaign.server";
import { authenticateAdmin } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const shop = session.shop;
  const activeCampaigns = await getActiveCampaigns(shop);

  let embedDeepLink: string | null = null;
  let blockDeepLink: string | null = null;
  try {
    embedDeepLink = buildThemeAppEmbedDeepLink({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
    blockDeepLink = buildThemeAppBlockDeepLink({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
  } catch {
    embedDeepLink = null;
    blockDeepLink = null;
  }

  return {
    embedDeepLink,
    blockDeepLink,
    storePreviewHref: `https://${shop}`,
    activeCampaignCount: activeCampaigns.length,
  };
};

export default function WidgetsPage() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <main className="fgpb-home">
      <div className="fgpb-home__wrap">
        <PageHeader
          title="Theme setup"
          subtitle="Verified on Dawn and Savor."
          actions={
            <a className="fgpb-btn fgpb-btn--secondary" href={data.storePreviewHref} target="_blank" rel="noreferrer">
              Open storefront
            </a>
          }
        />

        <section className="fgpb-create__card fgpb-theme-setup">
          <ol className="fgpb-theme-steps">
            <li>Open App embeds in the theme editor.</li>
            <li>Turn on UpsellTrix.</li>
            <li>Select Save.</li>
            <li>Add the UpsellTrix block to the product page, then save.</li>
          </ol>
          <div className="fgpb-home__gate-actions">
          {data.embedDeepLink ? (
            <a href={data.embedDeepLink} target="_top" rel="noreferrer" className="fgpb-btn fgpb-btn--primary">
              Open app embeds
            </a>
          ) : (
            <p className="fgpb-theme-setup__note">
              Open Online Store, then Themes, then Customize, then App embeds.
            </p>
          )}
          {data.blockDeepLink ? (
            <a href={data.blockDeepLink} target="_top" rel="noreferrer" className="fgpb-btn fgpb-btn--secondary">
              Add product block
            </a>
          ) : null}
          </div>
          <p className="fgpb-theme-setup__note">
            Dawn and Savor are the supported themes. Other themes may not be supported.
          </p>
          <p className="fgpb-theme-setup__note">
            This opens the published theme. On a draft theme, turn on the same embed in that theme’s editor and save.
          </p>
          <ThemeEmbedStatus />
        </section>

        {data.activeCampaignCount === 0 ? (
          <p className="fgpb-theme-setup__note">
            Create a campaign before you test the gift.{" "}
            <Link to={{ pathname: "/app/campaigns/new", search: location.search }}>Create campaign</Link>
          </p>
        ) : null}

        <nav className="fgpb-home__links" aria-label="Related">
          <Link to={{ pathname: "/app/help/accelerated-checkout", search: location.search }}>
            Buy it now skips the gift
          </Link>
        </nav>
      </div>
    </main>
  );
}
