import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { GraphqlQueryError, HttpResponseError } from "@shopify/shopify-api";
import type {
  ProductSearchImage,
  ProductSearchResponse,
  ProductSearchResult,
  ProductSearchVariantSummary,
} from "../lib/product-availability";
import {
  canSelectProductVariant,
  FALLBACK_PUBLICATION_CONTEXT,
  isSellableVariant,
  pickOnlineStorePublicationId,
  productUnavailableReason,
  sameShopifyGid,
  shouldWarnAboutPublicationVerification,
  type PublicationContext,
  validateGiftVariantForActivation,
  type GiftVariantValidationResult,
} from "./product-availability.server";
import { buildGiftProductSearchQuery } from "../lib/gift-product-search";
import type { CartRecommendationProduct } from "../lib/widget-settings";

export type ShopifyAdminClient = AdminApiContext;

export type ShopifyImage = ProductSearchImage;

export type ShopifyVariant = {
  id: string;
  title: string;
  price: string;
  compareAtPrice?: string | null;
  sku: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  sellableOnlineQuantity: number | null;
  inventoryTracked: boolean | null;
  image: ShopifyImage | null;
};

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  featuredImage: ShopifyImage | null;
  variants: ShopifyVariant[];
};

export type ShopifyProductVariantSummary = ProductSearchVariantSummary;

export type ShopifyProductSearchResult = ProductSearchResult;

export type ShopifyProductSearchResponse = ProductSearchResponse;

export type ShopifyGiftProduct = {
  id: string;
  title: string;
  handle: string;
  image: string | null;
  featuredImage: ShopifyImage | null;
  variants: ShopifyVariant[];
};

type GraphQLImageNode = {
  url: string;
  altText: string | null;
} | null;

type GraphQLVariantNode = {
  id: string;
  title: string;
  price: string;
  compareAtPrice?: string | null;
  sku: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  sellableOnlineQuantity?: number | null;
  inventoryItem?: { tracked?: boolean | null } | null;
  image: GraphQLImageNode;
};

type GraphQLProductNode = {
  id: string;
  title: string;
  handle: string;
  featuredImage: GraphQLImageNode;
  variants: {
    nodes: GraphQLVariantNode[];
  };
} | null;

type GetProductResponse = {
  data?: {
    product?: GraphQLProductNode;
  };
};

type SearchVariantNode = {
  id: string;
  title: string;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  sellableOnlineQuantity?: number | null;
  inventoryItem?: { tracked?: boolean | null } | null;
};

