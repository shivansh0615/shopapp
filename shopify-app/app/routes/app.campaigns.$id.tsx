import { getCampaignOverlapSummaries, parseCampaignPriority } from "../lib/campaign-overlaps";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import {
  CampaignBuilderForm,
  type CampaignBuilderInitial,
} from "../components/campaigns/CampaignBuilderForm";
import { CampaignDeleteButton } from "../components/campaigns/CampaignActionsMenu";
import type { InitialSelectedProduct, SelectedGiftProduct } from "../components/campaigns/ProductPicker";
import type { BuilderTierDraft } from "../components/campaigns/tier-builder";
import { PageHeader } from "../components/layout/PageHeader";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { StatusBadge } from "../components/ui/StatusBadge";
import {
  parseWidgetSettingsFromForm,
  STOREFRONT_PLACEMENTS,
  widgetFromCampaign,
  LIVE_FIXED_DISCOUNT_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_TYPE,
  LIVE_TIERED_FREE_GIFTS_TYPE,
} from "../lib/campaign-ui";
import type { CelebrationPopupStyle } from "../lib/widget-settings";
import { authenticateAdmin } from "../shopify.server";
import {
  getCampaign,
  getCampaigns,
  validateActivationCapacity,
  updateCampaign,
  type CampaignStatus,
  type CampaignWithTiers,
} from "../services/campaign.server";
import { runMerchantDiscountSync } from "../services/discount-sync.server";
import { parseRewardTiersFormField } from "../services/promotion-engine/tier-validation";
import {
  resolveFixedDiscountMajor,
  resolveThresholdMajor,
  resolveTierThresholdMoney,
  moneyToMajorNumber,
} from "../lib/money";
import {
  getShopCurrencyCode,
  getVariant,
  validateGiftVariantForOnlineStore,
  type ShopifyAdminClient,
} from "../services/shopify-admin.server";
import { redirectWithSyncNotice } from "../lib/merchant-notices";
import { containerStyle, pageStyle } from "../styles/tokens";

type RewardTierRow = CampaignWithTiers["rewardTiers"][number];

function campaignToInitialSelectedProduct(
  campaign: Pick<CampaignWithTiers, "giftProductId" | "giftProductTitle" | "giftProductImage" | "giftVariantId">,
): InitialSelectedProduct | null {
  if (!campaign.giftProductId) return null;
  return {
    id: campaign.giftProductId,
    title: campaign.giftProductTitle ?? "Selected gift",
    image: campaign.giftProductImage ?? null,
    firstVariant: {
      id: campaign.giftVariantId ?? "",
      title: "Selected variant",
    },
  };
}

function campaignToSelectedGift(
  campaign: Pick<CampaignWithTiers, "giftProductId" | "giftProductTitle" | "giftProductImage" | "giftVariantId">,
): SelectedGiftProduct | null {
  const initial = campaignToInitialSelectedProduct(campaign);
  if (!initial) return null;
  return {
    productId: initial.id,
    title: initial.title,
    imageUrl: initial.image,
    variantId: initial.firstVariant.id,
    variantTitle: initial.firstVariant.title,
  };
}

function tierToBuilderDraft(
  tier: RewardTierRow,
  currencyCode?: string | null,
): BuilderTierDraft {
  return {
    id: tier.id,
    threshold: moneyToMajorNumber(resolveTierThresholdMoney(tier, currencyCode)),
    gift: tier.giftVariantId
      ? {
          productId: tier.giftProductId || "",
          title: tier.giftProductTitle || "Selected gift",
          imageUrl: tier.giftProductImage ?? null,
          variantId: tier.giftVariantId,
          variantTitle: "Selected variant",
        }
      : null,
  };
}

