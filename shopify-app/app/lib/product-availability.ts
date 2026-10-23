export const PUBLICATION_FALLBACK_WARNING =
  "Verify Online Store publishing before activation.";

export type ProductSearchImage = {
  url: string;
  altText: string | null;
};

export type ProductSearchVariantSummary = {
  id: string;
  title: string;
  price?: string | null;
  compareAtPrice?: string | null;
  sku?: string | null;
  selectable?: boolean;
  /** Server-verified reason why this specific variant cannot be selected. */
  unavailableReason?: string | null;
};

export type ProductSearchPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ProductSearchResult = {
  id: string;
  title: string;
  featuredImage: ProductSearchImage | null;
  firstVariant: ProductSearchVariantSummary | null;
  variants?: ProductSearchVariantSummary[];
  /** True when Shopify has more variants than this response includes. */
  variantsTruncated?: boolean;
  variantPageInfo?: ProductSearchPageInfo;
  /** False when no sellable Online Store variant (e.g. out of stock). */
  available?: boolean;
  /** Human-readable reason when available is false. */
  unavailableReason?: string | null;
};

export type ProductSearchStatus = "ok" | "permission_required" | "load_failed";

export type ProductSearchResponse = {
  products: ProductSearchResult[];
  publicationWarning: boolean;
  status?: ProductSearchStatus;
  message?: string | null;
  pageInfo?: ProductSearchPageInfo;
};
