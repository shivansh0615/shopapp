import type { SelectedGiftProduct } from "./ProductPicker";

export type BuilderTierDraft = {
  /** Existing DB id when editing; omitted for new tiers. */
  id?: string;
  threshold: number;
  gift: SelectedGiftProduct | null;
};

export function emptyTierDraft(threshold = 50): BuilderTierDraft {
  return { threshold, gift: null };
}

export function tiersToFormJson(tiers: BuilderTierDraft[]): string {
  return JSON.stringify(
    tiers.map((tier, position) => ({
      id: tier.id || undefined,
      threshold: tier.threshold,
      giftProductId: tier.gift?.productId || "",
      giftProductTitle: tier.gift?.title || null,
      giftProductImage: tier.gift?.imageUrl || null,
      giftVariantId: tier.gift?.variantId || "",
      position,
    })),
  );
}
