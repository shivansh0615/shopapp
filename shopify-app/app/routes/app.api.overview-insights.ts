import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { resolveDiagnosticSession } from "../lib/diagnostic-session.server";
import {
  buildOverviewHealth,
  summarizeOverviewHealth,
} from "../lib/overview-metrics";
import { authenticateAdmin } from "../shopify.server";
import { getAnalyticsSummary } from "../services/analytics.server";
import { ANALYTICS_AVAILABLE } from "../lib/analytics-availability";
import { buildCompatibilityDiagnostics } from "../services/compatibility-diagnostics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);

  const diagnostics = resolveDiagnosticSession({
    prisma: db,
    authenticated: session,
  }).then((diagnosticSession) =>
    buildCompatibilityDiagnostics({
      prisma: db,
      session: diagnosticSession,
    }),
  );

  const [analytics, report] = await Promise.all([
    ANALYTICS_AVAILABLE ? getAnalyticsSummary(session.shop) : Promise.resolve({ giftsUnlocked: 0, giftsAdded: 0, influencedOrders: 0, revenueGenerated: 0 }),
    diagnostics,
  ]);

  return {
    analytics,
    health: summarizeOverviewHealth(buildOverviewHealth(report.checks)),
  };
};
