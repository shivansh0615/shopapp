/**
 * Safe redaction helpers for storefront validation artifacts.
 * Never log cookies, tokens, or full cart tokens.
 */

import { createHash } from "node:crypto";

export function hashToken(value) {
  if (value == null || value === "") return null;
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

export function redactPreview(text, max = 180) {
  const raw = String(text || "")
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/shp(at|ss|ua)_[A-Za-z0-9]+/gi, "[redacted]")
    .replace(/_secure_session_id=[^;\s]+/gi, "_secure_session_id=[redacted]")
    .replace(/cart=[^;\s]+/gi, "cart=[redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, "[redacted-email]");
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function pathnameOf(url) {
  try {
    const u = new URL(url, "https://example.invalid");
    return u.pathname + (u.search ? "?…" : "");
  } catch {
    return String(url || "").split("?")[0];
  }
}
