import { buildLiveResponse } from "../lib/health.server";

/**
 * Liveness probe — process is up. No DB / Shopify / config introspection.
 */
export const loader = async () => {
  return buildLiveResponse();
};
