import type { Metadata } from "next";
import { SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: {
    absolute: "Support | UpsellTrix",
  },
  description:
    "Get help installing, setting up, and using UpsellTrix on your Shopify store.",
  openGraph: {
    title: "Support | UpsellTrix",
    description:
      "Get help installing, setting up, and using UpsellTrix on your Shopify store.",
  },
  twitter: {
    title: "Support | UpsellTrix",
    description:
      "Get help installing, setting up, and using UpsellTrix on your Shopify store.",
  },
};

const START = [
  {
    title: "Install and open UpsellTrix",
    body: "Install UpsellTrix from the Shopify App Store, then open the app from your Shopify admin. Approve the permissions Shopify shows during installation.",
  },
  {
    title: "Enable the theme app embed",
    body: "In Shopify admin, open Online Store → Themes → Customize. Enable the UpsellTrix theme app embed so storefront elements such as the cart progress bar can render on supported themes.",
  },
  {
    title: "Create a Free Gift campaign",
    body: "Choose a cart-value threshold and the free product to unlock. Save and activate the campaign, then test in a cart on your live theme.",
  },
  {
    title: "Create Tiered Free Gift campaigns",
    body: "Set more than one spend threshold if you want shoppers to unlock additional gifts as the cart grows. Confirm each tier’s gift and threshold before you activate.",
  },
  {
    title: "Activate or pause campaigns",
    body: "Use the app to activate a campaign when you want it live, and pause it when you want it off. Paused campaigns should no longer apply new unlocks on the storefront.",
  },
] as const;

const TROUBLE = [
  {
    title: "Progress bar not appearing",
    body: "Confirm the theme app embed is enabled on the published theme, the campaign is active, and you are viewing a cart page or cart surface the embed supports. Hard-refresh or try an incognito window after theme changes.",
  },
  {
    title: "Gift not being added",
    body: "Check that the cart meets the campaign threshold, the gift product is available for the market and sales channel, and the campaign is active. Variants, inventory, and product status in Shopify can all block an add.",
  },
  {
    title: "Gift discount not appearing",
    body: "Confirm the campaign is configured to apply the gift as free (or at the intended price) and that no other discount app is removing or overriding it. Re-test with other automatic discounts temporarily disabled.",
  },
  {
    title: "Theme app embed",
    body: "If the embed toggle is missing, make sure you are editing the live Online Store theme and that the app remains installed. After reinstalling, enable the embed again.",
  },
  {
    title: "Campaign activation issues",
    body: "Save the campaign, then set it to active. If it will not activate, review required fields (threshold, gift product) and try again. Uninstalling and reinstalling should be a last step.",
  },
] as const;

export default function SupportPage() {
  return (
    <main className="flex-1">
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-black">
        <div className="hero-atmos pointer-events-none absolute inset-0" />
        <div className="page-shell relative z-10 py-16 md:py-24">
          <p className="hero-kicker">Help</p>
          <h1 className="section-heading mt-4 max-w-[16ch]">
            UpsellTrix Support
          </h1>
          <p className="section-lede mt-5 max-w-2xl">
            Merchants can contact us for help with installation, setup, and
            day-to-day use of UpsellTrix.
          </p>

          <h2 className="mt-16 font-display text-2xl tracking-[-0.02em] text-white md:text-3xl">
            Getting started
          </h2>
          <ul className="mt-8 grid gap-0 border-t border-[var(--border)] md:grid-cols-2">
            {START.map((item) => (
              <li
                key={item.title}
                className="border-b border-[var(--border)] py-8 md:odd:pr-8 md:even:border-l md:even:pl-8"
              >
                <h3 className="font-display text-xl tracking-[-0.02em] text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          <h2 className="mt-16 font-display text-2xl tracking-[-0.02em] text-white md:text-3xl">
            Troubleshooting
          </h2>
          <ul className="mt-8 grid gap-0 border-t border-[var(--border)] md:grid-cols-2">
            {TROUBLE.map((item) => (
              <li
                key={item.title}
                className="border-b border-[var(--border)] py-8 md:odd:pr-8 md:even:border-l md:even:pl-8"
              >
                <h3 className="font-display text-xl tracking-[-0.02em] text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
                  {item.body}
                </p>
              </li>
            ))}
          </ul>

          <h2 className="mt-16 font-display text-2xl tracking-[-0.02em] text-white md:text-3xl">
            Compatibility
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)] md:text-base">
            The primary supported launch experience is Shopify Online Store,
            with Dawn and other Online Store 2.0 themes where the theme app
            embed can be enabled. Support for custom checkouts, accelerated
            checkout gift injection, and third-party checkout wrappers is not
            part of the current launch promise.
          </p>

          <div className="mt-16 max-w-xl border border-[var(--border)] bg-[var(--surface-wine)] px-6 py-8 md:px-8 md:py-10">
            <h2 className="font-display text-2xl tracking-[-0.02em] text-white">
              Contact support
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted-foreground)]">
              Email us at{" "}
              <a
                href={`mailto:${SITE.supportEmail}`}
                className="text-white transition-colors hover:text-[var(--accent)]"
              >
                {SITE.supportEmail}
              </a>
              . When contacting support, please include your store URL and a
              brief description of the issue.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
