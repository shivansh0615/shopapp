import type { Campaign } from "@prisma/client";
import { Link, useLocation } from "react-router";
import { StatusBadge } from "../ui/StatusBadge";
import { CampaignTypeIcon } from "../ui/CampaignTypeIcon";
import { CampaignActionsMenu } from "./CampaignActionsMenu";
import {
  formatAdminDate,
  formatRewardSummary,
  formatScheduleSummary,
  formatTriggerSummary,
  formatTypeLabel,
  promotionSummaryLine,
} from "../../lib/campaign-ui";
import {
  isFixedDiscountCampaignType,
  isPercentageDiscountCampaignType,
  isTieredFreeGiftsCampaignType,
} from "../../services/promotion-engine/campaign-types";

type CampaignRow = Campaign & {
  rewardTiers?: Array<{
    threshold: number;
    giftProductId?: string | null;
    giftVariantId?: string | null;
    giftProductTitle?: string | null;
    giftProductImage?: string | null;
  }>;
};

type CampaignTableProps = {
  campaigns: CampaignRow[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptySecondary?: string;
  emptySecondaryHref?: string;
  createHref?: string;
  compact?: boolean;
};

function canActivateCampaign(campaign: CampaignRow): boolean {
  if (
    isPercentageDiscountCampaignType(campaign.campaignType) ||
    isFixedDiscountCampaignType(campaign.campaignType)
  ) {
    return true;
  }
  if (isTieredFreeGiftsCampaignType(campaign.campaignType)) {
    const tiers = campaign.rewardTiers || [];
    return (
      tiers.length > 0 &&
      tiers.every((tier) => Boolean(tier.giftProductId && tier.giftVariantId))
    );
  }
  return Boolean(campaign.giftProductId && campaign.giftVariantId);
}

function giftImageUrl(campaign: CampaignRow): string | null {
  if (campaign.giftProductImage) return campaign.giftProductImage;
  const fromTier = campaign.rewardTiers?.find((tier) => Boolean(tier.giftProductImage));
  return fromTier?.giftProductImage ?? null;
}

export function CampaignTable({
  campaigns,
  emptyTitle = "No promotions yet",
  emptyDescription = "Create your first free-gift promotion to start configuring storefront rewards.",
  emptySecondary = "Then enable the theme app embed so the progress bar can appear on your store.",
  emptySecondaryHref = "/app/widgets",
  createHref = "/app/campaigns/new",
  compact = false,
}: CampaignTableProps) {
  const location = useLocation();

  if (campaigns.length === 0) {
    return (
      <div className="fgpb-empty">
        <span className="fgpb-empty__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 5v3" />
            <path d="M8 8h8l1.2 3H6.8L8 8z" />
            <path d="M7 11v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7" />
          </svg>
        </span>
        <h3 className="fgpb-empty__title">{emptyTitle}</h3>
        <p className="fgpb-empty__text">{emptyDescription}</p>
        <Link
          to={{ pathname: createHref, search: location.search }}
          className="fgpb-btn fgpb-btn--primary"
        >
          Create promotion
        </Link>
        {emptySecondary ? (
          <p className="fgpb-empty__secondary">
            <Link to={{ pathname: emptySecondaryHref, search: location.search }}>{emptySecondary}</Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="fgpb-table-wrap">
      <table className="fgpb-table">
        <thead>
          <tr>
            <th scope="col">Campaign</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Trigger</th>
            {!compact ? <th scope="col">Reward</th> : null}
            {!compact ? <th scope="col">Schedule</th> : null}
            <th scope="col">Updated</th>
            <th scope="col">
              <span className="fgpb-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const image = giftImageUrl(campaign);
            const paused = campaign.status === "PAUSED";
            return (
              <tr
                key={campaign.id}
                className={paused ? "fgpb-table__row--paused" : undefined}
                data-status={campaign.status}
              >
                <td data-label="Campaign">
                  <div className="fgpb-table__campaign">
                    {image ? (
                      <img
                        className="fgpb-campaign-thumb"
                        src={image}
                        alt=""
                      />
                    ) : (
                      <span className="fgpb-campaign-thumb fgpb-campaign-thumb--fallback" aria-hidden>
                        <CampaignTypeIcon campaignType={campaign.campaignType} size={16} force />
                      </span>
                    )}
                    <div>
                      <Link
                        to={{ pathname: `/app/campaigns/${campaign.id}`, search: location.search }}
                        className="fgpb-table__primary-link"
                        title={campaign.name}
                      >
                        {campaign.name}
                      </Link>
                      {!compact ? (
                        <div className="fgpb-table__muted">{promotionSummaryLine(campaign)}</div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td data-label="Type">
                  <span className="fgpb-type-cell">
                    <CampaignTypeIcon campaignType={campaign.campaignType} />
                    {formatTypeLabel(campaign.campaignType)}
                  </span>
                </td>
                <td data-label="Status">
                  <StatusBadge status={campaign.status} />
                </td>
                <td data-label="Trigger">{formatTriggerSummary(campaign)}</td>
                {!compact ? <td data-label="Reward">{formatRewardSummary(campaign)}</td> : null}
                {!compact ? <td data-label="Schedule">{formatScheduleSummary(campaign)}</td> : null}
                <td data-label="Updated">{formatAdminDate(campaign.updatedAt || campaign.createdAt)}</td>
                <td className="fgpb-table__actions" data-label="Actions">
                  <CampaignActionsMenu
                    campaignId={campaign.id}
                    status={campaign.status}
                    canActivate={canActivateCampaign(campaign)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
