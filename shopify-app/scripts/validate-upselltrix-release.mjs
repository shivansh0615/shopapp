import { readFileSync } from "node:fs";
import { validateProductionToml } from "./validate-production-toml.mjs";

const raw = readFileSync(new URL("../shopify.app.release.toml", import.meta.url), "utf8");
const errors = validateProductionToml(raw);
if (!/^client_id\s*=\s*"b335d11311bf491819d273532508a56b"\s*$/m.test(raw)) {
  errors.push("Production configuration must target the UpsellTrix app client ID.");
}
if (/^automatically_update_urls_on_dev\s*=\s*true\s*$/m.test(raw)) {
  errors.push("Production configuration must not automatically replace URLs during development.");
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UpsellTrix production app identity and configuration verified.");
}
