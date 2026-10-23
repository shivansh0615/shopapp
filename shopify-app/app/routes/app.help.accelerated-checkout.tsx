import type { LoaderFunctionArgs } from "react-router";
import { Link, useLocation } from "react-router";
import { PageHeader } from "../components/layout/PageHeader";
import { authenticateAdmin } from "../shopify.server";
import { containerStyle, pageStyle } from "../styles/tokens";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);
  return null;
};


export default function AcceleratedCheckoutHelpPage() {
  const location = useLocation();
  return (
    <main style={pageStyle}><div style={containerStyle}>
      <Link to={{pathname:"/app/help",search:location.search}} className="fgpb-back-link">← Help</Link>
      <PageHeader title="Checkout compatibility" subtitle="Automatic gifts require the cart." />
      <div className="ut-checkout-grid">
        <section className="ut-card"><span className="fgpb-badge fgpb-badge--success">Supported</span><h2 className="ut-checkout-title">Standard checkout</h2><p className="ut-copy">Shoppers add products to the cart and reach the gift threshold before checkout.</p><ol className="ut-checkout-flow"><li>Add to cart</li><li>Gift threshold reached</li><li>Gift added to cart</li><li>Checkout</li></ol></section>
        <section className="ut-card"><span className="fgpb-badge fgpb-badge--warning">Not supported</span><h2 className="ut-checkout-title">Express checkout</h2><p className="ut-copy">Buy it now and product-page express buttons skip the cart, so automatic gifts are not added.</p><ul className="ut-feature-list"><li>Buy it now</li><li>Shop Pay express</li><li>Other product-page express buttons</li></ul><p className="ut-footnote">Campaigns still work for shoppers who use the regular cart.</p></section>
      </div>
      <div className="ut-page-footer"><Link to={{pathname:"/app/campaigns",search:location.search}} className="fgpb-text-link">Campaigns</Link><Link to={{pathname:"/app/widgets",search:location.search}} className="fgpb-text-link">Theme setup</Link></div>
    </div></main>
  );
}
