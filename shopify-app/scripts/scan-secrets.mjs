/**
 * Scan tracked-ish project files for high-risk secret patterns.
 * Prints file paths and pattern names only — never matched secret values.
 *
 * Exit 1 if a likely live secret pattern is found outside allowlisted fixtures.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "build",
  "dist",
  ".shopify",
  "coverage",
  ".turbo",
]);

const SKIP_FILES = new Set([".env", "package-lock.json"]);

const SKIP_PATH_GLOBS = [
  /(^|\/)_/, // investigation artifacts: _validate_*, _sqlite_*, etc.
  /\.sqlite($|-)/i,
  /_store_cookies/i,
  /shopify\.app\.production\.toml$/,
  /shopify\.app\.production\.upselltrix\.toml$/,
  /shopify\.app\.staging\.toml$/,
];

const ALLOW_PATH_SUBSTR = [
  ".env.example",
  "docs/",
  ".github/workflows/release-gates.yml", // intentional CI dummy secrets
  ".gitlab-ci.yml", // intentional CI dummy secrets (parity with GitHub workflow)
  "validate-production-toml.test.mjs",
  "env.server.test.ts",
  "generate-production-toml.test.mjs",
];

const PATTERNS = [
  { name: "shopify_access_token", re: /\bshpat_[A-Za-z0-9]{20,}\b/ },
  { name: "shopify_session_secret", re: /\bshpss_[A-Za-z0-9]{20,}\b/ },
  { name: "shopify_user_token", re: /\bshua_[A-Za-z0-9]{20,}\b/ },
  { name: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "private_key_block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, files);
    else if (st.isFile()) files.push(full);
  }
  return files;
}

function isAllowed(rel) {
  const normalized = rel.replace(/\\/g, "/");
  if (SKIP_FILES.has(normalized.split("/").pop())) return true;
  if (SKIP_PATH_GLOBS.some((re) => re.test(normalized))) return true;
  return ALLOW_PATH_SUBSTR.some((p) => normalized.includes(p));
}

const hits = [];
for (const file of walk(root)) {
  const rel = relative(root, file);
  if (isAllowed(rel)) continue;
  if (!/\.(ts|tsx|js|mjs|cjs|json|toml|yml|yaml|md|env|Dockerfile|txt)$/i.test(rel) &&
      !rel.endsWith("Dockerfile")) {
    continue;
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // Skip huge binaries accidentally matched
  if (text.length > 1_500_000) continue;
  for (const pattern of PATTERNS) {
    if (pattern.re.test(text)) {
      hits.push({ file: rel.replace(/\\/g, "/"), pattern: pattern.name });
    }
  }
}

if (hits.length > 0) {
  console.error("Secret-pattern scan found potential live secrets (values not printed):");
  for (const hit of hits) {
    console.error(`  - ${hit.file} [${hit.pattern}]`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, scanned: true, hits: 0, note: "No pattern hits outside allowlists." }),
);
