import type { Campaign } from "@prisma/client";

export type CartLineSnapshot = {
  variantId: string;
  productId?: string;
  quantity: number;
  price: number;
  collectionIds?: string[];
};

export const RULE_TYPES = {
  SPEND_THRESHOLD: "SPEND_THRESHOLD",
  BUY_X_GET_Y: "BUY_X_GET_Y",
  PRODUCT_SPEND: "PRODUCT_SPEND",
  COLLECTION_SPEND: "COLLECTION_SPEND",
} as const;

export type RuleType = (typeof RULE_TYPES)[keyof typeof RULE_TYPES];

export function parseIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

export function normalizeVariantId(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.includes("/") ? raw.split("/").pop() || raw : raw;
}

export function countMatchingLines(
  lines: CartLineSnapshot[],
  variantIds: string[],
): number {
  const targets = new Set(variantIds.map(normalizeVariantId));
  if (!targets.size) return 0;
  return lines.reduce((total, line) => {
    const id = normalizeVariantId(line.variantId);
    return targets.has(id) ? total + Math.max(0, line.quantity) : total;
  }, 0);
}

export function sumMatchingLineSubtotal(
  lines: CartLineSnapshot[],
  variantIds: string[],
): number {
  const targets = new Set(variantIds.map(normalizeVariantId));
  if (!targets.size) return 0;
  return lines.reduce((total, line) => {
    const id = normalizeVariantId(line.variantId);
    if (!targets.has(id)) return total;
    return total + Math.max(0, line.quantity) * Math.max(0, line.price);
  }, 0);
}

export function sumCollectionSubtotal(
  lines: CartLineSnapshot[],
  collectionIds: string[],
): number {
  const targets = new Set(collectionIds.map(String));
  if (!targets.size) return 0;
  return lines.reduce((total, line) => {
    const lineCollections = line.collectionIds || [];
    const matches = lineCollections.some((id) => targets.has(String(id)));
    return matches ? total + Math.max(0, line.quantity) * Math.max(0, line.price) : total;
  }, 0);
}

export function evaluateRuleProgress(input: {
  campaign: Pick<
    Campaign,
    "ruleType" | "threshold" | "triggerQuantity" | "triggerProductIds" | "triggerCollectionIds"
  >;
  cartSubtotal: number;
  cartLines?: CartLineSnapshot[];
}): { progress: number; remaining: number; eligible: boolean; metric: number } {
  const threshold = Math.max(0, input.campaign.threshold);
  const triggerQty = Math.max(1, input.campaign.triggerQuantity || 1);
  const lines = input.cartLines || [];
  const productIds = parseIdList(input.campaign.triggerProductIds);
  const collectionIds = parseIdList(input.campaign.triggerCollectionIds);

  let metric = Math.max(0, input.cartSubtotal);

  switch (input.campaign.ruleType) {
    case RULE_TYPES.BUY_X_GET_Y:
      metric = countMatchingLines(lines, productIds);
      break;
    case RULE_TYPES.PRODUCT_SPEND:
      metric = sumMatchingLineSubtotal(lines, productIds);
      break;
    case RULE_TYPES.COLLECTION_SPEND:
      metric = sumCollectionSubtotal(lines, collectionIds);
      break;
    case RULE_TYPES.SPEND_THRESHOLD:
    default:
      metric = Math.max(0, input.cartSubtotal);
      break;
  }

  const target = input.campaign.ruleType === RULE_TYPES.BUY_X_GET_Y ? triggerQty : threshold;
  if (target <= 0) {
    return { progress: 0, remaining: 0, eligible: false, metric };
  }

  const remaining = Math.max(target - metric, 0);
  const progress = Math.max(0, Math.min(100, (metric / target) * 100));
  const eligible = metric >= target;
  return { progress, remaining, eligible, metric };
}
