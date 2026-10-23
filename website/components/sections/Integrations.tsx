"use client";

import { motion } from "framer-motion";
import { INTEGRATIONS } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";

export function Integrations() {
  return (
    <Section
      id="integrations"
      className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)]"
      title="Shopify native"
      description="Built for the Shopify stack merchants already run."
      align="center"
    >
      <motion.ul
        variants={staggerContainer}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-4 border-t border-[var(--border)] pt-8 md:mt-16 md:gap-x-14 md:pt-16"
      >
        {INTEGRATIONS.map((name) => (
          <motion.li
            key={name}
            variants={fadeInUp}
            className="font-display text-xl tracking-[-0.02em] text-white/90 md:text-[1.85rem]"
          >
            {name}
          </motion.li>
        ))}
      </motion.ul>
    </Section>
  );
}
