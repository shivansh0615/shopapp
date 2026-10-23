/**
 * Staging Shopify deploy gate — requires explicit target and confirmation.
 * Does NOT run unless --i-authorize-staging-shopify-deploy is passed.
 *
 * Usage:
 *   STAGING_SHOPIFY_APP_URL=https://staging.example.tld \
 *   SHOPIFY_TOML_PATH=shopify.app.staging.toml \
 *   npm run deploy:staging -- --i-authorize-staging-shopify-deploy
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const authorized = process.argv.includes("--i-authorize-staging-shopify-deploy");
const tomlPath = process.env.SHOPIFY_TOML_PATH?.trim() || "shopify.app.staging.toml";

if (!authorized) {
  console.error(
    "deploy:staging refused: pass --i-authorize-staging-shopify-deploy after validating staging config.",
  );
  process.exit(1);
}

if (!process.env.STAGING_SHOPIFY_APP_URL?.trim() && !process.env.SHOPIFY_APP_URL?.trim()) {
  console.error("Set STAGING_SHOPIFY_APP_URL before staging deploy.");
  process.exit(1);
}

if (!existsSync(join(root, tomlPath))) {
  console.error(`Missing ${tomlPath}. Run npm run config:staging:generate first.`);
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const env = {
  ...process.env,
  SHOPIFY_TOML_PATH: tomlPath,
  SHOPIFY_APP_URL:
    process.env.STAGING_SHOPIFY_APP_URL?.trim() || process.env.SHOPIFY_APP_URL,
};

run("npm", ["run", "config:staging:validate"], env);
run("npm", ["run", "build:storefront"], env);
run("npm", ["run", "check:storefront-assets"], env);

console.log(`Deploying Shopify staging config from ${tomlPath} …`);
run("npx", ["shopify", "app", "deploy", "--config", tomlPath], env);
