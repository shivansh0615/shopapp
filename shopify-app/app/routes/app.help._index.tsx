import type { LoaderFunctionArgs } from "react-router";
import { Link, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { authenticateAdmin } from "../shopify.server";
import { containerStyle, pageStyle } from "../styles/tokens";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};

/**
 * In-app help hub so App Store / support paths do not dead-end.
 */
export default function HelpIndexPage() {
  const location = useLocation();
  const q = location.search;

  const links = [
    {
      to: "/app/widgets",
      title: "Theme setup",
      body: "Enable UpsellTrix on Dawn or Savor.",
    },
    {
      to: "/app/campaigns/new",
      title: "Create a campaign",
      body: "Choose your gift and spending goal. The offer shows on the product page and in the cart drawer.",
    },
    {
      to: "/app/compatibility",
      title: "Store health",
      body: "Find and resolve setup issues.",
    },
    {
      to: "/app/help/accelerated-checkout",
      title: "Checkout compatibility",
      body: "Understand which checkout paths support gifts.",
    },
    {
      to: "/app/billing",
      title: "Billing",
      body: "View your current plan and charges.",
    },
  ];

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <PageHeader
          title="Help"
          subtitle="Find a guide or troubleshoot an issue."
        />

        <ul className="fgpb-help-list ut-help-grid">
          {links.map((item, index) => (
            <li key={item.to}>
              <Link to={{ pathname: item.to, search: q }}>
                <span className="ut-help-icon" aria-hidden>{["◈", "+", "✓", "↗", "≡"][index]}</span>
                <p className="fgpb-help-list__title">{item.title}</p>
                <p className="fgpb-help-list__meta">{item.body}</p>
              </Link>
            </li>
          ))}
        </ul>

        <section className="fgpb-panel" style={{ marginTop: 24 }}>
          <div className="fgpb-panel__header">
            <div>
              <h2 className="fgpb-panel__title">Contact support</h2>
              <p className="fgpb-panel__subtitle">
                Include your store domain, theme name, and a description of the issue.
              </p>
            </div>
          </div>
          <p className="fgpb-muted-note" style={{ marginTop: 0 }}>
            <a
              className="fgpb-text-link"
              href="mailto:support@upselltrix.algorithmtrix.com"
              target="_blank"
              rel="noreferrer"
              style={{ overflowWrap: "anywhere" }}
              onClick={(event) => {
                // App Bridge treats a plain mailto link as an in-app navigation,
                // which unloads this page. Open the mail client outside the iframe.
                event.preventDefault();
                window.open("mailto:support@upselltrix.algorithmtrix.com", "_blank", "noopener,noreferrer");
              }}
            >
              support@upselltrix.algorithmtrix.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
