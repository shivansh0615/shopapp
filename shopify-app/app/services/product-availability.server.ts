export type PublicationContext = {
  onlineStorePublicationId: string | null;
  canVerifyPublication: boolean;
};

export const FALLBACK_PUBLICATION_CONTEXT: PublicationContext = {
  onlineStorePublicationId: null,
  canVerifyPublication: false,
};

export type VariantInventoryFields = {
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  /** Units the Online Store can sell. Warehouse stock is not enough. */
  sellableOnlineQuantity?: number | null;
  /** False when Shopify does not track this variant's inventory. */
  inventoryTracked?: boolean | null;
};

export type GiftVariantValidationResult =
  | { valid: true; warning?: string }
  | { valid: false; reason: string };

export function isSellableVariant(variant: VariantInventoryFields): boolean {
  if (!variant.availableForSale) return false;
  // A gift must have units the Online Store can sell. Continue-selling and
  // untracked inventory do not count as stock.
  const online = variant.sellableOnlineQuantity;
  if (typeof online === "number") return online > 0;
  return (variant.inventoryQuantity ?? 0) > 0;
}

/** Why a catalog product cannot be selected for gift / bestsellers. */
export function productUnavailableReason(input: {
  status: string;
  variants: VariantInventoryFields[];
  publishedOnPublication?: boolean | null;
  onlineStoreUrl?: string | null;
  publishedAt?: string | null;
  publicationContext: PublicationContext;
}): string | null {
  if (!isActiveProduct(input.status)) {
    return "This product is not active.";
  }
  if (!input.variants.length) {
    return "This product has no variants.";
  }
  const hasSellable = input.variants.some((variant) => isSellableVariant(variant));
  if (!hasSellable) {
    return "Can't add — this product is out of stock.";
  }
  if (!isPublishedOnOnlineStore(input.publishedOnPublication, input.publicationContext, input.onlineStoreUrl, input.publishedAt)) {
    return "This product is not published to the Online Store.";
  }
  return null;
}

export function isActiveProduct(status: string): boolean {
  return status === "ACTIVE";
}

export function isPublishedOnOnlineStore(
  publishedOnPublication: boolean | null | undefined,
  context: PublicationContext,
  onlineStoreUrl?: string | null,
  publishedAt?: string | null,
): boolean {
  if (!context.canVerifyPublication || !context.onlineStorePublicationId) {
    // Password-protected stores return onlineStoreUrl:null even for published
    // products. publishedAt describes Online Store publication independently.
    if (publishedAt !== undefined) {
      const timestamp = typeof publishedAt === "string" ? Date.parse(publishedAt) : NaN;
      return Number.isFinite(timestamp) && timestamp <= Date.now();
    }
    if (typeof onlineStoreUrl === "string") return onlineStoreUrl.trim().length > 0;
    return false;
  }
  return publishedOnPublication === true;
}

export function canSelectProductVariant(input: {
  status: string;
  variant: VariantInventoryFields;
  publishedOnPublication?: boolean | null;
  onlineStoreUrl?: string | null;
  publishedAt?: string | null;
  publicationContext: PublicationContext;
}): boolean {
  if (!isActiveProduct(input.status)) return false;
  if (!isSellableVariant(input.variant)) return false;
  return isPublishedOnOnlineStore(input.publishedOnPublication, input.publicationContext, input.onlineStoreUrl, input.publishedAt);
}

export function validateGiftVariantForActivation(input: {
  productStatus: string;
  variant: VariantInventoryFields;
  publishedOnPublication?: boolean | null;
  onlineStoreUrl?: string | null;
  publishedAt?: string | null;
  publicationContext: PublicationContext;
}): GiftVariantValidationResult {
  if (!isActiveProduct(input.productStatus)) {
    return { valid: false, reason: "The selected gift product must be active." };
  }

  if (!isSellableVariant(input.variant)) {
    return {
      valid: false,
      reason: "The selected gift must be in stock on the Online Store.",
    };
  }

  if (
    input.publicationContext.canVerifyPublication &&
    input.publicationContext.onlineStorePublicationId &&
    input.publishedOnPublication !== true
  ) {
    return {
      valid: false,
      reason: "The selected gift product must be published to the Online Store.",
    };
  }

  if (!input.publicationContext.canVerifyPublication || !input.publicationContext.onlineStorePublicationId) {
    if (!isPublishedOnOnlineStore(input.publishedOnPublication, input.publicationContext, input.onlineStoreUrl, input.publishedAt)) {
      const unknown = input.publishedAt === undefined && input.onlineStoreUrl === undefined;
      return { valid: false, reason: unknown
        ? "Could not verify Online Store publishing. Retry before activating this campaign."
        : "The selected gift product must be published to the Online Store." };
    }
  }

  return { valid: true };
}

export function shouldWarnAboutPublicationVerification(
  context: PublicationContext,
): boolean {
  return !context.canVerifyPublication;
}

/** Compare a stored id with a Shopify global id for the same resource. */
export function sameShopifyGid(
  left: string,
  right: string,
  resource: "Product" | "ProductVariant",
): boolean {
  const normalize = (value: string) => {
    const trimmed = String(value || "").trim();
    const prefix = `gid://shopify/${resource}/`;
    if (trimmed.startsWith(prefix)) return trimmed;
    if (/^\d+$/.test(trimmed)) return `${prefix}${trimmed}`;
    return trimmed;
  };
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a) && a === b;
}

export function pickOnlineStorePublicationId(
  nodes: Array<{ id: string; catalog?: { title?: string | null } | null }>,
): string | null {
  const match = nodes.find(
    (node) => node.catalog?.title?.trim().toLowerCase() === "online store",
  );
  return match?.id ?? null;
}
