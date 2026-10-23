/**
 * Generate staging Shopify TOML from explicit STAGING_SHOPIFY_APP_URL.
 * Does not overwrite shopify.app.toml or shopify.app.production.toml.
 *
 * Usage:
 *   STAGING_SHOPIFY_APP_URL=https://staging.example.tld npm run config:staging:generate
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyProductionUrlsToToml,
  normalizeOrigin,
} from "./generate-production-toml.mjs";
import { isForbiddenProductionHostname, parseHttpsUrl } from "./validate-production-toml.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.SHOPIFY_TOML_OUT?.trim() || "shopify.app.staging.toml";
const PROD_HOST = process.env.PRODUCTION_SHOPIFY_APP_HOST?.trim().toLowerCase() || "";

function main() {
  const appUrl = process.env.STAGING_SHOPIFY_APP_URL?.trim() || process.env.SHOPIFY_APP_URL?.trim();
  if (!appUrl) {
    console.error("Set STAGING_SHOPIFY_APP_URL to an https:// staging origin (no guessing).");
    process.exit(1);
  }

  const origin = normalizeOrigin(appUrl);
  if (!origin) {
    console.error("STAGING_SHOPIFY_APP_URL rejected (https required; no localhost/example.com).");
    process.exit(1);
  }

  const host = parseHttpsUrl(origin)?.hostname?.toLowerCase() || "";
  if (PROD_HOST && host === PROD_HOST) {
    console.error("Staging hostname must not equal PRODUCTION_SHOPIFY_APP_HOST.");
    process.exit(1);
  }
  if (isForbiddenProductionHostname(host)) {
    console.error("Forbidden staging hostname.");
    process.exit(1);
  }

  const templatePath = join(root, "shopify.app.toml");
  if (!existsSync(templatePath)) {
    console.error("Missing shopify.app.toml template.");
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf8");
  const { toml, urls } = applyProductionUrlsToToml(template, origin);
  const outPath = join(root, OUT);
  writeFileSync(outPath, toml, "utf8");
  console.log(
    JSON.stringify({
      ok: true,
      out: OUT,
      applicationUrl: urls.applicationUrl,
      note: "Generated file should remain gitignored. Not deployed by this command.",
    }),
  );
}

main();
