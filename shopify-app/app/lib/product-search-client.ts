import type { ProductSearchResponse, ProductSearchResult } from "./product-availability";

export type ProductSearchClientResult = {
  products: ProductSearchResult[];
  publicationWarning: boolean;
  status: "ok" | "permission_required" | "load_failed";
  message: string | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type ResourcePickerVariant = { id?: string; title?: string | null };
type ResourcePickerProduct = {
  id?: string;
  title?: string;
  images?: Array<{ originalSrc?: string; url?: string } | null> | null;
  variants?: Array<ResourcePickerVariant | null> | null;
};

type ShopifyAdminGlobal = {
  resourcePicker?: (options: {
    type: "product";
    action: "select";
    multiple: false;
    filter: { variants: boolean; draft: boolean; archived: boolean };
  }) => Promise<ResourcePickerProduct[] | undefined>;
};

export type PickedGiftChoice = {
  productId: string;
  title: string;
  imageUrl: string | null;
  variants: Array<{ id: string; title: string }>;
};

function emptyPage(): ProductSearchClientResult["pageInfo"] {
  return { hasNextPage: false, endCursor: null };
}

export async function fetchProductSearch(input: {
  productId?: string;
  q?: string;
  browse?: boolean;
  after?: string | null;
  signal?: AbortSignal;
}): Promise<ProductSearchClientResult> {
  const params = new URLSearchParams();
  if (input.productId) params.set("productId", input.productId);
  if (input.browse) params.set("browse", "1");
  if (input.q) params.set("q", input.q);
  if (input.after) params.set("after", input.after);

  let response: Response;
  try {
    response = await fetch(`/app/api/products/search?${params.toString()}`, {
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return {
      products: [],
      publicationWarning: false,
      status: "load_failed",
      message: "Could not load products. Try again.",
      pageInfo: emptyPage(),
    };
  }

  const raw: unknown = await response.json().catch(() => null);
  const data = (raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Partial<ProductSearchResponse> & {
    status?: string;
    message?: string | null;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
  };

  const pageInfo = {
    hasNextPage: data.pageInfo?.hasNextPage === true,
    endCursor: data.pageInfo?.endCursor ?? null,
  };

  if (response.status === 403 || data.status === "permission_required") {
    return {
      products: [],
      publicationWarning: false,
      status: "permission_required",
      message:
        data.message ||
        "Product access is required. Reopen UpsellTrix and approve product access, then try again.",
      pageInfo,
    };
  }

  if (
    !response.ok ||
    (data.status !== undefined && data.status !== "ok") ||
    !Array.isArray(data.products)
  ) {
    return {
      products: [],
      publicationWarning: false,
      status: "load_failed",
      message: data.message || "Could not load products. Try again.",
      pageInfo,
    };
  }

  return {
    products: data.products ?? [],
    publicationWarning: data.publicationWarning === true,
    status: "ok",
    message: null,
    pageInfo,
  };
}

function adminGlobal(): ShopifyAdminGlobal | null {
  if (typeof window === "undefined") return null;
  const shopify = (window as Window & { shopify?: ShopifyAdminGlobal }).shopify;
  return shopify?.resourcePicker ? shopify : null;
}

/**
 * Shopify's resource picker. Cancellation leaves the previous gift untouched.
 * Returns null when App Bridge is not available so the caller can browse instead.
 */
export async function pickGiftWithResourcePicker(): Promise<
  { status: "cancelled" } | { status: "unavailable" } | { status: "selected"; gift: PickedGiftChoice }
> {
  const shopify = adminGlobal();
  if (!shopify?.resourcePicker) return { status: "unavailable" };

  let selection: ResourcePickerProduct[] | undefined;
  try {
    selection = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
      filter: { variants: true, draft: false, archived: false },
    });
  } catch {
    return { status: "unavailable" };
  }

  if (selection === undefined) return { status: "cancelled" };
  const product = selection[0];
  if (!product?.id || !product.title) return { status: "cancelled" };

  const image = product.images?.find((item) => item?.originalSrc || item?.url) ?? null;
  const variants = (product.variants ?? [])
    .filter((variant): variant is ResourcePickerVariant => Boolean(variant?.id))
    .map((variant) => ({
      id: String(variant.id),
      title: String(variant.title || "Default Title"),
    }));

  return {
    status: "selected",
    gift: {
      productId: product.id,
      title: product.title,
      imageUrl: image?.originalSrc || image?.url || null,
      variants,
    },
  };
}
