import type { Campaign } from "@prisma/client";
import type { WidgetSettings } from "./widget-settings";
import {
  DEFAULT_CELEBRATION_POPUP,
  DEFAULT_WIDGET_PADDING,
  normalizeCartProgressBar,
  normalizeCartRecommendations,
  normalizeCelebrationPopup,
  normalizeWidgetPadding,
  parseWidgetSettings,
} from "./widget-settings";
import {
  getMerchantPromotionTypeOptions,
  type PromotionTypeOption,
} from "./merchant-campaign-types";
import { formatAdminMoney } from "./admin-money";

export const DEFAULT_WIDGET: WidgetSettings = {
  heading: "You are {remaining} away from your free gift",
  description: "Add more to your cart to unlock your gift.",
  unlockedHeading: "You've unlocked your free gift!",
  unlockedDescription: "You've unlocked your free gift!",
  template: "Premium",
  barColor: "#111111",
  backgroundColor: "#FAFAFA",
  textColor: "#111111",
  borderRadius: 16,
  progressHeight: 12,
  widgetPadding: DEFAULT_WIDGET_PADDING,
  buttonText: "Continue Shopping",
  celebrationPopup: { ...DEFAULT_CELEBRATION_POPUP },
  cartProgressBar: {
    enabled: true,
    height: 6,
    borderRadius: 8,
    compact: true,
    bannerTitle: "SHOP MORE, WIN FREEBIES",
  },
};

/** Fully supported today — Free Gift remains a creatable type. */
export const LIVE_PROMOTION_TYPE = "Spend X -> Free Gift" as const;
export const LIVE_TIERED_FREE_GIFTS_TYPE = "Tiered Free Gifts" as const;
export const LIVE_PERCENTAGE_DISCOUNT_TYPE = "Spend X -> Percentage Discount" as const;
export const LIVE_FIXED_DISCOUNT_TYPE = "Spend X -> Fixed Discount" as const;

export type { PromotionTypeOption };

/**
 * Merchant-facing type selector — driven solely by `merchant-campaign-types.ts`.
 * Default export is create-mode options (Tiered, Free Gift, Mystery coming soon).
 */
export const PROMOTION_TYPE_OPTIONS: PromotionTypeOption[] = getMerchantPromotionTypeOptions({
  mode: "create",
});

export { getMerchantPromotionTypeOptions };

export const DEFAULT_PERCENTAGE_WIDGET: WidgetSettings = {
  heading: "You are {remaining} away from your discount",
  description: "Add more to your cart to unlock your discount.",
  unlockedHeading: "You've unlocked your discount!",
  unlockedDescription: "You've unlocked your discount!",
  template: "Premium",
  barColor: "#111111",
  backgroundColor: "#FAFAFA",
  textColor: "#111111",
  borderRadius: 16,
  progressHeight: 12,
  widgetPadding: DEFAULT_WIDGET_PADDING,
  buttonText: "Continue Shopping",
  cartProgressBar: {
    enabled: true,
    height: 6,
    borderRadius: 8,
    compact: true,
    bannerTitle: "SHOP MORE, SAVE MORE",
  },
};

/** Same progress-oriented copy as percentage — Fixed Discount has no gift UI. */
export const DEFAULT_FIXED_DISCOUNT_WIDGET: WidgetSettings = DEFAULT_PERCENTAGE_WIDGET;

export const DEFAULT_TIERED_WIDGET: WidgetSettings = {
  heading: "You are {remaining} away from your next free gift",
  description: "Spend more to unlock the next tier gift.",
  unlockedHeading: "All rewards unlocked!",
  unlockedDescription: "You've unlocked every tier gift.",
  template: "Premium",
  barColor: "#111111",
  backgroundColor: "#FAFAFA",
  textColor: "#111111",
  borderRadius: 16,
  progressHeight: 12,
  widgetPadding: DEFAULT_WIDGET_PADDING,
  buttonText: "Continue Shopping",
  celebrationPopup: {
    ...DEFAULT_CELEBRATION_POPUP,
    tierHeading: "You've unlocked a free gift!",
    tierDescription: "Keep shopping to unlock more tier gifts.",
    heading: "All gifts unlocked!",
    description: "You've unlocked every tier gift.",
  },
  cartProgressBar: {
    enabled: true,
    height: 6,
    borderRadius: 8,
    compact: true,
    bannerTitle: "SHOP MORE, WIN FREEBIES",
    bannerSubtitle: "Free gifts worth unlocking",
    bannerBackgroundColor: "#6b7c4a",
    bannerTextColor: "#ffffff",
    bodyBackgroundColor: "#ffffff",
    trackColor: "#e8e8e8",
    markBorderColor: "#cfcfcf",
    tierLabel: "Gift",
    finalTierLabel: "Bumper",
  },
};
export const TEMPLATE_OPTIONS = [
  "Minimal",
  "Premium",
  "Gradient",
  "Cart Drawer",
  "Mobile Compact",
  "Celebration",
] as const;

