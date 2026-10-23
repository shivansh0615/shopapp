import type { ActionFunctionArgs } from "react-router";
import { Outlet } from "react-router";
import { authenticateAdmin } from "../shopify.server";
import {
  activateCampaign,
  deleteCampaign,
  getCampaign,
  pauseCampaign,
} from "../services/campaign.server";
import { runMerchantDiscountSync } from "../services/discount-sync.server";
import { validateGiftVariantForOnlineStore } from "../services/shopify-admin.server";
import {
  isFixedDiscountCampaignType,
  isPercentageDiscountCampaignType,
  isTieredFreeGiftsCampaignType,
} from "../services/promotion-engine/campaign-types";
import { redirectWithSyncNotice } from "../lib/merchant-notices";

/**
 * Layout owns the POST action for `/app/campaigns`.
 * Forms/fetchers that post to this path hit this route (not the index child).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const campaignId = Number(formData.get("campaignId"));

  if (!Number.isFinite(campaignId)) {
    return { error: "Invalid campaign. Refresh the page and try again." };
  }

  if (intent === "delete") {
    await deleteCampaign(campaignId, session.shop);
    const sync = await runMerchantDiscountSync(admin, session.shop);
    return redirectWithSyncNotice("/app/campaigns", request, sync, "deleted");
  }

  if (intent === "pause") {
    const paused = await pauseCampaign(campaignId, session.shop);
    if (!paused) {
      return { error: "Campaign not found. It may have been deleted — refresh and try again." };
    }
    const sync = await runMerchantDiscountSync(admin, session.shop);
    return redirectWithSyncNotice("/app/campaigns", request, sync, "paused");
  }

  if (intent === "activate") {
    const campaign = await getCampaign(campaignId, session.shop);
    if (!campaign) {
      return { error: "Campaign not found. Refresh the page and try again." };
    }

    const isDiscountOnly =
      isPercentageDiscountCampaignType(campaign.campaignType) ||
      isFixedDiscountCampaignType(campaign.campaignType);

    if (isTieredFreeGiftsCampaignType(campaign.campaignType)) {
      const tiers = campaign.rewardTiers || [];
      if (tiers.length === 0) {
        return {
          error:
            "Add at least one gift tier with a product and variant before activating this campaign.",
        };
      }
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i]!;
        if (!tier.giftProductId || !tier.giftVariantId) {
          return {
            error: `Tier ${i + 1} needs a gift product and variant before you can activate.`,
          };
        }
        const variantValidation = await validateGiftVariantForOnlineStore(
          admin,
          session.shop,
          tier.giftVariantId,
          { expectedProductId: tier.giftProductId, requireSellable: true },
        );
        if (!variantValidation.valid) {
          return { error: `Tier ${i + 1}: ${variantValidation.reason}` };
        }
      }
    } else if (!isDiscountOnly) {
      if (!campaign.giftProductId || !campaign.giftVariantId) {
        return {
          error: "Select a gift product and variant before activating this campaign.",
        };
      }
      const variantValidation = await validateGiftVariantForOnlineStore(
        admin,
        session.shop,
        campaign.giftVariantId,
        { expectedProductId: campaign.giftProductId, requireSellable: true },
      );
      if (!variantValidation.valid) {
        return { error: variantValidation.reason };
      }
    }

    try {
      await activateCampaign(campaignId, session.shop);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Campaign activation is not allowed." };
    }
    const sync = await runMerchantDiscountSync(admin, session.shop);
    return redirectWithSyncNotice("/app/campaigns", request, sync, "activated");
  }

  return { error: "That action is not supported. Refresh and try again." };
};

export default function CampaignsLayout() {
  return <Outlet />;
}
