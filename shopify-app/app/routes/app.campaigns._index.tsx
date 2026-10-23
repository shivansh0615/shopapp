import type { LoaderFunctionArgs } from "react-router";
import { Link, useFetchers, useLoaderData, useLocation, useSearchParams } from "react-router";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { PageHeader } from "../components/layout/PageHeader";
import { CampaignTable } from "../components/campaigns/CampaignTable";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { authenticateAdmin } from "../shopify.server";
import { getCampaigns } from "../services/campaign.server";
import { formatTypeLabel } from "../lib/campaign-ui";
import { containerStyle, pageStyle } from "../styles/tokens";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  return { campaigns: await getCampaigns(session.shop) };
};

export default function CampaignsIndexPage() {
  const { campaigns } = useLoaderData<typeof loader>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetchers = useFetchers();
  const actionError = fetchers
    .map((fetcher) => {
      const data = fetcher.data as { error?: string } | undefined;
      return data?.error;
    })
    .find(Boolean);

  const statusFilter = searchParams.get("status") || "ALL";
  const typeFilter = searchParams.get("type") || "ALL";
  const query = (searchParams.get("q") || "").trim().toLowerCase();

  const filtered = campaigns.filter((campaign) => {
    if (statusFilter !== "ALL" && campaign.status !== statusFilter) return false;
    if (typeFilter !== "ALL" && campaign.campaignType !== typeFilter) return false;
    if (!query) return true;
    const haystack = `${campaign.name} ${campaign.giftProductTitle || ""} ${campaign.campaignType}`.toLowerCase();
    return haystack.includes(query);
  });

  const types = Array.from(new Set(campaigns.map((c) => c.campaignType))).sort();

  const toolbar = (
    <div className="fgpb-toolbar fgpb-toolbar-in-panel">
      <input
        className="fgpb-input fgpb-toolbar__search"
        type="search"
        placeholder="Search campaigns"
        value={searchParams.get("q") || ""}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams);
          const value = event.target.value.trim();
          if (value) next.set("q", value);
          else next.delete("q");
          setSearchParams(next, { replace: true });
        }}
        aria-label="Search campaigns"
      />
      <select
        className="fgpb-input fgpb-toolbar__select"
        value={typeFilter}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams);
          if (event.target.value === "ALL") next.delete("type");
          else next.set("type", event.target.value);
          setSearchParams(next, { replace: true });
        }}
        aria-label="Filter by type"
      >
        <option value="ALL">All types</option>
        {types.map((type) => (
          <option key={type} value={type}>
            {formatTypeLabel(type)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <PageHeader
          title="Campaigns"
          subtitle="Manage your free-gift offers."
          actions={<PrimaryButton href="/app/campaigns/new">Create campaign</PrimaryButton>}
        />

        <MerchantNoticeBanner />
        {campaigns.filter((campaign) => campaign.status === "ACTIVE").length > 1 ? (
          <p className="fgpb-muted-note" role="status">
            Only one campaign can be active. Pause the extra active campaigns so a single offer holds the slot.
          </p>
        ) : null}

        {actionError ? (
          <div className="fgpb-notice fgpb-notice--critical" role="alert">
            <div className="fgpb-notice__body">
              <p className="fgpb-notice__title">Couldn’t complete that action</p>
              <p className="fgpb-notice__text">{actionError}</p>
              <p className="fgpb-notice__recovery">
                Fix the issue above, then try again. If it keeps failing, open Store health check.
              </p>
            </div>
          </div>
        ) : null}

        {campaigns.length === 0 ? (
          <section className="fgpb-panel">
            <CampaignTable campaigns={[]} />
          </section>
        ) : (
          <section className="fgpb-panel ut-campaign-panel">
            <div className="ut-status-tabs" role="group" aria-label="Campaign status">
              {[["ALL", "All"], ["ACTIVE", "Active"], ["DRAFT", "Draft"], ["PAUSED", "Paused"]].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (value === "ALL") next.delete("status"); else next.set("status", value);
                  setSearchParams(next, { replace: true });
                }}>{label}<span>{value === "ALL" ? campaigns.length : campaigns.filter(c => c.status === value).length}</span></button>
              ))}
            </div>
            {toolbar}
            {filtered.length === 0 ? (
              <div className="fgpb-empty" style={{ padding: "32px 16px" }}>
                <h3 className="fgpb-empty__title">No matching campaigns</h3>
                <p className="fgpb-empty__text">Try another search or clear filters.</p>
                <button
                  type="button"
                  className="fgpb-btn fgpb-btn--secondary fgpb-btn--sm"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete("q");
                    next.delete("status");
                    next.delete("type");
                    setSearchParams(next, { replace: true });
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <CampaignTable campaigns={filtered} />
            )}
          </section>
        )}

        <p className="fgpb-muted-note">
          To show gifts on your store,{" "}
          <Link to={{ pathname: "/app/widgets", search: location.search }}>enable the theme app embed</Link>.
        </p>
      </div>
    </main>
  );
}
