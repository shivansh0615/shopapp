/**
 * Generate a deploy-time shopify.app.*.toml from the development template + SHOPIFY_APP_URL.
 *
 * Never guesses a hostname. Never overwrites shopify.app.toml unless
 * --overwrite-dev-toml is passed explicitly.
 *
 * Usage:
 *   SHOPIFY_APP_URL=https://app.your-domain.tld \
 *     npm run generate:production-toml
 *
 * Default template: shopify.app.upselltrix.toml (UpsellTrix identity).
 * Output default: shopify.app.production.toml (gitignored recommended for real domains).
 * For the committed CI artifact: SHOPIFY_TOML_OUT=shopify.app.production.upselltrix.toml
 * Then:
 *   SHOPIFY_TOML_PATH=shopify.app.production.toml npm run validate:production-toml
 *   SHOPIFY_TOML_PATH=shopify.app.production.toml npm run deploy:production
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isForbiddenProductionHostname,
  parseHttpsUrl,
  validateProductionToml,
  RUNTIME_AUTH_PATH_PREFIX,
  RUNTIME_APP_PROXY_BACKEND_PREFIX,
} from "./validate-production-toml.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function normalizeOrigin(appUrl) {
  const trimmed = String(appUrl || "").trim().replace(/\/$/, "");
  const parsed = parseHttpsUrl(trimmed);
  if (!parsed) return null;
  if (isForbiddenProductionHostname(parsed.hostname)) return null;
  return `${parsed.protocol}//${parsed.host}`;
}

export function buildProductionUrlSet(appUrl) {
  const origin = normalizeOrigin(appUrl);
  if (!origin) {
    throw new Error(
      "SHOPIFY_APP_URL must be a valid https:// origin with a non-placeholder host " +
        "(not example.com / localhost).",
    );
  }
  return {
    origin,
    applicationUrl: origin,
    redirectUrl: `${origin}${RUNTIME_AUTH_PATH_PREFIX}/callback`,
    appProxyUrl: `${origin}${RUNTIME_APP_PROXY_BACKEND_PREFIX}`,
  };
}

export function applyProductionUrlsToToml(templateRaw, appUrl) {
  const urls = buildProductionUrlSet(appUrl);
  let out = templateRaw;

  out = out.replace(
    /^application_url\s*=\s*"[^"]*"/m,
    `application_url = "${urls.applicationUrl}"`,
  );
  out = out.replace(
    /^redirect_urls\s*=\s*\[[^\]]*\]/m,
    `redirect_urls = [ "${urls.redirectUrl}" ]`,
  );

  // app_proxy.url sits under [app_proxy]
  out = out.replace(
    /(\[app_proxy\][\s\S]*?^url\s*=\s*")[^"]*(")/m,
    `$1${urls.appProxyUrl}$2`,
  );

  return { toml: out, urls };
}

export function assertTomlMatchesAppUrl(tomlRaw, appUrl) {
  const urls = buildProductionUrlSet(appUrl);
  const errors = validateProductionToml(tomlRaw);
  if (!tomlRaw.includes(`application_url = "${urls.applicationUrl}"`)) {
    errors.push(
      `application_url does not match SHOPIFY_APP_URL origin ${urls.applicationUrl}`,
    );
  }
  if (!tomlRaw.includes(`"${urls.redirectUrl}"`)) {
    errors.push(`auth.redirect_urls must include ${urls.redirectUrl}`);
  }
  if (!tomlRaw.includes(`url = "${urls.appProxyUrl}"`)) {
    errors.push(`app_proxy.url must be ${urls.appProxyUrl}`);
  }
  return errors;
}

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    overwriteDevToml: args.has("--overwrite-dev-toml"),
    out:
      [...argv].find((a) => a.startsWith("--out="))?.slice("--out=".length) ||
      process.env.SHOPIFY_TOML_OUT ||
      "shopify.app.production.toml",
    template:
      [...argv].find((a) => a.startsWith("--template="))?.slice(
        "--template=".length,
      ) ||
      process.env.SHOPIFY_TOML_TEMPLATE ||
      "shopify.app.upselltrix.toml",
  };
}

function main() {
  const { overwriteDevToml, out, template } = parseArgs(process.argv.slice(2));
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (!appUrl || !String(appUrl).trim()) {
    console.error(
      "generate:production-toml failed: set SHOPIFY_APP_URL to the real https origin (no guessing).",
    );
    process.exit(1);
  }

  if (out === "shopify.app.toml" && !overwriteDevToml) {
    console.error(
      "Refusing to overwrite shopify.app.toml without --overwrite-dev-toml.",
    );
    console.error(
      "Default output is shopify.app.production.toml (keeps local CLI placeholders intact).",
    );
    process.exit(1);
  }

  const templatePath = join(root, template);
  const outPath = join(root, out);
  const templateRaw = readFileSync(templatePath, "utf8");
  const { toml, urls } = applyProductionUrlsToToml(templateRaw, appUrl);
  const errors = [
    ...validateProductionToml(toml),
    ...assertTomlMatchesAppUrl(toml, appUrl),
  ];
  if (errors.length > 0) {
    console.error("Generated TOML failed validation:");
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  writeFileSync(outPath, toml, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        template,
        out,
        application_url: urls.applicationUrl,
        redirect_url: urls.redirectUrl,
        app_proxy_url: urls.appProxyUrl,
        note: "No secrets written. Review before shopify app deploy.",
      },
      null,
      2,
    ),
  );
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main();
}
