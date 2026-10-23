import type { CartLineSnapshot } from "../services/cart-rules.server";

/**
 * Proxy cart line snapshot. `price` is optional: missing/invalid prices must not
 * be coerced to 0 (that would falsely pass the qualifying-subtotal completeness gate).
 */
export type ProxyCartLineSnapshot = Omit<CartLineSnapshot, "price"> & {
  /** Explicit unit price in major currency units when the client provided one. */
  price?: number;
  /** Present only when the client included a properties object (even empty). */
  properties?: Record<string, string>;
  lineKey?: string;
};

function readLineProperties(
  value: unknown,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const properties: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (entry === null || entry === undefined) continue;
    properties[key] = String(entry);
  }
  return properties;
}

/** Parse an explicit non-negative price; return undefined when absent or invalid. */
function readExplicitPrice(record: Record<string, unknown>): number | undefined {
  if (!("price" in record) && !("unitPrice" in record) && !("unit_price" in record)) {
    return undefined;
  }
  const raw = record.price ?? record.unitPrice ?? record.unit_price;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const price = Number(raw);
  if (!Number.isFinite(price) || price < 0) return undefined;
  return price;
}

export function parseProxyCartLines(request: Request): ProxyCartLineSnapshot[] {
  const url = new URL(request.url);
  const raw = url.searchParams.get("cartLines");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((line): ProxyCartLineSnapshot | null => {
        if (!line || typeof line !== "object" || Array.isArray(line)) return null;
        const record = line as Record<string, unknown>;
        const variantId = String(record.variantId || record.variant_id || "").trim();
        if (!variantId) return null;
        const quantity = Number(record.quantity);
        const price = readExplicitPrice(record);
        const productId = record.productId ? String(record.productId) : undefined;
        const collectionIds = Array.isArray(record.collectionIds)
          ? record.collectionIds.map(String)
          : undefined;
        const lineKey = record.lineKey || record.key
          ? String(record.lineKey || record.key)
          : undefined;
        const properties =
          "properties" in record ? readLineProperties(record.properties) : undefined;
        return {
          variantId,
          productId,
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 1,
          ...(price !== undefined ? { price } : {}),
          collectionIds,
          lineKey,
          properties,
        };
      })
      .filter((line): line is ProxyCartLineSnapshot => line !== null);
  } catch {
    return [];
  }
}
