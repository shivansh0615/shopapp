/**
 * Production environment validation.
 * Local / Shopify CLI development must keep working with tunnel-managed URLs.
 *
 * Authoritative contract: docs/ops/environment-contract.md
 */

import {
  loadDiscountSyncConfig,
  type DiscountSyncRuntimeConfig,
} from "./lib/discount-sync-config.server";

function isBlank(value: string | undefined | null): boolean {
  return !value || !String(value).trim();
}

/**
 * Hostnames forbidden for production SHOPIFY_APP_URL.
 * Rejects example.com / *.example.com and localhost loopbacks only —
 * not substrings like myexample.com or example-company.com.
 */
export function isForbiddenProductionHostname(hostname: string): boolean {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");

  if (!host) return true;

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  ) {
    return true;
  }

  if (host === "example.com" || host.endsWith(".example.com")) {
    return true;
  }

  return false;
}

/** Strip trailing slash from origin URLs (path-less app origins). */
export function normalizeAppOrigin(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/$/, "") || "";
    if (path && path !== "") {
      // Keep path if present (unusual for SHOPIFY_APP_URL); only strip trailing slash.
      parsed.pathname = path;
      return parsed.toString().replace(/\/$/, "");
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

/**
 * Returns true when the URL is missing, unparsable, non-https, or uses a forbidden host.
 */
export function isInvalidProductionAppUrl(value: string): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return true;
  }

  if (parsed.protocol !== "https:") {
    return true;
  }

  return isForbiddenProductionHostname(parsed.hostname);
}

/** Validate optional PORT (empty → ok; invalid → fail). */
export function isInvalidProductionPort(value: string | undefined): boolean {
  if (value == null || !String(value).trim()) return false;
  const n = Number(String(value).trim());
  return !Number.isInteger(n) || n < 1 || n > 65535;
}

export type ProductionEnvSnapshot = {
  NODE_ENV: "production";
  PORT: string;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SCOPES: string;
  DATABASE_URL: string;
  worker: DiscountSyncRuntimeConfig;
};

/**
 * Throws a clear error when required production variables are missing or still placeholders.
 * No-op outside production so Shopify CLI tunnels and empty local defaults keep working.
 * Never logs secret values.
 */
export function assertProductionEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProductionEnvSnapshot | null {
  if (env.NODE_ENV !== "production") {
    return null;
  }

  const required = [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "SCOPES",
    "DATABASE_URL",
  ] as const;

  const missing: string[] = [];
  for (const key of required) {
    if (isBlank(env[key])) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Production boot failed: missing required environment variable(s): ${missing.join(", ")}. ` +
        `See .env.example and docs/ops/environment-contract.md.`,
    );
  }

  if (isInvalidProductionPort(env.PORT)) {
    throw new Error(
      `Production boot failed: PORT must be an integer 1–65535 when set.`,
    );
  }

  const appUrl = normalizeAppOrigin(String(env.SHOPIFY_APP_URL));
  if (isInvalidProductionAppUrl(appUrl)) {
    throw new Error(
      `Production boot failed: SHOPIFY_APP_URL must be a valid https:// URL with a non-placeholder host. ` +
        `Rejected hosts: example.com, *.example.com, localhost. ` +
        `Do not fall back to example.com.`,
    );
  }

  const databaseUrl = String(env.DATABASE_URL).trim();
  if (databaseUrl.startsWith("file:")) {
    throw new Error(
      `Production boot failed: DATABASE_URL must point at PostgreSQL, not a SQLite file URL.`,
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      `Production boot failed: DATABASE_URL must be a postgres:// or postgresql:// URL.`,
    );
  }

  // Worker numeric knobs are bounded here so invalid production env fails at boot.
  const worker = loadDiscountSyncConfig(env);

  return {
    NODE_ENV: "production",
    PORT: String(env.PORT || "3000").trim() || "3000",
    SHOPIFY_API_KEY: String(env.SHOPIFY_API_KEY).trim(),
    SHOPIFY_API_SECRET: String(env.SHOPIFY_API_SECRET).trim(),
    SHOPIFY_APP_URL: appUrl,
    SCOPES: String(env.SCOPES).trim(),
    DATABASE_URL: databaseUrl,
    worker,
  };
}

// Evaluate once at module load when imported from shopify.server.
assertProductionEnv();