async function toBuilderInitial(
  campaign: CampaignWithTiers,
  admin: ShopifyAdminClient,
): Promise<CampaignBuilderInitial> {
  const widget = widgetFromCampaign(campaign);
  const placements = Array.isArray(campaign.placements)
    ? campaign.placements.map(String)
    : ["Product Page", "Cart Drawer"];

  const gift = campaignToSelectedGift(campaign);
  const initialGift = campaignToInitialSelectedProduct(campaign);
  if (gift?.variantId) {
    const variant = await getVariant(admin, gift.variantId).catch(() => null);
    if (variant) {
      gift.variantTitle = variant.title;
      if (initialGift) initialGift.firstVariant.title = variant.title;
    }
  }
  const rewardTiers = await Promise.all((campaign.rewardTiers || []).map(async (tier) => {
    const draft = tierToBuilderDraft(tier, campaign.currencyCode);
    if (draft.gift?.variantId) {
      const variant = await getVariant(admin, draft.gift.variantId).catch(() => null);
      if (variant) draft.gift.variantTitle = variant.title;
    }
    return draft;
  }));

  return {
    name: campaign.name,
    priority: campaign.priority,
    campaignType: campaign.campaignType,
    threshold: resolveThresholdMajor(campaign),
    giftQuantity: campaign.giftQuantity,
    discountPercentage:
      campaign.discountPercentage != null && Number.isFinite(campaign.discountPercentage)
        ? Math.trunc(campaign.discountPercentage)
        : 10,
    fixedDiscountAmount: resolveFixedDiscountMajor(campaign) ?? 100,
    gift,
    initialGift,
    rewardTiers,
    heading: widget.heading || "",
    description: widget.description || "",
    unlockedHeading: widget.unlockedHeading || "",
    unlockedDescription: widget.unlockedDescription || "",
    barColor: widget.barColor || "#111111",
    backgroundColor: widget.backgroundColor || "#FAFAFA",
    textColor: widget.textColor || "#111111",
    borderRadius: widget.borderRadius ?? 16,
    progressHeight: widget.progressHeight ?? 12,
    widgetPadding: widget.widgetPadding ?? 16,
    buttonText: widget.buttonText || "Continue Shopping",
    template: widget.template || "Premium",
    placements,
    cartBarHeight: widget.cartProgressBar?.height ?? 6,
    cartBarRadius: widget.cartProgressBar?.borderRadius ?? 8,
    cartBarCompact: widget.cartProgressBar?.compact !== false,
    cartBarEnabled: widget.cartProgressBar?.enabled !== false,
    cartBarBannerTitle: widget.cartProgressBar?.bannerTitle || "SHOP MORE, WIN FREEBIES",
    cartBarBannerSubtitle:
      widget.cartProgressBar?.bannerSubtitle || "Free gifts worth unlocking",
    cartBarBannerBg: widget.cartProgressBar?.bannerBackgroundColor || "#6b7c4a",
    cartBarBannerText: widget.cartProgressBar?.bannerTextColor || "#ffffff",
    cartBarBodyBg: widget.cartProgressBar?.bodyBackgroundColor || "#ffffff",
    cartBarTrackColor: widget.cartProgressBar?.trackColor || "#e8e8e8",
    cartBarMarkBorder: widget.cartProgressBar?.markBorderColor || "#cfcfcf",
    cartBarTierLabel: widget.cartProgressBar?.tierLabel || "Gift",
    cartBarFinalTierLabel: widget.cartProgressBar?.finalTierLabel || "Bumper",
    celebEnabled: widget.celebrationPopup?.enabled !== false,
    celebStyle: (widget.celebrationPopup?.style || "classic") as CelebrationPopupStyle,
    celebPlacement: (widget.celebrationPopup?.placement || "center") as "center" | "drawer",
    celebTierHeading:
      widget.celebrationPopup?.tierHeading || "You've unlocked a free gift!",
    celebTierDescription:
      widget.celebrationPopup?.tierDescription || "Keep shopping to unlock more tier gifts.",
    celebHeading: widget.celebrationPopup?.heading || "",
    celebDescription: widget.celebrationPopup?.description || "",
    celebButtonText: widget.celebrationPopup?.buttonText || "Awesome",
    celebBorderRadius: widget.celebrationPopup?.borderRadius ?? 18,
    celebDrawerSizePercent: widget.celebrationPopup?.drawerSizePercent ?? 52,
    celebCardBg: widget.celebrationPopup?.cardBackgroundColor || "#ffffff",
    celebTitleColor: widget.celebrationPopup?.titleColor || "#111111",
    celebDescColor: widget.celebrationPopup?.descriptionColor || "#555555",
    celebBtnBg: widget.celebrationPopup?.buttonBackgroundColor || "#111111",
    celebBtnText: widget.celebrationPopup?.buttonTextColor || "#ffffff",
    celebIconBg: widget.celebrationPopup?.iconBackgroundColor || "#111111",
    celebShowIcon: widget.celebrationPopup?.showIcon !== false,
    celebShowConfetti: widget.celebrationPopup?.showConfetti !== false,
    celebAutoCloseMs: widget.celebrationPopup?.autoCloseMs ?? 6500,
    status: campaign.status,
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const campaign = await getCampaign(id, session.shop);
  if (!campaign) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const [currencyCode, initial] = await Promise.all([
    getShopCurrencyCode(admin),
    toBuilderInitial(campaign, admin),
  ]);

  return { campaign, currencyCode, initial, competingCampaigns: getCampaignOverlapSummaries(await getCampaigns(session.shop), campaign) };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const existing = await getCampaign(id, session.shop);
  if (!existing) {
    throw new Response("Campaign not found", { status: 404 });
  }

  const currencyCode = await getShopCurrencyCode(admin);

  const formData = await request.formData();
  let priority: number;
  try { priority = parseCampaignPriority(formData.get("priority"), existing.priority); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid priority." }; }
  const intent = String(formData.get("intent") || "save");
  const campaignType = String(formData.get("campaignType") || existing.campaignType);
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

  let status = existing.status as CampaignStatus;
  if (intent === "draft") status = "DRAFT";
  else if (intent === "activate") status = "ACTIVE";
  else if (intent === "pause") status = "PAUSED";
  if (status === "ACTIVE") {
    const capacityError = await validateActivationCapacity(session.shop, campaignType, id);
    if (capacityError) return { error: capacityError };
  }

  let rewardTiers;
  if (isTiered) {
    try {
      rewardTiers = parseRewardTiersFormField(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid tier configuration.";
      return { error: message };
    }

    if (intent !== "pause" && (status === "ACTIVE" || status === "DRAFT" || status === "PAUSED")) {
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
            expectedProductId: tier.giftProductId,
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
    if (!giftProductId) {
      if (intent === "activate" || status === "ACTIVE") {
        return { error: "A gift product is required to activate or save an active campaign." };
      }
      return { error: "A gift product is required before saving." };
    }

    if (!giftVariantId) {
      return { error: "Select an available gift variant before saving." };
    }

    if (giftQuantity !== 1) {
      return { error: "Classic free gifts support exactly one unit per cart." };
    }

    if (intent !== "pause") {
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
  }

  try {
    await updateCampaign(id, session.shop, {
      name: String(formData.get("name") || "").trim() || "Untitled Campaign",
      campaignType,
      priority,
      currencyCode,
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
      giftVariantId: isNonGift || isTiered ? null : giftVariantId,
      giftQuantity,
      discountPercentage: isPercentage ? discountPercentage : null,
      fixedDiscountAmount: isFixed ? fixedDiscountAmount : null,
      ...(isTiered ? { rewardTiers } : {}),
      placements: [...STOREFRONT_PLACEMENTS],
      widgetSettings: parseWidgetSettingsFromForm(formData, existing.widgetSettings),
      status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update campaign.";
    return { error: message };
  }

  const sync = await runMerchantDiscountSync(admin, session.shop);
  const successNotice =
    intent === "pause" || status === "PAUSED"
      ? "paused"
      : status === "ACTIVE" || intent === "activate"
        ? "activated"
        : "saved";
  return redirectWithSyncNotice(`/app/campaigns/${id}`, request, sync, successNotice);
};

export default function EditCampaignPage() {
  const { campaign, currencyCode, initial, competingCampaigns } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const location = useLocation();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <Link to={{ pathname: "/app/campaigns", search: location.search }} className="fgpb-back-link">
          ← Back to Campaigns
        </Link>

        <MerchantNoticeBanner />

        <PageHeader
          title={campaign.name || "Untitled campaign"}
          subtitle="Name the offer, set the reward, then check the preview."
          status={<StatusBadge status={campaign.status} />}
          actions={
            <div className="fgpb-editor-actions">
              <button
                type="submit"
                form="campaign-edit-form"
                name="intent"
                value="draft"
                className="fgpb-btn fgpb-btn--secondary"
                disabled={isSubmitting}
              >
                Save as draft
              </button>
              {campaign.status === "ACTIVE" ? (
                <button
                  type="submit"
                  form="campaign-edit-form"
                  name="intent"
                  value="pause"
                  className="fgpb-btn fgpb-btn--secondary"
                  disabled={isSubmitting}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="submit"
                  form="campaign-edit-form"
                  name="intent"
                  value="activate"
                  className="fgpb-btn fgpb-btn--secondary"
                  disabled={isSubmitting}
                >
                  Activate
                </button>
              )}
              <button
                type="submit"
                form="campaign-edit-form"
                name="intent"
                value="save"
                className="fgpb-btn fgpb-btn--primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving…" : "Save"}
              </button>
            </div>
          }
        />

        <Form method="post" id="campaign-edit-form">
          <CampaignBuilderForm
            key={`edit-${campaign.id}-${new Date(campaign.updatedAt).getTime()}`}
            mode="edit"
            formId="campaign-edit-form"
            error={actionData?.error}
            isSubmitting={isSubmitting}
            initial={initial}
            currencyCode={currencyCode}
            competingCampaigns={competingCampaigns}
          />
        </Form>

        <div className="fgpb-danger-zone">
          <div>
            <p className="fgpb-danger-zone__title">Delete campaign</p>
            <p className="fgpb-danger-zone__text">Removes this promotion and syncs the store discount.</p>
          </div>
          <CampaignDeleteButton campaignId={campaign.id} />
        </div>
      </div>
    </main>
  );
}
