/**
 * Production gate for shopify.app.toml.
 *
 * Local CLI may keep example.com placeholders while
 * automatically_update_urls_on_dev rewrites URLs during `shopify app dev`.
 *
 * Before a real production Partner deploy this script must pass:
 *   npm run validate:production-toml
 *
 * Checks:
 * - application_url / auth.redirect_urls / app_proxy.url are https and non-placeholder
 * - OAuth redirect paths match runtime authPathPrefix (/auth), not /api/auth
 * - App Proxy prefix/subpath/url path match handlers under /apps/proxy
 * - Required compliance topics are subscribed
 * - Required uninstall/scopes webhook URIs exist
 * - Rejects localhost in production URLs
 * - Does NOT false-positive on hosts like myexample.com
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath = join(root, process.env.SHOPIFY_TOML_PATH || "shopify.app.toml");

/** Must stay aligned with app/shopify.server.ts authPathPrefix. */
export const RUNTIME_AUTH_PATH_PREFIX = "/auth";

/** Must stay aligned with app/routes/apps.proxy.*.ts */
export const RUNTIME_APP_PROXY_BACKEND_PREFIX = "/apps/proxy";

const REQUIRED_COMPLIANCE_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
];

const REQUIRED_WEBHOOK_URIS = [
  "/webhooks/app/uninstalled",
  "/webhooks/app/scopes_update",
  "/webhooks/compliance",
];

