import { CampaignCompetitionNotice } from "./CampaignCompetitionNotice";
import type { CampaignOverlapSummary } from "../../lib/campaign-overlaps";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import {
  ProductPicker,
  type InitialSelectedProduct,
  type SelectedGiftProduct,
} from "./ProductPicker";
import { ColorField } from "./ColorField";
import { WidgetLivePreview } from "./WidgetLivePreview";
import { CelebrationPopupPreview } from "./CelebrationPopupPreview";
import { ProductMultiPicker, type RecommendationProduct } from "./ProductMultiPicker";
import type { CelebrationPopupPlacement, CelebrationPopupStyle, WidgetSettings } from "../../lib/widget-settings";
import {
  DEFAULT_CELEBRATION_POPUP,
  CELEBRATION_POPUP_PLACEMENTS,
  CELEBRATION_POPUP_STYLES,
} from "../../lib/widget-settings";
import {
  DEFAULT_FIXED_DISCOUNT_WIDGET,
  DEFAULT_PERCENTAGE_WIDGET,
  DEFAULT_TIERED_WIDGET,
  DEFAULT_WIDGET,
  LIVE_FIXED_DISCOUNT_TYPE,
  LIVE_PERCENTAGE_DISCOUNT_TYPE,
  LIVE_PROMOTION_TYPE,
  LIVE_TIERED_FREE_GIFTS_TYPE,
  getMerchantPromotionTypeOptions,
  TEMPLATE_OPTIONS,
  PLACEMENT_OPTIONS,
  BUILDER_STEPS,
  type BuilderStepId,
  normalizeHexColor,
  formatTypeLabel,
} from "../../lib/campaign-ui";
import { adminCurrencyPrefix, formatAdminMoney } from "../../lib/admin-money";
import { DEFAULT_SHOP_CURRENCY } from "../../lib/money/currency";
import { color } from "../../styles/tokens";
import { CURRENT_THRESHOLD_LIMIT } from "../../lib/plan-tier-allowance";
import {
  emptyTierDraft,
  tiersToFormJson,
  type BuilderTierDraft,
} from "./tier-builder";

export type CampaignBuilderInitial = {
  priority?: number;
  name: string;
  campaignType: string;
  threshold: number;
  giftQuantity: number;
  discountPercentage: number;
  fixedDiscountAmount: number;
  gift: SelectedGiftProduct | null;
  initialGift?: InitialSelectedProduct | null;
  rewardTiers?: BuilderTierDraft[];
  heading: string;
  description: string;
  unlockedHeading: string;
  unlockedDescription: string;
  barColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  progressHeight: number;
  widgetPadding: number;
  buttonText: string;
  template: string;
  placements: string[];
  cartBarHeight: number;
  cartBarRadius: number;
  cartBarCompact: boolean;
  cartBarEnabled: boolean;
  cartBarBannerTitle: string;
  cartBarBannerSubtitle: string;
  cartBarBannerBg: string;
  cartBarBannerText: string;
  cartBarBodyBg: string;
  cartBarTrackColor: string;
  cartBarMarkBorder: string;
  cartBarTierLabel: string;
  cartBarFinalTierLabel: string;
  celebEnabled: boolean;
  celebStyle: CelebrationPopupStyle;
  celebPlacement: CelebrationPopupPlacement;
  celebTierHeading: string;
  celebTierDescription: string;
  celebHeading: string;
  celebDescription: string;
  celebButtonText: string;
  celebBorderRadius: number;
  celebDrawerSizePercent: number;
  celebCardBg: string;
  celebTitleColor: string;
  celebDescColor: string;
  celebBtnBg: string;
  celebBtnText: string;
  celebIconBg: string;
  celebShowIcon: boolean;
  celebShowConfetti: boolean;
  celebAutoCloseMs: number;
  recsEnabled: boolean;
  recsHeading: string;
  recsDescription: string;
  recsProducts: RecommendationProduct[];
  recsMaxProducts: number;
  recsButtonText: string;
  recsBackgroundColor: string;
  status?: string;
};

export type CampaignBuilderFormProps = {
  competingCampaigns?: CampaignOverlapSummary[];
  mode: "create" | "edit";
  formId?: string;
  error?: string | null;
  isSubmitting?: boolean;
  initial?: CampaignBuilderInitial;
  currencyCode?: string;
};

const DEFAULT_INITIAL: CampaignBuilderInitial = {
  name: "",
  campaignType: LIVE_PROMOTION_TYPE,
  threshold: 999,
  giftQuantity: 1,
  discountPercentage: 10,
  fixedDiscountAmount: 100,
  gift: null,
  initialGift: null,
  heading: DEFAULT_WIDGET.heading ?? "",
  description: DEFAULT_WIDGET.description ?? "",
  unlockedHeading: DEFAULT_WIDGET.unlockedHeading ?? "",
  unlockedDescription: DEFAULT_WIDGET.unlockedDescription ?? "",
  barColor: DEFAULT_WIDGET.barColor ?? "#111111",
  backgroundColor: DEFAULT_WIDGET.backgroundColor ?? "#FAFAFA",
  textColor: DEFAULT_WIDGET.textColor ?? "#111111",
  borderRadius: DEFAULT_WIDGET.borderRadius ?? 16,
  progressHeight: DEFAULT_WIDGET.progressHeight ?? 12,
  widgetPadding: DEFAULT_WIDGET.widgetPadding ?? 16,
  buttonText: DEFAULT_WIDGET.buttonText ?? "Continue Shopping",
  template: DEFAULT_WIDGET.template ?? "Premium",
  placements: ["Product Page", "Cart Drawer"],
  cartBarHeight: DEFAULT_WIDGET.cartProgressBar?.height ?? 6,
  cartBarRadius: DEFAULT_WIDGET.cartProgressBar?.borderRadius ?? 8,
  cartBarCompact: DEFAULT_WIDGET.cartProgressBar?.compact !== false,
  cartBarEnabled: DEFAULT_WIDGET.cartProgressBar?.enabled !== false,
  cartBarBannerTitle: DEFAULT_WIDGET.cartProgressBar?.bannerTitle ?? "SHOP MORE, WIN FREEBIES",
  cartBarBannerSubtitle: DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerSubtitle ?? "Free gifts worth unlocking",
  cartBarBannerBg: DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerBackgroundColor ?? "#6b7c4a",
  cartBarBannerText: DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerTextColor ?? "#ffffff",
  cartBarBodyBg: DEFAULT_TIERED_WIDGET.cartProgressBar?.bodyBackgroundColor ?? "#ffffff",
  cartBarTrackColor: DEFAULT_TIERED_WIDGET.cartProgressBar?.trackColor ?? "#e8e8e8",
  cartBarMarkBorder: DEFAULT_TIERED_WIDGET.cartProgressBar?.markBorderColor ?? "#cfcfcf",
  cartBarTierLabel: DEFAULT_TIERED_WIDGET.cartProgressBar?.tierLabel ?? "Gift",
  cartBarFinalTierLabel: DEFAULT_TIERED_WIDGET.cartProgressBar?.finalTierLabel ?? "Bumper",
  celebEnabled: DEFAULT_CELEBRATION_POPUP.enabled !== false,
  celebStyle: (DEFAULT_CELEBRATION_POPUP.style || "classic") as CelebrationPopupStyle,
  celebPlacement: (DEFAULT_CELEBRATION_POPUP.placement || "center") as CelebrationPopupPlacement,
  celebTierHeading: DEFAULT_CELEBRATION_POPUP.tierHeading || "You've unlocked a free gift!",
  celebTierDescription:
    DEFAULT_CELEBRATION_POPUP.tierDescription || "Keep shopping to unlock more tier gifts.",
  celebHeading: "",
  celebDescription: "",
  celebButtonText: DEFAULT_CELEBRATION_POPUP.buttonText || "Awesome",
  celebBorderRadius: DEFAULT_CELEBRATION_POPUP.borderRadius ?? 18,
  celebDrawerSizePercent: DEFAULT_CELEBRATION_POPUP.drawerSizePercent ?? 52,
  celebCardBg: DEFAULT_CELEBRATION_POPUP.cardBackgroundColor || "#ffffff",
  celebTitleColor: DEFAULT_CELEBRATION_POPUP.titleColor || "#111111",
  celebDescColor: DEFAULT_CELEBRATION_POPUP.descriptionColor || "#555555",
  celebBtnBg: DEFAULT_CELEBRATION_POPUP.buttonBackgroundColor || "#111111",
  celebBtnText: DEFAULT_CELEBRATION_POPUP.buttonTextColor || "#ffffff",
  celebIconBg: DEFAULT_CELEBRATION_POPUP.iconBackgroundColor || "#111111",
  celebShowIcon: DEFAULT_CELEBRATION_POPUP.showIcon !== false,
  celebShowConfetti: DEFAULT_CELEBRATION_POPUP.showConfetti !== false,
  celebAutoCloseMs: DEFAULT_CELEBRATION_POPUP.autoCloseMs ?? 6500,
  recsEnabled: false,
  recsHeading: "Our other bestsellers loved by shoppers. You can try them!",
  recsDescription: "",
  recsProducts: [],
  recsMaxProducts: 4,
  recsButtonText: "+ Add",
  recsBackgroundColor: "#f7d6de",
};

