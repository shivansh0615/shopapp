"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { usePrefersReducedMotion } from "@/components/three/hooks";

const SHOTS = [
  {
    src: "/images/product/upselltrix-dashboard.png",
    alt: "UpsellTrix free gift campaign dashboard",
    caption: "Overview — live campaigns in Shopify Admin",
    kicker: "Overview",
    title: "Campaigns in one place",
    body: "See what is live, draft, or paused — and whether the storefront is talking to UpsellTrix — without leaving Shopify Admin.",
  },
  {
    src: "/images/product/create-promotion.png",
    alt: "Create promotion step in UpsellTrix choosing Spend X to Free Gift or Tiered Free Gifts",
    caption: "Create promotion — pick a type, then save a draft or activate",
    kicker: "Create promotion",
    title: "Start with the promotion type",
    body: "Choose Spend X → Free Gift or Tiered Free Gifts, then step through trigger, reward, display, and placement.",
  },
  {
    src: "/images/product/spend-x-free-gift.png",
    alt: "Spend threshold and free gift configuration in UpsellTrix",
    caption: "Spend X → Free Gift editor with live progress preview",
    kicker: "Spend X → Free Gift",
    title: "Set the threshold and the gift",
    body: "Choose the cart spend that unlocks the reward, pick the free product, and preview the progress shoppers will see.",
  },
  {
    src: "/images/product/upselltrix-campaigns.png",
    alt: "UpsellTrix campaign list with search, status, and spend triggers",
    caption: "Campaigns — search, status, trigger, and reward",
    kicker: "Campaigns",
    title: "Manage promotions without a maze",
    body: "One list for every free-gift campaign. Open a promotion to edit trigger, reward, display, and placement.",
  },
  {
    src: "/images/product/theme-setup.png",
    alt: "UpsellTrix theme setup with embed instructions inside Shopify Admin",
    caption: "Theme setup — enable the embed, then preview",
    kicker: "Theme setup",
    title: "Turn it on in the theme editor",
    body: "Enable the UpsellTrix app embed, save, and preview. The progress bar appears where shoppers already shop.",
  },
] as const;

function ShotFrame({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="w-full min-w-0 max-w-full">
      <div className="relative aspect-[1920/1090] w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#111] shadow-[0_0_0_1px_rgba(212,165,116,0.08),0_18px_48px_-28px_rgba(0,0,0,0.85)]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 88rem, 100vw"
          className="object-contain object-top"
          style={{ objectFit: "contain", objectPosition: "top" }}
        />
      </div>
      <figcaption className="mt-3 text-[12px] leading-snug tracking-[0.02em] text-[var(--muted-foreground)]">
        {caption}
      </figcaption>
    </figure>
  );
}

export function ProductDemo() {
  const reduced = usePrefersReducedMotion();
  const stackClass = "mt-10 space-y-16 lg:mt-16 lg:space-y-24";

  const blocks = SHOTS.map((shot) => (
    <article key={shot.src} className="min-w-0 space-y-6 lg:space-y-8">
      <div className="min-w-0 max-w-3xl">
        <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--accent)] uppercase">
          {shot.kicker}
        </p>
        <h3 className="mt-3 font-display text-2xl tracking-[-0.02em] text-balance text-white md:text-3xl">
          {shot.title}
        </h3>
        <p className="mt-4 max-w-md text-[15px] leading-[1.55] text-[var(--muted-foreground)]">
          {shot.body}
        </p>
      </div>
      <ShotFrame src={shot.src} alt={shot.alt} caption={shot.caption} />
    </article>
  ));

  return (
    <Section
      id="see-it-in-action"
      className="scroll-mt-[var(--nav-height)] overflow-x-clip border-t border-[var(--border)] bg-black"
    >
      <div className="min-w-0 max-w-3xl">
        <p className="hero-kicker">See it in action</p>
        <h2 className="section-heading mt-4">See how UpsellTrix works</h2>
        <p className="section-lede mt-5">
          Create the promotion, set the gift, and show shoppers how close they
          are — from Shopify Admin.
        </p>
      </div>

      {reduced ? (
        <div className={stackClass}>{blocks}</div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial={false}
          whileInView="visible"
          viewport={viewportOnce}
          className={stackClass}
        >
          {SHOTS.map((shot) => (
            <motion.article
              key={shot.src}
              variants={fadeInUp}
              className="min-w-0 space-y-6 lg:space-y-8"
            >
              <div className="min-w-0 max-w-3xl">
                <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--accent)] uppercase">
                  {shot.kicker}
                </p>
                <h3 className="mt-3 font-display text-2xl tracking-[-0.02em] text-balance text-white md:text-3xl">
                  {shot.title}
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-[1.55] text-[var(--muted-foreground)]">
                  {shot.body}
                </p>
              </div>
              <ShotFrame src={shot.src} alt={shot.alt} caption={shot.caption} />
            </motion.article>
          ))}
        </motion.div>
      )}
    </Section>
  );
}
