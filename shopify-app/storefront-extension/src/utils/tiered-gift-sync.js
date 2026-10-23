/**
 * Tiered Free Gifts sync helpers (testable). Production storefront uses the
 * standalone IIFE at extensions/.../assets/tiered-gift-sync.js.
 */
import { CAMPAIGN_KEY, FREE_GIFT_KEY, TIER_KEY, ajaxVariantId } from "./util.js";

export function buildTierGiftProperties(campaignId, tierId) {
  const p = { [FREE_GIFT_KEY]: "true" };
  if (campaignId != null) p[CAMPAIGN_KEY] = String(campaignId);
  if (tierId != null) p[TIER_KEY] = String(tierId);
  return p;
}

export function isTaggedGift(props) {
  return !!(props && props[FREE_GIFT_KEY] === "true");
}

/**
 * Pure planner: decide add/remove/normalize for unlocked tier gifts.
 * Only mutates tagged lines; paid same-SKU lines are ignored.
 */
export function planTieredGiftSync({ cart, unlockedGifts, campaignId, autoAddGift = true }) {
  const unlocked = Array.isArray(unlockedGifts) ? unlockedGifts : [];
  const unlockedByTier = new Map(unlocked.map((g) => [String(g.tierId), g]));
  const items = cart?.items || [];
  const giftLines = items.filter((item) => {
    if (!isTaggedGift(item.properties)) return false;
    return true;
  });

  const actions = [];
  const linesByTier = new Map();

  for (const line of giftLines) {
    const tierId = String(line.properties?.[TIER_KEY] || "").trim();
    const lineCid = String(line.properties?.[CAMPAIGN_KEY] ?? "").trim();
    const expected = unlockedByTier.get(tierId);
    const lineVariant = ajaxVariantId(line.variantId ?? line.variant_id ?? line.id);
    if (lineCid !== String(campaignId ?? "").trim() || !expected ||
        !lineVariant || lineVariant !== ajaxVariantId(expected.variantId)) {
      if (line.lineKey || line.key) {
        actions.push({ type: "REMOVE", lineKey: line.lineKey || line.key });
      }
      continue;
    }
    const list = linesByTier.get(tierId) || [];
    list.push(line);
    linesByTier.set(tierId, list);
  }

  for (const [tierId, lines] of linesByTier) {
    for (let i = 1; i < lines.length; i++) {
      const key = lines[i].lineKey || lines[i].key;
      if (key) actions.push({ type: "REMOVE", lineKey: key, tierId });
    }
    const primary = lines[0];
    const key = primary?.lineKey || primary?.key;
    if (key && (Number(primary.quantity) || 0) > 1) {
      actions.push({ type: "NORMALIZE", lineKey: key, quantity: 1, tierId });
    }
  }

  if (autoAddGift !== false) {
    for (const gift of unlocked) {
      if (!gift?.tierId || !gift?.variantId) continue;
      const tierId = String(gift.tierId);
      if (linesByTier.get(tierId)?.length) continue;
      const id = ajaxVariantId(gift.variantId);
      if (!id) continue;
      actions.push({
        type: "ADD",
        tierId,
        variantId: id,
        properties: buildTierGiftProperties(campaignId, tierId),
      });
    }
  }

  return actions;
}
