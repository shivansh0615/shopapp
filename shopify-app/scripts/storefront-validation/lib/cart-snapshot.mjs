/**
 * Canonical cart snapshot for storefront validation.
 */

export function isTaggedGiftProps(properties) {
  const p = properties || {};
  return p._fgpb_free_gift === "true" || p._fgpb_free_gift === true;
}

export function classifyLine(item, giftVariantId = null) {
  const props = item.properties || {};
  const tagged = isTaggedGiftProps(props);
  const variantId = String(item.variant_id ?? item.variantId ?? "");
  const sameSku =
    giftVariantId != null && variantId === String(giftVariantId).split("/").pop();
  let kind = "unrelated";
  if (tagged) kind = "tagged_gift";
  else if (sameSku) kind = "paid_same_sku";
  else kind = "paid";
  return {
    lineKey: item.key || item.id || null,
    variantId,
    productId: item.product_id != null ? String(item.product_id) : null,
    title: item.title || item.product_title || null,
    quantity: Number(item.quantity) || 0,
    finalLinePrice: item.final_line_price ?? item.line_price ?? null,
    originalLinePrice: item.original_line_price ?? null,
    properties: {
      _fgpb_free_gift: props._fgpb_free_gift ?? null,
      _fgpb_campaign_id: props._fgpb_campaign_id ?? null,
      _fgpb_tier_id: props._fgpb_tier_id ?? null,
    },
    sellingPlan: item.selling_plan_allocation ? true : false,
    discountAllocationCount: Array.isArray(item.discounts) ? item.discounts.length : 0,
    kind,
  };
}

export function snapshotCart(cart, options = {}) {
  const giftVariantId = options.giftVariantId ?? null;
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const lines = items.map((item) => classifyLine(item, giftVariantId));
  const tagged = lines.filter((l) => l.kind === "tagged_gift");
  const paidSameSku = lines.filter((l) => l.kind === "paid_same_sku");
  const keys = lines.map((l) => l.lineKey).filter(Boolean);
  const keySet = new Set(keys);
  const campaignIds = [
    ...new Set(
      tagged
        .map((l) => l.properties._fgpb_campaign_id)
        .filter((v) => v != null && String(v).length),
    ),
  ];

  return {
    itemCount: cart?.item_count ?? lines.reduce((s, l) => s + l.quantity, 0),
    subtotalCents: cart?.items_subtotal_price ?? cart?.original_total_price ?? null,
    taggedGiftLineCount: tagged.length,
    taggedGiftQuantityTotal: tagged.reduce((s, l) => s + l.quantity, 0),
    paidSameSkuLineCount: paidSameSku.length,
    paidSameSkuQuantityTotal: paidSameSku.reduce((s, l) => s + l.quantity, 0),
    campaignIds,
    duplicateLineKeys: keys.length !== keySet.size,
    lines,
    shapes: {
      oneTaggedQty2: tagged.length === 1 && tagged[0].quantity === 2,
      twoTaggedQty1:
        tagged.length === 2 && tagged.every((l) => l.quantity === 1),
      taggedPlusPaidSameSku: tagged.length >= 1 && paidSameSku.length >= 1,
      twoPaidOnly: tagged.length === 0 && paidSameSku.length >= 2,
    },
  };
}

export function detectQuantityViolation(snapshot) {
  if (!snapshot) return null;
  if (snapshot.shapes.oneTaggedQty2) {
    return {
      code: "TAGGED_QTY_2_SINGLE_LINE",
      line: snapshot.lines.find((l) => l.kind === "tagged_gift"),
    };
  }
  if (snapshot.shapes.twoTaggedQty1) {
    return {
      code: "TWO_TAGGED_LINES",
      lines: snapshot.lines.filter((l) => l.kind === "tagged_gift"),
    };
  }
  if (snapshot.taggedGiftQuantityTotal > 1) {
    return {
      code: "TAGGED_QTY_TOTAL_GT_1",
      total: snapshot.taggedGiftQuantityTotal,
      lines: snapshot.lines.filter((l) => l.kind === "tagged_gift"),
    };
  }
  return null;
}
