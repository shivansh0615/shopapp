"use client";

import { motion } from "framer-motion";
import { COMPARISON_ROWS, SITE } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";

export function Comparison() {
  return (
    <Section
      id="comparison"
      className="overflow-x-clip border-t border-[var(--border)]"
      title="One engine. Not ten apps."
      description={`Stop stacking single-purpose tools. ${SITE.name} runs coordinated promotions with consistent logic.`}
    >
      <motion.div
        variants={staggerContainer}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mt-10 min-w-0 border-t border-[var(--border)] md:mt-16"
      >
        <div className="hidden grid-cols-[1fr_1.1fr_1.1fr] gap-8 border-b border-[var(--border)] py-5 text-[11px] tracking-[0.14em] text-[var(--muted-foreground)] uppercase md:grid">
          <span>Compare</span>
          <span>Traditional apps</span>
          <span className="text-[var(--accent)]">{SITE.name}</span>
        </div>

        {COMPARISON_ROWS.map((row) => (
          <motion.div
            key={row.label}
            variants={fadeInUp}
            className="grid min-w-0 grid-cols-1 gap-3 border-b border-[var(--border)] py-6 md:grid-cols-[1fr_1.1fr_1.1fr] md:items-baseline md:gap-8 md:py-8"
          >
            <p className="text-sm tracking-[0.06em] break-words text-[var(--muted-foreground)] uppercase">
              {row.label}
            </p>
            <p className="text-base text-[var(--muted-foreground)] md:text-lg">
              <span className="mr-2 text-[11px] tracking-[0.12em] uppercase md:hidden">
                Traditional
              </span>
              {row.traditional}
            </p>
            <p className="font-display text-xl tracking-[-0.02em] text-white md:text-2xl">
              <span className="mr-2 font-sans text-[11px] tracking-[0.12em] text-[var(--accent)] uppercase md:hidden">
                {SITE.name}
              </span>
              {row.upselltrix}
            </p>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
