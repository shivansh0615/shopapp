import type { Metadata } from "next";
import { SITE } from "@/lib/constants";
import { ContactForm } from "@/components/sections/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: `Install ${SITE.name} or ask about it for your Shopify store.`,
};

export default function ContactPage() {
  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <section className="relative overflow-x-clip border-b border-[var(--border)] bg-black">
        <div className="hero-atmos pointer-events-none absolute inset-0" />
        <div className="page-shell relative z-10 grid grid-cols-1 gap-10 py-12 md:grid-cols-[0.95fr_1.05fr] md:gap-20 md:py-24">
          <div className="min-w-0">
            <p className="hero-kicker">Contact</p>
            <h1 className="section-heading mt-4">
              Install UpsellTrix on your store.
            </h1>
            <p className="section-lede mt-5">
              Tell us about your store. We onboard Shopify merchants into
              UpsellTrix while the product is in private beta — free, no
              monthly fee.
            </p>

            <ul className="mt-10 space-y-4">
              <li>
                <p className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
                  Email
                </p>
                <a
                  href={`mailto:${SITE.contactEmail}`}
                  className="mt-1 inline-flex min-h-11 min-w-0 items-center break-all text-[15px] text-white transition-colors hover:text-[var(--accent)]"
                >
                  {SITE.contactEmail}
                </a>
              </li>
            </ul>
          </div>

          <div className="min-w-0 border border-[var(--border)] bg-[var(--surface-wine)] px-5 py-8 md:px-8 md:py-10">
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