export const PLACEMENT_OPTIONS = [
  "Product Page",
  "Cart Drawer",
  "Cart Page",
  "Announcement Bar",
] as const;

export const BUILDER_STEPS = [
  { id: "type", label: "Promotion type" },
  { id: "trigger", label: "Trigger" },
  { id: "reward", label: "Reward" },
  { id: "display", label: "Display" },
  { id: "placement", label: "Placement" },
  { id: "review", label: "Review" },
] as const;

export type BuilderStepId = (typeof BUILDER_STEPS)[number]["id"];

export function normalizeHexColor(value: unknown, fallback: string): string {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const [, a, b, c] = raw;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return fallback;
}

export function parseWidgetSettingsFromForm(formData: FormData, existing?: unknown): WidgetSettings {
  const existingParsed = parseWidgetSettings(existing);
  const raw = String(formData.get("widgetSettings") || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WidgetSettings;
      if (parsed && typeof parsed === "object") {
        return {
          heading: String(parsed.heading ?? DEFAULT_WIDGET.heading),
          description: String(parsed.description ?? DEFAULT_WIDGET.description),
          unlockedHeading: String(parsed.unlockedHeading ?? DEFAULT_WIDGET.unlockedHeading),
          unlockedDescription: String(parsed.unlockedDescription ?? DEFAULT_WIDGET.unlockedDescription),
          template: String(parsed.template ?? DEFAULT_WIDGET.template),
          barColor: normalizeHexColor(parsed.barColor, DEFAULT_WIDGET.barColor!),
          backgroundColor: normalizeHexColor(parsed.backgroundColor, DEFAULT_WIDGET.backgroundColor!),
          textColor: normalizeHexColor(parsed.textColor, DEFAULT_WIDGET.textColor!),
          borderRadius: Number(parsed.borderRadius ?? DEFAULT_WIDGET.borderRadius),
          progressHeight: Number(parsed.progressHeight ?? DEFAULT_WIDGET.progressHeight),
          widgetPadding: normalizeWidgetPadding(
            parsed.widgetPadding,
            existingParsed?.widgetPadding ?? DEFAULT_WIDGET.widgetPadding,
          ),
          buttonText: String(parsed.buttonText ?? DEFAULT_WIDGET.buttonText),
          cartProgressBar: normalizeCartProgressBar(
            parsed.cartProgressBar,
            existingParsed?.cartProgressBar || DEFAULT_WIDGET.cartProgressBar,
          ),
          cartRecommendations: normalizeCartRecommendations(
            parsed.cartRecommendations ?? existingParsed?.cartRecommendations,
            existingParsed?.cartRecommendations,
          ),
          celebrationPopup: normalizeCelebrationPopup(
            parsed.celebrationPopup,
            existingParsed?.celebrationPopup || DEFAULT_WIDGET.celebrationPopup,
          ),
        };
      }
    } catch {
      // fall through
    }
  }

  const hasDiscrete =
    formData.has("widgetHeading") ||
    formData.has("widgetBarColor") ||
    formData.has("widgetTemplate") ||
    formData.has("cartBarHeight");

  if (hasDiscrete) {
    return {
      heading: String(formData.get("widgetHeading") || DEFAULT_WIDGET.heading),
      description: String(formData.get("widgetDescription") || DEFAULT_WIDGET.description),
      unlockedHeading: String(formData.get("widgetUnlockedHeading") || DEFAULT_WIDGET.unlockedHeading),
      unlockedDescription: String(
        formData.get("widgetUnlockedDescription") || DEFAULT_WIDGET.unlockedDescription,
      ),
      template: String(formData.get("widgetTemplate") || DEFAULT_WIDGET.template),
      barColor: normalizeHexColor(formData.get("widgetBarColor"), DEFAULT_WIDGET.barColor!),
      backgroundColor: normalizeHexColor(formData.get("widgetBackgroundColor"), DEFAULT_WIDGET.backgroundColor!),
      textColor: normalizeHexColor(formData.get("widgetTextColor"), DEFAULT_WIDGET.textColor!),
      borderRadius: Number(formData.get("widgetBorderRadius") || DEFAULT_WIDGET.borderRadius),
      progressHeight: Number(formData.get("widgetProgressHeight") || DEFAULT_WIDGET.progressHeight),
      widgetPadding: normalizeWidgetPadding(
        formData.get("widgetPadding"),
        existingParsed?.widgetPadding ?? DEFAULT_WIDGET.widgetPadding,
      ),
      buttonText: String(formData.get("widgetButtonText") || DEFAULT_WIDGET.buttonText),
      cartProgressBar: normalizeCartProgressBar(
        {
          enabled: formData.get("cartBarEnabled") !== "false",
          height: formData.get("cartBarHeight"),
          borderRadius: formData.get("cartBarRadius"),
          compact: formData.get("cartBarCompact") !== "false",
          bannerTitle: formData.get("cartBarBannerTitle"),
          bannerSubtitle: formData.get("cartBarBannerSubtitle"),
          bannerBackgroundColor: formData.get("cartBarBannerBg"),
          bannerTextColor: formData.get("cartBarBannerText"),
          bodyBackgroundColor: formData.get("cartBarBodyBg"),
          trackColor: formData.get("cartBarTrackColor"),
          markBorderColor: formData.get("cartBarMarkBorder"),
          tierLabel: formData.get("cartBarTierLabel"),
          finalTierLabel: formData.get("cartBarFinalTierLabel"),
        },
        existingParsed?.cartProgressBar || DEFAULT_WIDGET.cartProgressBar,
      ),
      cartRecommendations: normalizeCartRecommendations(
        existingParsed?.cartRecommendations,
        existingParsed?.cartRecommendations,
      ),
      celebrationPopup: normalizeCelebrationPopup(
        {
          enabled: formData.get("celebEnabled") !== "false",
          style: formData.get("celebStyle"),
          placement: formData.get("celebPlacement"),
          tierHeading: formData.get("celebTierHeading"),
          tierDescription: formData.get("celebTierDescription"),
          heading: formData.get("celebHeading"),
          description: formData.get("celebDescription"),
          buttonText: formData.get("celebButtonText"),
          borderRadius: formData.get("celebBorderRadius"),
          drawerSizePercent: formData.get("celebDrawerSizePercent"),
          cardBackgroundColor: formData.get("celebCardBg"),
          titleColor: formData.get("celebTitleColor"),
          descriptionColor: formData.get("celebDescColor"),
          buttonBackgroundColor: formData.get("celebBtnBg"),
          buttonTextColor: formData.get("celebBtnText"),
          iconBackgroundColor: formData.get("celebIconBg"),
          showIcon: formData.get("celebShowIcon") !== "false",
          showConfetti: formData.get("celebShowConfetti") !== "false",
          autoCloseMs: formData.get("celebAutoCloseMs"),
        },
        existingParsed?.celebrationPopup || DEFAULT_WIDGET.celebrationPopup,
      ),
    };
  }

  return {
    ...DEFAULT_WIDGET,
    ...(existingParsed || {}),
    cartProgressBar: normalizeCartProgressBar(
      existingParsed?.cartProgressBar,
      DEFAULT_WIDGET.cartProgressBar,
    ),
    cartRecommendations: normalizeCartRecommendations(
      existingParsed?.cartRecommendations,
      existingParsed?.cartRecommendations,
    ),
    celebrationPopup: normalizeCelebrationPopup(
      existingParsed?.celebrationPopup,
      DEFAULT_WIDGET.celebrationPopup,
    ),
  };
}

