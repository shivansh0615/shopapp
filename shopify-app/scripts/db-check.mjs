/**
 * Safe PostgreSQL connectivity check.
 * Never prints credentials, full DATABASE_URL, username, or password.
 *
 * Usage: npm run db:check
 */

import { PrismaClient } from "@prisma/client";

function assertPostgresUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) {
    throw new Error("DATABASE_URL is not set.");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "postgresql" && protocol !== "postgres") {
    throw new Error(`DATABASE_URL must use postgresql:// (got ${protocol}).`);
  }
  return { protocol };
}

async function main() {
  const started = Date.now();
  assertPostgresUrl(process.env.DATABASE_URL);

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  try {
    // Bounded connect via Promise.race
    const timeoutMs = Number(process.env.DB_CHECK_TIMEOUT_MS || 8000);
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`connect timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    const rows = await prisma.$queryRawUnsafe(
      "SELECT current_database() AS db, current_setting('server_version') AS version, current_setting('server_version_num') AS version_num",
    );
    const row = Array.isArray(rows) ? rows[0] : rows;

    // Extensions probe (read-only)
    let hasPgcrypto = false;
    try {
      const ext = await prisma.$queryRawUnsafe(
        "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgcrypto') AS ok",
      );
      hasPgcrypto = !!(Array.isArray(ext) ? ext[0]?.ok : ext?.ok);
    } catch {
      hasPgcrypto = false;
    }

    console.log(
      JSON.stringify({
        ok: true,
        protocol: "postgresql",
        databaseName: row?.db ? String(row.db) : null,
        serverVersion: row?.version ? String(row.version) : null,
        serverVersionNum: row?.version_num ? String(row.version_num) : null,
        extensions: { pgcryptoAvailable: hasPgcrypto },
        elapsedMs: Date.now() - started,
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        ok: false,
        error: String(err?.message || err).replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[redacted]"),
        elapsedMs: Date.now() - started,
      }),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main();
