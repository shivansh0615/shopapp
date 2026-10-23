"use client";

import { ShoppingCart3D } from "@/components/three/ShoppingCart3D";
import { Button } from "@/components/ui/Button";
import { SITE } from "@/lib/constants";

function HeroCopy() {
  return (
    <div className="relative z-20 flex w-full min-w-0 max-w-xl flex-col justify-center">
      <p className="max-w-full text-[11px] font-medium tracking-[0.14em] text-[var(--accent)] uppercase sm:tracking-[0.22em]">
        Shopify Upsells · Cross-sells · Cart
      </p>

      <p className="hero-brand mt-6">{SITE.name}</p>

      <h1 className="hero-display mt-6 max-w-full">
        Turn Every Cart Into{" "}
        <span className="hero-display-accent">More Revenue.</span>
      </h1>

      <p className="hero-detail mt-6 max-w-full">
        UpsellTrix helps Shopify brands increase average order value with
        smarter upsells, cross-sells, and high-converting cart experiences.
      </p>

      <div className="mt-9 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          href="/contact"
          variant="primary"
          size="lg"
          className="btn-shine w-full sm:w-auto"
        >
          {SITE.primaryCta}
        </Button>
        <Button
          href="/#how-it-works"
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
        >
          See How It Works
        </Button>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-[var(--border)] bg-black"
      aria-label={`${SITE.name} hero`}
    >
      <div className="hero-atmos pointer-events-none absolute inset-0" />
      <div className="page-shell relative z-10 grid items-center gap-10 py-10 lg:min-h-[calc(100svh-var(--nav-height))] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-16">
        <HeroCopy />
        <div className="relative mx-auto aspect-square w-full max-w-[240px] lg:h-[min(56vh,460px)] lg:max-w-none lg:aspect-auto">
          <ShoppingCart3D className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
