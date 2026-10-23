/**
 * Pure helpers for gift-row highlighting (Fix 1).
 * Index-based CartItem-N matching is intentionally unsupported.
 */
export function collectTaggedLineKeys(items) {
  const taggedKeys = Object.create(null);
  const list = Array.isArray(items) ? items : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const props = (item && item.properties) || {};
    const flag = props._fgpb_free_gift;
    if (flag !== "true" && flag !== true) continue;
    const key = item.key || item.lineKey;
    if (key) taggedKeys[String(key)] = true;
  }
  return taggedKeys;
}

/** True only when rowKey is a real Shopify line key present in taggedKeys. */
export function shouldHighlightGiftRow(rowKey, taggedKeys) {
  if (!rowKey || !taggedKeys) return false;
  return !!taggedKeys[String(rowKey)];
}
