export const FGPB_FREE_GIFT_PROPERTY = "_fgpb_free_gift";
export const FGPB_CAMPAIGN_ID_PROPERTY = "_fgpb_campaign_id";
/** Distinguishes multiple tier gifts within one campaign. */
export const FGPB_TIER_ID_PROPERTY = "_fgpb_tier_id";

export type CartLineProperties = Record<string, string>;

export type TaggedGiftCartItem = {
  productId: string;
  variantId: string;
  title: string;
  quantity: number;
  price: number;
  lineKey: string;
  properties: Record<string, string> | null;
  isFreeGift: boolean;
};

export type TaggedGiftCart = {
  subtotal: number;
  currency: string;
  items: TaggedGiftCartItem[];
};

export function readLineProperties(
  properties: unknown,
): CartLineProperties | null {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return null;
  }

  const record = properties as Record<string, unknown>;
  const normalized: CartLineProperties = {};

  Object.keys(record).forEach((key) => {
    const value = record[key];
    if (value === null || value === undefined) return;
    normalized[key] = String(value);
  });

  return Object.keys(normalized).length > 0 ? normalized : null;
}

/** Tagged free-gift lines are identified ONLY by line item property. */
export function isTaggedFreeGiftLine(
  properties: CartLineProperties | null | undefined,
): boolean {
  return properties?.[FGPB_FREE_GIFT_PROPERTY] === "true";
}

export function isCampaignTaggedGiftLine(
  item: Pick<TaggedGiftCartItem, "isFreeGift" | "properties">,
  campaignId: number | string | null | undefined,
): boolean {
  if (!isTaggedFreeGiftLine(item.properties)) return false;
  if (campaignId === null || campaignId === undefined || campaignId === "") return true;

  const lineCampaignId = item.properties?.[FGPB_CAMPAIGN_ID_PROPERTY];
  if (!lineCampaignId) return true;

  return String(lineCampaignId) === String(campaignId);
}

export function findTaggedGiftLines(
  cart: TaggedGiftCart,
  campaignId?: number | string | null,
): TaggedGiftCartItem[] {
  return cart.items.filter((item) => isCampaignTaggedGiftLine(item, campaignId));
}

export function findTaggedGiftLine(
  cart: TaggedGiftCart,
  campaignId?: number | string | null,
): TaggedGiftCartItem | null {
  return findTaggedGiftLines(cart, campaignId)[0] ?? null;
}

/** Eligible subtotal includes manually purchased lines, even when they share the gift variant. */
export function calculateEligibleSubtotal(cart: TaggedGiftCart): number {
  return cart.items.reduce((total, item) => {
    if (isTaggedFreeGiftLine(item.properties)) {
      return total;
    }

    const quantity = Math.max(0, item.quantity);
    const price = Math.max(0, item.price);
    return total + quantity * price;
  }, 0);
}

export function calculatePaidSubtotal(cart: TaggedGiftCart): number {
  return calculateEligibleSubtotal(cart);
}

export type CartGiftAction = "ADD_GIFT" | "REMOVE_GIFT" | "NONE";

export function buildTaggedGiftCartAction(input: {
  cart: TaggedGiftCart;
  threshold: number;
  campaignId?: number | string | null;
}): CartGiftAction {
  const threshold = Math.max(0, input.threshold);
  const eligibleSubtotal = calculateEligibleSubtotal(input.cart);
  const taggedGiftLine = findTaggedGiftLine(input.cart, input.campaignId);
  const meetsThreshold = threshold > 0 && eligibleSubtotal >= threshold;

  if (meetsThreshold && !taggedGiftLine) {
    return "ADD_GIFT";
  }

  if (!meetsThreshold && taggedGiftLine) {
    return "REMOVE_GIFT";
  }

  return "NONE";
}

export function buildAutoAddGiftProperties(
  campaignId: number | string,
): CartLineProperties {
  return {
    [FGPB_FREE_GIFT_PROPERTY]: "true",
    [FGPB_CAMPAIGN_ID_PROPERTY]: String(campaignId),
  };
}

export function needsTaggedGiftQuantityEnforcement(
  cart: TaggedGiftCart,
  campaignId?: number | string | null,
): boolean {
  const taggedLines = findTaggedGiftLines(cart, campaignId);
  if (!taggedLines.length) return false;

  if (taggedLines.length > 1) return true;

  return taggedLines[0].quantity > 1;
}