type SearchProductsResponse = {
  data?: {
    product?: SearchProductNode | null;
    products?: {
      nodes: Array<{
        id: string;
        title: string;
        status: string;
        publishedOnPublication?: boolean | null;
        onlineStoreUrl?: string | null;
        publishedAt?: string | null;
        featuredImage: GraphQLImageNode;
        variants: {
          nodes: SearchVariantNode[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>;
      pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
    };
  };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

const EMPTY_SEARCH_PAGE = { hasNextPage: false, endCursor: null as string | null };

type ShopCurrencyResponse = {
  data?: { shop?: { currencyCode?: string | null } };
};

type GetVariantResponse = {
  data?: {
    productVariant?: (GraphQLVariantNode & {
      product: {
        id: string;
        title: string;
        status: string;
        publishedOnPublication?: boolean | null;
        onlineStoreUrl?: string | null;
        publishedAt?: string | null;
      };
    }) | null;
  };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

type PublicationsResponse = {
  data?: {
    publications?: {
      nodes: Array<{
        id: string;
        catalog?: { title?: string | null } | null;
      }>;
      pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

const PUBLICATIONS_QUERY = `#graphql
  query FgpbPublications($after: String) {
    publications(first: 50, after: $after, catalogType: APP) {
      nodes {
        id
        catalog {
          title
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const SHOP_CURRENCY_QUERY = `#graphql
  query UpsellTrixShopCurrency {
    shop {
      currencyCode
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  query ShopifyAdminGetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      featuredImage {
        url
        altText
      }
      variants(first: 100) {
        nodes {
          id
          title
          price
          sku
          availableForSale
          inventoryQuantity
          inventoryPolicy
          sellableOnlineQuantity
          inventoryItem {
            tracked
          }
          image {
            url
            altText
          }
        }
      }
    }
  }
`;

const SEARCH_PRODUCT_FIELDS = `
        id
        title
        status
        onlineStoreUrl
        publishedAt
        featuredImage {
          url
          altText
        }
        variants(first: 20) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            availableForSale
            inventoryQuantity
            inventoryPolicy
            sellableOnlineQuantity
            inventoryItem {
              tracked
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
`;

const SEARCH_PRODUCTS_WITH_PUBLICATION_QUERY = `#graphql
  query ShopifyAdminSearchProducts(
    $query: String!
    $after: String
    $onlineStorePublicationId: ID!
  ) {
    products(first: 20, after: $after, query: $query) {
      nodes {
        ${SEARCH_PRODUCT_FIELDS}
        publishedOnPublication(publicationId: $onlineStorePublicationId)
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const SEARCH_PRODUCTS_FALLBACK_QUERY = `#graphql
  query ShopifyAdminSearchProductsFallback($query: String!, $after: String) {
    products(first: 20, after: $after, query: $query) {
      nodes {
        ${SEARCH_PRODUCT_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const VARIANT_WITH_PUBLICATION_QUERY = `#graphql
  query ShopifyAdminGetVariant(
    $id: ID!
    $onlineStorePublicationId: ID!
  ) {
    productVariant(id: $id) {
      id
      title
      price
      compareAtPrice
      sku
      availableForSale
      inventoryQuantity
      inventoryPolicy
      sellableOnlineQuantity
      inventoryItem {
        tracked
      }
      image {
        url
        altText
      }
      product {
        id
        title
        status
        onlineStoreUrl
        publishedAt
        publishedOnPublication(publicationId: $onlineStorePublicationId)
      }
    }
  }
`;

const VARIANT_FALLBACK_QUERY = `#graphql
  query ShopifyAdminGetVariantFallback($id: ID!) {
    productVariant(id: $id) {
      id
      title
      price
      compareAtPrice
      sku
      availableForSale
      inventoryQuantity
      inventoryPolicy
      sellableOnlineQuantity
      inventoryItem {
        tracked
      }
      image {
        url
        altText
      }
      product {
        id
        title
        status
        onlineStoreUrl
        publishedAt
      }
    }
  }
`;

export function toProductGid(productId: string): string {
  if (productId.startsWith("gid://shopify/Product/")) {
    return productId;
  }
  return `gid://shopify/Product/${productId}`;
}

export function toVariantGid(variantId: string): string {
  if (variantId.startsWith("gid://shopify/ProductVariant/")) {
    return variantId;
  }
  return `gid://shopify/ProductVariant/${variantId}`;
}

function mapImage(image: GraphQLImageNode): ShopifyImage | null {
  if (!image?.url) return null;
  return {
    url: image.url,
    altText: image.altText,
  };
}

function mapVariant(variant: GraphQLVariantNode): ShopifyVariant {
  return {
    id: variant.id,
    title: variant.title,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    sku: variant.sku,
    availableForSale: variant.availableForSale,
    inventoryQuantity: variant.inventoryQuantity,
    inventoryPolicy: variant.inventoryPolicy,
    sellableOnlineQuantity: variant.sellableOnlineQuantity ?? null,
    inventoryTracked: variant.inventoryItem?.tracked ?? null,
    image: mapImage(variant.image),
  };
}

function mapProduct(product: NonNullable<GraphQLProductNode>): ShopifyProduct {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    featuredImage: mapImage(product.featuredImage),
    variants: product.variants.nodes.map(mapVariant),
  };
}

function mapGiftProduct(product: ShopifyProduct): ShopifyGiftProduct {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    image: product.featuredImage?.url ?? null,
    featuredImage: product.featuredImage,
    variants: product.variants,
  };
}

function hasPublicationAccessError(errors: Array<{ message: string; extensions?: { code?: string } }> | undefined): boolean {
  if (!errors?.length) return false;
  return errors.some((error) => {
    const message = error.message.toLowerCase();
    const code = error.extensions?.code?.toUpperCase() ?? "";
    return (
      code === "ACCESS_DENIED" ||
      message.includes("access denied") ||
      message.includes("not authorized") ||
      message.includes("required access")
    );
  });
}

function logGraphQLErrors(scope: string, errors: Array<{ message: string; extensions?: { code?: string } }> | undefined): void {
  if (!errors?.length) return;
  for (const error of errors) {
    console.error(`[${scope}] GraphQL error:`, error.message, error.extensions ?? {});
  }
}

function hasPublicationLookupFailure(
  errors: Array<{ message: string; extensions?: { code?: string } }> | undefined,
): boolean {
  if (!errors?.length) return false;
  if (hasPublicationAccessError(errors)) return true;
  return errors.some((error) => {
    const message = error.message.toLowerCase();
    return message.includes("invalid value") || message.includes("field 'publications'");
  });
}

async function executeGraphQL<T>(
  admin: ShopifyAdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return (await response.json()) as T;
}

export async function getShopCurrencyCode(admin: ShopifyAdminClient): Promise<string> {
  const payload = await executeGraphQL<ShopCurrencyResponse>(admin, SHOP_CURRENCY_QUERY);
  const currency = payload.data?.shop?.currencyCode?.trim().toUpperCase();
  if (!currency) throw new Error("Could not verify shop currency. Please try again.");
  return currency;
}

let publicationContextCache = new Map<string, { context: PublicationContext; expiresAt: number }>();

export async function resolvePublicationContext(
  admin: ShopifyAdminClient,
  shop: string,
): Promise<PublicationContext> {
  const cached = publicationContextCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }

  try {
    let after: string | null = null;
    const cursors = new Set<string>();
    do {
      const payload: PublicationsResponse = await executeGraphQL<PublicationsResponse>(admin, PUBLICATIONS_QUERY, { after });
      if (hasPublicationLookupFailure(payload.errors) || payload.errors?.length) {
        logGraphQLErrors("resolvePublicationContext", payload.errors);
        return FALLBACK_PUBLICATION_CONTEXT;
      }
      const publicationId = pickOnlineStorePublicationId(payload.data?.publications?.nodes ?? []);
      if (publicationId) {
        const context = { onlineStorePublicationId: publicationId, canVerifyPublication: true };
        publicationContextCache.set(shop, { context, expiresAt: Date.now() + 5 * 60 * 1000 });
        return context;
      }
      const page: { hasNextPage: boolean; endCursor: string | null } | undefined = payload.data?.publications?.pageInfo;
      after = page?.hasNextPage ? page.endCursor : null;
      if (after && cursors.has(after)) return FALLBACK_PUBLICATION_CONTEXT;
      if (after) cursors.add(after);
    } while (after);
    return FALLBACK_PUBLICATION_CONTEXT;
  } catch (error) {
    console.error("[resolvePublicationContext] request failed:", error);
    return FALLBACK_PUBLICATION_CONTEXT;
  }
}

export function resetPublicationContextCacheForTests(): void {
  publicationContextCache = new Map();
}

type SearchProductNode = NonNullable<
  NonNullable<SearchProductsResponse["data"]>["products"]
>["nodes"][number];

function toInventoryFields(variant: SearchVariantNode) {
  return {
    availableForSale: variant.availableForSale,
    inventoryQuantity: variant.inventoryQuantity,
    inventoryPolicy: variant.inventoryPolicy,
    sellableOnlineQuantity: variant.sellableOnlineQuantity ?? null,
    inventoryTracked: variant.inventoryItem?.tracked ?? null,
  };
}

function mapSearchVariant(
  product: SearchProductNode,
  variant: SearchVariantNode,
  publicationContext: PublicationContext,
) {
  const inventory = toInventoryFields(variant);
  const selectable = canSelectProductVariant({
    status: product.status,
    variant: inventory,
    publishedOnPublication: product.publishedOnPublication,
    onlineStoreUrl: product.onlineStoreUrl,
    publishedAt: product.publishedAt,
    publicationContext,
  });
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku ?? null,
    price: variant.price ?? null,
    compareAtPrice: variant.compareAtPrice ?? null,
    selectable,
    unavailableReason: selectable ? null : productUnavailableReason({
      status: product.status,
      variants: [inventory],
      publishedOnPublication: product.publishedOnPublication,
      onlineStoreUrl: product.onlineStoreUrl,
      publishedAt: product.publishedAt,
      publicationContext,
    }) || "Availability could not be verified. Try again.",
  };
}

function mapSearchProductNode(
  product: SearchProductNode,
  publicationContext: PublicationContext,
): ShopifyProductSearchResult {
  const variants = product.variants?.nodes ?? [];
  const mappedVariants = variants.map((variant) =>
    mapSearchVariant(product, variant, publicationContext),
  );
  const firstVariantNode = mappedVariants.find((variant) => variant.selectable);
  const unavailableReason = firstVariantNode
    ? null
    : productUnavailableReason({
        status: product.status,
        variants: variants.map(toInventoryFields),
        publishedOnPublication: product.publishedOnPublication,
        onlineStoreUrl: product.onlineStoreUrl,
        publishedAt: product.publishedAt,
        publicationContext,
      }) || "Can't add — this product is out of stock.";

  return {
    id: product.id,
    title: product.title,
    featuredImage: mapImage(product.featuredImage),
    variants: mappedVariants,
    variantsTruncated: product.variants?.pageInfo?.hasNextPage === true,
    variantPageInfo: {
      hasNextPage: product.variants?.pageInfo?.hasNextPage === true,
      endCursor: product.variants?.pageInfo?.endCursor ?? null,
    },
    firstVariant: firstVariantNode
      ? {
          id: firstVariantNode.id,
          title: firstVariantNode.title,
          price: firstVariantNode.price ?? null,
          compareAtPrice: firstVariantNode.compareAtPrice ?? null,
          sku: firstVariantNode.sku ?? null,
          selectable: true,
        }
      : null,
    available: Boolean(firstVariantNode),
    unavailableReason,
  };
}

/** Drop recommendation products whose variants are not sellable right now. */
export async function filterSellableRecommendationProducts(
  admin: ShopifyAdminClient,
  products: CartRecommendationProduct[],
): Promise<CartRecommendationProduct[]> {
  if (!products.length) return [];
  const checks = await Promise.all(
    products.map(async (product) => {
      try {
        const variant = await getVariant(admin, product.variantId);
        if (!variant || !isSellableVariant(variant)) return null;
        return { ...product, price: variant.price, compareAtPrice: variant.compareAtPrice ?? null };
      } catch {
        return null;
      }
    }),
  );
  return checks.filter((product): product is NonNullable<typeof product> => product !== null);
}

/** Mark saved recommendation rows that are currently out of stock. */
export async function annotateRecommendationAvailability<T extends CartRecommendationProduct>(
  admin: ShopifyAdminClient,
  products: T[],
): Promise<Array<T & { outOfStock: boolean }>> {
  if (!products.length) return [];
  return Promise.all(
    products.map(async (product) => {
      try {
        const variant = await getVariant(admin, product.variantId);
        return {
          ...product,
          outOfStock: !variant || !isSellableVariant(variant),
        };
      } catch {
        return { ...product, outOfStock: true };
      }
    }),
  );
}

export async function getProduct(
  admin: ShopifyAdminClient,
  productId: string,
): Promise<ShopifyProduct | null> {
  const payload = await executeGraphQL<GetProductResponse>(admin, PRODUCT_QUERY, {
    id: toProductGid(productId),
  });

  const product = payload.data?.product;
  if (!product) return null;

  return mapProduct(product);
}

function isProductReadDenied(
  errors: Array<{ message: string; extensions?: { code?: string } }> | undefined,
): boolean {
  if (!errors?.length) return false;
  return errors.some((error) => {
    const message = error.message.toLowerCase();
    const code = error.extensions?.code?.toUpperCase() ?? "";
    return (
      code === "ACCESS_DENIED" ||
      message.includes("read_products") ||
      message.includes("access denied")
    );
  });
}

function failedProductSearch(
  status: "permission_required" | "load_failed",
  message: string,
): ShopifyProductSearchResponse {
  return {
    products: [],
    publicationWarning: false,
    status,
    message,
    pageInfo: EMPTY_SEARCH_PAGE,
  };
}

async function executeProductSearchGraphQL(
  admin: ShopifyAdminClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<SearchProductsResponse> {
  try {
    const response = await admin.graphql(query, { variables });
    if (!response.ok) {
      throw Object.assign(new Error("Shopify product search request failed."), {
        status: response.status,
      });
    }
    return (await response.json()) as SearchProductsResponse;
  } catch (error) {
    // The Shopify SDK throws GraphQL errors rather than returning their JSON.
    if (error instanceof GraphqlQueryError) {
      const errors = error.body?.errors?.graphQLErrors;
      if (Array.isArray(errors)) return { errors };
    }
    if (error instanceof HttpResponseError) {
      throw Object.assign(new Error("Shopify product search request failed."), {
        status: error.response.code,
      });
    }
    throw error;
  }
}

export async function searchProducts(
  admin: ShopifyAdminClient,
  shop: string,
  query: string,
  options?: { after?: string | null; browse?: boolean },
): Promise<ShopifyProductSearchResponse> {
  const trimmedQuery = query.trim();
  const browse = options?.browse === true;
  if (!browse && trimmedQuery.length < 2) {
    return {
      products: [],
      publicationWarning: false,
      status: "ok",
      message: null,
      pageInfo: EMPTY_SEARCH_PAGE,
    };
  }

  const shopifyQuery = buildGiftProductSearchQuery(trimmedQuery);
  const after = options?.after?.trim() || null;

  try {
    const publicationContext = await resolvePublicationContext(admin, shop);
    let publicationWarning = shouldWarnAboutPublicationVerification(publicationContext);
    let activeContext = publicationContext;

    let payload: SearchProductsResponse;
    if (publicationContext.canVerifyPublication && publicationContext.onlineStorePublicationId) {
      payload = await executeProductSearchGraphQL(admin, SEARCH_PRODUCTS_WITH_PUBLICATION_QUERY, {
        query: shopifyQuery,
        after,
        onlineStorePublicationId: publicationContext.onlineStorePublicationId,
      });

      if (payload.errors?.length) {
        logGraphQLErrors("searchProducts", payload.errors);
        publicationWarning = true;
        activeContext = FALLBACK_PUBLICATION_CONTEXT;
        payload = await executeProductSearchGraphQL(admin, SEARCH_PRODUCTS_FALLBACK_QUERY, {
          query: shopifyQuery,
          after,
        });
      }
    } else {
      publicationWarning = true;
      activeContext = FALLBACK_PUBLICATION_CONTEXT;
      payload = await executeProductSearchGraphQL(admin, SEARCH_PRODUCTS_FALLBACK_QUERY, {
        query: shopifyQuery,
        after,
      });
    }

    if (payload.errors?.length) {
      logGraphQLErrors("searchProducts", payload.errors);
      if (isProductReadDenied(payload.errors)) {
        return failedProductSearch(
          "permission_required",
          "Product access is required. Reopen UpsellTrix and approve product access, then try again.",
        );
      }
      return failedProductSearch("load_failed", "Could not load products. Try again.");
    }

    const nodes = payload?.data?.products?.nodes;
    if (!Array.isArray(nodes)) {
      return failedProductSearch("load_failed", "Could not load products. Try again.");
    }
    const pageInfo = payload.data?.products?.pageInfo;

    return {
      products: nodes.map((product) => mapSearchProductNode(product, activeContext)),
      publicationWarning: publicationWarning && nodes.some(product => (product.publishedAt === undefined && product.onlineStoreUrl === undefined)),
      status: "ok",
      message: null,
      pageInfo: {
        hasNextPage: pageInfo?.hasNextPage === true,
        endCursor: pageInfo?.endCursor ?? null,
      },
    };
  } catch (error) {
    console.error("[searchProducts] request failed:", error);
    if (typeof error === "object" && error !== null && "status" in error && error.status === 403) {
      return failedProductSearch(
        "permission_required",
        "Product access is required. Reopen UpsellTrix and approve product access, then try again.",
      );
    }
    return failedProductSearch("load_failed", "Could not load products. Try again.");
  }
}

/** Retrieve variants for one chosen product without multiplying catalog query cost. */
export async function getGiftVariantPage(
  admin: ShopifyAdminClient,
  shop: string,
  productId: string,
  after: string | null = null,
): Promise<ShopifyProductSearchResponse> {
  try {
    const context = await resolvePublicationContext(admin, shop);
    const publicationField = context.canVerifyPublication
      ? "publishedOnPublication(publicationId: $publicationId)" : "";
    const publicationVariable = context.canVerifyPublication ? ", $publicationId: ID!" : "";
    const query = `query GiftProductVariants($id: ID!, $after: String${publicationVariable}) {
      product(id: $id) {
        ${SEARCH_PRODUCT_FIELDS.replace("variants(first: 20)", "variants(first: 100, after: $after)")}
        ${publicationField}
      }
    }`;
    const payload = await executeProductSearchGraphQL(admin, query, {
      id: toProductGid(productId), after,
      ...(context.canVerifyPublication ? { publicationId: context.onlineStorePublicationId } : {}),
    });
    if (payload.errors?.length) {
      return failedProductSearch(isProductReadDenied(payload.errors) ? "permission_required" : "load_failed",
        "Could not load gift variants. Check product access and try again.");
    }
    if (!payload.data?.product || !Array.isArray(payload.data.product.variants?.nodes)) {
      return failedProductSearch("load_failed", "This gift product is unavailable. Choose another product.");
    }
    const product = mapSearchProductNode(payload.data.product, context);
    return {
      products: [product], status: "ok", message: null,
      publicationWarning: shouldWarnAboutPublicationVerification(context) && payload.data.product.publishedAt === undefined && payload.data.product.onlineStoreUrl === undefined,
      pageInfo: product.variantPageInfo ?? EMPTY_SEARCH_PAGE,
    };
  } catch (error) {
    const denied = typeof error === "object" && error !== null && "status" in error && error.status === 403;
    return failedProductSearch(denied ? "permission_required" : "load_failed",
      "Could not load gift variants. Check product access and try again.");
  }
}

export async function getVariant(
  admin: ShopifyAdminClient,
  variantId: string,
): Promise<ShopifyVariant | null> {
  const payload = await executeGraphQL<GetVariantResponse>(admin, VARIANT_FALLBACK_QUERY, {
    id: toVariantGid(variantId),
  });

  const variant = payload.data?.productVariant;
  if (!variant) return null;

  return mapVariant(variant);
}

export type { GiftVariantValidationResult };

export async function validateGiftVariantForOnlineStore(
  admin: ShopifyAdminClient,
  shop: string,
  variantId: string,
  check: { expectedProductId?: string; requireSellable?: boolean } = {},
): Promise<GiftVariantValidationResult> {
  const requireSellable = check.requireSellable !== false;
  const publicationContext = await resolvePublicationContext(admin, shop);

  try {
    const payload = publicationContext.canVerifyPublication
      ? await executeGraphQL<GetVariantResponse>(admin, VARIANT_WITH_PUBLICATION_QUERY, {
          id: toVariantGid(variantId),
          onlineStorePublicationId: publicationContext.onlineStorePublicationId,
        })
      : await executeGraphQL<GetVariantResponse>(admin, VARIANT_FALLBACK_QUERY, {
          id: toVariantGid(variantId),
        });

    if (payload.errors?.length) {
      logGraphQLErrors("validateGiftVariantForOnlineStore", payload.errors);
    }

    const variant = payload.data?.productVariant;
    if (!variant) {
      return {
        valid: false,
        reason: "The selected gift variant no longer exists. Choose another gift.",
      };
    }

    if (
      check.expectedProductId &&
      !sameShopifyGid(variant.product.id, check.expectedProductId, "Product")
    ) {
      return {
        valid: false,
        reason: "That variant does not belong to the selected gift product. Choose the variant again.",
      };
    }

    if (!requireSellable) return { valid: true };

    return validateGiftVariantForActivation({
      productStatus: variant.product.status,
      variant,
      publishedOnPublication: variant.product.publishedOnPublication,
      onlineStoreUrl: variant.product.onlineStoreUrl,
      publishedAt: variant.product.publishedAt,
      publicationContext,
    });
  } catch (error) {
    console.error("[validateGiftVariantForOnlineStore] request failed:", error);
    return {
      valid: false,
      reason: "Could not verify the selected gift variant with Shopify. Try again.",
    };
  }
}

export async function getProductImage(
  admin: ShopifyAdminClient,
  productId: string,
): Promise<ShopifyImage | null> {
  const product = await getProduct(admin, productId);
  return product?.featuredImage ?? null;
}

export async function getGiftProduct(
  admin: ShopifyAdminClient,
  productId: string,
): Promise<ShopifyGiftProduct | null> {
  const product = await getProduct(admin, productId);
  if (!product) return null;

  return mapGiftProduct(product);
}
