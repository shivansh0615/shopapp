import {
  findTaggedGiftLine,
  findTaggedGiftLines,
  isCampaignTaggedGiftLine,
  isTaggedFreeGiftLine,
  type TaggedGiftCart,
  type TaggedGiftCartItem,
} from "./tagged-gift-cart.server";

export const FGPP_LINE_KEY_DATA_ATTR = "data-fgpb-line-key";

export type SectionStampItem = {
  lineKey: string;
};

const CART_ROW_OPEN_TAG =
  /<(tr|li|div)([^>]*(?:\bcart-item\b|\bcart__item\b|\bcart-items__row\b|\bdrawer__cart-item\b|data-cart-item=|id="[^"]*Cart[^"]*")[^>]*)>/gi;

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Stamp Shopify section HTML once at render time when row count matches cart items exactly. */
export function injectLineKeysIntoSectionHtml(
  html: string,
  items: SectionStampItem[],
): { html: string; stamped: boolean; reason?: string } {
  if (!html || !items.length) {
    return { html, stamped: false, reason: "missing-html-or-items" };
  }

  let rowIndex = 0;
  let rowMatches = 0;

  CART_ROW_OPEN_TAG.lastIndex = 0;
  while (CART_ROW_OPEN_TAG.exec(html)) {
    rowMatches += 1;
  }

  if (rowMatches !== items.length) {
    return {
      html,
      stamped: false,
      reason: "row-item-count-mismatch",
    };
  }

  rowIndex = 0;
  CART_ROW_OPEN_TAG.lastIndex = 0;

  const stampedHtml = html.replace(CART_ROW_OPEN_TAG, function (match, tag, attrs) {
    const lineKey = items[rowIndex]?.lineKey;
    rowIndex += 1;

    if (!lineKey) return match;
    if (attrs.includes(FGPP_LINE_KEY_DATA_ATTR)) return `<${tag}${attrs}>`;

    return `<${tag}${attrs} ${FGPP_LINE_KEY_DATA_ATTR}="${escapeHtmlAttribute(lineKey)}">`;
  });

  return { html: stampedHtml, stamped: true };
}

export function reorderCartItems(
  cart: TaggedGiftCart,
  lineKeyOrder: string[],
): TaggedGiftCart {
  const itemsByKey = new Map(cart.items.map((item) => [item.lineKey, item]));
  const items = lineKeyOrder
    .map((lineKey) => itemsByKey.get(lineKey) ?? null)
    .filter((item): item is TaggedGiftCartItem => item !== null);

  const subtotal = items.reduce((total, item) => total + item.quantity * item.price, 0);

  return {
    subtotal,
    currency: cart.currency,
    items,
  };
}

export function updateLineQuantity(
  cart: TaggedGiftCart,
  lineKey: string,
  quantity: number,
): TaggedGiftCart {
  const items = cart.items.map((item) =>
    item.lineKey === lineKey
      ? {
          ...item,
          quantity: Math.max(0, Math.trunc(quantity)),
        }
      : item,
  );

  const subtotal = items.reduce((total, item) => total + item.quantity * item.price, 0);

  return {
    subtotal,
    currency: cart.currency,
    items,
  };
}

/** FREE decoration is allowed only for tagged lines with a stamped row key present. */
export function resolveTaggedLinesForDecoration(
  cart: TaggedGiftCart,
  stampedRowKeys: Set<string>,
  campaignId?: number | string | null,
): TaggedGiftCartItem[] {
  return findTaggedGiftLines(cart, campaignId).filter((line) =>
    stampedRowKeys.has(line.lineKey),
  );
}

export function countPaidAndTaggedGiftVariantLines(
  cart: TaggedGiftCart,
  variantId: string,
  campaignId?: number | string | null,
): { paid: number; tagged: number } {
  let paid = 0;
  let tagged = 0;

  cart.items.forEach((item) => {
    if (item.variantId !== variantId) return;

    if (isCampaignTaggedGiftLine(item, campaignId)) {
      tagged += 1;
      return;
    }

    if (!isTaggedFreeGiftLine(item.properties)) {
      paid += 1;
    }
  });

  return { paid, tagged };
}

export function findTaggedGiftLineByKey(
  cart: TaggedGiftCart,
  lineKey: string,
  campaignId?: number | string | null,
): TaggedGiftCartItem | null {
  const line = cart.items.find((item) => item.lineKey === lineKey) ?? null;
  if (!line || !isCampaignTaggedGiftLine(line, campaignId)) return null;
  return line;
}

export function findTaggedGiftLineAfterPaidRemoval(
  cart: TaggedGiftCart,
  campaignId?: number | string | null,
): TaggedGiftCartItem | null {
  return findTaggedGiftLine(cart, campaignId);
}
