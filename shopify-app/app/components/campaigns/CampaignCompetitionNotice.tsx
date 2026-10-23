import type { CampaignOverlapSummary } from "../../lib/campaign-overlaps";
import { formatAdminMoney } from "../../lib/admin-money";

export function CampaignCompetitionNotice({ campaigns, priority, currencyCode }: {
  campaigns: CampaignOverlapSummary[];
  priority?: number;
  currencyCode: string;
}) {
  return (
    <div style={{ minWidth: 0, display: "grid", gap: 12, fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" }}>
      <p style={{ margin: 0 }}>
        Only one campaign can be active. Pause the other campaign before activating this one.
        A tiered campaign can have up to 5 thresholds, and it awards every gift the cart has reached.
      </p>
      {campaigns.length ? (
        <div>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Campaign holding the active slot</h3>
          <p style={{ margin: "0 0 12px", color: "#595959" }}>
            Pause the campaign below before activating this one. Only one campaign can be active.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {campaigns.map((campaign) => (
              <li key={campaign.id} style={{ minWidth: 0, padding: 12, border: "1px solid #dedede", borderRadius: 8, background: "#fafafa" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "4px 12px" }}>
                  <strong style={{ minWidth: 0 }}>{campaign.name}</strong>
                  <span>Priority {campaign.priority} · #{campaign.id}</span>
                </div>
                <p style={{ margin: "4px 0 0" }}>
                  {campaign.spendGoals.length === 1 ? "Spend goal: " : "Tier goals: "}
                  {campaign.spendGoals.map((goal) => formatAdminMoney(goal, campaign.currencyCode || currencyCode)).join(" / ")}
                  {campaign.startsLater ? " · Scheduled to start later" : ""}
                </p>
                {priority !== undefined && Number.isFinite(priority) ? (
                  <p style={{ margin: "4px 0 0", color: "#595959" }}>
                    Pause this campaign before activating the one you are editing.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ margin: 0, color: "#595959" }}>No other campaign is holding the active slot.</p>
      )}
    </div>
  );
}
