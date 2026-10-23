import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { loadDiscountSyncConfig } from "../app/lib/discount-sync-config.server";
import { startDiscountSyncWorker } from "../app/services/discount-sync-worker.server";

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch") || args.has("--continuous");
const config = loadDiscountSyncConfig();

if (!process.env.DATABASE_URL) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "DATABASE_URL is required",
    }),
  );
  process.exit(1);
}

const handle = startDiscountSyncWorker({
  mode: watch ? "watch" : "once",
  client: db,
  config,
});

const result = await handle.done;
console.log(
  JSON.stringify(
    {
      ok: true,
      workerId: randomUUID(),
      mode: result.mode,
      batches: result.batches,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      shutdownReason: result.shutdownReason,
    },
    null,
    2,
  ),
);

// Empty queue and partial batch failures are not process failures.
// Non-zero only for startup / fatal path (handled above).
process.exit(0);
