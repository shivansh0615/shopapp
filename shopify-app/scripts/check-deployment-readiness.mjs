/**
 * Deployment readiness gate — documentation + config workflow presence.
 * Does not deploy. Fails if critical ops artifacts or scripts are missing.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const errors = [];

const requiredFiles = [
  "docs/ops/deployment.md",
  "docs/ops/deployment-engineer-handoff.md",
  "docs/ops/environment-contract.md",
  "docs/ops/worker-scheduling.md",
  "docs/ops/database-migrations.md",
  "docs/ops/backup-restore.md",
  "docs/ops/secrets.md",
  "docs/ops/staging-checklist.md",
  "docs/ops/release-pipeline.md",
  "docs/ops/smoke-tests.md",
  "docs/ops/incident-runbook.md",
  "docs/ops/api-version-audit.md",
  "docs/ops/logging.md",
  "docs/ops/money-field-inventory.md",
  "docs/ops/integer-money-migration.md",
  "docs/ops/staging-environment.md",
  "docs/issues/storefront-harness-gift-qty.md",
  "scripts/generate-production-toml.mjs",
  "scripts/validate-production-toml.mjs",
  "scripts/deploy-production.mjs",
  "scripts/db-check.mjs",
  "scripts/staging-money-fixtures.mjs",
  "scripts/check-api-version-skew.mjs",
  "scripts/generate-staging-toml.mjs",
  "scripts/validate-staging-toml.mjs",
  "scripts/deploy-staging.mjs",
  "scripts/scan-secrets.mjs",
  ".env.example",
];

for (const rel of requiredFiles) {
  if (!existsSync(join(root, rel))) {
    errors.push(`missing required artifact: ${rel}`);
  }
}

const deploymentDoc = existsSync(join(root, "docs/ops/deployment.md"))
  ? readFileSync(join(root, "docs/ops/deployment.md"), "utf8")
  : "";

const requiredPhrases = [
  "must schedule the discount-sync worker",
  "prisma migrate deploy",
  "SHOPIFY_APP_URL",
  "guessed",
];

for (const phrase of requiredPhrases) {
  if (!deploymentDoc.toLowerCase().includes(phrase.toLowerCase())) {
    errors.push(`docs/ops/deployment.md missing required guidance: "${phrase}"`);
  }
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of [
  "generate:production-toml",
  "validate:production-toml",
  "validate:production-config",
  "deploy:production",
  "discount-sync:once",
  "migrate:deploy",
  "money:backfill",
  "money:backfill:dry-run",
  "money:verify",
  "test:money",
  "db:check",
  "config:staging:generate",
  "config:staging:validate",
  "deploy:staging",
  "check:api-version-skew",
  "scan:secrets",
  "check:deployment-readiness",
]) {
  if (!pkg.scripts?.[script]) {
    errors.push(`package.json missing script: ${script}`);
  }
}

// Development TOML may keep placeholders — that is expected.
const toml = readFileSync(join(root, "shopify.app.toml"), "utf8");
if (!toml.includes("example.com")) {
  // Soft note only — not an error. Placeholders are the preferred local template.
}

if (errors.length > 0) {
  console.error("Deployment readiness check failed:");
  for (const err of errors) console.error(`  - ${err}`);
  console.error("");
  console.error(
    "BLOCKER: configure real SHOPIFY_APP_URL + generate production TOML + schedule worker before production traffic.",
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    note: "Artifacts present. External production inputs (hostname, DB, scheduler, secrets store) still required.",
  }),
);