export function extractQuotedValues(sectionText, key) {
  const values = [];
  const single = sectionText.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  if (single) values.push(single[1]);

  const arrayBlock = sectionText.match(
    new RegExp(`^\\s*${key}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m"),
  );
  if (arrayBlock) {
    for (const m of arrayBlock[1].matchAll(/"([^"]*)"/g)) {
      values.push(m[1]);
    }
  }
  return values;
}

export function sectionBody(raw, header) {
  const escaped = header.replace(/[[\]]/g, "\\$&");
  const match = raw.match(
    new RegExp(`${escaped}([\\s\\S]*?)(?=\\n\\[|$)`),
  );
  return match ? match[1] : "";
}

export function isForbiddenProductionHostname(hostname) {
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

export function parseHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function validateProductionToml(raw) {
  const errors = [];

  const applicationUrls = extractQuotedValues(raw, "application_url");
  if (applicationUrls.length === 0) {
    errors.push("missing application_url");
  }
  for (const url of applicationUrls) {
    const parsed = parseHttpsUrl(url);
    if (!parsed) {
      errors.push(`application_url is not a valid https URL: "${url}"`);
      continue;
    }
    if (isForbiddenProductionHostname(parsed.hostname)) {
      errors.push(
        `application_url uses a forbidden production host: "${url}"`,
      );
    }
  }

  const authBody = sectionBody(raw, "[auth]");
  if (!authBody.trim()) {
    errors.push("missing [auth] section");
  } else {
    const redirects = extractQuotedValues(authBody, "redirect_urls");
    if (redirects.length === 0) {
      errors.push("auth.redirect_urls is missing or empty");
    }
    for (const url of redirects) {
      const parsed = parseHttpsUrl(url);
      if (!parsed) {
        errors.push(`auth.redirect_urls contains invalid https URL: "${url}"`);
        continue;
      }
      if (isForbiddenProductionHostname(parsed.hostname)) {
        errors.push(
          `auth.redirect_urls uses a forbidden production host: "${url}"`,
        );
      }
      if (parsed.pathname.startsWith("/api/auth")) {
        errors.push(
          `auth.redirect_urls path "${parsed.pathname}" does not match runtime authPathPrefix "${RUNTIME_AUTH_PATH_PREFIX}" (found /api/auth)`,
        );
      } else if (!parsed.pathname.startsWith(`${RUNTIME_AUTH_PATH_PREFIX}/`) &&
        parsed.pathname !== RUNTIME_AUTH_PATH_PREFIX) {
        errors.push(
          `auth.redirect_urls path "${parsed.pathname}" must start with runtime authPathPrefix "${RUNTIME_AUTH_PATH_PREFIX}"`,
        );
      }
    }
  }

  const proxyBody = sectionBody(raw, "[app_proxy]");
  if (!proxyBody.trim()) {
    errors.push("missing [app_proxy] section");
  } else {
    const urls = extractQuotedValues(proxyBody, "url");
    const prefixes = extractQuotedValues(proxyBody, "prefix");
    const subpaths = extractQuotedValues(proxyBody, "subpath");

    if (urls.length === 0) errors.push("app_proxy.url is missing");
    if (prefixes[0] !== "apps") {
      errors.push(`app_proxy.prefix must be "apps" (got "${prefixes[0] || ""}")`);
    }
    if (subpaths[0] !== "free-gift") {
      errors.push(
        `app_proxy.subpath must be "free-gift" (got "${subpaths[0] || ""}")`,
      );
    }

    for (const url of urls) {
      const parsed = parseHttpsUrl(url);
      if (!parsed) {
        errors.push(`app_proxy.url is not a valid https URL: "${url}"`);
        continue;
      }
      if (isForbiddenProductionHostname(parsed.hostname)) {
        errors.push(`app_proxy.url uses a forbidden production host: "${url}"`);
      }
      const normalizedPath = parsed.pathname.replace(/\/$/, "") || "/";
      if (normalizedPath !== RUNTIME_APP_PROXY_BACKEND_PREFIX) {
        errors.push(
          `app_proxy.url path must be "${RUNTIME_APP_PROXY_BACKEND_PREFIX}" to match apps.proxy.* routes (got "${parsed.pathname}")`,
        );
      }
    }
  }

  for (const uri of REQUIRED_WEBHOOK_URIS) {
    if (!raw.includes(`uri = "${uri}"`)) {
      errors.push(`missing webhook subscription uri "${uri}"`);
    }
  }

  const complianceBlock = raw.match(
    /compliance_topics\s*=\s*\[([\s\S]*?)\]/,
  );
  if (!complianceBlock) {
    errors.push("missing compliance_topics subscription");
  } else {
    for (const topic of REQUIRED_COMPLIANCE_TOPICS) {
      if (!complianceBlock[1].includes(`"${topic}"`)) {
        errors.push(`missing compliance topic "${topic}"`);
      }
    }
  }

  return errors;
}

function main() {
  const raw = readFileSync(tomlPath, "utf8");
  const errors = validateProductionToml(raw);

  const appUrl = process.env.SHOPIFY_APP_URL;
  if (appUrl && String(appUrl).trim()) {
    try {
      const parsed = parseHttpsUrl(String(appUrl).trim().replace(/\/$/, ""));
      if (!parsed || isForbiddenProductionHostname(parsed.hostname)) {
        errors.push(
          "SHOPIFY_APP_URL is set but is not a valid https non-placeholder origin",
        );
      } else {
        const origin = `${parsed.protocol}//${parsed.host}`;
        if (!raw.includes(`application_url = "${origin}"`)) {
          errors.push(
            `application_url must equal SHOPIFY_APP_URL origin "${origin}"`,
          );
        }
        const redirect = `${origin}${RUNTIME_AUTH_PATH_PREFIX}/callback`;
        if (!raw.includes(`"${redirect}"`)) {
          errors.push(`auth.redirect_urls must include "${redirect}"`);
        }
        const proxy = `${origin}${RUNTIME_APP_PROXY_BACKEND_PREFIX}`;
        if (!raw.includes(`url = "${proxy}"`)) {
          errors.push(`app_proxy.url must be "${proxy}"`);
        }
      }
    } catch {
      errors.push("SHOPIFY_APP_URL could not be parsed for TOML alignment check");
    }
  }

  if (errors.length > 0) {
    console.error("Production toml validation failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error("");
    console.error(
      "Keep example.com only for local CLI. Before production deploy, generate a deploy TOML:",
    );
    console.error(
      "  SHOPIFY_APP_URL=https://your-real-host npm run generate:production-toml",
    );
    console.error(
      "  SHOPIFY_TOML_PATH=shopify.app.production.toml npm run validate:production-toml",
    );
    console.error("See docs/ops/deployment.md");
    process.exit(1);
  }

  console.log("Production toml validation passed.");
}

import { pathToFileURL } from "node:url";

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry || process.env.VALIDATE_PRODUCTION_TOML_FORCE === "1") {
  main();
}
