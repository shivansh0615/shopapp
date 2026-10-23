import type { WidgetSettings } from "./widget-settings";
import type { WidgetColors } from "../services/widget-presentation.server";

export type StorefrontWidgetGift = {
  productId: string;
  variantId: string | null;
  title: string;
  image: string | null;
  quantity: number;
};

export type StorefrontWidgetStateResponse = {
  enabled: boolean;
  campaignId: number | null;
  placements?: string[];
  threshold: number | null;
  heading: string | null;
  description: string | null;
  progress: number | null;
  remaining: number | null;
  eligible: boolean;
  /** Paid eligible subtotal for tiered milestone fill. */
  cartSubtotal?: number;
  /** Additive — Free Gift clients ignore; storefront gates gift sync on this. */
  rewardType?: string | null;
  gift: StorefrontWidgetGift | null;
  /** Additive — Tiered Free Gifts unlocked lines. */
  unlockedGifts?: Array<{
    tierId: string;
    threshold: number;
    productId?: string;
    variantId: string;
    quantity: 1;
  }>;
  /** Additive — next locked tier for progress. */
  nextTier?: {
    tierId: string;
    threshold: number;
    remaining: number;
    productId?: string;
    variantId: string;
  } | null;
  /** All tiers for multi-milestone cart drawer UI. */
  rewardTiers?: Array<{
    tierId: string;
    threshold: number;
    position: number;
    productId?: string;
    variantId?: string;
  }>;
  /** Null only on the disabled / error proxy payload path. */
  colors: WidgetColors | null;
  /** Null only on the disabled / error proxy payload path. */
  widgetSettings: WidgetSettings | null;
  /** Null only on the disabled / error proxy payload path. */
  template: string | null;
  autoAddGift: boolean;
  /** Cart/presentment currency used for every monetary field in this response. */
  currency?: string;
};

