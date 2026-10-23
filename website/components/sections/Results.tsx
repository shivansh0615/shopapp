"use client";

import { motion } from "framer-motion";
import { RESULTS } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { cn } from "@/lib/utils";

export function Results() {
  return (
    <Section
      id="results"
      className="overflow-x-clip border-t border-[var(--border)]"
      title="Built for measurable lift"
      description="Gift-with-purchase that shoppers understand — and merchants can measure."
    >
      <motion.ul
        variants={staggerContainer}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mt-10 grid grid-cols-1 gap-0 border-t border-[var(--border)] lg:mt-16 lg:grid-cols-3"
      >
        {RESULTS.map((item, i) => (
          <motion.li
            key={item.label}
            variants={fadeInUp}
            className={cn(
              "min-w-0 border-b border-[var(--border)] py-8 last:border-b-0 lg:border-b-0 lg:py-12",
              i < RESULTS.length - 1 && "lg:border-r lg:pr-8",
              i > 0 && "lg:pl-8",
            )}
          >
            <p className="font-display text-3xl tracking-[-0.03em] text-[var(--accent-deep)] sm:text-4xl md:text-5xl">
              {item.value}
            </p>
            <p className="mt-3 text-sm font-medium text-white">{item.label}</p>
            <p className="mt-1.5 text-sm leading-[1.55] text-[var(--muted-foreground)]">
              {item.note}
            </p>
          </motion.li>
        ))}
      </motion.ul>
    </Section>
  );
}
