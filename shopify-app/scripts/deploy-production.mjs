/**
 * Production Shopify config deploy gate.
 *
 * Requires:
 *   NODE_ENV=production (or rely on validate:env no-op outside prod — force production)
 *   SHOPIFY_APP_URL=https://real-host
 *   SHOPIFY_TOML_PATH=shopify.app.production.toml (recommended)
 *
 * Does not guess hostnames. Does not deploy if validation fails.
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tomlPath =
  process.env.SHOPIFY_TOML_PATH?.trim() || "shopify.app.production.toml";

if (!process.env.SHOPIFY_APP_URL?.trim()) {
  console.error(
    "deploy:production failed: set SHOPIFY_APP_URL to the real https origin (no guessing).",
  );
  process.exit(1);
}

if (!existsSync(join(root, tomlPath))) {
  console.error(
    `deploy:production failed: missing ${tomlPath}. Generate it first:`,
  );
  console.error(
    "  SHOPIFY_APP_URL=https://YOUR_HOST npm run generate:production-toml",
  );
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const env = {
  ...process.env,
  NODE_ENV: "production",
  SHOPIFY_TOML_PATH: tomlPath,
};

run("npm", ["run", "validate:env"], env);
run("npm", ["run", "validate:production-toml"], env);

run("npm", ["run", "build:storefront"], env);
run("npm", ["run", "check:storefront-assets"], env);

console.log(`Deploying Shopify app config from ${tomlPath} …`);
run("npx", ["shopify", "app", "deploy", "--config", tomlPath], env);
