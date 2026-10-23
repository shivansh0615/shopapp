import { Link, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { containerStyle, pageStyle } from "../styles/tokens";

export default function BillingPage() {
  const location = useLocation();
  return (
    <main style={pageStyle}><div style={containerStyle}>
      <PageHeader title="Billing" subtitle="Your plan, at a glance." />
      <div className="ut-billing-grid">
        <section className="ut-card ut-plan" aria-labelledby="plan-heading">
          <div className="ut-card-heading"><h2 id="plan-heading">Current plan</h2><span className="fgpb-badge fgpb-badge--success">Active</span></div>
          <p className="ut-plan-name">Free</p>
          <p className="ut-plan-price">$0 <span>/ month</span></p>
          <p className="ut-copy">No payment method required.</p>
          <ul className="ut-feature-list">
            <li>Free-gift and tiered campaigns</li>
            <li>Storefront progress bar</li>
            <li>Automatic gift discounts</li>
            <li>Theme setup and diagnostics</li>
          </ul>
          <Link className="fgpb-btn fgpb-btn--secondary" to={{pathname:"/app/campaigns",search:location.search}}>Manage campaigns</Link>
        </section>
      </div>
    </div></main>
  );
}