export function widgetFromCampaign(campaign: Campaign): WidgetSettings {
  const saved = parseWidgetSettings(campaign.widgetSettings) || {};
  const base =
    campaign.campaignType === LIVE_TIERED_FREE_GIFTS_TYPE ? DEFAULT_TIERED_WIDGET : DEFAULT_WIDGET;
  return {
    ...base,
    ...saved,
    barColor: normalizeHexColor(saved.barColor, base.barColor!),
    backgroundColor: normalizeHexColor(saved.backgroundColor, base.backgroundColor!),
    textColor: normalizeHexColor(saved.textColor, base.textColor!),
    cartProgressBar: normalizeCartProgressBar(saved.cartProgressBar, base.cartProgressBar),
    cartRecommendations: normalizeCartRecommendations(saved.cartRecommendations),
    celebrationPopup: normalizeCelebrationPopup(saved.celebrationPopup, base.celebrationPopup),
    widgetPadding: normalizeWidgetPadding(saved.widgetPadding, base.widgetPadding),
  };
}

export function formatAdminDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTriggerSummary(
  campaign: Pick<Campaign, "threshold" | "campaignType" | "currencyCode"> & {
    rewardTiers?: Array<{ threshold: number }>;
  },
) {
  const money = (n: number | string) => formatAdminMoney(n, campaign.currencyCode);
  if (campaign.campaignType === "Buy X -> Get Y") {
    return "Quantity trigger";
  }
  if (campaign.campaignType === LIVE_TIERED_FREE_GIFTS_TYPE) {
    const n = campaign.rewardTiers?.length ?? 0;
    return n > 0 ? `${n} spend tier${n === 1 ? "" : "s"}` : `Spend ${money(campaign.threshold)}+`;
  }
  return `Spend ${money(campaign.threshold)}`;
}

