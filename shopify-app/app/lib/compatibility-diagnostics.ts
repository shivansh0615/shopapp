/**
 * Compatibility diagnostics — pure types and aggregation (no I/O).
 * Safe for unit tests. Never includes secrets or tokens.
 */

export type DiagnosticCheckStatus =
  | "pass"
  | "warn"
  | "fail"
  | "unable_to_verify"
  | "info";

export type OverallDiagnosticState =
  | "READY"
  | "READY_WITH_LIMITATIONS"
  | "ACTION_REQUIRED"
  | "UNABLE_TO_VERIFY";

export type DiagnosticCheck = {
  id: string;
  label: string;
  status: DiagnosticCheckStatus;
  explanation: string;
  merchantAction: string | null;
  /** Safe technical notes only — never secrets, tokens, or PII. */
  technicalDetails: string | null;
};

export type CompatibilityDiagnosticsReport = {
  shop: string;
  generatedAt: string;
  overall: OverallDiagnosticState;
  overallExplanation: string;
  checks: DiagnosticCheck[];
};

export const EXPECTED_APP_SCOPES = [
  "read_discounts",
  "write_discounts",
  "read_publications",
  "read_products",
] as const;

export const APP_PROXY_STOREFRONT_PATH = "/apps/free-gift";
export const APP_PROXY_BACKEND_PATH = "/apps/proxy";

/** Compliance webhook topics declared in shopify.app.toml (static). */
export const COMPLIANCE_WEBHOOK_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
] as const;

export const APP_WEBHOOK_TOPICS = [
  "app/uninstalled",
  "app/scopes_update",
] as const;

export const STOREFRONT_CONTACT_RECENT_MS = 1000 * 60 * 60 * 24 * 7;

export type StorefrontContactClass =
  | "recent"
  | "stale"
  | "none";

export function classifyStorefrontContact(
  lastWidgetStateAt: Date | string | null | undefined,
  nowMs: number = Date.now(),
  recentMs: number = STOREFRONT_CONTACT_RECENT_MS,
): StorefrontContactClass {
  if (!lastWidgetStateAt) return "none";
  const t =
    typeof lastWidgetStateAt === "string"
      ? Date.parse(lastWidgetStateAt)
      : lastWidgetStateAt.getTime();
  if (!Number.isFinite(t)) return "none";
  const age = nowMs - t;
  if (age <= recentMs) return "recent";
  return "stale";
}

export function parseScopeList(scope: string | null | undefined): string[] {
  if (!scope || !String(scope).trim()) return [];
  return String(scope)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .sort();
}

/**
 * Shopify write_{resource} grants include the matching read_{resource}.
 * Offline session strings often omit the implied read scope, which must
 * not be reported as missing.
 */
export function scopeSatisfied(granted: ReadonlySet<string>, needed: string): boolean {
  if (granted.has(needed)) return true;
  if (needed.startsWith("read_")) {
    return granted.has(`write_${needed.slice("read_".length)}`);
  }
  return false;
}

export function missingScopes(
  granted: string | null | undefined,
  expected: readonly string[] = EXPECTED_APP_SCOPES,
): string[] {
  const have = new Set(parseScopeList(granted));
  return expected.filter((scope) => !scopeSatisfied(have, scope));
}

/**
 * Aggregate check statuses into one overall state.
 * - Any fail or a disabled theme embed → ACTION_REQUIRED
 * - Unverified backend, installation, or theme activation → UNABLE_TO_VERIFY
 * - Known product limitations (accelerated checkout, optional drawers) use warn/info → READY_WITH_LIMITATIONS when otherwise healthy
 */
export function aggregateOverallState(
  checks: readonly DiagnosticCheck[],
): { overall: OverallDiagnosticState; explanation: string } {
  if (!checks.length) {
    return {
      overall: "UNABLE_TO_VERIFY",
      explanation: "No diagnostic checks were produced.",
    };
  }

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const hasUnable = checks.some((c) => c.status === "unable_to_verify");
  const criticalUnable = checks.some(
    (c) =>
      c.status === "unable_to_verify" &&
      (c.id === "backend_health" || c.id === "shopify_installation" || c.id === "theme_app_embed"),
  );

  if (hasFail || checks.some((check) => check.id === "theme_app_embed" && check.status === "warn")) {
    return {
      overall: "ACTION_REQUIRED",
      explanation:
        "One or more checks need merchant or operator action before the free-gift experience is reliable.",
    };
  }

  if (criticalUnable) {
    return {
      overall: "UNABLE_TO_VERIFY",
      explanation:
        "Installation, core health, or published-theme activation could not be verified. Retry the checks.",
    };
  }

  if (hasWarn || hasUnable) {
    return {
      overall: "READY_WITH_LIMITATIONS",
      explanation:
        "Core free-gift flows can work for Dawn/OS2 cart paths, with known limitations (theme embed verification, accelerated checkout, and optional third-party drawers).",
    };
  }

  return {
    overall: "READY",
    explanation:
      "Diagnostics look healthy for supported Dawn/OS2 cart paths. This does not mean every theme or accelerated checkout is supported.",
  };
}

/** Redact accidental secret-like strings from technical detail fields. */
export function redactTechnicalDetails(input: string | null | undefined): string | null {
  if (input == null) return null;
  let s = String(input);
  s = s.replace(/shpat_[A-Za-z0-9]+/gi, "[redacted]");
  s = s.replace(/shpss_[A-Za-z0-9]+/gi, "[redacted]");
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
  s = s.replace(/postgresql:\/\/[^\s"']+/gi, "postgresql://[redacted]");
  s = s.replace(/access[_-]?token["']?\s*[:=]\s*["']?[^"'\\\s]+/gi, "access_token=[redacted]");
  if (!s.trim()) return null;
  return s.slice(0, 500);
}
