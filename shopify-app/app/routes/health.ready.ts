import prisma from "../db.server";
import { buildReadyResponse } from "../lib/health.server";

/**
 * Readiness probe — required config present and PostgreSQL reachable.
 * Does not call Shopify. Does not leak raw errors.
 */
export const loader = async () => {
  return buildReadyResponse({ prisma });
};
