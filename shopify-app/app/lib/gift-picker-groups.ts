import type { ProductSearchResult, ProductSearchVariantSummary } from "./product-availability";

/** Explicit server verification is required; unknown availability is never addable. */
export function giftVariants(product: ProductSearchResult): ProductSearchVariantSummary[] {
  if (product.variants?.length) return product.variants;
  return product.firstVariant ? [product.firstVariant] : [];
}

export function groupGiftVariants(variants: ProductSearchVariantSummary[]) {
  return {
    available: variants.filter(variant => variant.selectable === true),
    unavailable: variants.filter(variant => variant.selectable !== true),
  };
}

export function groupGiftProducts(products: ProductSearchResult[]) {
  const available: ProductSearchResult[] = [];
  const unavailable: ProductSearchResult[] = [];
  const unchecked: ProductSearchResult[] = [];
  for (const product of products) {
    if (giftVariants(product).some(variant => variant.selectable === true)) available.push(product);
    else if (product.variantsTruncated) unchecked.push(product);
    else unavailable.push(product);
  }
  return { available, unavailable, unchecked };
}

export function mergeGiftVariants(previous: ProductSearchVariantSummary[], next: ProductSearchVariantSummary[]) {
  return [...new Map([...previous, ...next].map(variant => [variant.id, variant])).values()];
}
