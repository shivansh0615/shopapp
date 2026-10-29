import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { CampaignTypeIcon } from "../components/ui/CampaignTypeIcon";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { StatusBadge } from "../components/ui/StatusBadge";
import { usePublishedThemeEmbedStatus } from "../components/ui/usePublishedThemeEmbedStatus";
import { formatAdminDate, formatTypeLabel } from "../lib/campaign-ui";
import { homeThemeGate } from "../lib/published-theme-embed";
import { buildThemeAppBlockDeepLink, buildThemeAppEmbedDeepLink } from "../lib/theme-embed-deeplink";
import { authenticateAdmin } from "../shopify.server";
import { getDashboardSummary, type DashboardSummary } from "../services/dashboard.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const summary = await getDashboardSummary(session.shop);
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  let embedDeepLink: string | null = null;
  let blockDeepLink: string | null = null;
  try {
    embedDeepLink = buildThemeAppEmbedDeepLink({ shop: session.shop, apiKey });
    blockDeepLink = buildThemeAppBlockDeepLink({ shop: session.shop, apiKey });
  } catch {
    embedDeepLink = null;
    blockDeepLink = null;
  }

  return {
    summary,
    storePreviewHref: `https://${session.shop}`,
    embedDeepLink,
    blockDeepLink,
  };
};

export default function Index() {
  const { summary, storePreviewHref, embedDeepLink, blockDeepLink } = useLoaderData<typeof loader>();
  const location = useLocation();
  const { status, refresh } = usePublishedThemeEmbedStatus();
  const gate = homeThemeGate(status);
  const recentCampaigns = summary.latestCampaigns.slice(0, 5);
  const empty = summary.totalCampaigns === 0;
  const live = liveCampaign(summary);

  if (gate === "checking") {
    return (
      <main className="fgpb-home fgpb-home--quiet">
        <div className="fgpb-home__wrap">
          <PageHeader title="Home" subtitle="Checking the published theme." />
          <p className="fgpb-home__detail" role="status">Checking whether the UpsellTrix app embed is turned on.</p>
        </div>
      </main>
    );
  }

  if (gate === "setup") {
    return (
      <main className="fgpb-home fgpb-home--quiet">
        <div className="fgpb-home__wrap">
          <PageHeader
            title="Set up your theme"
            subtitle="Shoppers see the gift after the app embed is on and the product block is added."
          />
          <section className="fgpb-home__setup fgpb-home__setup--gate" aria-labelledby="fgpb-home-gate-title">
            <div>
              <p className="fgpb-home__kicker">Theme setup</p>
              <h2 id="fgpb-home-gate-title">Turn on UpsellTrix in your theme</h2>
              <p className="fgpb-home__detail">The campaign home stays hidden until the published theme has the app embed turned on.</p>
              <ol className="fgpb-theme-steps">
                <li>Turn on the UpsellTrix app embed, then save the theme.</li>
                <li>Add the UpsellTrix block to the product page, then save.</li>
              </ol>
              <div className="fgpb-home__gate-actions">
                {embedDeepLink ? (
                  <a className="fgpb-btn fgpb-btn--primary" href={embedDeepLink} target="_top" rel="noreferrer">
                    Open app embeds
                  </a>
                ) : (
                  <p className="fgpb-home__detail">Open Online Store, then Themes, then Customize, then App embeds.</p>
                )}
                {blockDeepLink ? (
                  <a className="fgpb-btn fgpb-btn--secondary" href={blockDeepLink} target="_top" rel="noreferrer">
                    Add product block
                  </a>
                ) : null}
                <button type="button" className="fgpb-btn fgpb-btn--secondary" onClick={() => void refresh()}>
                  Check again
                </button>
              </div>
              <p className="fgpb-home__detail">Dawn and Savor are the supported themes. Save the theme, then return here and check again.</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="fgpb-home fgpb-home--quiet">
      <div className="fgpb-home__wrap">
        <PageHeader
          title="Home"
          subtitle={homeSubtitle(summary)}
          actions={<PrimaryButton href="/app/campaigns/new">Create campaign</PrimaryButton>}
        />

        <MerchantNoticeBanner />

        {empty ? (
          <section className="fgpb-home__empty">
            <h2>Create your first campaign</h2>
            <p>Choose a spend goal or a set of tiers, pick the gift, and activate the campaign when it is ready.</p>
          </section>
        ) : (
          <>
            {live ? (
              <section className="fgpb-home__live" aria-labelledby="fgpb-home-live-title">
                <div>
                  <p className="fgpb-home__kicker">{live.kicker}</p>
                  <h2 id="fgpb-home-live-title">{live.title}</h2>
                  <p className="fgpb-home__detail">{live.detail}</p>
                </div>
                <Link
                  to={{ pathname: live.href, search: location.search }}
                  className="fgpb-home__manage"
                >
                  {live.action}
                </Link>
              </section>
            ) : null}

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

        <section className="fgpb-home__setup" aria-labelledby="fgpb-home-setup-title">
          <div>
            <h2 id="fgpb-home-setup-title">Theme setup</h2>
            <p className="fgpb-home__detail">Enable the UpsellTrix app embed in your theme to display your campaign.</p>
          </div>
          <Link to={{ pathname: "/app/widgets", search: location.search }} className="fgpb-home__manage">
            Check theme setup
          </Link>
        </section>

        <nav className="fgpb-home__links" aria-label="More">
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
  if (summary.activeCampaigns === 1) return "One campaign is active.";
  if (summary.activeCampaigns > 1) return `${summary.activeCampaigns} campaigns are active.`;
  return "No campaign is active right now.";
}

function liveCampaign(summary: DashboardSummary): { kicker: string; title: string; detail: string; href: string; action: string } | null {
  const active = summary.activeCampaignList[0] ?? null;
  if (summary.activeCampaigns > 1) {
    return {
      kicker: "Active campaigns",
      title: `${summary.activeCampaigns} campaigns are active`,
      detail: "Only one campaign should run at a time. Activate the offer you want and the others will pause.",
      href: "/app/campaigns",
      action: "Review campaigns",
    };
  }
  if (active) {
    return {
      kicker: "Active campaign",
      title: active.name,
      detail: formatTypeLabel(active.campaignType),
      href: `/app/campaigns/${active.id}`,
      action: "Manage",
    };
  }
  if (summary.draftCampaigns > 0) {
    return {
      kicker: "No active campaign",
      title: "No campaign is active",
      detail: summary.draftCampaigns === 1
        ? "One draft is waiting. Open it when you are ready to activate it."
        : `${summary.draftCampaigns} drafts are waiting. Open one when you are ready to activate it.`,
      href: "/app/campaigns",
      action: "Review drafts",
    };
  }
  if (summary.pausedCampaigns > 0) {
    return {
      kicker: "No active campaign",
      title: "No campaign is active",
      detail: summary.pausedCampaigns === 1
        ? "One campaign is paused. Turn it on from the campaign list when you want it in the cart."
        : `${summary.pausedCampaigns} campaigns are paused. Turn one on from the list when you want it in the cart.`,
      href: "/app/campaigns",
      action: "Review paused",
    };
  }
  return null;
}
