export type CartProgressBarSettings = {
  /** When false, cart-page strip is not mounted. Default true. */
  enabled?: boolean;
  height?: number;
  borderRadius?: number;
  compact?: boolean;
  /** Promo banner headline on the cart strip (inspired layout). */
  bannerTitle?: string;
  /** Banner supporting line (tiered drawer), e.g. "Free gifts worth INR 898/-". */
  bannerSubtitle?: string;
  /** Banner background (defaults to bar / olive for tiered). */
  bannerBackgroundColor?: string;
  bannerTextColor?: string;
  /** White body behind the rail. */
  bodyBackgroundColor?: string;
  /** Unfilled track color. */
  trackColor?: string;
  /** Milestone circle border. */
  markBorderColor?: string;
  /** Label under each non-final milestone. Default "Gift". */
  tierLabel?: string;
  /** Label under the last milestone. Default "Bumper". */
  finalTierLabel?: string;
};

export type CartRecommendationProduct = {
  productId: string;
  variantId: string;
  title?: string;
  imageUrl?: string | null;
  /** Unit price as decimal string, e.g. "410.00" */
  price?: string | null;
  /** Compare-at price as decimal string when on sale */
  compareAtPrice?: string | null;
};

export type CartRecommendationsSettings = {
  enabled?: boolean;
  heading?: string;
  description?: string;
  products?: CartRecommendationProduct[];
  maxProducts?: number;
  buttonText?: string;
  /** Section background color (hex). */
  backgroundColor?: string;
};

export type WidgetSettings = {
  heading?: string;
  description?: string;
  unlockedHeading?: string;
  unlockedDescription?: string;
  template?: string;
  barColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  /** Thickness of the progress track (the thin fill bar). */
  progressHeight?: number;
  /** Overall widget padding / vertical size of the whole card. */
  widgetPadding?: number;
  buttonText?: string;
  cartProgressBar?: CartProgressBarSettings;
  cartRecommendations?: CartRecommendationsSettings;
  /** Unlock celebration modal shown on the storefront. */
  celebrationPopup?: CelebrationPopupSettings;
};

export type CelebrationPopupStyle =
  | "classic"
  | "minimal"
  | "confetti"
  | "soft"
  | "bold"
  | "toast";

export type CelebrationPopupPlacement = "center" | "drawer";

export const CELEBRATION_POPUP_STYLES: CelebrationPopupStyle[] = [
  "classic",
  "minimal",
  "confetti",
  "soft",
  "bold",
  "toast",
];

export const CELEBRATION_POPUP_PLACEMENTS: CelebrationPopupPlacement[] = ["center", "drawer"];

export type CelebrationPopupSettings = {
  enabled?: boolean;
  style?: CelebrationPopupStyle;
  /** Where the popup appears: page center overlay, or inside the cart drawer. */
  placement?: CelebrationPopupPlacement;
  /** Partial tier unlock heading (Tiered campaigns). */
  tierHeading?: string;
  tierDescription?: string;
  /** Full unlock heading — falls back to unlockedHeading. */
  heading?: string;
  description?: string;
  buttonText?: string;
  borderRadius?: number;
  /** Cart drawer popup scale as percent (30–100). Default 52. */
  drawerSizePercent?: number;
  cardBackgroundColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
  iconBackgroundColor?: string;
  showIcon?: boolean;
  showConfetti?: boolean;
  autoCloseMs?: number;
};

export const DEFAULT_CELEBRATION_POPUP: CelebrationPopupSettings = {
  enabled: true,
  style: "classic",
  placement: "center",
  tierHeading: "You've unlocked a free gift!",
  tierDescription: "Keep shopping to unlock more tier gifts.",
  heading: "",
  description: "",
  buttonText: "Awesome",
  borderRadius: 18,
  drawerSizePercent: 52,
  cardBackgroundColor: "#ffffff",
  titleColor: "#111111",
  descriptionColor: "#555555",
  buttonBackgroundColor: "#111111",
  buttonTextColor: "#ffffff",
  iconBackgroundColor: "#111111",
  showIcon: true,
  showConfetti: true,
  autoCloseMs: 6500,
};

export function parseWidgetSettings(value: unknown): WidgetSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as WidgetSettings;
}

const CART_BAR_HEIGHT_MIN = 4;
const CART_BAR_HEIGHT_MAX = 40;
const CART_BAR_RADIUS_MIN = 0;
const CART_BAR_RADIUS_MAX = 16;
const WIDGET_PADDING_MIN = 2;
const WIDGET_PADDING_MAX = 32;
export const DEFAULT_WIDGET_PADDING = 16;

