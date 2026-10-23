/**
 * Run-once alias — claim a bounded batch and exit.
 * Exit 0 when the queue is empty or jobs were processed.
 * Exit 1 only for unrecoverable startup failures (e.g. missing DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { runDiscountSyncOnce } from "../app/services/discount-sync-worker.server";

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL is required" }));
  process.exit(1);
}

const result = await runDiscountSyncOnce({ client: db });
console.log(
  JSON.stringify(
    {
      ok: true,
      workerId: randomUUID(),
      mode: "once",
      ...result,
    },
    null,
    2,
  ),
);
process.exit(0);
