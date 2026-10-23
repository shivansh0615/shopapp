import db from "../app/db.server";
import { inspectDiscountSyncQueueSummary } from "../app/services/discount-sync-job.server";

if (!process.env.DATABASE_URL) {
  console.error(JSON.stringify({ ok: false, error: "DATABASE_URL is required" }));
  process.exit(1);
}

const shop = process.argv[2] || undefined;
const summary = await inspectDiscountSyncQueueSummary(shop, db);

console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
process.exit(0);
