import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const complianceFiles = new Set([
  "app/lib/webhook-auth.server.test.ts",
  "app/services/compliance-webhooks.server.test.ts",
]);

function discover(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return discover(name);
      return entry.isFile() && /\.test\.(ts|tsx|js|mjs)$/.test(entry.name) ? [name] : [];
    });
}

function suiteFor(file) {
  if (file.startsWith("app/services/promotion-engine/")) return "promotion";
  if (complianceFiles.has(file)) return "compliance";
  return "backend";
}

const [suite, ...options] = process.argv.slice(2);
if (!["backend", "compliance", "promotion"].includes(suite) ||
    options.some((option) => option !== "--list")) {
  console.error("Usage: node scripts/test-app.mjs <backend|compliance|promotion> [--list]");
  process.exit(1);
}

const files = discover("app").filter((file) => suiteFor(file) === suite);
if (files.length === 0) {
  console.error(`No tests found for ${suite}`);
  process.exit(1);
}
if (options.includes("--list")) {
  console.log(files.join("\n"));
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}
