/**
 * Enforce Admin/webhook/codegen API version alignment.
 * Discount Function may intentionally differ (separate Function schema).
 *
 * Usage: npm run check:api-version-skew
 *
 * Fails when:
 * - Admin runtime, GraphQL codegen, and webhook TOML disagree;
 * - webhook/Admin version is outside the known @shopify/shopify-api set.
 *
 * Does not fail solely because Function api_version differs from Admin.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Versions present in @shopify/shopify-api@13 ApiVersion enum (excluding unstable). */
const SDK_ADMIN_VERSIONS = new Set([
  "2024-10",
  "2025-01",
  "2025-04",
  "2025-07",
  "2025-10",
  "2026-01",
  "2026-04",
  "2026-07",
]);

const API_VERSION_ENUM = {
  October24: "2024-10",
  January25: "2025-01",
  April25: "2025-04",
  July25: "2025-07",
  October25: "2025-10",
  January26: "2026-01",
  April26: "2026-04",
  July26: "2026-07",
};

function read(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function enumVersionFromSource(src) {
  for (const [name, version] of Object.entries(API_VERSION_ENUM)) {
    if (new RegExp(`ApiVersion\\.${name}\\b`).test(src)) return version;
  }
  return null;
}

function extract() {
  const admin = [];
  const functionDecls = [];

  const toml = read("shopify.app.toml") || "";
  const tomlMatch = toml.match(/api_version\s*=\s*"([^"]+)"/);
  if (tomlMatch) {
    admin.push({ source: "shopify.app.toml [webhooks]", version: tomlMatch[1] });
  }

  // UpsellTrix is the active Partner app template — keep webhook API version aligned.
  const upsellToml = read("shopify.app.upselltrix.toml") || "";
  const upsellMatch = upsellToml.match(/api_version\s*=\s*"([^"]+)"/);
  if (upsellMatch) {
    admin.push({
      source: "shopify.app.upselltrix.toml [webhooks]",
      version: upsellMatch[1],
    });
  }

  const server = read("app/shopify.server.ts") || "";
  const serverVer = enumVersionFromSource(server);
  if (serverVer) admin.push({ source: "app/shopify.server.ts", version: serverVer });

  const graphqlrc = read(".graphqlrc.ts") || "";
  const gqlVer = enumVersionFromSource(graphqlrc);
  if (gqlVer) admin.push({ source: ".graphqlrc.ts", version: gqlVer });

  const ext = read("extensions/fgpb-discount/shopify.extension.toml") || "";
  const extMatch = ext.match(/api_version\s*=\s*"([^"]+)"/);
  if (extMatch) {
    functionDecls.push({
      source: "extensions/fgpb-discount/shopify.extension.toml",
      version: extMatch[1],
      note: "Function schema version — independent of Admin API",
    });
  }

  return { admin, functionDecls };
}

function main() {
  const { admin, functionDecls } = extract();
  const adminVersions = [...new Set(admin.map((d) => d.version))];
  const adminAligned = adminVersions.length === 1;
  const adminVersion = adminAligned ? adminVersions[0] : null;
  const unsupported = admin
    .filter((d) => !SDK_ADMIN_VERSIONS.has(d.version))
    .map((d) => d.source);

  const functionVersion = functionDecls[0]?.version || null;
  const functionDiffers =
    adminVersion != null && functionVersion != null && functionVersion !== adminVersion;

  const errors = [];
  if (!adminAligned) {
    errors.push("Admin/webhook/codegen API versions disagree.");
  }
  if (unsupported.length) {
    errors.push(
      `API version not in installed @shopify/shopify-api set: ${unsupported.join(", ")}`,
    );
  }

  const report = {
    ok: errors.length === 0,
    selectedAdminVersion: adminVersion,
    adminAligned,
    adminDeclarations: admin,
    functionDeclarations: functionDecls,
    intentionalFunctionDifference: functionDiffers
      ? {
          admin: adminVersion,
          function: functionVersion,
          reason:
            "Shopify Functions select a separate GraphQL schema via extension api_version; " +
            "changing it requires shopify app function schema + typegen.",
        }
      : null,
    sdkAdminVersions: [...SDK_ADMIN_VERSIONS],
    errors,
  };

  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main();
