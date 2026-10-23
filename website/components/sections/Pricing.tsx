"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PRICING, SITE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { fadeInUp, viewportOnce } from "@/lib/animations";

export function Pricing() {
  return (
    <Section
      id="pricing"
      className="overflow-x-clip border-t border-[var(--border)]"
      title="Private beta"
      description={PRICING.description}
      align="center"
    >
      <motion.div
        variants={fadeInUp}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mx-auto mt-10 w-full max-w-lg border border-[var(--accent)]/35 px-5 py-10 text-center md:mt-16 md:px-12 md:py-12"
        style={{
          boxShadow: "0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)",
        }}
      >
        <p className="font-display text-4xl tracking-[-0.03em] text-white sm:text-5xl md:text-6xl">
          {PRICING.price}
        </p>
        <p className="mt-3 text-xs tracking-[0.14em] text-[var(--sage)] uppercase">
          {PRICING.badge}
        </p>

        <ul className="mx-auto mt-9 max-w-sm space-y-3 text-left">
          {PRICING.perks.map((perk) => (
            <li
              key={perk}
              className="flex items-start gap-3 text-sm text-[var(--foreground)] md:text-[15px]"
            >
              <Check
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent)]"
                strokeWidth={2}
              />
              {perk}
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <Button href="/contact" size="lg" className="btn-shine w-full sm:w-auto">
            {SITE.requestAccessCta}
          </Button>
        </div>
      </motion.div>
    </Section>
  );
}
