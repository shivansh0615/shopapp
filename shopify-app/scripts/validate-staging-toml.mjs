/**
 * Validate staging TOML. Rejects localhost, placeholders, and production host reuse.
 *
 * Usage:
 *   SHOPIFY_TOML_PATH=shopify.app.staging.toml \
 *   STAGING_SHOPIFY_APP_URL=https://staging.example.tld \
 *   npm run config:staging:validate
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProductionToml,
  parseHttpsUrl,
  isForbiddenProductionHostname,
} from "./validate-production-toml.mjs";
import { assertTomlMatchesAppUrl, normalizeOrigin } from "./generate-production-toml.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath =
  process.env.SHOPIFY_TOML_PATH?.trim() || "shopify.app.staging.toml";
const appUrl =
  process.env.STAGING_SHOPIFY_APP_URL?.trim() || process.env.SHOPIFY_APP_URL?.trim();
const prodHost = process.env.PRODUCTION_SHOPIFY_APP_HOST?.trim().toLowerCase() || "";

if (!existsSync(join(root, tomlPath))) {
  console.error(`Missing ${tomlPath}. Run npm run config:staging:generate first.`);
  process.exit(1);
}
if (!appUrl) {
  console.error("Set STAGING_SHOPIFY_APP_URL for validation.");
  process.exit(1);
}

const origin = normalizeOrigin(appUrl);
if (!origin) {
  console.error("Invalid STAGING_SHOPIFY_APP_URL.");
  process.exit(1);
}

const host = parseHttpsUrl(origin)?.hostname?.toLowerCase() || "";
if (prodHost && host === prodHost) {
  console.error("Staging hostname must not reuse production hostname.");
  process.exit(1);
}
if (isForbiddenProductionHostname(host)) {
  console.error("Forbidden hostname for staging.");
  process.exit(1);
}

const raw = readFileSync(join(root, tomlPath), "utf8");
const errors = [
  ...validateProductionToml(raw),
  ...assertTomlMatchesAppUrl(raw, origin),
];

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, tomlPath, applicationUrl: origin }));