export function normalizeWidgetPadding(
  value: unknown,
  fallback: number = DEFAULT_WIDGET_PADDING,
): number {
  return clampInt(value, WIDGET_PADDING_MIN, WIDGET_PADDING_MAX, fallback);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeText(value: unknown, maxLen: number, fallback = ""): string {
  const raw = String(value ?? "")
    .split("\0")
    .join("")
    .trim();
  if (!raw) return fallback;
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function sanitizeMoney(value: unknown): string | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

function sanitizeMultiline(value: unknown, maxLen: number, fallback = ""): string {
  const raw = String(value ?? "")
    .split("\0")
    .join("")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return fallback;
  return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    const a = raw[1];
    const b = raw[2];
    const c = raw[3];
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return fallback;
}

/** Server-side clamps for cart-page progress bar presentation. */
export function normalizeCartProgressBar(
  value: unknown,
  fallback?: CartProgressBarSettings | null,
): CartProgressBarSettings {
  const src =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as CartProgressBarSettings)
      : fallback || {};
  const enabledRaw = (src as { enabled?: unknown }).enabled;
  let enabled = fallback?.enabled !== false;
  if (enabledRaw === false || enabledRaw === "false") enabled = false;
  else if (enabledRaw === true || enabledRaw === "true") enabled = true;

  const fb = fallback || {};
  return {
    enabled,
    height: clampInt(src.height, CART_BAR_HEIGHT_MIN, CART_BAR_HEIGHT_MAX, fb.height ?? 6),
    borderRadius: clampInt(
      src.borderRadius,
      CART_BAR_RADIUS_MIN,
      CART_BAR_RADIUS_MAX,
      fb.borderRadius ?? 8,
    ),
    compact: src.compact !== false,
    bannerTitle: sanitizeText(src.bannerTitle, 80, fb.bannerTitle || "SHOP MORE, WIN FREEBIES"),
    bannerSubtitle: sanitizeText(src.bannerSubtitle, 120, fb.bannerSubtitle || ""),
    bannerBackgroundColor: sanitizeHexColor(
      src.bannerBackgroundColor,
      fb.bannerBackgroundColor || "",
    ),
    bannerTextColor: sanitizeHexColor(src.bannerTextColor, fb.bannerTextColor || "#ffffff"),
    bodyBackgroundColor: sanitizeHexColor(
      src.bodyBackgroundColor,
      fb.bodyBackgroundColor || "#ffffff",
    ),
    trackColor: sanitizeHexColor(src.trackColor, fb.trackColor || "#e8e8e8"),
    markBorderColor: sanitizeHexColor(src.markBorderColor, fb.markBorderColor || "#cfcfcf"),
    tierLabel: sanitizeText(src.tierLabel, 24, fb.tierLabel || "Gift"),
    finalTierLabel: sanitizeText(src.finalTierLabel, 24, fb.finalTierLabel || "Bumper"),
  };
}

const CELEBRATION_RADIUS_MIN = 0;
const CELEBRATION_RADIUS_MAX = 32;
const CELEBRATION_CLOSE_MIN = 2000;
const CELEBRATION_CLOSE_MAX = 15000;
const CELEBRATION_DRAWER_SIZE_MIN = 30;
const CELEBRATION_DRAWER_SIZE_MAX = 100;

export function normalizeCelebrationPopup(
  value: unknown,
  fallback?: CelebrationPopupSettings | null,
): CelebrationPopupSettings {
  const fb = fallback || DEFAULT_CELEBRATION_POPUP;
  const src =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as CelebrationPopupSettings)
      : {};
  const enabledRaw = (src as { enabled?: unknown }).enabled;
  let enabled = fb.enabled !== false;
  if (enabledRaw === false || enabledRaw === "false") enabled = false;
  else if (enabledRaw === true || enabledRaw === "true") enabled = true;

  const styleRaw = String(src.style || fb.style || "classic").toLowerCase();
  const style = (CELEBRATION_POPUP_STYLES.includes(styleRaw as CelebrationPopupStyle)
    ? styleRaw
    : fb.style || "classic") as CelebrationPopupStyle;

  const placementRaw = String(src.placement || fb.placement || "center").toLowerCase();
  const placement = (CELEBRATION_POPUP_PLACEMENTS.includes(
    placementRaw as CelebrationPopupPlacement,
  )
    ? placementRaw
    : fb.placement || "center") as CelebrationPopupPlacement;

  const showIconRaw = (src as { showIcon?: unknown }).showIcon;
  let showIcon = fb.showIcon !== false;
  if (showIconRaw === false || showIconRaw === "false") showIcon = false;
  else if (showIconRaw === true || showIconRaw === "true") showIcon = true;

  const showConfettiRaw = (src as { showConfetti?: unknown }).showConfetti;
  let showConfetti = fb.showConfetti !== false;
  if (showConfettiRaw === false || showConfettiRaw === "false") showConfetti = false;
  else if (showConfettiRaw === true || showConfettiRaw === "true") showConfetti = true;

  return {
    enabled,
    style,
    placement,
    tierHeading: sanitizeText(src.tierHeading, 80, fb.tierHeading || "You've unlocked a free gift!"),
    tierDescription: sanitizeText(
      src.tierDescription,
      160,
      fb.tierDescription || "Keep shopping to unlock more tier gifts.",
    ),
    heading: sanitizeText(src.heading, 80, fb.heading || ""),
    description: sanitizeText(src.description, 160, fb.description || ""),
    buttonText: sanitizeText(src.buttonText, 40, fb.buttonText || "Awesome"),
    borderRadius: clampInt(
      src.borderRadius,
      CELEBRATION_RADIUS_MIN,
      CELEBRATION_RADIUS_MAX,
      fb.borderRadius ?? 18,
    ),
    drawerSizePercent: clampInt(
      src.drawerSizePercent,
      CELEBRATION_DRAWER_SIZE_MIN,
      CELEBRATION_DRAWER_SIZE_MAX,
      fb.drawerSizePercent ?? 52,
    ),
    cardBackgroundColor: sanitizeHexColor(
      src.cardBackgroundColor,
      fb.cardBackgroundColor || "#ffffff",
    ),
    titleColor: sanitizeHexColor(src.titleColor, fb.titleColor || "#111111"),
    descriptionColor: sanitizeHexColor(src.descriptionColor, fb.descriptionColor || "#555555"),
    buttonBackgroundColor: sanitizeHexColor(
      src.buttonBackgroundColor,
      fb.buttonBackgroundColor || "#111111",
    ),
    buttonTextColor: sanitizeHexColor(src.buttonTextColor, fb.buttonTextColor || "#ffffff"),
    iconBackgroundColor: sanitizeHexColor(
      src.iconBackgroundColor,
      fb.iconBackgroundColor || "#111111",
    ),
    showIcon,
    showConfetti,
    autoCloseMs: clampInt(
      src.autoCloseMs,
      CELEBRATION_CLOSE_MIN,
      CELEBRATION_CLOSE_MAX,
      fb.autoCloseMs ?? 6500,
    ),
  };
}

