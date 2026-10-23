/**
 * Theme customizer / inspector only.
 * Storefront preview (`?pb=0`, `preview_theme_id`) must still add gifts and show the bar.
 */
export function isThemeEditor(win) {
  const w = win || (typeof window !== "undefined" ? window : undefined);
  if (!w) return false;
  try {
    const s = w.Shopify;
    if (s && (s.designMode === true || s.inspectMode === true)) return true;
  } catch (_e) {}
  try {
    const el = w.document && w.document.documentElement;
    if (el && el.classList && el.classList.contains("shopify-design-mode")) return true;
  } catch (_e2) {}
  try {
    if (w.top && w.top !== w.self) {
      try {
        const host = String((w.top.location && w.top.location.hostname) || "");
        if (/shopify\.com$/i.test(host)) return true;
      } catch (_cross) {
        return true;
      }
    }
  } catch (_e4) {}
  return false;
}
