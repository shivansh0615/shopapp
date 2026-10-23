/**
 * Validates process env for production-like boots.
 * Usage:
 *   NODE_ENV=production npm run validate:env
 *
 * Safe for CI with dummy non-placeholder values.
 */

try {
  const { assertProductionEnv } = await import("../app/env.server.ts");
  const snapshot = assertProductionEnv(process.env);
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "validate:env: NODE_ENV is not production — assertProductionEnv is a no-op (OK for local).",
    );
    process.exit(0);
  }
  if (!snapshot) {
    console.error("validate:env: expected a production env snapshot.");
    process.exit(1);
  }
  console.log("validate:env: production environment variables look valid.");
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`validate:env failed: ${message}`);
  process.exit(1);
}
