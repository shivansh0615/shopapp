import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useLocation, useRevalidator } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { usePublishedThemeEmbedStatus } from "../components/ui/usePublishedThemeEmbedStatus";
import { withPublishedThemeEmbedCheck } from "../lib/published-theme-embed";
import { aggregateOverallState } from "../lib/compatibility-diagnostics";
import db from "../db.server";
import { resolveDiagnosticSession } from "../lib/diagnostic-session.server";
import { buildCompatibilityDiagnostics } from "../services/compatibility-diagnostics.server";
import { authenticateAdmin } from "../shopify.server";
import { containerStyle, pageStyle } from "../styles/tokens";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const shop = session.shop;

  const diagnosticSession = await resolveDiagnosticSession({
    prisma: db,
    authenticated: session,
  });

  const report = await buildCompatibilityDiagnostics({
    prisma: db,
    session: diagnosticSession,
  });

  return {
    report: {
      shop: report.shop,
      generatedAt: report.generatedAt,
      overall: report.overall,
      overallExplanation: report.overallExplanation,
      checks: report.checks,
    },
    embedDeepLink: report.embedDeepLink,
    storePreviewHref: `https://${shop}`,
  };
};


function statusLabel(status: string) {
  return ({pass:"Working",warn:"Needs attention",fail:"Action needed",unable_to_verify:"Not verified",info:"Information"} as Record<string,string>)[status] ?? "Not verified";
}

export default function CompatibilityDiagnosticsPage() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const revalidator = useRevalidator();
  const embedCheck = usePublishedThemeEmbedStatus();
  const checks = withPublishedThemeEmbedCheck(data.report.checks, embedCheck.status);
  const overall = aggregateOverallState(checks);
  const refreshing = revalidator.state !== "idle" || embedCheck.status === "checking";
  const overallLabels: Record<string,string> = {READY:"Checks passed",READY_WITH_LIMITATIONS:"Review limitations",ACTION_REQUIRED:"Action needed",UNABLE_TO_VERIFY:"Verification needed"};
  return (
    <main style={pageStyle}><div style={containerStyle}>
      <PageHeader title="Store health" subtitle="Check your installation and storefront setup." actions={
        <button className="fgpb-btn fgpb-btn--secondary" disabled={refreshing} onClick={() => { void revalidator.revalidate(); void embedCheck.refresh(); }}>{refreshing ? "Checking…" : "Run checks"}</button>
      } />
      <section className="ut-health-summary ut-card" aria-live="polite" aria-busy={refreshing}>
        <span className={`ut-health-summary__symbol ${overall.overall === "READY" ? "is-ready" : ""}`} aria-hidden>{overall.overall === "READY" ? "✓" : "!"}</span>
        <div><h2>{overallLabels[overall.overall] ?? "Review results"}</h2><p>{overall.explanation}</p><small>Installation checked <time dateTime={data.report.generatedAt}>{new Date(data.report.generatedAt).toLocaleString()}</time></small></div>
        <Link className="fgpb-btn fgpb-btn--secondary fgpb-btn--sm" to={{pathname:"/app/widgets",search:location.search}}>Theme setup</Link>
      </section>
      <section className="ut-health-checks" aria-label="Diagnostic results">
        {checks.map(check => (
          <details className="ut-health-row" key={check.id} open={check.status === "fail" || check.status === "warn"}>
            <summary><span className={`ut-check-dot is-${check.status}`} aria-hidden /><strong>{check.label}</strong><span className={`ut-check-status is-${check.status}`}>{statusLabel(check.status)}</span></summary>
            <div className="ut-health-row__body">
              <p>{check.explanation}</p>
              {check.merchantAction ? <p className="ut-health-action"><strong>Next step:</strong> {check.merchantAction}</p> : null}
              {check.id === "theme_app_embed" ? <Link className="fgpb-text-link" to={{pathname:"/app/widgets",search:location.search}}>Open theme setup →</Link> : null}
              {check.technicalDetails ? <details className="ut-technical-details"><summary>Technical details</summary><p>{check.technicalDetails}</p></details> : null}
            </div>
          </details>
        ))}
      </section>
      <div className="ut-page-footer"><span>{data.report.shop}</span><Link className="fgpb-text-link" to={{pathname:"/app/help/accelerated-checkout",search:location.search}}>Checkout compatibility</Link></div>
    </div></main>
  );
}
