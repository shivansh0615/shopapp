import { getCampaignOverlapSummaries, parseCampaignPriority } from "../lib/campaign-overlaps";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { CampaignBuilderForm } from "../components/campaigns/CampaignBuilderForm";
import { PageHeader } from "../components/layout/PageHeader";
import {
  LIVE_FIXED_DISCOUNT_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_TYPE,
  LIVE_PROMOTION_TYPE,
  LIVE_TIERED_FREE_GIFTS_TYPE,
  parseWidgetSettingsFromForm,
} from "../lib/campaign-ui";
import { redirectWithSyncNotice } from "../lib/merchant-notices";
import { authenticateAdmin } from "../shopify.server";
import { createCampaign, getCampaigns, validateActivationCapacity } from "../services/campaign.server";
import { runMerchantDiscountSync } from "../services/discount-sync.server";
import { getSettings } from "../services/settings.server";
import { parseRewardTiersFormField } from "../services/promotion-engine/tier-validation";
import { getShopCurrencyCode, validateGiftVariantForOnlineStore } from "../services/shopify-admin.server";
import { containerStyle, pageStyle } from "../styles/tokens";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const currencyCode = await getShopCurrencyCode(admin);
  await getSettings(session.shop, currencyCode);
  return { currencyCode, competingCampaigns: getCampaignOverlapSummaries(await getCampaigns(session.shop)) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const currencyCode = await getShopCurrencyCode(admin);
  const formData = await request.formData();
  let priority: number;
  try { priority = parseCampaignPriority(formData.get("priority"), 0); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid priority." }; }
  const intent = String(formData.get("intent") || "draft");
  const status = intent === "activate" ? "ACTIVE" : "DRAFT";
  const campaignType = String(formData.get("campaignType") || LIVE_PROMOTION_TYPE);
    if (status === "ACTIVE") {
      const capacityError = await validateActivationCapacity(session.shop, campaignType);
      if (capacityError) return { error: capacityError };
    }
  const isPercentage = campaignType === LIVE_PERCENTAGE_DISCOUNT_TYPE;
  const isFixed = campaignType === LIVE_FIXED_DISCOUNT_TYPE;
  const isTiered = campaignType === LIVE_TIERED_FREE_GIFTS_TYPE;
  const isNonGift = isPercentage || isFixed;

  const giftProductId = String(formData.get("giftProductId") || "").trim();
  const giftVariantId = String(formData.get("giftVariantId") || "").trim();
  const giftQuantity = Number(formData.get("giftQuantity") || 1);
  const discountPercentage = Number(formData.get("discountPercentage") || 0);
  const fixedDiscountAmount = String(formData.get("fixedDiscountAmount") || "").trim();
  const thresholdRaw = String(formData.get("threshold") || "").trim();

  let rewardTiers;
  if (isTiered) {
    try {
      rewardTiers = parseRewardTiersFormField(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid tier configuration.";
      return { error: message };
    }

    if (status === "ACTIVE" || status === "DRAFT") {
      for (let i = 0; i < rewardTiers.length; i++) {
        const tier = rewardTiers[i]!;
        if (!tier.giftProductId || !tier.giftVariantId) {
          return { error: `Tier ${i + 1}: Select a gift product and variant before saving.` };
        }
        const variantValidation = await validateGiftVariantForOnlineStore(
          admin,
          session.shop,
          tier.giftVariantId,
          {
            expectedProductId: tier.giftProductId ?? undefined,
            requireSellable: status === "ACTIVE",
          },
        );
        if (!variantValidation.valid) {
          return {
            error: `Tier ${i + 1}: ${variantValidation.reason}`,
          };
        }
      }
    }
  } else if (isPercentage) {
    if (!Number.isFinite(discountPercentage) || discountPercentage < 1 || discountPercentage > 100) {
      return { error: "Enter a discount percentage between 1 and 100." };
    }
  } else if (isFixed) {
    if (!fixedDiscountAmount) {
      return { error: "Enter a fixed discount amount greater than 0." };
    }
  } else {
    if (!giftProductId || !giftVariantId) {
      return { error: "Select a gift product and variant before saving." };
    }

    if (giftQuantity !== 1) {
      return { error: "Classic free gifts support exactly one unit per cart." };
    }

    const variantValidation = await validateGiftVariantForOnlineStore(
      admin,
      session.shop,
      giftVariantId,
      { expectedProductId: giftProductId, requireSellable: status === "ACTIVE" },
    );
    if (!variantValidation.valid) {
      return { error: variantValidation.reason };
    }
  }

  let campaign;
  try {
    campaign = await createCampaign({
      shop: session.shop,
      name: String(formData.get("name") || "Untitled Campaign").trim() || "Untitled Campaign",
      campaignType,
      priority,
      threshold: thresholdRaw || "0",
      giftProductId: isNonGift || isTiered ? "" : giftProductId,
      giftProductTitle:
        isNonGift || isTiered
          ? undefined
          : String(formData.get("giftProductTitle") || "") || undefined,
      giftProductImage:
        isNonGift || isTiered
          ? undefined
          : String(formData.get("giftProductImage") || "") || undefined,
      giftVariantId: isNonGift || isTiered ? undefined : giftVariantId,
      giftQuantity,
      discountPercentage: isPercentage ? discountPercentage : null,
      fixedDiscountAmount: isFixed ? fixedDiscountAmount : null,
      rewardTiers: isTiered ? rewardTiers : undefined,
      placements: formData.getAll("placements").map(String),
      widgetSettings: parseWidgetSettingsFromForm(formData),
      status,
      currencyCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create campaign.";
    return { error: message };
  }

  const sync = await runMerchantDiscountSync(admin, session.shop);
  return redirectWithSyncNotice(
    `/app/campaigns/${campaign.id}`,
    request,
    sync,
    status === "ACTIVE" ? "activated" : "saved",
  );
};

export default function CreateCampaignPage() {
  const { currencyCode, competingCampaigns } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link to={{ pathname: "/app/campaigns", search: location.search }} className="fgpb-back-link">
          ← Campaigns
        </Link>
        <PageHeader
          title="Create campaign"
          subtitle="Choose the reward and when shoppers receive it."
          actions={
            <>
              <button
                type="submit"
                form="campaign-create-form"
                name="intent"
                value="draft"
                className="fgpb-btn fgpb-btn--secondary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Save draft"}
              </button>
              <button
                type="submit"
                form="campaign-create-form"
                name="intent"
                value="activate"
                className="fgpb-btn fgpb-btn--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Activate"}
              </button>
            </>
          }
        />

        <Form method="post" id="campaign-create-form">
          <CampaignBuilderForm
            mode="create"
            formId="campaign-create-form"
            error={actionData?.error}
            isSubmitting={isSubmitting}
            currencyCode={currencyCode}
            competingCampaigns={competingCampaigns}
          />
        </Form>
      </div>
    </main>
  );
}