function toSelectedGiftProduct(product: InitialSelectedProduct): SelectedGiftProduct {
  return {
    productId: product.id,
    title: product.title,
    imageUrl: product.image,
    variantId: product.firstVariant.id,
    variantTitle: product.firstVariant.title,
  };
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function tierOrdinal(n: number): string {
  const value = Math.max(1, Math.trunc(n));
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="fgpb-section" style={sectionStyle}>
      <h2 className="fgpb-section__title" style={sectionTitleStyle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function CampaignBuilderForm({ mode, formId, error, isSubmitting, initial, competingCampaigns = [], currencyCode = DEFAULT_SHOP_CURRENCY }: CampaignBuilderFormProps) {
  const money = (amount: number | string) => formatAdminMoney(amount, currencyCode);
  const cur = adminCurrencyPrefix(currencyCode);
  const source = initial ?? DEFAULT_INITIAL;

  const [step, setStep] = useState<BuilderStepId>("type");
  const [name, setName] = useState(source.name);
  const [priority, setPriority] = useState(source.priority ?? 0);
  const [campaignType, setCampaignType] = useState(source.campaignType || LIVE_PROMOTION_TYPE);
  const [threshold, setThreshold] = useState(source.threshold);
  const giftQuantity = 1;
  const [discountPercentage, setDiscountPercentage] = useState(
    source.discountPercentage > 0 ? source.discountPercentage : 10,
  );
  const [fixedDiscountAmount, setFixedDiscountAmount] = useState(
    source.fixedDiscountAmount > 0 ? source.fixedDiscountAmount : 100,
  );
  const [rewardTiers, setRewardTiers] = useState<BuilderTierDraft[]>(() => {
    if (source.rewardTiers?.length) return source.rewardTiers;
    return [emptyTierDraft(50)];
  });
  const isPercentageDiscount = campaignType === LIVE_PERCENTAGE_DISCOUNT_TYPE;
  const isFixedDiscount = campaignType === LIVE_FIXED_DISCOUNT_TYPE;
  const isTiered = campaignType === LIVE_TIERED_FREE_GIFTS_TYPE;
  const isNonGiftDiscount = isPercentageDiscount || isFixedDiscount;
  const isGiftCampaign =
    isTiered || campaignType === LIVE_PROMOTION_TYPE;
  const promotionTypeOptions = getMerchantPromotionTypeOptions({
    mode,
    currentType: campaignType,
  });
  const [gift, setGift] = useState<SelectedGiftProduct | null>(() => {
    if (source.gift) return source.gift;
    if (source.initialGift) return toSelectedGiftProduct(source.initialGift);
    return null;
  });
  const [heading, setHeading] = useState(source.heading);
  const [description, setDescription] = useState(source.description);
  const [unlockedHeading, setUnlockedHeading] = useState(source.unlockedHeading);
  const [unlockedDescription, setUnlockedDescription] = useState(source.unlockedDescription);
  const [barColor, setBarColor] = useState(normalizeHexColor(source.barColor, DEFAULT_INITIAL.barColor));
  const [backgroundColor, setBackgroundColor] = useState(
    normalizeHexColor(source.backgroundColor, DEFAULT_INITIAL.backgroundColor),
  );
  const [textColor, setTextColor] = useState(normalizeHexColor(source.textColor, DEFAULT_INITIAL.textColor));
  const [borderRadius, setBorderRadius] = useState(source.borderRadius);
  const [progressHeight, setProgressHeight] = useState(source.progressHeight);
  const [widgetPadding, setWidgetPadding] = useState(source.widgetPadding ?? 16);
  const [buttonText, setButtonText] = useState(source.buttonText);
  const [template, setTemplate] = useState(source.template);
  const [placements, setPlacements] = useState<string[]>(source.placements);
  const [cartBarHeight, setCartBarHeight] = useState(source.cartBarHeight ?? 6);
  const [cartBarRadius, setCartBarRadius] = useState(source.cartBarRadius ?? 8);
  const [cartBarCompact, setCartBarCompact] = useState(source.cartBarCompact !== false);
  const [cartBarEnabled, setCartBarEnabled] = useState(source.cartBarEnabled !== false);
  const [cartBarBannerTitle, setCartBarBannerTitle] = useState(
    source.cartBarBannerTitle || "SHOP MORE, WIN FREEBIES",
  );
  const [cartBarBannerSubtitle, setCartBarBannerSubtitle] = useState(
    source.cartBarBannerSubtitle ||
      DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerSubtitle ||
      "Free gifts worth unlocking",
  );
  const [cartBarBannerBg, setCartBarBannerBg] = useState(
    normalizeHexColor(
      source.cartBarBannerBg,
      DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerBackgroundColor || "#6b7c4a",
    ),
  );
  const [cartBarBannerText, setCartBarBannerText] = useState(
    normalizeHexColor(source.cartBarBannerText, "#ffffff"),
  );
  const [cartBarBodyBg, setCartBarBodyBg] = useState(
    normalizeHexColor(source.cartBarBodyBg, "#ffffff"),
  );
  const [cartBarTrackColor, setCartBarTrackColor] = useState(
    normalizeHexColor(source.cartBarTrackColor, "#e8e8e8"),
  );
  const [cartBarMarkBorder, setCartBarMarkBorder] = useState(
    normalizeHexColor(source.cartBarMarkBorder, "#cfcfcf"),
  );
  const [cartBarTierLabel, setCartBarTierLabel] = useState(source.cartBarTierLabel || "Gift");
  const [cartBarFinalTierLabel, setCartBarFinalTierLabel] = useState(
    source.cartBarFinalTierLabel || "Bumper",
  );
  const [celebEnabled, setCelebEnabled] = useState(source.celebEnabled !== false);
  const [celebStyle, setCelebStyle] = useState<CelebrationPopupStyle>(
    source.celebStyle || "classic",
  );
  const [celebPlacement, setCelebPlacement] = useState<CelebrationPopupPlacement>(
    source.celebPlacement || "center",
  );
  const [celebTierHeading, setCelebTierHeading] = useState(
    source.celebTierHeading || "You've unlocked a free gift!",
  );
  const [celebTierDescription, setCelebTierDescription] = useState(
    source.celebTierDescription || "Keep shopping to unlock more tier gifts.",
  );
  const [celebHeading, setCelebHeading] = useState(source.celebHeading || "");
  const [celebDescription, setCelebDescription] = useState(source.celebDescription || "");
  const [celebButtonText, setCelebButtonText] = useState(source.celebButtonText || "Awesome");
  const [celebBorderRadius, setCelebBorderRadius] = useState(source.celebBorderRadius ?? 18);
  const [celebDrawerSizePercent, setCelebDrawerSizePercent] = useState(
    source.celebDrawerSizePercent ?? 52,
  );
  const [celebCardBg, setCelebCardBg] = useState(
    normalizeHexColor(source.celebCardBg, "#ffffff"),
  );
  const [celebTitleColor, setCelebTitleColor] = useState(
    normalizeHexColor(source.celebTitleColor, "#111111"),
  );
  const [celebDescColor, setCelebDescColor] = useState(
    normalizeHexColor(source.celebDescColor, "#555555"),
  );
  const [celebBtnBg, setCelebBtnBg] = useState(normalizeHexColor(source.celebBtnBg, "#111111"));
  const [celebBtnText, setCelebBtnText] = useState(
    normalizeHexColor(source.celebBtnText, "#ffffff"),
  );
  const [celebIconBg, setCelebIconBg] = useState(normalizeHexColor(source.celebIconBg, "#111111"));
  const [celebShowIcon, setCelebShowIcon] = useState(source.celebShowIcon !== false);
  const [celebShowConfetti, setCelebShowConfetti] = useState(source.celebShowConfetti !== false);
  const [celebAutoCloseMs, setCelebAutoCloseMs] = useState(source.celebAutoCloseMs ?? 6500);
  const [recsEnabled, setRecsEnabled] = useState(source.recsEnabled);
  const [recsHeading, setRecsHeading] = useState(source.recsHeading);
  const [recsDescription, setRecsDescription] = useState(source.recsDescription);
  const [recsProducts, setRecsProducts] = useState<RecommendationProduct[]>(source.recsProducts || []);
  const [recsMaxProducts, setRecsMaxProducts] = useState(source.recsMaxProducts || 4);
  const [recsButtonText, setRecsButtonText] = useState(source.recsButtonText || "Add to cart");
  const [recsBackgroundColor, setRecsBackgroundColor] = useState(
    normalizeHexColor(source.recsBackgroundColor, "#f7d6de"),
  );
  const [simulatedCartAmount, setSimulatedCartAmount] = useState(() =>
    mode === "edit" ? Math.round((source.threshold || 0) * 0.6) : Math.round((source.threshold || 0) * 0.5),
  );

  function selectCampaignType(nextType: string) {
    setCampaignType(nextType);
    const switchingToDiscount =
      (nextType === LIVE_PERCENTAGE_DISCOUNT_TYPE || nextType === LIVE_FIXED_DISCOUNT_TYPE) &&
      campaignType !== LIVE_PERCENTAGE_DISCOUNT_TYPE &&
      campaignType !== LIVE_FIXED_DISCOUNT_TYPE;
    if (switchingToDiscount) {
      const defaults =
        nextType === LIVE_FIXED_DISCOUNT_TYPE ? DEFAULT_FIXED_DISCOUNT_WIDGET : DEFAULT_PERCENTAGE_WIDGET;
      if (!heading || heading === DEFAULT_WIDGET.heading) {
        setHeading(defaults.heading ?? heading);
      }
      if (!description || description === DEFAULT_WIDGET.description) {
        setDescription(defaults.description ?? description);
      }
      if (!unlockedHeading || unlockedHeading === DEFAULT_WIDGET.unlockedHeading) {
        setUnlockedHeading(defaults.unlockedHeading ?? unlockedHeading);
      }
      if (!unlockedDescription || unlockedDescription === DEFAULT_WIDGET.unlockedDescription) {
        setUnlockedDescription(defaults.unlockedDescription ?? unlockedDescription);
      }
    }
    const switchingToTiered =
      nextType === LIVE_TIERED_FREE_GIFTS_TYPE && campaignType !== LIVE_TIERED_FREE_GIFTS_TYPE;
    if (switchingToTiered) {
      if (!heading || heading === DEFAULT_WIDGET.heading) {
        setHeading(DEFAULT_TIERED_WIDGET.heading ?? heading);
      }
      if (!description || description === DEFAULT_WIDGET.description) {
        setDescription(DEFAULT_TIERED_WIDGET.description ?? description);
      }
      if (!unlockedHeading || unlockedHeading === DEFAULT_WIDGET.unlockedHeading) {
        setUnlockedHeading(DEFAULT_TIERED_WIDGET.unlockedHeading ?? unlockedHeading);
      }
      if (!unlockedDescription || unlockedDescription === DEFAULT_WIDGET.unlockedDescription) {
        setUnlockedDescription(DEFAULT_TIERED_WIDGET.unlockedDescription ?? unlockedDescription);
      }
      if (
        !cartBarBannerTitle ||
        cartBarBannerTitle === DEFAULT_WIDGET.cartProgressBar?.bannerTitle ||
        cartBarBannerTitle === "SHOP MORE, WIN FREEBIES"
      ) {
        setCartBarBannerTitle(
          DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerTitle ?? "SHOP MORE, WIN FREEBIES",
        );
        if (
          !cartBarBannerSubtitle ||
          cartBarBannerSubtitle === "Free gifts worth unlocking"
        ) {
          setCartBarBannerSubtitle(
            DEFAULT_TIERED_WIDGET.cartProgressBar?.bannerSubtitle ?? "Free gifts worth unlocking",
          );
        }
      }
      if (!rewardTiers.length) {
        setRewardTiers([emptyTierDraft(50)]);
      }
    }
  }

  function updateTierThreshold(index: number, nextThreshold: number) {
    setRewardTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, threshold: nextThreshold } : tier)),
    );
  }

  function updateTierGift(index: number, nextGift: SelectedGiftProduct | null) {
    setRewardTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, gift: nextGift } : tier)),
    );
  }

  function removeTier(index: number) {
    setRewardTiers((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function addTier() {
    setRewardTiers((prev) => {
      if (prev.length >= CURRENT_THRESHOLD_LIMIT) return prev;
      const last = prev[prev.length - 1];
      const nextThreshold = last ? Math.max(last.threshold + 50, 50) : 50;
      return [...prev, emptyTierDraft(nextThreshold)];
    });
  }

  function moveTier(index: number, direction: -1 | 1) {
    setRewardTiers((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[target]!;
      next[target] = tmp;
      return next;
    });
  }

  function togglePlacement(value: string) {
    setPlacements((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  const stepIndex = BUILDER_STEPS.findIndex((s) => s.id === step);
  const isFirstStep = stepIndex <= 0;
  const isLastStep = stepIndex >= BUILDER_STEPS.length - 1;

  function goNext() {
    if (!isLastStep) setStep(BUILDER_STEPS[stepIndex + 1].id);
  }
  function goBack() {
    if (!isFirstStep) setStep(BUILDER_STEPS[stepIndex - 1].id);
  }

  const previewGoalThreshold = isTiered
    ? Math.max(...rewardTiers.map((t) => t.threshold), 1)
    : threshold > 0
      ? threshold
      : 1;
  const effectiveThreshold = previewGoalThreshold;
  const remainingAmount = Math.max(effectiveThreshold - simulatedCartAmount, 0);
  const progressPercent = Math.max(0, Math.min(100, (simulatedCartAmount / effectiveThreshold) * 100));
  const isUnlockedPreview = remainingAmount <= 0;

  const previewHeading = (isUnlockedPreview ? unlockedHeading || heading : heading || "").replace(
    /\{remaining\}/gi,
    `${money(remainingAmount)}`,
  );
  const previewDescription = (
    isUnlockedPreview ? unlockedDescription || description : description || ""
  ).replace(/\{remaining\}/gi, `${money(remainingAmount)}`);

  const widgetSettingsPayload: WidgetSettings = {
    heading,
    description,
    unlockedHeading,
    unlockedDescription,
    template,
    barColor,
    backgroundColor,
    textColor,
    borderRadius,
    progressHeight,
    widgetPadding,
    buttonText,
    cartProgressBar: {
      enabled: cartBarEnabled,
      height: cartBarHeight,
      borderRadius: cartBarRadius,
      compact: cartBarCompact,
      bannerTitle: cartBarBannerTitle,
      bannerSubtitle: cartBarBannerSubtitle,
      bannerBackgroundColor: cartBarBannerBg,
      bannerTextColor: cartBarBannerText,
      bodyBackgroundColor: cartBarBodyBg,
      trackColor: cartBarTrackColor,
      markBorderColor: cartBarMarkBorder,
      tierLabel: cartBarTierLabel,
      finalTierLabel: cartBarFinalTierLabel,
    },
    celebrationPopup: {
      enabled: celebEnabled,
      style: celebStyle,
      placement: celebPlacement,
      tierHeading: celebTierHeading,
      tierDescription: celebTierDescription,
      heading: celebHeading,
      description: celebDescription,
      buttonText: celebButtonText,
      borderRadius: celebBorderRadius,
      drawerSizePercent: celebDrawerSizePercent,
      cardBackgroundColor: celebCardBg,
      titleColor: celebTitleColor,
      descriptionColor: celebDescColor,
      buttonBackgroundColor: celebBtnBg,
      buttonTextColor: celebBtnText,
      iconBackgroundColor: celebIconBg,
      showIcon: celebShowIcon,
      showConfetti: celebShowConfetti,
      autoCloseMs: celebAutoCloseMs,
    },
    cartRecommendations: {
      enabled: recsEnabled,
      heading: recsHeading,
      description: recsDescription,
      maxProducts: recsMaxProducts,
      buttonText: recsButtonText,
      backgroundColor: recsBackgroundColor,
      products: recsProducts.map((p) => ({
        productId: p.productId,
        variantId: p.variantId,
        title: p.title,
        imageUrl: p.imageUrl,
        price: p.price ?? null,
        compareAtPrice: p.compareAtPrice ?? null,
      })),
    },
  };

  const sliderMax = Math.max(effectiveThreshold * 1.2, 1000);

  // ---- field blocks (content only — no section wrapper) --------------------

  const nameField = (
    <div className="fgpb-field" style={fieldStyle}>
      <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-campaign-name">
        Campaign name
      </label>
      <input
        id="fgpb-campaign-name"
        className="fgpb-input"
        style={inputStyle}
        type="text"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Spring spend & save"
        form={formId}
        disabled={isSubmitting}
      />
    </div>
  );

  const thresholdField = isTiered ? (
    <div className="fgpb-field" style={fieldStyle}>
      <p style={labelStyle}>Spend thresholds</p>
      <p style={hintTextStyle}>Thresholds are set per tier in Reward</p>
      <input
        type="hidden"
        name="threshold"
        value={rewardTiers[0]?.threshold || 0}
        form={formId}
      />
    </div>
  ) : (
    <div className="fgpb-field" style={fieldStyle}>
      <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-threshold">
        Customer spends
      </label>
      <div style={prefixWrapStyle}>
        <span style={prefixStyle}>{cur}</span>
        <input
          id="fgpb-threshold"
          className="fgpb-input"
          style={prefixInputStyle}
          type="number"
          min={0}
          name="threshold"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value) || 0)}
          form={formId}
          disabled={isSubmitting}
        />
      </div>
      <p style={hintTextStyle}>
        {isNonGiftDiscount
          ? "Customers unlock the discount once their cart reaches this amount."
          : "Customers unlock the gift once their cart reaches this amount."}
      </p>
    </div>
  );

  const typeContent = (
    <div className="fgpb-type-grid" style={typeGridStyle}>
      {promotionTypeOptions.filter((option) => option.available || option.legacyPreserved).map((option) => {
        const active = campaignType === option.title;
        const disabled = !option.available;
        return (
          <button
            key={option.title}
            type="button"
            disabled={disabled || isSubmitting}
            aria-pressed={active}
            aria-disabled={disabled || undefined}
            onClick={() => option.available && selectCampaignType(option.title)}
            className={cx(
              "fgpb-type-card",
              active && "fgpb-type-card--active",
              disabled && "fgpb-type-card--disabled",
            )}
            style={{
              ...typeCardStyle,
              ...(active ? typeCardActiveStyle : null),
              ...(disabled ? typeCardDisabledStyle : null),
            }}
          >
            <span style={typeCardTitleStyle}>{formatTypeLabel(option.title)}</span>
            <span style={typeCardDescStyle}>{option.description}</span>
            {disabled ? (
              <span style={comingSoonBadgeStyle}>
                {option.legacyPreserved ? "Existing type" : "Coming soon"}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const acceleratedCheckoutNotice = isGiftCampaign ? (
    <div
      role="note"
      className="fgpb-info-notice"
      style={infoNoticeStyle}
      data-testid="accelerated-checkout-notice"
    >
      <p style={infoNoticeTitleStyle}>Cart checkout required</p>
      <p style={infoNoticeBodyStyle}>
        Automatic gifts are added in the cart. <strong>Buy it now</strong> and product-page
        express checkout skip this step. Use Add to cart for gift eligibility.
      </p>
      <p style={infoNoticeLinkStyle}>
        <a href="/app/help/accelerated-checkout" style={infoNoticeAnchorStyle}>
          Learn more
        </a>
      </p>
    </div>
  ) : null;

  const rewardContent = isPercentageDiscount ? (
    <div className="fgpb-field" style={fieldStyle}>
      <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-discount-pct">
        Discount percentage
      </label>
      <div style={prefixWrapStyle}>
        <input
          id="fgpb-discount-pct"
          className="fgpb-input"
          style={prefixInputStyle}
          type="number"
          min={1}
          max={100}
          name="discountPercentage"
          value={discountPercentage}
          onChange={(e) =>
            setDiscountPercentage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
          }
          form={formId}
          disabled={isSubmitting}
        />
        <span style={prefixStyle}>%</span>
      </div>
      <p style={hintTextStyle}>Applied to paid cart lines once the spend threshold is met.</p>
    </div>
  ) : isFixedDiscount ? (
    <div className="fgpb-field" style={fieldStyle}>
      <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-discount-fixed">
        Fixed discount amount
      </label>
      <div style={prefixWrapStyle}>
        <span style={prefixStyle}>{cur}</span>
        <input
          id="fgpb-discount-fixed"
          className="fgpb-input"
          style={prefixInputStyle}
          type="number"
          min={0.01}
          step={0.01}
          name="fixedDiscountAmount"
          value={fixedDiscountAmount}
          onChange={(e) => {
            const next = Number(e.target.value);
            setFixedDiscountAmount(Number.isFinite(next) && next > 0 ? next : 0.01);
          }}
          form={formId}
          disabled={isSubmitting}
        />
      </div>
      <p style={hintTextStyle}>Applied once to paid cart lines once the spend threshold is met.</p>
    </div>
  ) : isTiered ? (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#666", lineHeight: 1.4 }}>
        Each tier is a spend goal and the gift unlocked at that level. Higher tiers unlock in order as cart
        spend climbs.
      </p>
      <div style={tierGridStyle}>
        {rewardTiers.map((tier, index) => (
          <div key={tier.id ?? `tier-${index}`} style={tierCardStyle}>
            <div style={tierCardHeaderStyle}>
              <span style={{ fontSize: 13, fontWeight: 700, color: color.text }}>Tier {index + 1}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  aria-label="Move tier left"
                  onClick={() => moveTier(index, -1)}
                  disabled={index === 0 || isSubmitting}
                  style={tierReorderBtnStyle}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Move tier right"
                  onClick={() => moveTier(index, 1)}
                  disabled={index >= rewardTiers.length - 1 || isSubmitting}
                  style={tierReorderBtnStyle}
                >
                  →
                </button>
                <button
                  type="button"
                  aria-label="Remove tier"
                  onClick={() => removeTier(index)}
                  disabled={rewardTiers.length <= 1 || isSubmitting}
                  style={{
                    ...tierReorderBtnStyle,
                    color: "#999",
                    ...(rewardTiers.length <= 1 ? { opacity: 0.4, cursor: "not-allowed" } : null),
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={tierStepStyle}>
              <div style={tierStepBlockStyle}>
                <span style={tierKickerStyle}>Threshold</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: color.textSecondary }}>{cur}</span>
                  <input
                    className="fgpb-input"
                    style={{ ...inputStyle, height: 36, flex: 1 }}
                    type="number"
                    min={0}
                    aria-label={`Tier ${index + 1} spend threshold`}
                    value={tier.threshold}
                    onChange={(e) => updateTierThreshold(index, Number(e.target.value) || 0)}
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <span style={tierArrowStyle} aria-hidden>
                →
              </span>
              <div style={tierStepBlockStyle}>
                <span style={tierKickerStyle}>Reward</span>
                <ProductPicker
                  compact
                  selectedProduct={tier.gift}
                  onSelect={(product) => updateTierGift(index, product)}
                  onRemove={() => updateTierGift(index, null)}
                />
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addTier}
          disabled={isSubmitting || rewardTiers.length >= CURRENT_THRESHOLD_LIMIT}
          style={tierAddCardStyle}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span>
            {rewardTiers.length >= CURRENT_THRESHOLD_LIMIT
              ? `${CURRENT_THRESHOLD_LIMIT} thresholds is the limit`
              : "Add threshold"}
          </span>
        </button>
      </div>
      <input
        type="hidden"
        name="rewardTiers"
        value={tiersToFormJson(rewardTiers)}
        form={formId}
      />
    </div>
  ) : (
    <>
      <div style={fieldStyle}>
        <p style={labelStyle}>Customer receives</p>
        {!gift ? <p style={hintTextStyle}>Select a gift product before activating this campaign.</p> : null}
        <ProductPicker
          selectedProduct={gift}
          initialSelectedProduct={source.initialGift ?? null}
          onSelect={setGift}
          onRemove={() => setGift(null)}
        />
      </div>
      <div className="fgpb-field" style={fieldStyle}>
        <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-gift-qty">
          Gift quantity
        </label>
        <input
          id="fgpb-gift-qty"
          className="fgpb-input"
          style={inputStyle}
          type="number"
          min={1}
          name="giftQuantity"
          max={1}
          value={giftQuantity}
          readOnly
          form={formId}
          disabled={isSubmitting}
        />
        <p style={hintTextStyle}>One free gift unit per cart. Saving applies this limit to older campaigns too.</p>
      </div>
    </>
  );

  const celebrationContent = (
      <div style={copyGroupStyle}>
        <p style={copyGroupTitleStyle}>Celebration popup</p>
        <p style={hintTextStyle}>Show a popup when a gift unlocks.</p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={celebEnabled}
            onChange={(e) => setCelebEnabled(e.target.checked)}
            disabled={isSubmitting}
            style={{ accentColor: color.primary }}
          />
          Enable celebration popup
        </label>
        {celebEnabled ? (
          <>
            <p style={{ ...labelStyle, marginTop: 8 }}>Popup style</p>
            <div style={chipRowStyle}>
              {CELEBRATION_POPUP_STYLES.map((option) => {
                const active = celebStyle === option;
                const label = option.charAt(0).toUpperCase() + option.slice(1);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCelebStyle(option)}
                    className={cx("fgpb-chip", active && "fgpb-chip--active")}
                    style={{ ...chipStyle, ...(active ? chipActiveStyle : null) }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p style={{ ...labelStyle, marginTop: 8 }}>Popup location</p>
            <div style={chipRowStyle}>
              {CELEBRATION_POPUP_PLACEMENTS.map((option) => {
                const active = celebPlacement === option;
                const label = option === "center" ? "Page center" : "Cart drawer";
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCelebPlacement(option)}
                    className={cx("fgpb-chip", active && "fgpb-chip--active")}
                    style={{ ...chipStyle, ...(active ? chipActiveStyle : null) }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p style={hintTextStyle}>
              {celebPlacement === "center"
                ? "Shows as a centered overlay on the page (even if the cart drawer is open)."
                : "Shows as a compact toast inside the cart drawer, under the progress bar."}
            </p>
            <CelebrationPopupPreview
              style={celebStyle}
              heading={celebHeading || unlockedHeading || "You've unlocked your free gift!"}
              description={
                celebDescription ||
                unlockedDescription ||
                "Your free gift has been added to the cart."
              }
              tierHeading={celebTierHeading}
              tierDescription={celebTierDescription}
              buttonText={celebButtonText || "Awesome"}
              borderRadius={celebBorderRadius}
              drawerSizePercent={celebDrawerSizePercent}
              cardBackgroundColor={celebCardBg}
              titleColor={celebTitleColor}
              descriptionColor={celebDescColor}
              buttonBackgroundColor={celebBtnBg}
              buttonTextColor={celebBtnText}
              iconBackgroundColor={celebIconBg}
              showIcon={celebShowIcon}
              showConfetti={celebShowConfetti && celebStyle !== "minimal"}
              allowTierMode={isTiered}
              tierPreviewLabels={
                isTiered
                  ? {
                      first: "1st tier",
                      last: `${tierOrdinal(Math.max(1, rewardTiers.length))} tier`,
                    }
                  : undefined
              }
            />
            {isTiered ? (
              <>
                <div className="fgpb-field" style={fieldStyle}>
                  <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-tier-heading">
                    1st tier unlock heading
                  </label>
                  <input
                    id="fgpb-celeb-tier-heading"
                    className="fgpb-input"
                    style={inputStyle}
                    type="text"
                    value={celebTierHeading}
                    onChange={(e) => setCelebTierHeading(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
                <div className="fgpb-field" style={fieldStyle}>
                  <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-tier-description">
                    1st tier unlock description
                  </label>
                  <input
                    id="fgpb-celeb-tier-description"
                    className="fgpb-input"
                    style={inputStyle}
                    type="text"
                    value={celebTierDescription}
                    onChange={(e) => setCelebTierDescription(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>
              </>
            ) : null}
            <div className="fgpb-field" style={fieldStyle}>
              <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-heading">
                {isTiered
                  ? `${tierOrdinal(Math.max(1, rewardTiers.length))} tier unlock heading`
                  : "Full unlock heading"}
              </label>
              <input
                id="fgpb-celeb-heading"
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={celebHeading}
                onChange={(e) => setCelebHeading(e.target.value)}
                placeholder={unlockedHeading || "You've unlocked your free gift!"}
                disabled={isSubmitting}
              />
            </div>
            <div className="fgpb-field" style={fieldStyle}>
              <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-description">
                {isTiered
                  ? `${tierOrdinal(Math.max(1, rewardTiers.length))} tier unlock description`
                  : "Full unlock description"}
              </label>
              <input
                id="fgpb-celeb-description"
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={celebDescription}
                onChange={(e) => setCelebDescription(e.target.value)}
                placeholder={unlockedDescription || "Your free gift has been added to the cart."}
                disabled={isSubmitting}
              />
            </div>
            <div className="fgpb-field" style={fieldStyle}>
              <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-button-text">
                Button text
              </label>
              <input
                id="fgpb-celeb-button-text"
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={celebButtonText}
                onChange={(e) => setCelebButtonText(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            {celebPlacement === "drawer" ? (
            <div className="fgpb-field" style={fieldStyle}>
              <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-celeb-drawer-size">
                Cart drawer popup size ({celebDrawerSizePercent}%)
              </label>
              <input
                id="fgpb-celeb-drawer-size"
                type="range"
                min={30}
                max={100}
                step={2}
                value={celebDrawerSizePercent}
                onChange={(e) => setCelebDrawerSizePercent(Number(e.target.value) || 52)}
                disabled={isSubmitting}
                style={{ width: "100%", accentColor: color.primary }}
              />
              <p style={hintTextStyle}>How large the unlock popup appears inside the cart drawer. Lower = more compact.</p>
            </div>
            ) : null}
            <div className="fgpb-field" style={fieldStyle}>
              <label className="fgpb-label" style={labelStyle}>
                Auto-close ({Math.round(celebAutoCloseMs / 1000)}s)
              </label>
              <input
                type="range"
                min={2000}
                max={15000}
                step={500}
                value={celebAutoCloseMs}
                onChange={(e) => setCelebAutoCloseMs(Number(e.target.value) || 6500)}
                disabled={isSubmitting}
                style={{ width: "100%", accentColor: color.primary }}
              />
            </div>
            <details style={detailsStyle}>
              <summary style={summaryStyle}>Popup colors &amp; shape</summary>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                <div className="fgpb-field" style={fieldStyle}>
                  <label className="fgpb-label" style={labelStyle}>
                    Corner radius ({celebBorderRadius}px)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={32}
                    value={celebBorderRadius}
                    onChange={(e) => setCelebBorderRadius(Number(e.target.value) || 0)}
                    disabled={isSubmitting}
                    style={{ width: "100%", accentColor: color.primary }}
                  />
                </div>
                <div style={compactColorGridStyle}>
                  <ColorField compact label="Card" value={celebCardBg} onChange={setCelebCardBg} />
                  <ColorField compact label="Title" value={celebTitleColor} onChange={setCelebTitleColor} />
                  <ColorField compact label="Body text" value={celebDescColor} onChange={setCelebDescColor} />
                  <ColorField compact label="Button" value={celebBtnBg} onChange={setCelebBtnBg} />
                  <ColorField compact label="Button text" value={celebBtnText} onChange={setCelebBtnText} />
                  <ColorField compact label="Icon" value={celebIconBg} onChange={setCelebIconBg} />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={celebShowIcon}
                    onChange={(e) => setCelebShowIcon(e.target.checked)}
                    disabled={isSubmitting}
                    style={{ accentColor: color.primary }}
                  />
                  Show gift icon
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={celebShowConfetti}
                    onChange={(e) => setCelebShowConfetti(e.target.checked)}
                    disabled={isSubmitting || celebStyle === "minimal"}
                    style={{ accentColor: color.primary }}
                  />
                  Show confetti
                </label>
              </div>
            </details>
          </>
        ) : null}
      </div>
  );

  const displayContent = (
    <>
      <div style={copyGroupStyle}>
        <p style={copyGroupTitleStyle}>Before threshold</p>
        <div className="fgpb-field" style={fieldStyle}>
          <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-heading">
            Heading
          </label>
          <input
            id="fgpb-heading"
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
          />
        </div>
        <div className="fgpb-field" style={fieldStyle}>
          <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-description">
            Description
          </label>
          <input
            id="fgpb-description"
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <p style={hintTextStyle}>Use {"{remaining}"} to insert the amount still needed.</p>
      </div>

      <div style={copyGroupStyle}>
        <p style={copyGroupTitleStyle}>After threshold</p>
        <div className="fgpb-field" style={fieldStyle}>
          <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-unlocked-heading">
            Heading
          </label>
          <input
            id="fgpb-unlocked-heading"
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={unlockedHeading}
            onChange={(e) => setUnlockedHeading(e.target.value)}
          />
        </div>
        <div className="fgpb-field" style={fieldStyle}>
          <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-unlocked-description">
            Description
          </label>
          <input
            id="fgpb-unlocked-description"
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={unlockedDescription}
            onChange={(e) => setUnlockedDescription(e.target.value)}
          />
        </div>
      </div>

      {celebrationContent}

      <div style={copyGroupStyle}>
        <p style={copyGroupTitleStyle}>Colors</p>
        <p style={hintTextStyle}>Colors for the progress widget.</p>
        <div style={compactColorGridStyle}>
          <ColorField compact label="Progress bar" value={barColor} onChange={setBarColor} />
          <ColorField compact label="Background" value={backgroundColor} onChange={setBackgroundColor} />
          <ColorField compact label="Text" value={textColor} onChange={setTextColor} />
        </div>
      </div>

      <div className="fgpb-field" style={fieldStyle}>
        <label className="fgpb-label" style={labelStyle}>
          Border radius ({borderRadius}px)
        </label>
        <input
          type="range"
          min={0}
          max={30}
          value={borderRadius}
          onChange={(e) => setBorderRadius(Number(e.target.value) || 0)}
          style={{ accentColor: barColor }}
        />
      </div>
      <div className="fgpb-field" style={fieldStyle}>
        <p className="fgpb-label" style={labelStyle}>
          Widget size &amp; track thickness
        </p>
        <p style={hintTextStyle}>
          Use the controls on the live preview (right). Widget size changes the whole card on the
          product page; cart drawer/page stay more compact so spacious never balloons empty space.
        </p>
      </div>
      <div className="fgpb-field" style={fieldStyle}>
        <label className="fgpb-label" style={labelStyle} htmlFor="fgpb-button-text">
          Button text
        </label>
        <input
          id="fgpb-button-text"
          className="fgpb-input"
          style={inputStyle}
          type="text"
          value={buttonText}
          onChange={(e) => setButtonText(e.target.value)}
        />
      </div>

      <div className="fgpb-field" style={fieldStyle}>
        <p style={labelStyle}>Template</p>
        <div style={chipRowStyle}>
          {TEMPLATE_OPTIONS.map((option) => {
            const active = template === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setTemplate(option)}
                className={cx("fgpb-chip", active && "fgpb-chip--active")}
                style={{ ...chipStyle, ...(active ? chipActiveStyle : null) }}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  const placementContent = (
    <div style={placementGridStyle}>
      {PLACEMENT_OPTIONS.map((option) => {
        const checked = placements.includes(option);
        return (
          <label key={option} style={{ ...placementCardStyle, ...(checked ? placementCardActiveStyle : null) }}>
            <input
              type="checkbox"
              name="placements"
              value={option}
              checked={checked}
              onChange={() => togglePlacement(option)}
              style={{ accentColor: color.primary }}
              form={formId}
              disabled={isSubmitting}
            />
            <span>{option}</span>
          </label>
        );
      })}
    </div>
  );

  const cartExperienceContent = (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: color.text }}>Product Page Card</p>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          Full marketing widget on product pages. Uses the same campaign evaluation as the cart strip.
        </p>
        <label className="fgpb-field" style={fieldStyle}>
          <span className="fgpb-label" style={labelStyle}>
            Heading
          </span>
          <input
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            disabled={isSubmitting}
          />
        </label>
        <label className="fgpb-field" style={fieldStyle}>
          <span className="fgpb-label" style={labelStyle}>
            Description
          </span>
          <textarea
            className="fgpb-input"
            style={{ ...inputStyle, height: 88, padding: "10px 12px", resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={3}
          />
        </label>
        <label className="fgpb-field" style={fieldStyle}>
          <span className="fgpb-label" style={labelStyle}>
            Button text
          </span>
          <input
            className="fgpb-input"
            style={inputStyle}
            type="text"
            value={buttonText}
            onChange={(e) => setButtonText(e.target.value)}
            disabled={isSubmitting}
          />
        </label>
        <label className="fgpb-field" style={fieldStyle}>
          <span className="fgpb-label" style={labelStyle}>
            Progress height ({progressHeight}px)
          </span>
          <input
            type="range"
            min={4}
            max={40}
            value={progressHeight}
            onChange={(e) => setProgressHeight(Math.max(4, Math.min(40, Number(e.target.value) || 12)))}
            disabled={isSubmitting}
            style={{ width: "100%", accentColor: barColor }}
          />
        </label>
        <label className="fgpb-field" style={fieldStyle}>
          <span className="fgpb-label" style={labelStyle}>
            Border radius ({borderRadius}px)
          </span>
          <input
            type="range"
            min={0}
            max={30}
            value={borderRadius}
            onChange={(e) => setBorderRadius(Number(e.target.value) || 0)}
            disabled={isSubmitting}
            style={{ width: "100%", accentColor: barColor }}
          />
        </label>
        <div className="fgpb-field" style={fieldStyle}>
          <p style={labelStyle}>Template</p>
          <div style={chipRowStyle}>
            {TEMPLATE_OPTIONS.map((option) => {
              const active = template === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTemplate(option)}
                  className={cx("fgpb-chip", active && "fgpb-chip--active")}
                  style={{ ...chipStyle, ...(active ? chipActiveStyle : null) }}
                  disabled={isSubmitting}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: 0 }} />

      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: color.text }}>Cart strip</p>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          {isTiered
            ? "Multi-tier milestone bar in the cart drawer. Turn on, set titles, then open colors if you need them."
            : "Promo banner + progress rail on the cart page and drawer."}
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={cartBarEnabled}
            onChange={(e) => setCartBarEnabled(e.target.checked)}
            disabled={isSubmitting}
            style={{ accentColor: color.primary }}
          />
          Enable cart strip (page + drawer)
        </label>
        {cartBarEnabled ? (
          <>
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                {isTiered ? "Banner title" : "Cart strip banner title"}
              </span>
              <input
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={cartBarBannerTitle}
                onChange={(e) => setCartBarBannerTitle(e.target.value)}
                disabled={isSubmitting}
                placeholder="SHOP MORE, WIN FREEBIES"
              />
            </label>
            {isTiered ? (
              <>
                <label className="fgpb-field" style={fieldStyle}>
                  <span className="fgpb-label" style={labelStyle}>
                    Banner subtitle
                  </span>
                  <input
                    className="fgpb-input"
                    style={inputStyle}
                    type="text"
                    value={cartBarBannerSubtitle}
                    onChange={(e) => setCartBarBannerSubtitle(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Free gifts worth unlocking"
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  <label className="fgpb-field" style={fieldStyle}>
                    <span className="fgpb-label" style={labelStyle}>
                      Tier label
                    </span>
                    <input
                      className="fgpb-input"
                      style={inputStyle}
                      type="text"
                      value={cartBarTierLabel}
                      onChange={(e) => setCartBarTierLabel(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="Gift"
                    />
                  </label>
                  <label className="fgpb-field" style={fieldStyle}>
                    <span className="fgpb-label" style={labelStyle}>
                      Final tier label
                    </span>
                    <input
                      className="fgpb-input"
                      style={inputStyle}
                      type="text"
                      value={cartBarFinalTierLabel}
                      onChange={(e) => setCartBarFinalTierLabel(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="Bumper"
                    />
                  </label>
                </div>
                <details style={detailsStyle}>
                  <summary style={summaryStyle}>Cart strip colors</summary>
                  <div style={{ ...compactColorGridStyle, marginTop: 10 }}>
                    <ColorField compact label="Banner bg" value={cartBarBannerBg} onChange={setCartBarBannerBg} />
                    <ColorField compact label="Banner text" value={cartBarBannerText} onChange={setCartBarBannerText} />
                    <ColorField compact label="Body bg" value={cartBarBodyBg} onChange={setCartBarBodyBg} />
                    <ColorField compact label="Track" value={cartBarTrackColor} onChange={setCartBarTrackColor} />
                    <ColorField compact label="Milestone" value={cartBarMarkBorder} onChange={setCartBarMarkBorder} />
                  </div>
                </details>
              </>
            ) : null}
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Height ({cartBarHeight}px)
              </span>
              <input
                type="range"
                min={4}
                max={40}
                value={cartBarHeight}
                onChange={(e) => setCartBarHeight(Math.max(4, Math.min(40, Number(e.target.value) || 6)))}
                disabled={isSubmitting}
                style={{ width: "100%", accentColor: barColor }}
              />
            </label>
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Border radius ({cartBarRadius}px)
              </span>
              <input
                type="range"
                min={0}
                max={16}
                value={cartBarRadius}
                onChange={(e) => setCartBarRadius(Number(e.target.value) || 0)}
                disabled={isSubmitting}
                style={{ width: "100%", accentColor: color.primary }}
              />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={cartBarCompact}
                onChange={(e) => setCartBarCompact(e.target.checked)}
                disabled={isSubmitting}
                style={{ accentColor: color.primary }}
              />
              Compact mode
            </label>
            <div
              aria-hidden
              style={{
                marginTop: 4,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #eee",
              }}
            >
              <div
                style={{
                  background: isTiered ? cartBarBannerBg : barColor,
                  color: isTiered ? cartBarBannerText : "#fff",
                  textAlign: "center",
                  padding: cartBarCompact ? "8px 10px" : "10px 12px",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em" }}>
                  {(cartBarBannerTitle || "SHOP MORE, WIN FREEBIES").toUpperCase()}
                </div>
                <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>
                  {cartBarBannerSubtitle || "Free gifts worth unlocking"}
                </div>
              </div>
              <div
                style={{
                  padding: cartBarCompact ? "10px 12px 12px" : "12px 14px 14px",
                  background: isTiered ? cartBarBodyBg : "#fff",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: textColor,
                  }}
                >
                  {isUnlockedPreview
                    ? unlockedHeading || "You've unlocked your free gift!"
                    : `Add ${money(remainingAmount)} more to earn Free Gift`}
                </div>
                {isTiered && rewardTiers.length > 0 ? (
                  <div style={{ position: "relative", padding: "18px 8px 28px" }}>
                    <div
                      style={{
                        height: cartBarHeight,
                        borderRadius: cartBarRadius || Math.round(cartBarHeight / 2),
                        background: cartBarTrackColor,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(8, Math.min(100, progressPercent))}%`,
                          height: "100%",
                          background: barColor,
                          borderRadius: cartBarRadius || Math.round(cartBarHeight / 2),
                        }}
                      />
                    </div>
                    {rewardTiers.map((tier, idx) => {
                      const maxTh = Math.max(...rewardTiers.map((t) => Number(t.threshold) || 0), 1);
                      const left = ((Number(tier.threshold) || 0) / maxTh) * 100;
                      const label =
                        idx === rewardTiers.length - 1 ? cartBarFinalTierLabel : cartBarTierLabel;
                      return (
                        <div
                          key={`${tier.id || "new"}-${idx}`}
                          style={{
                            position: "absolute",
                            left: `${left}%`,
                            top: 0,
                            transform: "translateX(-50%)",
                            width: 48,
                            textAlign: "center",
                            fontSize: 9,
                            color: "#888",
                            fontWeight: 600,
                          }}
                        >
                          <div>{money(Number(tier.threshold) || 0)}</div>
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              margin: "4px auto 2px",
                              borderRadius: "50%",
                              border: `1.5px solid ${cartBarMarkBorder}`,
                              background: "#fff",
                            }}
                          />
                          <div>{label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ position: "relative", padding: "14px 28px 22px 4px" }}>
                    <div
                      style={{
                        height: cartBarHeight,
                        borderRadius: cartBarRadius || Math.round(cartBarHeight / 2),
                        background: "rgba(17,24,39,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(8, Math.min(100, progressPercent))}%`,
                          height: "100%",
                          background: barColor,
                          borderRadius: cartBarRadius || Math.round(cartBarHeight / 2),
                        }}
                      />
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        width: 40,
                        textAlign: "center",
                        fontSize: 9,
                        color: "#888",
                        fontWeight: 600,
                      }}
                    >
                      Gift
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: 0 }} />

      <div style={{ display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: color.text }}>Bestsellers</p>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          Shows on the cart page and cart drawer below line items. Enable, add products, then save.
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={recsEnabled}
            onChange={(e) => setRecsEnabled(e.target.checked)}
            disabled={isSubmitting}
            style={{ accentColor: color.primary }}
          />
          Enable bestsellers
        </label>
        {recsEnabled ? (
          <>
            <ColorField
              compact
              label="Section background"
              value={recsBackgroundColor}
              onChange={setRecsBackgroundColor}
            />
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Section heading
              </span>
              <input
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={recsHeading}
                onChange={(e) => setRecsHeading(e.target.value)}
                disabled={isSubmitting}
              />
            </label>
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Supporting line (optional)
              </span>
              <textarea
                className="fgpb-input"
                style={{ ...inputStyle, height: 72, padding: "10px 12px", resize: "vertical" }}
                value={recsDescription}
                onChange={(e) => setRecsDescription(e.target.value)}
                disabled={isSubmitting}
                rows={2}
              />
            </label>
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Products shown ({recsMaxProducts})
              </span>
              <input
                type="range"
                min={2}
                max={8}
                value={recsMaxProducts}
                onChange={(e) => setRecsMaxProducts(Number(e.target.value) || 4)}
                disabled={isSubmitting}
                style={{ width: "100%", accentColor: color.primary }}
              />
            </label>
            <label className="fgpb-field" style={fieldStyle}>
              <span className="fgpb-label" style={labelStyle}>
                Add button text
              </span>
              <input
                className="fgpb-input"
                style={inputStyle}
                type="text"
                value={recsButtonText}
                onChange={(e) => setRecsButtonText(e.target.value)}
                disabled={isSubmitting}
                placeholder="+ Add"
              />
            </label>
            <div>
              <p className="fgpb-label" style={labelStyle}>
                Recommended products
              </p>
              <ProductMultiPicker
                products={recsProducts}
                maxProducts={recsMaxProducts}
                onChange={setRecsProducts}
                disabled={isSubmitting}
              />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
              Re-add products after this update if you want sale prices / “% off” badges stored from
              search.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );

  const priorityField = (
<div className="fgpb-field" style={fieldStyle}>
          <label htmlFor="campaign-priority" style={labelStyle}>Campaign priority</label>
          <input id="campaign-priority" className="fgpb-input" type="number" min={0} max={1000} step={1}
            value={priority} disabled={isSubmitting} onChange={(event) => setPriority(Number(event.target.value))} />
          <CampaignCompetitionNotice campaigns={competingCampaigns} priority={priority} currencyCode={currencyCode} />
        </div>
  );

  const reviewContent = (
    <>
      <div style={reviewGridStyle}>
        <ReviewRow label="Promotion type" value={campaignType} />
        {priorityField}
        <ReviewRow label="Campaign name" value={name || "Untitled campaign"} />
        {isTiered ? (
          <>
            <ReviewRow label="Tiers" value={`${rewardTiers.length}`} />
            {rewardTiers.map((tier, index) => (
              <ReviewRow
                key={tier.id ?? `review-tier-${index}`}
                label={`Tier ${index + 1}`}
                value={`${money(tier.threshold)} → ${tier.gift?.title || "No gift"}`}
              />
            ))}
          </>
        ) : (
          <ReviewRow label="Threshold" value={`${money(threshold)}`} />
        )}
        {isPercentageDiscount ? (
          <ReviewRow label="Discount" value={`${discountPercentage}%`} />
        ) : isFixedDiscount ? (
          <ReviewRow label="Discount" value={`${money(fixedDiscountAmount)}`} />
        ) : isTiered ? null : (
          <>
            <ReviewRow label="Gift" value={gift ? gift.title : "No gift selected"} />
            <ReviewRow label="Gift quantity" value={String(giftQuantity)} />
          </>
        )}
        <ReviewRow label="Template" value={template} />
        <ReviewRow label="Placements" value={placements.length ? placements.join(", ") : "None selected"} />
      </div>
      <p style={reviewNoteStyle}>
        Choose Save draft to finish later, or Activate when your campaign is ready.
      </p>
    </>
  );

  function setBarHeight(next: number) {
    setProgressHeight(Math.max(4, Math.min(40, Math.round(Number(next) || 12))));
  }

  function setPad(next: number) {
    setWidgetPadding(Math.max(2, Math.min(32, Math.round(Number(next) || 16))));
  }

  const sizeControls = (
    <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span className="fgpb-label" style={{ ...labelStyle, margin: 0 }}>
            Widget padding
          </span>
          <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{widgetPadding}px</strong>
        </div>
        <input
          type="range"
          min={2}
          max={32}
          value={widgetPadding}
          onChange={(e) => setPad(Number(e.target.value))}
          style={{ width: "100%", accentColor: barColor }}
          disabled={isSubmitting}
          aria-label="Widget size"
        />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <span className="fgpb-label" style={{ ...labelStyle, margin: 0 }}>
            Bar height
          </span>
          <strong style={{ fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{progressHeight}px</strong>
        </div>
        <input
          type="range"
          min={4}
          max={40}
          value={progressHeight}
          onChange={(e) => setBarHeight(Number(e.target.value))}
          style={{ width: "100%", accentColor: barColor }}
          disabled={isSubmitting}
          aria-label="Track thickness"
        />
      </div>
    </div>
  );

  const previewCartSlider =
    mode === "edit" ? (
      <div className="fgpb-field" style={{ ...fieldStyle, marginTop: 14 }}>
        <label className="fgpb-label" style={labelStyle}>
          Preview cart · {money(simulatedCartAmount)}
        </label>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={50}
          value={simulatedCartAmount}
          onChange={(e) => setSimulatedCartAmount(Number(e.target.value) || 0)}
          style={{ accentColor: barColor, width: "100%" }}
        />
      </div>
    ) : null;

  const preview = (
    <aside className="fgpb-builder__preview" style={previewWrapStyle}>
      <div className="fgpb-builder__preview-heading">
        <p style={previewTitleStyle}>Live preview</p>
        <span>Storefront card</span>
      </div>
      <WidgetLivePreview
        key={`preview-${progressHeight}-${widgetPadding}`}
        heading={previewHeading}
        description={previewDescription}
        template={template}
        barColor={barColor}
        backgroundColor={backgroundColor}
        textColor={textColor}
        borderRadius={borderRadius}
        progressHeight={progressHeight}
        widgetPadding={widgetPadding}
        buttonText={buttonText}
        progressPercent={progressPercent}
        remainingLabel={
          isUnlockedPreview
            ? "Threshold met in this preview cart."
            : `${money(remainingAmount)} remaining · goal ${money(effectiveThreshold)}.`
        }
        giftTitle={
          isPercentageDiscount
            ? `${discountPercentage}% discount`
            : isFixedDiscount
              ? `${money(fixedDiscountAmount)} off`
              : isTiered
                ? rewardTiers.map((t) => t.gift?.title || "Gift").join(" · ") || "Select tier gifts"
                : gift?.title ?? "Select a gift product"
        }
        giftImageUrl={isNonGiftDiscount || isTiered ? null : gift?.imageUrl}
        unlocked={isUnlockedPreview}
      />
      <div className="fgpb-builder__preview-controls">
        <div>
          <p className="fgpb-builder__preview-controls-title">Preview controls</p>
          <p className="fgpb-builder__preview-controls-copy">Changes appear in the preview.</p>
        </div>
        {sizeControls}
        {previewCartSlider}
      </div>
    </aside>
  );

  const hiddenInputs = (
    <>
      <input type="hidden" name="campaignType" value={campaignType} form={formId} />
      <input type="hidden" name="currencyCode" value={currencyCode} form={formId} />
      {isNonGiftDiscount || isTiered ? (
        <input type="hidden" name="giftQuantity" value={1} form={formId} />
      ) : null}
      {!isTiered ? (
        <>
          <input type="hidden" name="giftProductId" value={gift?.productId ?? ""} form={formId} />
          <input type="hidden" name="giftProductTitle" value={gift?.title ?? ""} form={formId} />
          <input type="hidden" name="giftProductImage" value={gift?.imageUrl ?? ""} form={formId} />
          <input type="hidden" name="giftVariantId" value={gift?.variantId ?? ""} form={formId} />
        </>
      ) : null}
      <input type="hidden" name="widgetHeading" value={heading} form={formId} />
      <input type="hidden" name="priority" value={priority} form={formId} />
      <input type="hidden" name="widgetDescription" value={description} form={formId} />
      <input type="hidden" name="widgetUnlockedHeading" value={unlockedHeading} form={formId} />
      <input type="hidden" name="widgetUnlockedDescription" value={unlockedDescription} form={formId} />
      <input type="hidden" name="widgetBarColor" value={barColor} form={formId} />
      <input type="hidden" name="widgetBackgroundColor" value={backgroundColor} form={formId} />
      <input type="hidden" name="widgetTextColor" value={textColor} form={formId} />
      <input type="hidden" name="widgetBorderRadius" value={borderRadius} form={formId} />
      <input type="hidden" name="widgetProgressHeight" value={progressHeight} form={formId} />
      <input type="hidden" name="widgetPadding" value={widgetPadding} form={formId} />
      <input type="hidden" name="widgetButtonText" value={buttonText} form={formId} />
      <input type="hidden" name="widgetTemplate" value={template} form={formId} />
      <input type="hidden" name="cartBarEnabled" value={cartBarEnabled ? "true" : "false"} form={formId} />
      <input type="hidden" name="cartBarBannerTitle" value={cartBarBannerTitle} form={formId} />
      <input type="hidden" name="cartBarBannerSubtitle" value={cartBarBannerSubtitle} form={formId} />
      <input type="hidden" name="cartBarBannerBg" value={cartBarBannerBg} form={formId} />
      <input type="hidden" name="cartBarBannerText" value={cartBarBannerText} form={formId} />
      <input type="hidden" name="cartBarBodyBg" value={cartBarBodyBg} form={formId} />
      <input type="hidden" name="cartBarTrackColor" value={cartBarTrackColor} form={formId} />
      <input type="hidden" name="cartBarMarkBorder" value={cartBarMarkBorder} form={formId} />
      <input type="hidden" name="cartBarTierLabel" value={cartBarTierLabel} form={formId} />
      <input type="hidden" name="cartBarFinalTierLabel" value={cartBarFinalTierLabel} form={formId} />
      <input type="hidden" name="cartBarHeight" value={cartBarHeight} form={formId} />
      <input type="hidden" name="cartBarRadius" value={cartBarRadius} form={formId} />
      <input type="hidden" name="cartBarCompact" value={cartBarCompact ? "true" : "false"} form={formId} />
      <input type="hidden" name="widgetSettings" value={JSON.stringify(widgetSettingsPayload)} form={formId} />
    </>
  );

  const errorBanner = error ? (
    <div className="fgpb-notice fgpb-notice--critical" role="alert">
      <div className="fgpb-notice__body">
        <p className="fgpb-notice__title">Couldn’t save this promotion</p>
        <p className="fgpb-notice__text">{error}</p>
      </div>
    </div>
  ) : null;

  if (mode === "edit") {
    return (
      <div className="fgpb-builder fgpb-builder--edit" data-mode="edit" style={editLayoutStyle}>
        <div style={editMainStyle}>
          {errorBanner}
          <nav className="fgpb-editor-section-nav" aria-label="Campaign editor sections">
            <a href="#campaign-details">Details</a>
            <a href="#campaign-offer">Offer</a>
            <a href="#campaign-experience">Experience</a>
            <a href="#campaign-placement">Placement</a>
          </nav>
          <Section id="campaign-details" title="Campaign details">
            {nameField}
            {priorityField}
            <div style={{ marginTop: 4 }}>
              <p style={labelStyle}>Promotion type</p>
              {typeContent}
            </div>
          </Section>
          <Section id="campaign-offer" title="Offer">
            <div className="fgpb-builder__subsection">
              <h3>Trigger</h3>
              {thresholdField}
            </div>
            <div className="fgpb-builder__subsection">
              <h3>Reward</h3>
              {rewardContent}
            </div>
          </Section>
          <Section id="campaign-experience" title="Storefront experience">
            <div className="fgpb-builder__subsection">
              <h3>Progress widget</h3>
              {displayContent}
            </div>
            <div className="fgpb-builder__subsection">
              <h3>Cart experience</h3>
              {cartExperienceContent}
            </div>
          </Section>
          <Section id="campaign-placement" title="Placement">
            {placementContent}
            {acceleratedCheckoutNotice}
          </Section>
          {hiddenInputs}
        </div>
        {preview}
      </div>
    );
  }

  return (
    <div className="fgpb-builder fgpb-builder--create" data-mode="create">
      {errorBanner}
      <div className="fgpb-create">
        <div className="fgpb-create__main">
          <section className="fgpb-create__card">
            <p className="fgpb-create__kicker">Offer</p>
            <h2>Name the campaign</h2>
            {nameField}
            {typeContent}
          </section>
          <section className="fgpb-create__card">
            <p className="fgpb-create__kicker">{isTiered ? "Tiers" : "Gift"}</p>
            <h2>{isTiered ? "Build the ladder" : "Set the reward"}</h2>
            {isTiered ? null : thresholdField}
            {rewardContent}
          </section>
        </div>
        <aside className="fgpb-create__stage">
          <div className="fgpb-create__stage-hero">
            <p>Celebration</p>
            <h2>When the gift unlocks</h2>
          </div>
          <div className="fgpb-create__stage-body">{celebrationContent}</div>
        </aside>
      </div>
      {acceleratedCheckoutNotice}
      {placements.map((placement) => (
        <input key={placement} type="hidden" name="placements" value={placement} form={formId} />
      ))}
      {hiddenInputs}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={reviewRowStyle}>
      <span style={reviewLabelStyle}>{label}</span>
      <span style={reviewValueStyle}>{value}</span>
    </div>
  );
}

// ---- styles -----------------------------------------------------------------

const FONT: CSSProperties["fontFamily"] =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const createLayoutStyle: CSSProperties = {
  gap: 20,
  alignItems: "start",
  fontFamily: FONT,
  color: color.text,
};

const editLayoutStyle: CSSProperties = {
  gap: 20,
  alignItems: "start",
  fontFamily: FONT,
  color: color.text,
};

const editMainStyle: CSSProperties = { display: "grid", gap: 20 };

const navStepStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid transparent",
  borderRadius: 10,
  background: "transparent",
  color: "#666",
  fontSize: 13,
  fontWeight: 600,
  padding: "9px 10px",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const navStepActiveStyle: CSSProperties = {
  background: color.primarySoft,
  color: color.primaryHover,
};

const navStepIndexStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  background: "rgba(0,0,0,0.06)",
  flexShrink: 0,
};

const panelStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  background: "#fff",
  padding: 24,
  boxShadow: "none",
  display: "grid",
  gap: 20,
};

const sectionStyle: CSSProperties = { display: "grid", gap: 14 };

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: color.text,
  letterSpacing: "0.01em",
};

const fieldStyle: CSSProperties = { display: "grid", gap: 8 };

const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: color.text };

const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 8,
  border: "1px solid #e8e8e8",
  padding: "0 14px",
  fontSize: 14,
  background: "#fff",
  color: color.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const hintTextStyle: CSSProperties = { margin: 0, fontSize: 12, color: color.textSecondary };

const prefixWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 44,
  borderRadius: 8,
  border: "1px solid #e8e8e8",
  background: "#fff",
  overflow: "hidden",
};

const prefixStyle: CSSProperties = { padding: "0 10px", color: color.textSecondary, fontWeight: 600, fontSize: 14 };

const prefixInputStyle: CSSProperties = {
  border: "none",
  outline: "none",
  width: "100%",
  height: "100%",
  padding: "0 12px 0 0",
  fontSize: 14,
  color: color.text,
  background: "transparent",
  fontFamily: "inherit",
};

const typeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 10,
};

const typeCardStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: 4,
  textAlign: "left",
  border: "1px solid #e8e8e8",
  borderRadius: 8,
  background: "#fff",
  padding: "14px 16px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const typeCardActiveStyle: CSSProperties = {
  border: `1px solid ${color.primary}`,
  background: color.primarySoft,
};

const typeCardDisabledStyle: CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.7,
  background: "#fafafa",
};

const typeCardTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: color.text };

const typeCardDescStyle: CSSProperties = { fontSize: 12, color: "#666", lineHeight: 1.4 };

const tierGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 12,
  alignItems: "stretch",
};

const tierCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  border: `1px solid ${color.border}`,
  borderLeft: `3px solid ${color.primary}`,
  borderRadius: 8,
  padding: 14,
  background: "#fff",
  minWidth: 0,
};

const tierCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const tierStepStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const tierStepBlockStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
};

const tierKickerStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: color.textMuted,
};

const tierArrowStyle: CSSProperties = {
  color: color.primary,
  fontWeight: 700,
  fontSize: 14,
  lineHeight: 1,
};

const tierAddCardStyle: CSSProperties = {
  display: "grid",
  placeContent: "center",
  gap: 6,
  minHeight: 160,
  border: "1px dashed #cfcfcf",
  borderRadius: 8,
  background: "#fff",
  color: "#666",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 12,
};

const tierReorderBtnStyle: CSSProperties = {
  height: 32,
  minWidth: 32,
  padding: "0 6px",
  borderRadius: 8,
  border: "1px solid #e8e8e8",
  background: "#fff",
  color: color.text,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const detailsStyle: CSSProperties = {
  border: "1px solid #e8e8e8",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fff",
};

const summaryStyle: CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#444",
  listStyle: "none",
};

const compactColorGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: 10,
};

const comingSoonBadgeStyle: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: color.textSecondary,
  background: "#f5f5f5",
  border: "1px solid #e8e8e8",
  borderRadius: 999,
  padding: "2px 8px",
};

const copyGroupStyle: CSSProperties = { display: "grid", gap: 10 };

const copyGroupTitleStyle: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 700, color: "#666" };

const chipRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };

const chipStyle: CSSProperties = {
  border: "1px solid #e8e8e8",
  borderRadius: 999,
  background: "#fff",
  color: color.text,
  fontSize: 12,
  fontWeight: 600,
  padding: "7px 14px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const chipActiveStyle: CSSProperties = {
  background: color.primarySoft,
  color: color.primaryHover,
  borderColor: color.primary,
};

const placementGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const placementCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #e8e8e8",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fafafa",
  color: color.text,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const placementCardActiveStyle: CSSProperties = {
  background: "#fff",
  borderColor: color.primary,
};

const reviewGridStyle: CSSProperties = { display: "grid", gap: 8 };

const reviewRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid #f0f0f0",
};

const reviewLabelStyle: CSSProperties = { fontSize: 13, color: "#666", fontWeight: 500 };

const reviewValueStyle: CSSProperties = {
  fontSize: 13,
  color: color.text,
  fontWeight: 600,
  textAlign: "right",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const reviewNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: color.textSecondary,
  lineHeight: 1.5,
};


const stepNavStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  paddingTop: 4,
};

const stepNavBackStyle: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid #e8e8e8",
  background: "#fff",
  color: color.text,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const stepNavNextStyle: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid transparent",
  background: color.primary,
  color: "#fff",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const previewWrapStyle: CSSProperties = {
  minWidth: 0,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  background: "#fff",
  padding: 20,
  boxShadow: "none",
};

const previewTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: color.textSecondary,
};

const infoNoticeStyle: CSSProperties = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e8e8e8",
  background: "#fafafa",
};

const infoNoticeTitleStyle: CSSProperties = {
  margin: "0 0 4px",
  fontSize: 12,
  fontWeight: 700,
  color: "#555",
};

const infoNoticeBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.45,
  color: "#666",
};

const infoNoticeLinkStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
};

const infoNoticeAnchorStyle: CSSProperties = {
  color: "#2c6ecb",
  textDecoration: "none",
  fontWeight: 600,
};
