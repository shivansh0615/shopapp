/**
 * Shopify Admin product search syntax for gift selection.
 * A typed word is a query, not a selected product.
 */

const MAX_TERM_LENGTH = 120;

/** Strip search operators so a merchant term cannot change the query shape. */
export function sanitizeGiftSearchTerm(raw: string): string {
  return String(raw || "")
    .replace(/["\\:*()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM_LENGTH);
}

/**
 * Active products whose title or SKU matches the term.
 * An empty term lists active products for browsing.
 */
export function buildGiftProductSearchQuery(raw: string): string {
  const term = sanitizeGiftSearchTerm(raw);
  if (!term) return "status:active";
  const quoted = `"${term}"`;
  return `status:active AND (title:${quoted} OR sku:${quoted})`;
}
