import type { CampaignOverlapSummary } from "../../lib/campaign-overlaps";
import { formatAdminMoney } from "../../lib/admin-money";

export function CampaignCompetitionNotice({ campaigns, currencyCode }: {
  campaigns: CampaignOverlapSummary[];
  priority?: number;
  currencyCode: string;
}) {
  if (!campaigns.length) {
    return (
      <p className="fgpb-slot-note">
        This offer can be the active one. Only one campaign runs at a time.
      </p>
    );
  }

  return (
    <div className="fgpb-slot-note fgpb-slot-note--busy">
      <p>Activating this campaign will pause the one that is running now.</p>
      <ul>
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <strong>{campaign.name}</strong>
            <span>
              {campaign.spendGoals.length === 1 ? "Spend " : "Tiers "}
              {campaign.spendGoals.map((goal) => formatAdminMoney(goal, campaign.currencyCode || currencyCode)).join(" / ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