const RECS_MAX_MIN = 2;
const RECS_MAX_MAX = 8;
const RECS_HEADING_MAX = 80;
const RECS_DESC_MAX = 500;
const RECS_BUTTON_MAX = 40;
const RECS_TITLE_MAX = 120;

export const DEFAULT_CART_RECOMMENDATIONS: CartRecommendationsSettings = {
  enabled: false,
  heading: "Our other bestsellers loved by shoppers. You can try them!",
  description: "",
  products: [],
  maxProducts: 4,
  buttonText: "+ Add",
  backgroundColor: "#f7d6de",
};

/** Normalize + clamp cart recommendations before persisting. */
export function normalizeCartRecommendations(
  value: unknown,
  fallback?: CartRecommendationsSettings | null,
): CartRecommendationsSettings {
  const base = fallback || DEFAULT_CART_RECOMMENDATIONS;
  const src =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as CartRecommendationsSettings)
      : {};

  const seen = new Set<string>();
  const products: CartRecommendationProduct[] = [];
  const rawProducts = Array.isArray(src.products) ? src.products : [];
  for (const item of rawProducts) {
    if (!item || typeof item !== "object") continue;
    const productId = sanitizeText((item as CartRecommendationProduct).productId, 128);
    const variantId = sanitizeText((item as CartRecommendationProduct).variantId, 128);
    if (!productId || !variantId) continue;
    const key = `${productId}::${variantId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = sanitizeText((item as CartRecommendationProduct).title, RECS_TITLE_MAX);
    const imageUrlRaw = (item as CartRecommendationProduct).imageUrl;
    const imageUrl =
      typeof imageUrlRaw === "string" && /^https?:\/\//i.test(imageUrlRaw.trim())
        ? imageUrlRaw.trim().slice(0, 500)
        : null;
    const price = sanitizeMoney((item as CartRecommendationProduct).price);
    const compareAtPrice = sanitizeMoney((item as CartRecommendationProduct).compareAtPrice);
    products.push({
      productId,
      variantId,
      ...(title ? { title } : {}),
      imageUrl,
      ...(price ? { price } : {}),
      ...(compareAtPrice ? { compareAtPrice } : {}),
    });
    if (products.length >= RECS_MAX_MAX) break;
  }

  const maxProducts = clampInt(src.maxProducts, RECS_MAX_MIN, RECS_MAX_MAX, base.maxProducts ?? 4);

  return {
    enabled: src.enabled === true,
    heading: sanitizeText(src.heading, RECS_HEADING_MAX, base.heading || "Bestsellers"),
    description: sanitizeMultiline(
      src.description,
      RECS_DESC_MAX,
      base.description || "",
    ),
    products: products.slice(0, maxProducts),
    maxProducts,
    buttonText: sanitizeText(src.buttonText, RECS_BUTTON_MAX, base.buttonText || "+ Add"),
    backgroundColor: sanitizeHexColor(
      src.backgroundColor,
      base.backgroundColor || "#f7d6de",
    ),
  };
}
