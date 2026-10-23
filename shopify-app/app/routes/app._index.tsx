import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CampaignTypeIcon } from "../components/ui/CampaignTypeIcon";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { StatusBadge } from "../components/ui/StatusBadge";
import { formatAdminDate, formatTypeLabel } from "../lib/campaign-ui";
import { authenticateAdmin } from "../shopify.server";
import { getDashboardSummary, type DashboardSummary } from "../services/dashboard.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const summary = await getDashboardSummary(session.shop);

  return {
    summary,
    storePreviewHref: `https://${session.shop}`,
  };
};

export default function Index() {
  const { summary, storePreviewHref } = useLoaderData<typeof loader>();
  const location = useLocation();
  const recentCampaigns = summary.latestCampaigns.slice(0, 5);
  const empty = summary.totalCampaigns === 0;

  return (
    <main className="fgpb-home">
      <div className="fgpb-home__wrap">
        <PageHeader
          title="Home"
          subtitle={homeSubtitle(summary)}
          actions={<PrimaryButton href="/app/campaigns/new">Create campaign</PrimaryButton>}
        />

        <MerchantNoticeBanner />

        {empty ? (
          <section className="fgpb-home__empty">
            <h2>No campaigns yet</h2>
            <p>Add a spend threshold or a set of tiers, choose the gift, and turn the campaign on.</p>
          </section>
        ) : (
          <>
            <section className="fgpb-home__stats" aria-label="Campaign counts">
              <div>
                <span>Active</span>
                <strong>{summary.activeCampaigns}</strong>
              </div>
              <div>
                <span>Paused</span>
                <strong>{summary.pausedCampaigns}</strong>
              </div>
              <div>
                <span>Drafts</span>
                <strong>{summary.draftCampaigns}</strong>
              </div>
            </section>

            <section className="fgpb-home__list" aria-labelledby="fgpb-home-recent-title">
              <div className="fgpb-home__list-head">
                <h2 id="fgpb-home-recent-title">Campaigns</h2>
                <Link to={{ pathname: "/app/campaigns", search: location.search }} className="fgpb-text-link">
                  View all
                </Link>
              </div>
              <ul className="fgpb-home__rows">
                {recentCampaigns.map((campaign) => (
                  <li key={campaign.id}>
                    <Link
                      to={{ pathname: `/app/campaigns/${campaign.id}`, search: location.search }}
                      className="fgpb-home__row"
                    >
                      <span className="fgpb-home__mark" aria-hidden>
                        <CampaignTypeIcon campaignType={campaign.campaignType} size={16} />
                      </span>
                      <span className="fgpb-home__copy">
                        <span className="fgpb-home__name">{campaign.name}</span>
                        <span className="fgpb-home__type">{formatTypeLabel(campaign.campaignType)}</span>
                      </span>
                      <span className="fgpb-home__status">
                        <StatusBadge status={campaign.status} />
                      </span>
                      <span className="fgpb-home__date">
                        {formatAdminDate(campaign.updatedAt || campaign.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        <nav className="fgpb-home__links" aria-label="More">
          <Link to={{ pathname: "/app/widgets", search: location.search }}>Theme setup</Link>
          <Link to={{ pathname: "/app/analytics", search: location.search }}>Analytics</Link>
          <a href={storePreviewHref} target="_blank" rel="noreferrer">
            Open storefront
          </a>
        </nav>
      </div>
    </main>
  );
}

function homeSubtitle(summary: DashboardSummary) {
  if (summary.totalCampaigns === 0) return "Free gifts for your Shopify store.";
  if (summary.activeCampaigns === 1) return "One campaign is live.";
  if (summary.activeCampaigns > 1) return `${summary.activeCampaigns} campaigns are live.`;
  return "No campaign is live right now.";
}