export function formatRewardSummary(
  campaign: Pick<
    Campaign,
    | "giftProductTitle"
    | "campaignType"
    | "discountPercentage"
    | "fixedDiscountAmount"
    | "currencyCode"
  > & {
    rewardTiers?: Array<{ giftProductTitle?: string | null }>;
  },
) {
  if (campaign.campaignType === LIVE_PERCENTAGE_DISCOUNT_TYPE) {
    const pct =
      campaign.discountPercentage != null && Number.isFinite(campaign.discountPercentage)
        ? Math.trunc(campaign.discountPercentage)
        : null;
    return pct != null ? `${pct}% discount` : "Percentage discount";
  }
  if (campaign.campaignType === LIVE_FIXED_DISCOUNT_TYPE) {
    const amount =
      campaign.fixedDiscountAmount != null && Number.isFinite(campaign.fixedDiscountAmount)
        ? campaign.fixedDiscountAmount
        : null;
    return amount != null
      ? `${formatAdminMoney(amount, campaign.currencyCode)} off`
      : "Fixed discount";
  }
  if (campaign.campaignType === LIVE_TIERED_FREE_GIFTS_TYPE) {
    const n = campaign.rewardTiers?.length ?? 0;
    return n > 0 ? `${n} tier gift${n === 1 ? "" : "s"}` : "Tiered free gifts";
  }
  if (campaign.giftProductTitle) return campaign.giftProductTitle;
  if (campaign.campaignType.includes("Shipping")) return "Free shipping + gift";
  return "Free gift";
}

export function formatScheduleSummary(campaign: Pick<Campaign, "startDate" | "endDate">) {
  if (!campaign.startDate && !campaign.endDate) return "Always on";
  const start = campaign.startDate ? formatAdminDate(campaign.startDate) : "…";
  const end = campaign.endDate ? formatAdminDate(campaign.endDate) : "…";
  return `${start} – ${end}`;
}

export function formatTypeLabel(campaignType: string) {
  if (campaignType === "Spend X -> Free Gift") return "Spend X → Free Gift";
  if (campaignType === LIVE_TIERED_FREE_GIFTS_TYPE) return "Tiered Free Gifts";
  if (campaignType === LIVE_PERCENTAGE_DISCOUNT_TYPE) return "Spend & Save";
  if (campaignType === LIVE_FIXED_DISCOUNT_TYPE) return "Spend & Save (Fixed)";
  return campaignType;
}

export function promotionSummaryLine(
  campaign: Pick<
    Campaign,
    | "threshold"
    | "giftProductTitle"
    | "campaignType"
    | "discountPercentage"
    | "fixedDiscountAmount"
    | "currencyCode"
  > & {
    rewardTiers?: Array<{ threshold: number; giftProductTitle?: string | null }>;
  },
) {
  const money = (n: number | string) => formatAdminMoney(n, campaign.currencyCode);
  if (campaign.campaignType === LIVE_PERCENTAGE_DISCOUNT_TYPE) {
    const pct =
      campaign.discountPercentage != null && Number.isFinite(campaign.discountPercentage)
        ? Math.trunc(campaign.discountPercentage)
        : null;
    return pct != null
      ? `Spend ${money(campaign.threshold)} → ${pct}% off`
      : `Spend ${money(campaign.threshold)} → Discount`;
  }
  if (campaign.campaignType === LIVE_FIXED_DISCOUNT_TYPE) {
    const amount =
      campaign.fixedDiscountAmount != null && Number.isFinite(campaign.fixedDiscountAmount)
        ? campaign.fixedDiscountAmount
        : null;
    return amount != null
      ? `Spend ${money(campaign.threshold)} → ${money(amount)} off`
      : `Spend ${money(campaign.threshold)} → Fixed discount`;
  }
  if (campaign.campaignType === LIVE_TIERED_FREE_GIFTS_TYPE) {
    const n = campaign.rewardTiers?.length ?? 0;
    return n > 0 ? `${n} cumulative free gift tiers` : "Tiered free gifts";
  }
  const gift = campaign.giftProductTitle || "Free Gift";
  return `Spend ${money(campaign.threshold)} → ${gift}`;
}
